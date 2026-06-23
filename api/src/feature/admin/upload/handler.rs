use axum::extract::State;
use serde_json::Value;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

pub async fn list_uploads(State(state): State<AppState>) -> ApiResult<Vec<Value>> {
    let rows = sqlx::query_scalar::<_, Value>(
        r#"
        SELECT
            to_jsonb(f) || jsonb_build_object(
                'uploaded_by_name', COALESCE(u.username, u.email),
                'uploaded_by_email', u.email
            )
        FROM upload_files f
        LEFT JOIN users u ON u.id = f.uploaded_by
        WHERE f.is_deleted = FALSE
        ORDER BY f.created_at DESC
        "#,
    )
    .fetch_all(state.db.pool())
    .await
    .map_err(|err| ApiError::default().log_only(err))?;

    Ok(ApiSuccess::default()
        .with_data(rows)
        .with_message("Upload files fetched successfully"))
}
