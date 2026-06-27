use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::feature::user::User;

/// Admin user repository errors
#[derive(Debug, thiserror::Error)]
pub enum AdminUserRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("User not found")]
    NotFound,
}

#[derive(Debug, Clone)]
pub struct ManagedProject {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct AdminUserWithProjects {
    pub user: User,
    pub managed_projects: Vec<ManagedProject>,
}

#[derive(Debug, FromRow)]
struct AdminUserRow {
    id: Uuid,
    email: String,
    username: Option<String>,
    is_active: bool,
    email_verified: bool,
    role: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    managed_projects: Value,
}

/// Admin user repository trait
#[async_trait]
pub trait AdminUserRepository: Send + Sync {
    /// List all users ordered by creation date
    async fn list_all(
        &self,
        pool: &PgPool,
    ) -> Result<Vec<AdminUserWithProjects>, AdminUserRepositoryError>;

    /// Update user role
    async fn update_role(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        role: &str,
    ) -> Result<Option<User>, AdminUserRepositoryError>;

    /// Replace user managed project grants
    async fn replace_managed_projects(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        project_ids: &[Uuid],
    ) -> Result<(), AdminUserRepositoryError>;

    /// List user managed project grants
    async fn list_managed_projects(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ManagedProject>, AdminUserRepositoryError>;
}

#[derive(Debug, Clone, Default)]
pub struct AdminUserRepositoryImpl;

impl AdminUserRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AdminUserRepository for AdminUserRepositoryImpl {
    async fn list_all(
        &self,
        pool: &PgPool,
    ) -> Result<Vec<AdminUserWithProjects>, AdminUserRepositoryError> {
        let rows: Vec<AdminUserRow> = sqlx::query_as(
            r#"
            SELECT
                u.id,
                u.email,
                u.username,
                u.is_active,
                u.email_verified,
                u.role,
                u.created_at,
                u.updated_at,
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object('id', p.id, 'name', COALESCE(p.name, '未命名项目'))
                        ORDER BY p.updated_at DESC
                    ) FILTER (WHERE p.id IS NOT NULL),
                    '[]'::jsonb
                ) AS managed_projects
            FROM users u
            LEFT JOIN user_managed_projects ump ON ump.user_id = u.id
            LEFT JOIN construction_projects p ON p.id = ump.project_id AND p.is_deleted = FALSE
            GROUP BY u.id
            ORDER BY u.created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| AdminUserWithProjects {
                managed_projects: parse_managed_projects(row.managed_projects),
                user: User {
                    id: row.id,
                    email: row.email,
                    username: row.username,
                    is_active: row.is_active,
                    email_verified: row.email_verified,
                    role: row.role,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                },
            })
            .collect())
    }

    async fn update_role(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        role: &str,
    ) -> Result<Option<User>, AdminUserRepositoryError> {
        let user: Option<User> = sqlx::query_as(
            r#"
            UPDATE users 
            SET role = $1, updated_at = NOW() 
            WHERE id = $2 
            RETURNING id, email, username, is_active, email_verified, role, created_at, updated_at
            "#,
        )
        .bind(role)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    async fn replace_managed_projects(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        project_ids: &[Uuid],
    ) -> Result<(), AdminUserRepositoryError> {
        let mut tx = pool.begin().await?;

        sqlx::query("DELETE FROM user_managed_projects WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        for project_id in project_ids {
            sqlx::query(
                r#"
                INSERT INTO user_managed_projects (user_id, project_id)
                SELECT $1, $2
                WHERE EXISTS (
                    SELECT 1 FROM construction_projects
                    WHERE id = $2 AND is_deleted = FALSE
                )
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(user_id)
            .bind(project_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn list_managed_projects(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ManagedProject>, AdminUserRepositoryError> {
        let rows: Vec<(Uuid, String)> = sqlx::query_as(
            r#"
            SELECT p.id, COALESCE(p.name, '未命名项目') AS name
            FROM user_managed_projects ump
            JOIN construction_projects p ON p.id = ump.project_id AND p.is_deleted = FALSE
            WHERE ump.user_id = $1
            ORDER BY p.updated_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, name)| ManagedProject { id, name })
            .collect())
    }
}

fn parse_managed_projects(value: Value) -> Vec<ManagedProject> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item.get("id")?.as_str()?;
            let name = item.get("name")?.as_str()?.to_owned();
            Some(ManagedProject {
                id: Uuid::parse_str(id).ok()?,
                name,
            })
        })
        .collect()
}
