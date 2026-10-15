//! 只从有权访问项目近7天的设备原始考勤抽取完整图，不创建照片组。
use axum::extract::{Extension, State};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use super::{internal_error, invalid_input, ok};
use crate::{
    feature::auth::{AuthUser, Role},
    infrastructure::web::{
        response::{ApiError, ApiResult},
        trimmed_json::TrimmedJson,
    },
    state::AppState,
};

#[derive(Deserialize)]
pub struct SampleRequest {
    project_id: Uuid,
    count: usize,
}
#[derive(Serialize, sqlx::FromRow)]
pub struct Reference {
    record_id: Uuid,
}

// 两条查询共用同一真实来源条件，指定ID也不能绕过时间、来源和授权过滤。
const REAL_SOURCE: &str = r#"
 FROM construction_attendance_records r
 JOIN LATERAL (
   SELECT a.photo_data FROM construction_attendance_record_photos a
   WHERE a.attendance_record_id=r.id
     AND a.source IN ('mqtt_rec_push','device_vendor_b_photo','qianyi_mqtt')
     AND a.photo_kind IN ('overall','closeup','snapshot')
     AND NULLIF(a.photo_data,'') IS NOT NULL
   ORDER BY (a.photo_kind='overall') DESC,a.created_at DESC LIMIT 1
 ) photo ON TRUE
 WHERE r.trigger_time>=NOW()-INTERVAL '7 days' AND r.trigger_time<=NOW()
   AND NOT r.is_deleted AND NOT r.is_generated AND NOT r.is_managed_generated
   AND COALESCE(r.record_type,'device')='device'
   AND NULLIF(BTRIM(COALESCE(r.serial_number,r.equipment_id)),'') IS NOT NULL
   AND r.worker_id IS NOT NULL
"#;
fn filtered_query<'a>(
    select: &str,
    project_id: Uuid,
    user: &AuthUser,
) -> QueryBuilder<'a, Postgres> {
    let mut query = QueryBuilder::new(select.to_owned());
    query
        .push(REAL_SOURCE)
        .push(" AND r.project_id=")
        .push_bind(project_id);
    if !user.roles.contains(&Role::Admin) {
        query.push(" AND EXISTS (SELECT 1 FROM user_managed_projects ump WHERE ump.project_id=r.project_id AND ump.user_id=")
            .push_bind(user.user_id).push(")");
    }
    query
}

pub async fn sample(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    TrimmedJson(body): TrimmedJson<SampleRequest>,
) -> ApiResult<Vec<Reference>> {
    if !(1..=30).contains(&body.count) {
        return Err(invalid_input("参考照片数量必须为1–30"));
    }
    let mut query = filtered_query(
        "WITH people AS (SELECT DISTINCT ON (r.worker_id) r.id AS record_id, r.worker_id",
        body.project_id,
        &user,
    );
    // 每人只取最近一张，随机选不同人，不读取或返回姓名、身份证号。
    query.push(" ORDER BY r.worker_id,r.trigger_time DESC,r.id) SELECT record_id FROM people ORDER BY random() LIMIT ")
        .push_bind(body.count as i64);
    let rows = query
        .build_query_as::<Reference>()
        .fetch_all(state.db.pool())
        .await
        .map_err(|error| {
            tracing::error!(%error, "抽取真实服装参考失败");
            internal_error("抽取真实考勤参考失败")
        })?;
    if rows.len() < body.count {
        return Err(invalid_input(format!(
            "所选项目近7天只有{}位可用的设备考勤人员，请减少套数或更换项目；不会重复使用同一人的照片",
            rows.len()
        )));
    }
    ok(rows)
}

