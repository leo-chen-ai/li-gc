use axum::{
    Router,
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    routing::{delete, get, post, put},
};

use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::middleware::{admin_middleware, auth_middleware},
    state::AppState,
};

use super::{
    attendance_alert, construction, enterprise, log, registration_lead, report_forwarding, role,
    stats, supplemental_attendance, system_warning, upload, user,
};

fn report_forward_routes() -> Router<AppState> {
    Router::new()
        .route("/report-forward/summary", get(report_forwarding::summary))
        .route(
            "/report-forward/configs",
            get(report_forwarding::list_configs).post(report_forwarding::create_config),
        )
        .route(
            "/report-forward/configs/{config_id}",
            get(report_forwarding::get_config)
                .put(report_forwarding::update_config)
                .patch(report_forwarding::update_config)
                .delete(report_forwarding::delete_config),
        )
        .route(
            "/report-forward/configs/{config_id}/runs",
            post(report_forwarding::create_run),
        )
        .route("/report-forward/runs", get(report_forwarding::list_runs))
        .route(
            "/report-forward/runs/{run_id}",
            get(report_forwarding::get_run),
        )
        .route(
            "/report-forward/runs/{run_id}/cancel",
            post(report_forwarding::cancel_run),
        )
        .route(
            "/report-forward/runs/{run_id}/retry",
            post(report_forwarding::retry_run),
        )
        .route("/report-forward/items", get(report_forwarding::list_items))
        .route(
            "/report-forward/runs/{run_id}/items/export",
            get(report_forwarding::export_items),
        )
        .route(
            "/report-forward/artifacts/{artifact_id}/download",
            get(report_forwarding::download_artifact),
        )
}

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .merge(report_forward_routes())
        .route("/log/level", post(log::handler::set_log_level))
        .route(
            "/attendance-alert-configs",
            get(attendance_alert::list_configs).post(attendance_alert::create_config),
        )
        .route(
            "/attendance-alert-configs/{config_id}",
            put(attendance_alert::update_config)
                .patch(attendance_alert::update_config)
                .delete(attendance_alert::delete_config),
        )
        .route("/attendance-alert-logs", get(attendance_alert::list_logs))
        .route("/attendance-alerts/run", post(attendance_alert::run_alerts))
        .route(
            "/managed-attendance/photo-groups",
            get(construction::handler::list_managed_attendance_photo_groups)
                .post(construction::handler::create_managed_attendance_photo_group),
        )
        .route(
            "/managed-attendance/photo-groups/{photo_group_id}",
            get(construction::handler::get_managed_attendance_photo_group)
                .put(construction::handler::update_managed_attendance_photo_group)
                .patch(construction::handler::update_managed_attendance_photo_group)
                .delete(construction::handler::delete_managed_attendance_photo_group),
        )
        .route(
            "/managed-attendance/configs",
            get(construction::handler::list_managed_attendance_configs)
                .post(construction::handler::create_managed_attendance_config),
        )
        .route(
            "/managed-attendance/configs/{config_id}",
            get(construction::handler::get_managed_attendance_config)
                .put(construction::handler::update_managed_attendance_config)
                .patch(construction::handler::update_managed_attendance_config)
                .delete(construction::handler::delete_managed_attendance_config),
        )
        .route(
            "/managed-attendance/configs/{config_id}/generate",
            post(construction::handler::generate_managed_attendance_records),
        )
        .route(
            "/managed-attendance/configs/{config_id}/resend-day",
            post(construction::handler::resend_managed_attendance_day),
        )
        .route(
            "/managed-attendance/records",
            get(construction::handler::list_managed_attendance_records),
        )
        .route("/projects", get(construction::handler::list_projects))
        .route("/projects", post(construction::handler::create_project))
        .route(
            "/projects/options",
            get(construction::handler::list_project_options),
        )
        .route(
            "/projects/{id}",
            get(construction::handler::get_project)
                .put(construction::handler::update_project)
                .patch(construction::handler::update_project)
                .delete(construction::handler::delete_project),
        )
        .route(
            "/projects/{project_id}/units",
            get(construction::handler::list_units).post(construction::handler::create_unit),
        )
        .route(
            "/projects/{project_id}/units/reporting/repair",
            post(construction::handler::repair_unit_reporting),
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
            "/projects/{project_id}/teams/reporting/repair",
            post(construction::handler::repair_team_reporting),
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
            "/projects/{project_id}/workers/reporting/repair",
            post(construction::handler::repair_worker_reporting),
        )
        .route(
            "/projects/{project_id}/workers/export",
            post(construction::handler::export_project_workers_advanced),
        )
        .route(
            "/projects/{project_id}/workers/{worker_id}",
            get(construction::handler::get_worker)
                .put(construction::handler::update_worker)
                .patch(construction::handler::update_worker)
                .delete(construction::handler::delete_worker),
        )
        .route(
            "/projects/{project_id}/workers/{worker_id}/contract-download",
            get(construction::handler::download_worker_contract),
        )
        .route(
            "/projects/{project_id}/contract-template",
            get(construction::handler::get_project_contract_template_config)
                .put(construction::handler::upsert_project_contract_template_config),
        )
        .route(
            "/projects/{project_id}/attendance-records",
            get(construction::handler::list_attendance)
                .post(construction::handler::create_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-records/yongxin-repair",
            post(construction::handler::repair_yongxin_attendance_reporting),
        )
        .route(
            "/projects/{project_id}/attendance-records/yongxin-repair/preview",
            post(construction::handler::preview_yongxin_attendance_reporting),
        )
        .route(
            "/projects/{project_id}/attendance-records/export",
            post(construction::handler::export_project_attendance_advanced),
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
        .route(
            "/projects/{project_id}/attendance-devices/{device_id}/issue-workers",
            post(construction::handler::issue_attendance_device_workers),
        )
        .route(
            "/attendance-device-issue-reports",
            get(construction::handler::list_attendance_device_issue_reports)
                .post(construction::handler::create_attendance_device_issue_report),
        )
        .route(
            "/attendance-device-issue-reports/{report_id}",
            get(construction::handler::get_attendance_device_issue_report)
                .put(construction::handler::update_attendance_device_issue_report)
                .patch(construction::handler::update_attendance_device_issue_report)
                .delete(construction::handler::delete_attendance_device_issue_report),
        )
        .route(
            "/projects/{project_id}/wage-batches",
            get(construction::handler::list_wage_batches)
                .post(construction::handler::create_wage_batch),
        )
        .route(
            "/projects/{project_id}/wage-batches/import",
            post(construction::handler::import_wage_batch),
        )
        .route(
            "/projects/{project_id}/wage-batches/export",
            get(construction::handler::export_wage_batches),
        )
        .route(
            "/projects/{project_id}/wage-batches/{batch_id}",
            put(construction::handler::update_wage_batch)
                .patch(construction::handler::update_wage_batch)
                .delete(construction::handler::delete_wage_batch),
        )
        .route(
            "/contract-templates",
            get(construction::handler::list_contract_templates)
                .post(construction::handler::create_contract_template),
        )
        .route(
            "/contract-templates/{template_id}",
            get(construction::handler::get_contract_template)
                .put(construction::handler::update_contract_template)
                .patch(construction::handler::update_contract_template)
                .delete(construction::handler::delete_contract_template),
        )
        .route(
            "/work-hour-configs",
            get(construction::handler::list_work_hour_configs)
                .post(construction::handler::create_work_hour_config),
        )
        .route(
            "/work-hour-configs/{config_id}",
            get(construction::handler::get_work_hour_config)
                .put(construction::handler::update_work_hour_config)
                .patch(construction::handler::update_work_hour_config)
                .delete(construction::handler::delete_work_hour_config),
        )
        .route(
            "/platform-configs",
            get(construction::handler::list_platform_configs)
                .post(construction::handler::create_platform_config),
        )
        .route(
            "/platform-configs/{config_id}",
            get(construction::handler::get_platform_config)
                .put(construction::handler::update_platform_config)
                .patch(construction::handler::update_platform_config)
                .delete(construction::handler::delete_platform_config),
        )
        .route(
            "/platform-logs",
            get(construction::handler::list_platform_logs)
                .post(construction::handler::create_platform_log),
        )
        .route(
            "/platform-logs/{log_id}",
            get(construction::handler::get_platform_log)
                .put(construction::handler::update_platform_log)
                .patch(construction::handler::update_platform_log)
                .delete(construction::handler::delete_platform_log),
        )
        .route(
            "/platform-jobs/{job_id}/retry",
            post(construction::handler::retry_platform_job),
        )
        .route(
            "/construction-overview",
            get(construction::handler::get_construction_overview),
        )
        .route(
            "/enterprise-customers",
            get(enterprise::handler::list_enterprise_customers)
                .post(enterprise::handler::create_enterprise_customer),
        )
        .route(
            "/enterprise-customers/export",
            get(enterprise::handler::export_enterprise_customers),
        )
        .route(
            "/enterprise-customers/{customer_id}",
            get(enterprise::handler::get_enterprise_customer)
                .put(enterprise::handler::update_enterprise_customer)
                .patch(enterprise::handler::update_enterprise_customer)
                .delete(enterprise::handler::delete_enterprise_customer),
        )
        .route(
            "/enterprise-customers/{customer_id}/summary",
            get(enterprise::handler::get_enterprise_customer_summary),
        )
        .route(
            "/enterprise-own-entities",
            get(enterprise::handler::list_enterprise_own_entities)
                .post(enterprise::handler::create_enterprise_own_entity),
        )
        .route(
            "/enterprise-own-entities/export",
            get(enterprise::handler::export_enterprise_own_entities),
        )
        .route(
            "/enterprise-own-entities/{entity_id}",
            get(enterprise::handler::get_enterprise_own_entity)
                .put(enterprise::handler::update_enterprise_own_entity)
                .patch(enterprise::handler::update_enterprise_own_entity)
                .delete(enterprise::handler::delete_enterprise_own_entity),
        )
        .route(
            "/enterprise-projects",
            get(enterprise::handler::list_enterprise_projects)
                .post(enterprise::handler::create_enterprise_project),
        )
        .route(
            "/enterprise-projects/export",
            get(enterprise::handler::export_enterprise_projects),
        )
        .route(
            "/enterprise-projects/{project_id}",
            get(enterprise::handler::get_enterprise_project)
                .put(enterprise::handler::update_enterprise_project)
                .patch(enterprise::handler::update_enterprise_project)
                .delete(enterprise::handler::delete_enterprise_project),
        )
        .route(
            "/enterprise-projects/{project_id}/summary",
            get(enterprise::handler::get_enterprise_project_summary),
        )
        .route(
            "/enterprise-projects/{project_id}/issued-invoices",
            get(enterprise::handler::list_issued_invoices)
                .post(enterprise::handler::create_issued_invoice),
        )
        .route(
            "/enterprise-projects/{project_id}/issued-invoices/export",
            get(enterprise::handler::export_issued_invoices),
        )
        .route(
            "/enterprise-projects/{project_id}/issued-invoices/{record_id}",
            put(enterprise::handler::update_issued_invoice)
                .patch(enterprise::handler::update_issued_invoice)
                .delete(enterprise::handler::delete_issued_invoice),
        )
        .route(
            "/enterprise-projects/{project_id}/received-invoices",
            get(enterprise::handler::list_received_invoices)
                .post(enterprise::handler::create_received_invoice),
        )
        .route(
            "/enterprise-projects/{project_id}/received-invoices/export",
            get(enterprise::handler::export_received_invoices),
        )
        .route(
            "/enterprise-projects/{project_id}/received-invoices/{record_id}",
            put(enterprise::handler::update_received_invoice)
                .patch(enterprise::handler::update_received_invoice)
                .delete(enterprise::handler::delete_received_invoice),
        )
        .route(
            "/enterprise-projects/{project_id}/collections",
            get(enterprise::handler::list_collections).post(enterprise::handler::create_collection),
        )
        .route(
            "/enterprise-projects/{project_id}/collections/export",
            get(enterprise::handler::export_collections),
        )
        .route(
            "/enterprise-projects/{project_id}/collections/{record_id}",
            put(enterprise::handler::update_collection)
                .patch(enterprise::handler::update_collection)
                .delete(enterprise::handler::delete_collection),
        )
        .route(
            "/enterprise-projects/{project_id}/payments",
            get(enterprise::handler::list_payments).post(enterprise::handler::create_payment),
        )
        .route(
            "/enterprise-projects/{project_id}/payments/export",
            get(enterprise::handler::export_payments),
        )
        .route(
            "/enterprise-projects/{project_id}/payments/{record_id}",
            put(enterprise::handler::update_payment)
                .patch(enterprise::handler::update_payment)
                .delete(enterprise::handler::delete_payment),
        )
        .route("/roles", get(role::handler::list_roles))
        .route("/roles", post(role::handler::create_role))
        .route("/roles/{id}", delete(role::handler::delete_role))
        .route("/roles/{id}/menus", put(role::handler::update_role_menus))
        .route(
            "/registration-leads",
            get(registration_lead::handler::list_registration_leads),
        )
        .route("/uploads", get(upload::handler::list_uploads))
        .route(
            "/users",
            get(user::handler::list_users).post(user::handler::create_user),
        )
        .route("/users/{id}/role", post(user::handler::update_user_role))
        .route("/users/{id}", delete(user::handler::delete_user))
        .route(
            "/users/{id}/password",
            put(user::handler::reset_user_password),
        )
        .route(
            "/users/{id}/projects",
            put(user::handler::update_user_projects),
        )
        .route("/stats", get(stats::handler::get_dashboard_stats))
        .route(
            "/projects/{project_id}/attendance-generator/preview",
            post(construction::handler::preview_generated_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-generator/commit",
            post(construction::handler::commit_generated_attendance),
        )
        .route_layer(middleware::from_fn(admin_middleware))
        .route_layer(middleware::from_fn(auth_middleware))
}

pub fn management_routes(state: AppState) -> Router<AppState> {
    let permitted_report_forward_routes = report_forward_routes().route_layer(
        middleware::from_fn_with_state(state.clone(), data_reporting_permission_middleware),
    );

    Router::new()
        .merge(permitted_report_forward_routes)
        .route(
            "/role-permissions",
            get(role::handler::current_role_permissions),
        )
        .route("/warnings", get(system_warning::list_warnings))
        .route(
            "/supplemental-attendance/records",
            get(supplemental_attendance::list_records)
                .delete(supplemental_attendance::delete_records),
        )
        .route(
            "/supplemental-attendance/records/{job_id}/log",
            get(supplemental_attendance::get_dispatch_log),
        )
        .route("/projects", get(construction::handler::list_projects))
        .route(
            "/projects/{project_id}",
            get(construction::handler::get_project)
                .put(construction::handler::update_project)
                .patch(construction::handler::update_project),
        )
        .route(
            "/projects/options",
            get(construction::handler::list_accessible_project_options),
        )
        .route(
            "/projects/{project_id}/units",
            get(construction::handler::list_units).post(construction::handler::create_unit),
        )
        .route(
            "/projects/{project_id}/units/reporting/repair",
            post(construction::handler::repair_unit_reporting),
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
            "/projects/{project_id}/teams/reporting/repair",
            post(construction::handler::repair_team_reporting),
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
            "/projects/{project_id}/workers/reporting/repair",
            post(construction::handler::repair_worker_reporting),
        )
        .route(
            "/projects/{project_id}/workers/export",
            post(construction::handler::export_project_workers_advanced),
        )
        .route(
            "/projects/{project_id}/workers/{worker_id}",
            get(construction::handler::get_worker)
                .put(construction::handler::update_worker)
                .patch(construction::handler::update_worker)
                .delete(construction::handler::delete_worker),
        )
        .route(
            "/projects/{project_id}/workers/{worker_id}/contract-download",
            get(construction::handler::download_worker_contract),
        )
        .route(
            "/projects/{project_id}/attendance-records",
            get(construction::handler::list_attendance)
                .post(construction::handler::create_attendance),
        )
        .route(
            "/projects/{project_id}/attendance-records/yongxin-repair",
            post(construction::handler::repair_yongxin_attendance_reporting),
        )
        .route(
            "/projects/{project_id}/attendance-records/yongxin-repair/preview",
            post(construction::handler::preview_yongxin_attendance_reporting),
        )
        .route(
            "/projects/{project_id}/attendance-records/export",
            post(construction::handler::export_project_attendance_advanced),
        )
        .route(
            "/projects/{project_id}/attendance-records/{attendance_id}",
            get(construction::handler::get_attendance)
                .put(construction::handler::update_attendance)
                .patch(construction::handler::update_attendance)
                .delete(construction::handler::delete_attendance),
        )
        .route(
            "/projects/{project_id}/wage-batches",
            get(construction::handler::list_wage_batches)
                .post(construction::handler::create_wage_batch),
        )
        .route(
            "/projects/{project_id}/wage-batches/import",
            post(construction::handler::import_wage_batch),
        )
        .route(
            "/projects/{project_id}/wage-batches/export",
            get(construction::handler::export_wage_batches),
        )
        .route(
            "/projects/{project_id}/wage-batches/{batch_id}",
            put(construction::handler::update_wage_batch)
                .patch(construction::handler::update_wage_batch)
                .delete(construction::handler::delete_wage_batch),
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
        .route(
            "/projects/{project_id}/attendance-devices/{device_id}/issue-workers",
            post(construction::handler::issue_attendance_device_workers),
        )
        .route(
            "/attendance-device-issue-reports",
            get(construction::handler::list_attendance_device_issue_reports)
                .post(construction::handler::create_attendance_device_issue_report),
        )
        .route(
            "/attendance-device-issue-reports/{report_id}",
            get(construction::handler::get_attendance_device_issue_report)
                .put(construction::handler::update_attendance_device_issue_report)
                .patch(construction::handler::update_attendance_device_issue_report)
                .delete(construction::handler::delete_attendance_device_issue_report),
        )
        .route(
            "/personnel-workers",
            get(construction::handler::list_personnel_workers),
        )
        .route(
            "/personnel-workers/{worker_id}",
            get(construction::handler::get_personnel_worker),
        )
        .route_layer(middleware::from_fn_with_state(
            state,
            management_menu_permission_middleware,
        ))
        .route_layer(middleware::from_fn(auth_middleware))
}

async fn management_menu_permission_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let Some(allowed_menu_keys) = allowed_menu_keys_for_management_path(request.uri().path())
    else {
        return Ok(next.run(request).await);
    };

    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .cloned()
        .ok_or(StatusCode::UNAUTHORIZED)?;
    ensure_any_menu_permission(&state, &auth_user, allowed_menu_keys).await?;
    Ok(next.run(request).await)
}

async fn data_reporting_permission_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .cloned()
        .ok_or(StatusCode::UNAUTHORIZED)?;
    ensure_any_menu_permission(&state, &auth_user, &["data_reporting"]).await?;
    Ok(next.run(request).await)
}

async fn ensure_any_menu_permission(
    state: &AppState,
    auth_user: &AuthUser,
    allowed_menu_keys: &[&str],
) -> Result<(), StatusCode> {
    if auth_user.roles.contains(&Role::Admin) {
        return Ok(());
    }

    let user = state
        .user_repo
        .find_by_id(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .filter(|user| user.is_active)
        .ok_or(StatusCode::FORBIDDEN)?;

    let role = state
        .admin_role_repo
        .find_by_code(state.db.pool(), &user.role)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::FORBIDDEN)?;

    if !role
        .menu_keys
        .iter()
        .any(|key| allowed_menu_keys.contains(&key.as_str()))
    {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(())
}

fn allowed_menu_keys_for_management_path(path: &str) -> Option<&'static [&'static str]> {
    let management_path = path
        .split_once("/management")
        .map(|(_, suffix)| suffix)
        .unwrap_or(path);

    if management_path == "/projects" || management_path == "/projects/options" {
        return Some(&[
            "projects",
            "attendance_devices",
            "attendance_device_issue_reports",
            "personnel_workers",
            "supplemental_attendance",
        ]);
    }

    if management_path.starts_with("/projects/") {
        return Some(if management_path.contains("/attendance-devices") {
            &["attendance_devices"]
        } else {
            &["projects"]
        });
    }

    if management_path.starts_with("/attendance-device-issue-reports") {
        return Some(&["attendance_device_issue_reports"]);
    }

    if management_path.starts_with("/personnel-workers") {
        return Some(&["personnel_workers"]);
    }

    if management_path.starts_with("/supplemental-attendance") {
        return Some(&["supplemental_attendance"]);
    }

    None
}

#[cfg(test)]
mod management_permission_tests {
    use super::allowed_menu_keys_for_management_path;

    #[test]
    fn management_paths_map_to_their_menu_permissions() {
        assert_eq!(
            allowed_menu_keys_for_management_path("/api/v1/management/projects/123/workers"),
            Some(&["projects"][..])
        );
        assert_eq!(
            allowed_menu_keys_for_management_path(
                "/api/v1/management/projects/123/attendance-devices"
            ),
            Some(&["attendance_devices"][..])
        );
        assert_eq!(
            allowed_menu_keys_for_management_path("/api/v1/management/report-forward/summary"),
            None
        );
        assert_eq!(
            allowed_menu_keys_for_management_path(
                "/api/v1/management/supplemental-attendance/records"
            ),
            Some(&["supplemental_attendance"][..])
        );
    }
}
