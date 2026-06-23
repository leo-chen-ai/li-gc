use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct AdminRoleResponse {
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

#[derive(Debug, Deserialize)]
pub struct CreateRoleRequest {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoleMenusRequest {
    pub menu_keys: Vec<String>,
}
