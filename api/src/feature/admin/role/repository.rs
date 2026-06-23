use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AdminRole {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub description: String,
    pub is_system: bool,
    pub user_count: i64,
    pub menu_keys: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum AdminRoleRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("System role cannot be deleted")]
    SystemRole,
    #[error("Role is assigned to users")]
    RoleInUse,
}

#[async_trait]
pub trait AdminRoleRepository: Send + Sync {
    async fn list_all(&self, pool: &PgPool) -> Result<Vec<AdminRole>, AdminRoleRepositoryError>;

    async fn find_by_id(
        &self,
        pool: &PgPool,
        role_id: Uuid,
    ) -> Result<Option<AdminRole>, AdminRoleRepositoryError>;

    async fn find_by_code(
        &self,
        pool: &PgPool,
        code: &str,
    ) -> Result<Option<AdminRole>, AdminRoleRepositoryError>;

    async fn create(
        &self,
        pool: &PgPool,
        code: &str,
        name: &str,
        description: &str,
    ) -> Result<AdminRole, AdminRoleRepositoryError>;

    async fn replace_menu_keys(
        &self,
        pool: &PgPool,
        role_id: Uuid,
        menu_keys: &[String],
    ) -> Result<Option<AdminRole>, AdminRoleRepositoryError>;

    async fn delete(
        &self,
        pool: &PgPool,
        role_id: Uuid,
    ) -> Result<Option<()>, AdminRoleRepositoryError>;
}

#[derive(Debug, Clone, Default)]
pub struct AdminRoleRepositoryImpl;

impl AdminRoleRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AdminRoleRepository for AdminRoleRepositoryImpl {
    async fn list_all(&self, pool: &PgPool) -> Result<Vec<AdminRole>, AdminRoleRepositoryError> {
        Ok(sqlx::query_as::<_, AdminRole>(&format!(
            "{ROLE_SELECT_BASE_SQL} {ROLE_GROUP_SQL} {ROLE_ORDER_SQL}"
        ))
        .fetch_all(pool)
        .await?)
    }

    async fn find_by_id(
        &self,
        pool: &PgPool,
        role_id: Uuid,
    ) -> Result<Option<AdminRole>, AdminRoleRepositoryError> {
        Ok(sqlx::query_as::<_, AdminRole>(&format!(
            "{ROLE_SELECT_BASE_SQL} WHERE rc.id = $1 {ROLE_GROUP_SQL} {ROLE_ORDER_SQL}"
        ))
        .bind(role_id)
        .fetch_optional(pool)
        .await?)
    }

    async fn find_by_code(
        &self,
        pool: &PgPool,
        code: &str,
    ) -> Result<Option<AdminRole>, AdminRoleRepositoryError> {
        Ok(sqlx::query_as::<_, AdminRole>(&format!(
            "{ROLE_SELECT_BASE_SQL} WHERE rc.code = $1 {ROLE_GROUP_SQL} {ROLE_ORDER_SQL}"
        ))
        .bind(code)
        .fetch_optional(pool)
        .await?)
    }

    async fn create(
        &self,
        pool: &PgPool,
        code: &str,
        name: &str,
        description: &str,
    ) -> Result<AdminRole, AdminRoleRepositoryError> {
        let mut tx = pool.begin().await?;

        let role_id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO role_configs (code, name, description)
            VALUES ($1, $2, $3)
            RETURNING id
            "#,
        )
        .bind(code)
        .bind(name)
        .bind(description)
        .fetch_one(&mut *tx)
        .await?;

        insert_menu_keys(&mut tx, role_id, &["projects".to_string()]).await?;
        tx.commit().await?;

        self.find_by_id(pool, role_id)
            .await?
            .ok_or_else(|| AdminRoleRepositoryError::Database(sqlx::Error::RowNotFound))
    }

    async fn replace_menu_keys(
        &self,
        pool: &PgPool,
        role_id: Uuid,
        menu_keys: &[String],
    ) -> Result<Option<AdminRole>, AdminRoleRepositoryError> {
        let mut tx = pool.begin().await?;

        let exists: Option<Uuid> = sqlx::query_scalar("SELECT id FROM role_configs WHERE id = $1")
            .bind(role_id)
            .fetch_optional(&mut *tx)
            .await?;

        if exists.is_none() {
            tx.rollback().await?;
            return Ok(None);
        }

        sqlx::query("DELETE FROM role_menu_permissions WHERE role_id = $1")
            .bind(role_id)
            .execute(&mut *tx)
            .await?;

        insert_menu_keys(&mut tx, role_id, menu_keys).await?;
        tx.commit().await?;

        self.find_by_id(pool, role_id).await
    }

    async fn delete(
        &self,
        pool: &PgPool,
        role_id: Uuid,
    ) -> Result<Option<()>, AdminRoleRepositoryError> {
        let role = self.find_by_id(pool, role_id).await?;

        let Some(role) = role else {
            return Ok(None);
        };

        if role.is_system {
            return Err(AdminRoleRepositoryError::SystemRole);
        }

        if role.user_count > 0 {
            return Err(AdminRoleRepositoryError::RoleInUse);
        }

        sqlx::query("DELETE FROM role_configs WHERE id = $1")
            .bind(role_id)
            .execute(pool)
            .await?;

        Ok(Some(()))
    }
}

const ROLE_SELECT_BASE_SQL: &str = r#"
    SELECT
        rc.id,
        rc.code,
        rc.name,
        rc.description,
        rc.is_system,
        (
            SELECT COUNT(*)::BIGINT
            FROM users u
            WHERE u.role = rc.code
        ) AS user_count,
        COALESCE(
            ARRAY(
                SELECT rmp.menu_key
                FROM role_menu_permissions rmp
                WHERE rmp.role_id = rc.id
                ORDER BY
                    CASE rmp.menu_key
                        WHEN 'projects' THEN 10
                        WHEN 'users' THEN 30
                        WHEN 'roles' THEN 40
                        WHEN 'attendance_devices' THEN 50
                        WHEN 'attendance_device_issue_reports' THEN 60
                        WHEN 'uploads' THEN 70
                        ELSE 100
                    END,
                    rmp.menu_key
            ),
            ARRAY[]::TEXT[]
        ) AS menu_keys,
        rc.created_at,
        rc.updated_at
    FROM role_configs rc
"#;

const ROLE_GROUP_SQL: &str = "";
const ROLE_ORDER_SQL: &str = "ORDER BY rc.display_order ASC, rc.created_at ASC";

async fn insert_menu_keys(
    tx: &mut Transaction<'_, Postgres>,
    role_id: Uuid,
    menu_keys: &[String],
) -> Result<(), sqlx::Error> {
    for menu_key in menu_keys {
        sqlx::query(
            r#"
            INSERT INTO role_menu_permissions (role_id, menu_key)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(role_id)
        .bind(menu_key)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
