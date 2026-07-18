use axum::{Json, extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{generic, validation as val_codes},
    },
    state::AppState,
};

#[derive(Debug, Deserialize, Validate)]
pub struct CreateRegistrationLeadRequest {
    #[validate(length(
        min = 3,
        max = 50,
        message = "Username must be between 3 and 50 characters"
    ))]
    pub username: String,
    #[validate(length(
        min = 2,
        max = 100,
        message = "Name must be between 2 and 100 characters"
    ))]
    pub name: String,
    #[validate(length(
        min = 6,
        max = 30,
        message = "Phone must be between 6 and 30 characters"
    ))]
    pub phone: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RegistrationLeadResponse {
    pub id: Uuid,
    pub username: Option<String>,
    pub name: String,
    pub phone: String,
    pub created_at: DateTime<Utc>,
}

pub async fn create_registration_lead(
    State(state): State<AppState>,
    Json(req): Json<CreateRegistrationLeadRequest>,
) -> ApiResult<RegistrationLeadResponse> {
    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message(format!("Validation error: {}", e)));
    }

    let username = req.username.trim();
    let name = req.name.trim();
    let phone = req.phone.trim();
    if username.is_empty() || name.is_empty() || phone.is_empty() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(generic::INVALID_INPUT)
            .with_message("Username, name, and phone are required"));
    }

    let lead = sqlx::query_as::<_, RegistrationLeadResponse>(
        r#"
        INSERT INTO registration_leads (username, name, phone)
        VALUES ($1, $2, $3)
        RETURNING id, username, name, phone, created_at
        "#,
    )
    .bind(username)
    .bind(name)
    .bind(phone)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(lead)
        .with_message("Registration lead created successfully"))
}

pub async fn list_registration_leads(
    State(state): State<AppState>,
) -> ApiResult<Vec<RegistrationLeadResponse>> {
    let leads = sqlx::query_as::<_, RegistrationLeadResponse>(
        r#"
        SELECT id, username, name, phone, created_at
        FROM registration_leads
        ORDER BY created_at DESC
        LIMIT 500
        "#,
    )
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(leads)
        .with_message("Registration leads retrieved successfully"))
}
