use std::collections::HashMap;

use sqlx::{PgPool, postgres::PgPoolOptions};
use testcontainers::{ContainerAsync, runners::AsyncRunner};
use testcontainers_modules::postgres::Postgres;

async fn build_pool() -> (PgPool, ContainerAsync<Postgres>) {
    let container = Postgres::default()
        .start()
        .await
        .expect("Failed to start Postgres container");

    let port = container.get_host_port_ipv4(5432).await.unwrap();
    let url = format!("postgresql://postgres:postgres@127.0.0.1:{port}/postgres");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .expect("Failed to connect to test container");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    (pool, container)
}

async fn table_columns(pool: &PgPool, table_name: &str) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
        "#,
    )
    .bind(table_name)
    .fetch_all(pool)
    .await
    .expect("read table columns")
}

async fn table_column_data_types(pool: &PgPool, table_name: &str) -> HashMap<String, String> {
    sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        "#,
    )
    .bind(table_name)
    .fetch_all(pool)
    .await
    .expect("read table column types")
    .into_iter()
    .collect()
}

fn assert_has_columns(columns: &[String], required: &[&str]) {
    for column in required {
        assert!(
            columns.iter().any(|existing| existing == column),
            "missing column `{column}` in {columns:?}"
        );
    }
}

fn assert_lacks_columns(columns: &[String], excluded: &[&str]) {
    for column in excluded {
        assert!(
            !columns.iter().any(|existing| existing == column),
            "platform integration column `{column}` should not be copied"
        );
    }
}

fn assert_text_columns(column_types: &HashMap<String, String>, required: &[&str]) {
    for column in required {
        assert_eq!(
            column_types.get(*column).map(String::as_str),
            Some("text"),
            "column `{column}` should be TEXT, got {:?}",
            column_types.get(*column)
        );
    }
}

