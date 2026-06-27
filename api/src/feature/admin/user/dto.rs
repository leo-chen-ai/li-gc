use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct ManagedProjectResponse {
    pub id: Uuid,
    pub name: String,
}

/// User response for admin
#[derive(Debug, Serialize)]
pub struct AdminUserResponse {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub name: String,
    pub role: String,
    pub managed_projects: Vec<ManagedProjectResponse>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Create user request for admin
#[derive(Debug, Deserialize)]
pub struct CreateAdminUserRequest {
    pub name: String,
    pub email: Option<String>,
    pub username: Option<String>,
    pub role: String,
    pub password: String,
    #[serde(default)]
    pub project_ids: Vec<Uuid>,
}

/// Update user role request
#[derive(Debug, Deserialize)]
pub struct UpdateUserRoleRequest {
    pub role: String,
}

/// Update managed projects request
#[derive(Debug, Deserialize)]
pub struct UpdateUserProjectsRequest {
    #[serde(default)]
    pub project_ids: Vec<Uuid>,
}
