use axum::{
    Extension, Router,
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    routing::get,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    feature::{
        admin::construction,
        auth::{AuthUser, Role},
    },
    infrastructure::web::{
        middleware::auth_middleware,
        response::{ApiError, ApiResult, ApiSuccess},
    },
    state::AppState,
};

pub fn miniapp_routes(state: AppState) -> Router<AppState> {
    let scoped_project_routes = Router::new()
        .route("/projects/{id}", get(construction::handler::get_project))
        .route(
            "/projects/{project_id}/units",
            get(construction::handler::list_units).post(construction::handler::create_unit),
        )
        .route(
            "/projects/{project_id}/units/{unit_id}",
            get(construction::handler::get_unit)
                .put(construction::handler::update_unit)
                .patch(construction::handler::update_unit)
                .delete(construction::handler::delete_unit),
        )
        .route(
            "/projects/{project_id}/teams",
            get(construction::handler::list_teams).post(construction::handler::create_team),
        )
        .route(
            "/projects/{project_id}/teams/{team_id}",
            get(construction::handler::get_team)
                .put(construction::handler::update_team)
                .patch(construction::handler::update_team)
                .delete(construction::handler::delete_team),
        )
        .route(
            "/projects/{project_id}/workers",
            get(construction::handler::list_workers).post(construction::handler::create_worker),
        )
        .route(
            "/projects/{project_id}/workers/{worker_id}",
            get(construction::handler::get_worker)
                .put(construction::handler::update_worker)
                .patch(construction::handler::update_worker)
                .delete(construction::handler::delete_worker),
        )
        .route(
            "/projects/{project_id}/attendance-records",
            get(construction::handler::list_attendance)
                .post(construction::handler::create_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-records/{attendance_id}",
            get(construction::handler::get_attendance)
                .put(construction::handler::update_attendance)
                .patch(construction::handler::update_attendance)
                .delete(construction::handler::delete_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-devices",
            get(construction::handler::list_attendance_devices)
                .post(construction::handler::create_attendance_device),
        )
        .route(
            "/projects/{project_id}/attendance-devices/{device_id}",
            get(construction::handler::get_attendance_device)
                .put(construction::handler::update_attendance_device)
                .patch(construction::handler::update_attendance_device)
                .delete(construction::handler::delete_attendance_device),
        )
        .route_layer(middleware::from_fn_with_state(
            state,
            miniapp_project_middleware,
        ));

    Router::new()
        .route("/projects/options", get(list_miniapp_project_options))
        .merge(scoped_project_routes)
        .route_layer(middleware::from_fn(auth_middleware))
}

async fn miniapp_project_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if auth_user.roles.contains(&Role::Admin) {
        return Ok(next.run(request).await);
    }

    let project_id = extract_project_id(request.uri().path()).ok_or(StatusCode::BAD_REQUEST)?;
    let is_allowed = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM user_managed_projects ump
            JOIN construction_projects p ON p.id = ump.project_id AND p.is_deleted = FALSE
            WHERE ump.user_id = $1 AND ump.project_id = $2
        )
        "#,
    )
    .bind(auth_user.user_id)
    .bind(project_id)
    .fetch_one(state.db.pool())
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !is_allowed {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(request).await)
}

fn extract_project_id(path: &str) -> Option<Uuid> {
    let mut segments = path.split('/').filter(|segment| !segment.is_empty());
    while let Some(segment) = segments.next() {
        if segment == "projects" {
            return segments
                .next()
                .and_then(|value| Uuid::parse_str(value).ok());
        }
    }
    None
}

async fn list_miniapp_project_options(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Value> {
    let items = if auth_user.roles.contains(&Role::Admin) {
        sqlx::query_scalar::<_, Value>(
            r#"
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', p.id,
                        'name', COALESCE(p.name, '未命名项目'),
                        'work_permit', p.work_permit,
                        'status', p.status,
                        'address', p.address,
                        'address_code_list', p.address_code_list,
                        'build_unit', p.build_unit,
                        'contractor', p.contractor,
                        'updated_at', p.updated_at
                    )
                    ORDER BY p.updated_at DESC
                ),
                '[]'::jsonb
            )
            FROM construction_projects p
            WHERE p.is_deleted = FALSE
            "#,
        )
        .fetch_one(state.db.pool())
        .await
    } else {
        sqlx::query_scalar::<_, Value>(
            r#"
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', p.id,
                        'name', COALESCE(p.name, '未命名项目'),
                        'work_permit', p.work_permit,
                        'status', p.status,
                        'address', p.address,
                        'address_code_list', p.address_code_list,
                        'build_unit', p.build_unit,
                        'contractor', p.contractor,
                        'updated_at', p.updated_at
                    )
                    ORDER BY p.updated_at DESC
                ),
                '[]'::jsonb
            )
            FROM user_managed_projects ump
            JOIN construction_projects p ON p.id = ump.project_id AND p.is_deleted = FALSE
            WHERE ump.user_id = $1
            "#,
        )
        .bind(auth_user.user_id)
        .fetch_one(state.db.pool())
        .await
    }
    .map_err(|error| ApiError::default().log_only(error))?;

    Ok(ApiSuccess::default().with_data(items))
}

#[cfg(test)]
mod tests {
    use super::extract_project_id;

    #[test]
    fn extracts_project_id_from_miniapp_path() {
        assert_eq!(
            extract_project_id(
                "/api/v1/miniapp/projects/00000000-0000-0000-0000-000000000001/teams"
            )
            .map(|id| id.to_string()),
            Some("00000000-0000-0000-0000-000000000001".to_owned())
        );
        assert!(extract_project_id("/api/v1/miniapp/projects/options").is_none());
    }
}
