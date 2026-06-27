use axum::{Json, extract::Path, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    feature::admin::role::{
        dto::{AdminRoleResponse, CreateRoleRequest, UpdateRoleMenusRequest},
        repository::{AdminRole, AdminRoleRepositoryError},
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes::generic},
    state::AppState,
};

const ALLOWED_MENU_KEYS: &[&str] = &[
    "admin_overview",
    "projects",
    "enterprise_customers",
    "enterprise_own_entities",
    "enterprise_projects",
    "enterprise_issued_invoices",
    "enterprise_received_invoices",
    "enterprise_collections",
    "enterprise_payments",
    "contract_templates",
    "work_hour_configs",
    "platform_integrations",
    "attendance_devices",
    "attendance_device_issue_reports",
    "users",
    "roles",
    "uploads",
];

pub async fn list_roles(State(state): State<AppState>) -> ApiResult<Vec<AdminRoleResponse>> {
    let roles = state
        .admin_role_repo
        .list_all(state.db.pool())
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(roles.into_iter().map(AdminRoleResponse::from).collect())
        .with_message("Roles retrieved successfully"))
}

pub async fn create_role(
    State(state): State<AppState>,
    Json(req): Json<CreateRoleRequest>,
) -> ApiResult<AdminRoleResponse> {
    let code = req.code.trim().to_lowercase();
    let name = req.name.trim();
    let description = req.description.unwrap_or_default();
    let description = description.trim();

    validate_role_code(&code)?;
    if name.is_empty() {
        return Err(invalid_input("Role name is required"));
    }

    if state
        .admin_role_repo
        .find_by_code(state.db.pool(), &code)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .is_some()
    {
        return Err(ApiError::default()
            .with_code(StatusCode::CONFLICT)
            .with_error_code(generic::INVALID_INPUT)
            .with_message("Role code already exists"));
    }

    let role = state
        .admin_role_repo
        .create(
            state.db.pool(),
            &code,
            name,
            if description.is_empty() {
                "自定义角色，先配置菜单权限。"
            } else {
                description
            },
        )
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(AdminRoleResponse::from(role))
        .with_message("Role created successfully"))
}

pub async fn update_role_menus(
    State(state): State<AppState>,
    Path(role_id): Path<Uuid>,
    Json(req): Json<UpdateRoleMenusRequest>,
) -> ApiResult<AdminRoleResponse> {
    let menu_keys = normalize_menu_keys(req.menu_keys)?;

    let role = state
        .admin_role_repo
        .replace_menu_keys(state.db.pool(), role_id, &menu_keys)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("Role not found")
        })?;

    Ok(ApiSuccess::default()
        .with_data(AdminRoleResponse::from(role))
        .with_message("Role menus updated successfully"))
}

pub async fn delete_role(
    State(state): State<AppState>,
    Path(role_id): Path<Uuid>,
) -> ApiResult<()> {
    state
        .admin_role_repo
        .delete(state.db.pool(), role_id)
        .await
        .map_err(|e| match e {
            AdminRoleRepositoryError::SystemRole => invalid_input("System role cannot be deleted"),
            AdminRoleRepositoryError::RoleInUse => {
                invalid_input("Role is assigned to users and cannot be deleted")
            }
            AdminRoleRepositoryError::Database(e) => ApiError::default().log_only(e),
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("Role not found")
        })?;

    Ok(ApiSuccess::default().with_message("Role deleted successfully"))
}

impl From<AdminRole> for AdminRoleResponse {
    fn from(role: AdminRole) -> Self {
        Self {
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            is_system: role.is_system,
            user_count: role.user_count,
            menu_keys: role.menu_keys,
            created_at: role.created_at,
            updated_at: role.updated_at,
        }
    }
}

fn validate_role_code(code: &str) -> Result<(), ApiError> {
    if code.len() < 2 || code.len() > 50 {
        return Err(invalid_input(
            "Role code must be between 2 and 50 characters",
        ));
    }

    if !code
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(invalid_input(
            "Role code may only contain lowercase letters, numbers, and underscores",
        ));
    }

    Ok(())
}

fn normalize_menu_keys(menu_keys: Vec<String>) -> Result<Vec<String>, ApiError> {
    let mut normalized = Vec::new();

    for key in menu_keys {
        let key = key.trim().to_string();
        if !ALLOWED_MENU_KEYS.contains(&key.as_str()) {
            continue;
        }

        if !normalized.contains(&key) {
            normalized.push(key);
        }
    }

    if !normalized.iter().any(|key| key == "projects") {
        normalized.insert(0, "projects".to_string());
    }

    Ok(normalized)
}

fn invalid_input(message: &str) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_error_code(generic::INVALID_INPUT)
        .with_message(message)
}