pub(super) async fn load_reference(
    state: &AppState,
    user: &AuthUser,
    project_id: Uuid,
    record_id: Uuid,
) -> Result<Vec<u8>, ApiError> {
    let mut query = filtered_query("SELECT photo.photo_data", project_id, user);
    query.push(" AND r.id=").push_bind(record_id);
    let raw = query
        .build_query_scalar::<String>()
        .fetch_optional(state.db.pool())
        .await
        .map_err(|error| {
            tracing::error!(%error, "读取真实服装参考失败");
            internal_error("读取真实考勤参考失败")
        })?
        .ok_or_else(|| invalid_input("参考照片不属于可访问项目近7天的设备原始考勤，请重新抽取"))?;
    let bytes = if raw.starts_with("data:image/") {
        let (header, encoded) = raw
            .split_once(',')
            .ok_or_else(|| invalid_input("参考图片格式错误"))?;
        if !header.ends_with(";base64") || encoded.len() > 8 * 1024 * 1024 {
            return Err(invalid_input("参考图片格式或大小不支持"));
        }
        general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| invalid_input("参考图片编码错误"))?
    } else if let Some(key) = storage_key(&raw, state.storage.public_base_url()) {
        // 对象存储走自身provider，不抓取任意URL，也不跟随重定向。
        state
            .storage
            .get(key)
            .await
            .map_err(|_| internal_error("读取原始考勤图片失败"))?
            .to_vec()
    } else {
        return Err(invalid_input("参考照片不在系统图片存储中，请重新抽取"));
    };
    if bytes.len() > 6 * 1024 * 1024 {
        return Err(invalid_input("参考原图超过6MB"));
    }
    // 不裁剪。正常480px原图保留原始字节；只对异常大图做完整画幅压缩。
    crate::infrastructure::image_compression::compress_to_jpeg_below_async(bytes, 2 * 1024 * 1024)
        .await
        .map_err(|_| invalid_input("参考原图无法解析"))
}

fn storage_key<'a>(raw: &'a str, base: &str) -> Option<&'a str> {
    if base.is_empty() {
        return None;
    }
    let key = raw
        .strip_prefix(base.trim_end_matches('/'))?
        .strip_prefix('/')?;
    let decoded = percent_encoding::percent_decode_str(key)
        .decode_utf8()
        .ok()?;
    if key.is_empty()
        || decoded.starts_with('/')
        || decoded.contains('\\')
        || decoded.split('/').any(|part| part == "." || part == "..")
        || key.contains('?')
        || key.contains('#')
    {
        return None;
    }
    Some(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn references_filter_permissions_sources_and_time_even_for_explicit_record() {
        let user = AuthUser {
            user_id: Uuid::new_v4(),
            email: "test@example.invalid".into(),
            roles: vec![Role::User],
            session_id: "test".into(),
        };
        let mut query = filtered_query("SELECT photo.photo_data", Uuid::new_v4(), &user);
        query.push(" AND r.id=").push_bind(Uuid::new_v4());
        let sql = query.sql();
        assert!(sql.contains("user_managed_projects"));
        assert!(sql.contains("ump.user_id=$2"));
        assert!(sql.contains("r.id=$3"));
        for condition in [
            "INTERVAL '7 days'",
            "r.trigger_time<=NOW()",
            "NOT r.is_generated",
            "NOT r.is_managed_generated",
            "'device_vendor_b_photo'",
            "r.worker_id IS NOT NULL",
        ] {
            assert!(sql.contains(condition));
        }
        let admin = AuthUser {
            roles: vec![Role::Admin],
            ..user
        };
        assert!(
            !filtered_query("SELECT r.id", Uuid::new_v4(), &admin)
                .sql()
                .contains("user_managed_projects")
        );
    }
    #[test]
    fn storage_keys_cannot_escape_or_use_similar_hosts() {
        let base = "https://bucket.example/attendance";
        assert_eq!(
            storage_key("https://bucket.example/attendance/a.jpg", base),
            Some("a.jpg")
        );
        for bad in [
            "https://bucket.example/attendance.evil/a",
            "https://bucket.example/attendance/../secret",
            "http://127.0.0.1/a",
            "https://bucket.example/attendance//etc/passwd",
            "https://bucket.example/attendance/%2e%2e/secret",
            "https://bucket.example/attendance/a?redirect=x",
        ] {
            assert!(storage_key(bad, base).is_none());
        }
        assert!(storage_key("/x", "").is_none());
    }
}