#[tokio::test]
async fn construction_core_tables_use_normalized_non_platform_fields() {
    let (pool, _container) = build_pool().await;

    let project_columns = table_columns(&pool, "construction_projects").await;
    assert_has_columns(
        &project_columns,
        &[
            "id",
            "owner_user_id",
            "is_deleted",
            "name",
            "address_code",
            "street",
            "start_date",
            "finish_date",
            "invest_total",
            "investment_nature",
            "labor_cost",
            "status",
            "category",
            "industry",
            "address",
            "longitude",
            "latitude",
            "work_permit",
            "supervision_area",
            "contractor",
            "contractor_credit_code",
            "manager",
            "manager_phone",
            "contract_principal",
            "contract_principal_id_card",
            "contract_principal_phone",
            "party_a",
            "legal_representative",
            "legal_representative_id_card",
            "company_office_address",
            "company_phone",
            "bid_notice",
            "build_unit",
            "build_unit_credit_code",
            "labor_subcontractor",
            "labor_subcontractor_credit_code",
            "build_nature",
            "build_scale",
            "acreage",
            "length",
            "purpose",
            "progress_type",
            "real_name_manager",
            "real_name_manager_phone",
            "labor_manager",
            "labor_manager_phone",
            "complaint_phone",
            "labor_complaint_phone",
            "company_complaint_phone",
            "project_complaint_phone",
            "nationality",
            "manager_id_card",
            "labor_manager_id_card",
            "contract_amount",
            "injury_insurance_number",
            "margin_amount",
            "pay_date",
            "margin_photos",
            "injury_insurance_photos",
            "payment_guarantee_photos",
            "contract_number",
            "contract_prefix",
            "party_a_seal",
            "legal_representative_seal",
            "address_code_list",
            "supervision_area_list",
            "bid_notice_file",
            "margin_photos_file",
            "injury_insurance_photos_file",
            "payment_guarantee_photos_file",
            "is_inspected",
            "is_handheld_device_enabled",
            "created_at",
            "updated_at",
            "deleted_at",
        ],
    );
    assert_lacks_columns(
        &project_columns,
        &[
            "project_code",
            "rs_app_secret",
            "authorization_code",
            "wo_appid",
            "api",
            "api_config",
        ],
    );

    let unit_columns = table_columns(&pool, "construction_units").await;
    assert_has_columns(
        &unit_columns,
        &[
            "id",
            "project_id",
            "company_name",
            "company_credit_code",
            "company_type",
            "register_date",
            "register_area",
            "company_address",
            "manager_name",
            "manager_phone",
            "manager_id_card",
            "legal_person_name",
            "legal_person_id_card",
            "company_phone",
            "contract_amount",
            "attachment",
            "register_area_list",
            "attachment_file",
            "timer_set_a",
            "timer_set_b",
            "timer_set_c",
            "salary_calc_type",
            "quantity_unit_type",
            "seal_photo",
        ],
    );
    assert_lacks_columns(
        &unit_columns,
        &[
            "rs_api_status",
            "haishu1336_status",
            "haishu1336_request_message",
        ],
    );

    let team_columns = table_columns(&pool, "construction_teams").await;
    assert_has_columns(
        &team_columns,
        &[
            "project_id",
            "unit_id",
            "name",
            "work_type",
            "is_manage_team",
            "settlement_type",
            "quantity_unit_type",
            "remark",
            "attendance_start_time",
            "attendance_end_time",
            "attendance_is_next_day",
            "leader_id",
            "leader_name",
            "leader_phone",
            "leader_id_card",
            "team_no",
        ],
    );
    assert_lacks_columns(
        &team_columns,
        &[
            "api_run_shi_team_id",
            "api_zheng_hai_team_id",
            "haishu1336_team_no",
            "gj_team_id",
        ],
    );

    let worker_columns = table_columns(&pool, "construction_workers").await;
    assert_has_columns(
        &worker_columns,
        &[
            "project_id",
            "unit_id",
            "team_id",
            "id_card",
            "name",
            "gender",
            "nation",
            "visa_office",
            "address",
            "validity_period",
            "ocr_photo",
            "work_type",
            "worker_type",
            "political_status",
            "education",
            "settlement_type",
            "quantity_unit_type",
            "unit_price",
            "salary_bank_card",
            "salary_bank",
            "has_insurance",
            "has_major_medical_history",
            "current_address",
            "dormitory_id",
            "id_card_back_file",
            "phone",
            "is_manage_team",
            "is_key_personnel",
            "avatar",
            "work_status",
            "labor_contract_file",
            "settlement_file",
            "exit_time",
            "auth_status",
            "auth_fail_reason",
            "manager_type",
            "validity_period_end",
            "entry_time",
            "signature_photo",
            "signature_time",
            "native_place",
        ],
    );
    assert_lacks_columns(
        &worker_columns,
        &[
            "wo_admit_guid",
            "api_run_shi_worker_code",
            "api_zheng_hai_worker_code",
            "xinleda_status",
            "haishu1336_worker_no",
            "jinghuashi_worker_id",
            "hangzhoushi_worker_id",
        ],
    );

    let attendance_columns = table_columns(&pool, "construction_attendance_records").await;
    assert_has_columns(
        &attendance_columns,
        &[
            "worker_id",
            "project_id",
            "direction",
            "trigger_time",
            "equipment_id",
            "serial_number",
            "photo_path",
            "overall_photo",
            "closeup_photo",
            "original_time",
        ],
    );
    assert_lacks_columns(
        &attendance_columns,
        &[
            "request_serial_code",
            "rs_send_status",
            "gj_status",
            "zhigong_send_time",
        ],
    );
}

