use axum::{Extension, Json, extract::Path, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    feature::{
        admin::user::{
            dto::{
                AdminUserResponse, CreateAdminUserRequest, ManagedProjectResponse,
                UpdateUserProjectsRequest, UpdateUserRoleRequest,
            },
            repository::AdminUserWithProjects,
        },
        auth::{AuthError, AuthUser},
        user::User,
    },
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{auth as auth_codes, generic},
    },
    state::AppState,
};

/// GET /api/v1/admin/users
///
/// List all users (admin only)
pub async fn list_users(State(state): State<AppState>) -> ApiResult<Vec<AdminUserResponse>> {
    let users = state
        .admin_user_repo
        .list_all(state.db.pool())
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    let user_responses: Vec<AdminUserResponse> = users
        .into_iter()
        .map(admin_user_with_projects_response)
        .collect();

    Ok(ApiSuccess::default()
        .with_data(user_responses)
        .with_message("Users retrieved successfully"))
}

/// POST /api/v1/admin/users
///
/// Create a backend/miniapp login user and assign manageable projects.
pub async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateAdminUserRequest>,
) -> ApiResult<AdminUserResponse> {
    let role = req.role.trim().to_lowercase();
    ensure_role_exists(&state, &role).await?;

    let name = req.name.trim();
    if name.is_empty() {
        return Err(invalid_input("Name is required"));
    }

    let username = req
        .username
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let email = req
        .email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    if username.is_none() && email.is_none() {
        return Err(invalid_input("Username or email is required"));
    }

    if req.password.len() < 6 {
        return Err(invalid_input("Password must be at least 6 characters"));
    }

    let login_email = email
        .clone()
        .or_else(|| {
            username
                .as_ref()
                .map(|value| format!("{value}@miniapp.shanhuai.local"))
        })
        .ok_or_else(|| invalid_input("Username or email is required"))?;

    let (created, _) = state
        .auth_service
        .register(
            &login_email,
            username.as_deref(),
            &req.password,
            Some(name),
            None,
        )
        .await
        .map_err(map_create_user_error)?;

    let user = state
        .admin_user_repo
        .update_role(state.db.pool(), created.user.id, &role)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let project_ids = unique_project_ids(req.project_ids);
    state
        .admin_user_repo
        .replace_managed_projects(state.db.pool(), user.id, &project_ids)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    let managed_projects = state
        .admin_user_repo
        .list_managed_projects(state.db.pool(), user.id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(admin_user_response(user, managed_projects))
        .with_message("User created successfully"))
}

/// POST /api/v1/admin/users/:id/role
///
/// Update a user's role (admin only).
/// Cannot change your own role (prevents self-demotion).
pub async fn update_user_role(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserRoleRequest>,
) -> ApiResult<AdminUserResponse> {
    let role = req.role.trim().to_lowercase();
    ensure_role_exists(&state, &role).await?;

    // Prevent changing own role
    if user_id == auth_user.user_id {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message("Cannot change your own role"));
    }

    // Update the user's role
    let user = state
        .admin_user_repo
        .update_role(state.db.pool(), user_id, &role)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let managed_projects = state
        .admin_user_repo
        .list_managed_projects(state.db.pool(), user.id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(admin_user_response(user, managed_projects))
        .with_message(format!("User role updated to '{}'", role)))
}

/// PUT /api/v1/admin/users/:id/projects
///
/// Replace a user's manageable projects.
pub async fn update_user_projects(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserProjectsRequest>,
) -> ApiResult<AdminUserResponse> {
    let user = state
        .user_repo
        .find_by_id(state.db.pool(), user_id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let project_ids = unique_project_ids(req.project_ids);
    state
        .admin_user_repo
        .replace_managed_projects(state.db.pool(), user.id, &project_ids)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    let managed_projects = state
        .admin_user_repo
        .list_managed_projects(state.db.pool(), user.id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(admin_user_response(user, managed_projects))
        .with_message("User project permissions updated"))
}

async fn ensure_role_exists(state: &AppState, role: &str) -> Result<(), ApiError> {
    if state
        .admin_role_repo
        .find_by_code(state.db.pool(), role)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .is_none()
    {
        return Err(invalid_input("Role does not exist"));
    }

    Ok(())
}

fn admin_user_with_projects_response(item: AdminUserWithProjects) -> AdminUserResponse {
    admin_user_response(item.user, item.managed_projects)
}

fn admin_user_response(
    user: User,
    managed_projects: Vec<crate::feature::admin::user::repository::ManagedProject>,
) -> AdminUserResponse {
    let name = user.username.clone().unwrap_or_else(|| user.email.clone());
    AdminUserResponse {
        id: user.id,
        email: user.email,
        username: user.username,
        name,
        role: user.role,
        managed_projects: managed_projects
            .into_iter()
            .map(|project| ManagedProjectResponse {
                id: project.id,
                name: project.name,
            })
            .collect(),
        created_at: user.created_at,
        updated_at: user.updated_at,
    }
}

fn unique_project_ids(project_ids: Vec<Uuid>) -> Vec<Uuid> {
    let mut unique = Vec::new();
    for project_id in project_ids {
        if !unique.contains(&project_id) {
            unique.push(project_id);
        }
    }
    unique
}

fn invalid_input(message: &str) -> ApiError {
    ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_error_code(generic::INVALID_INPUT)
        .with_message(message)
}

fn map_create_user_error(error: AuthError) -> ApiError {
    match error {
        AuthError::EmailExists => ApiError::default()
            .with_code(StatusCode::CONFLICT)
            .with_error_code(auth_codes::EMAIL_EXISTS)
            .with_message("Email already registered"),
        AuthError::UsernameExists => ApiError::default()
            .with_code(StatusCode::CONFLICT)
            .with_error_code(auth_codes::EMAIL_EXISTS)
            .with_message("Username already taken"),
        _ => ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_error_code(auth_codes::INTERNAL_ERROR)
            .with_message("User creation failed"),
    }
}