#[tokio::test]
async fn construction_core_upload_and_address_fields_allow_long_text() {
    let (pool, _container) = build_pool().await;

    assert_text_columns(
        &table_column_data_types(&pool, "construction_projects").await,
        &[
            "address",
            "company_office_address",
            "margin_photos",
            "injury_insurance_photos",
            "payment_guarantee_photos",
            "party_a_seal",
            "legal_representative_seal",
            "address_code_list",
            "supervision_area_list",
        ],
    );
    assert_text_columns(
        &table_column_data_types(&pool, "construction_units").await,
        &[
            "company_address",
            "attachment",
            "register_area_list",
            "seal_photo",
        ],
    );
    assert_text_columns(
        &table_column_data_types(&pool, "construction_teams").await,
        &["remark"],
    );
    assert_text_columns(
        &table_column_data_types(&pool, "construction_workers").await,
        &[
            "address",
            "ocr_photo",
            "current_address",
            "id_card_back_file",
            "avatar",
            "auth_fail_reason",
            "signature_photo",
        ],
    );
    assert_text_columns(
        &table_column_data_types(&pool, "construction_attendance_records").await,
        &["photo_path", "overall_photo", "closeup_photo"],
    );
}

#[tokio::test]
async fn construction_core_tables_support_project_nested_crud_and_fake_attendance() {
    let (pool, _container) = build_pool().await;

    let project_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_projects (name, address, status, work_permit)
        VALUES ('测试项目', '测试地址', 1, 'WP-001')
        RETURNING id
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("insert project");

    sqlx::query("UPDATE construction_projects SET name = '测试项目-修改' WHERE id = $1")
        .bind(project_id)
        .execute(&pool)
        .await
        .expect("update project");

    let unit_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_units (project_id, company_name, company_credit_code, company_type)
        VALUES ($1, '测试建设单位', '91320000TEST0001X', 1)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .expect("insert unit");

    sqlx::query("UPDATE construction_units SET company_name = '测试建设单位-修改' WHERE id = $1")
        .bind(unit_id)
        .execute(&pool)
        .await
        .expect("update unit");

    let team_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_teams (project_id, unit_id, name, work_type, attendance_start_time, attendance_end_time)
        VALUES ($1, $2, '钢筋一班', 10, '06:00', '18:00')
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .fetch_one(&pool)
    .await
    .expect("insert team");

    sqlx::query("UPDATE construction_teams SET name = '钢筋一班-修改' WHERE id = $1")
        .bind(team_id)
        .execute(&pool)
        .await
        .expect("update team");

    let worker_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_workers (project_id, unit_id, team_id, id_card, name, gender, phone, work_status)
        VALUES ($1, $2, $3, '320800199001011234', '张三', 1, '13800000000', 1)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(unit_id)
    .bind(team_id)
    .fetch_one(&pool)
    .await
    .expect("insert worker");

    sqlx::query("UPDATE construction_workers SET name = '张三-修改' WHERE id = $1")
        .bind(worker_id)
        .execute(&pool)
        .await
        .expect("update worker");

    let attendance_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO construction_attendance_records
            (worker_id, project_id, direction, trigger_time, equipment_id, serial_number, original_time)
        VALUES
            ($1, $2, 0, NOW(), 'gate-001', 'SN-001', '2026-06-18 08:00:00')
        RETURNING id
        "#,
    )
    .bind(worker_id)
    .bind(project_id)
    .fetch_one(&pool)
    .await
    .expect("insert fake attendance");

    sqlx::query("DELETE FROM construction_attendance_records WHERE id = $1")
        .bind(attendance_id)
        .execute(&pool)
        .await
        .expect("delete attendance");
    sqlx::query("DELETE FROM construction_workers WHERE id = $1")
        .bind(worker_id)
        .execute(&pool)
        .await
        .expect("delete worker");
    sqlx::query("DELETE FROM construction_teams WHERE id = $1")
        .bind(team_id)
        .execute(&pool)
        .await
        .expect("delete team");
    sqlx::query("DELETE FROM construction_units WHERE id = $1")
        .bind(unit_id)
        .execute(&pool)
        .await
        .expect("delete unit");
    sqlx::query("DELETE FROM construction_projects WHERE id = $1")
        .bind(project_id)
        .execute(&pool)
        .await
        .expect("delete project");

    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM construction_projects")
        .fetch_one(&pool)
        .await
        .expect("count projects");
    assert_eq!(remaining, 0);
}
