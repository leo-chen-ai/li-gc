use aes::Aes256;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use cbc::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use serde::Serialize;
use serde_json::{Value, json};
use thiserror::Error;

type Aes256CbcEnc = cbc::Encryptor<Aes256>;

pub const PLATFORM_CODE: &str = "zhenhai";
pub const DEFAULT_BASE_URL: &str = "http://36.134.183.141:3020";

#[derive(Debug, Error)]
pub enum ZhenhaiError {
    #[error("app_secret must be 32 bytes for HugeSight AES-256-CBC")]
    InvalidSecretLength,
    #[error("failed to initialize AES cipher")]
    AesInit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZhenhaiCredentials {
    pub app_key: String,
    pub app_secret: String,
    pub project_id: String,
    pub base_url: String,
}

impl ZhenhaiCredentials {
    pub fn new(
        app_key: impl Into<String>,
        app_secret: impl Into<String>,
        project_id: impl Into<String>,
    ) -> Self {
        Self {
            app_key: app_key.into(),
            app_secret: app_secret.into(),
            project_id: project_id.into(),
            base_url: DEFAULT_BASE_URL.to_string(),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    pub fn endpoint(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }
}

pub type FormBody = Vec<(String, String)>;

pub fn token_signature(timestamp_seconds: i64, app_secret: &str) -> String {
    let source = format!("{timestamp_seconds}#{app_secret}");
    format!("{:x}", md5::compute(source.as_bytes()))
}

pub fn build_token_form(credentials: &ZhenhaiCredentials, timestamp_seconds: i64) -> FormBody {
    vec![
        (
            "signature".to_string(),
            token_signature(timestamp_seconds, &credentials.app_secret),
        ),
        ("timestamp".to_string(), timestamp_seconds.to_string()),
        ("app_key".to_string(), credentials.app_key.clone()),
    ]
}

pub fn encrypt_identity(app_secret: &str, identity: &str) -> Result<String, ZhenhaiError> {
    let key = app_secret.as_bytes();
    if key.len() != 32 {
        return Err(ZhenhaiError::InvalidSecretLength);
    }
    let iv = &key[..16];
    let ciphertext = Aes256CbcEnc::new_from_slices(key, iv)
        .map_err(|_| ZhenhaiError::AesInit)?
        .encrypt_padded_vec_mut::<Pkcs7>(identity.as_bytes());
    Ok(BASE64_STANDARD.encode(ciphertext))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamPayload {
    pub team_name: String,
    pub leader_name: String,
    pub leader_identity: String,
    pub leader_phone: String,
}

pub fn build_add_team_form(
    credentials: &ZhenhaiCredentials,
    team: &TeamPayload,
) -> Result<FormBody, ZhenhaiError> {
    Ok(vec![
        ("TeamName".to_string(), team.team_name.clone()),
        ("TeamLeaderName".to_string(), team.leader_name.clone()),
        (
            "TeamLeaderIDNumber".to_string(),
            encrypt_identity(&credentials.app_secret, &team.leader_identity)?,
        ),
        ("TeamLeaderPhone".to_string(), team.leader_phone.clone()),
    ])
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkerPayload {
    pub staff_sex: String,
    pub team_id: String,
    pub staff_identity: String,
    pub staff_name: String,
    pub staff_place: String,
    pub staff_mobile: String,
    pub staff_study_type: String,
    pub staff_race: String,
    pub staff_in_time: String,
    pub staff_type: String,
    pub staff_job: String,
    pub staff_state: i32,
    pub staff_device_id: String,
    pub staff_images: Vec<String>,
    pub grant_org: String,
    pub old_team_id: Option<String>,
    pub location: Option<String>,
}

pub fn build_add_worker_v2_json(
    credentials: &ZhenhaiCredentials,
    worker: &WorkerPayload,
) -> Result<Value, ZhenhaiError> {
    build_worker_json(credentials, worker, false)
}

pub fn build_update_worker_json(
    credentials: &ZhenhaiCredentials,
    worker: &WorkerPayload,
) -> Result<Value, ZhenhaiError> {
    build_worker_json(credentials, worker, true)
}

fn build_worker_json(
    credentials: &ZhenhaiCredentials,
    worker: &WorkerPayload,
    include_update_fields: bool,
) -> Result<Value, ZhenhaiError> {
    let mut payload = json!({
        "staff_sex": worker.staff_sex,
        "teamId": worker.team_id,
        "staff_identity": encrypt_identity(&credentials.app_secret, &worker.staff_identity)?,
        "staff_name": worker.staff_name,
        "staff_place": worker.staff_place,
        "staff_mobile": worker.staff_mobile,
        "staff_study_type": worker.staff_study_type,
        "staff_race": worker.staff_race,
        "staff_in_time": worker.staff_in_time,
        "staff_type": worker.staff_type,
        "staff_job": worker.staff_job,
        "staff_state": worker.staff_state,
        "staffDeviceId": worker.staff_device_id,
        "staff_images": worker.staff_images,
        "GrantOrg": worker.grant_org,
    });

    if include_update_fields {
        if let Some(old_team_id) = &worker.old_team_id {
            payload["oldTeamId"] = json!(old_team_id);
        }
        if let Some(location) = &worker.location {
            payload["Location"] = json!(location);
        }
    }

    Ok(payload)
}

pub fn build_leave_worker_form(
    credentials: &ZhenhaiCredentials,
    identity: &str,
) -> Result<FormBody, ZhenhaiError> {
    Ok(vec![(
        "staff_identity".to_string(),
        encrypt_identity(&credentials.app_secret, identity)?,
    )])
}

pub fn build_restore_worker_form(
    credentials: &ZhenhaiCredentials,
    identity: &str,
) -> Result<FormBody, ZhenhaiError> {
    build_leave_worker_form(credentials, identity)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevicePayload {
    pub device_name: String,
    pub device_location: String,
    pub state: i16,
    pub device_sn: String,
}

pub fn build_add_device_form(device: &DevicePayload) -> FormBody {
    vec![
        ("device_name".to_string(), device.device_name.clone()),
        (
            "device_location".to_string(),
            device.device_location.clone(),
        ),
        ("state".to_string(), device.state.to_string()),
        ("deviceSN".to_string(), device.device_sn.clone()),
    ]
}

pub fn project_query(credentials: &ZhenhaiCredentials) -> FormBody {
    vec![("projectId".to_string(), credentials.project_id.clone())]
}

pub fn response_is_success(response: &Value) -> bool {
    let code_ok = response.get("code").and_then(Value::as_i64) == Some(1000)
        || response.get("code").and_then(Value::as_str) == Some("1000");
    let message_ok = response
        .get("message")
        .and_then(Value::as_str)
        .map(|message| message.eq_ignore_ascii_case("success"))
        .unwrap_or(false);
    code_ok && message_ok
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credentials() -> ZhenhaiCredentials {
        ZhenhaiCredentials::new(
            "hugesight-appid-sy",
            "tOEVzsTN7YkyCuPRwvue7f7qGb3XBkSj",
            "119203",
        )
    }

    #[test]
    fn encrypt_identity_matches_hugesight_example() {
        let encrypted = encrypt_identity("tOEVzsTN7YkyCuPRwvue7f7qGb3XBkSj", "331004199405081819")
            .expect("encrypt identity");

        assert_eq!(encrypted, "dHyExkHU1idkJQ9wADWAr7R6v7dsfj5xZrPVeQhtFc8=");

        let encrypted = encrypt_identity("C35BAED06BC012D4C1E4374C9D276590", "331004199405081819")
            .expect("encrypt identity");

        assert_eq!(encrypted, "IB2wjNOib8hRgbuo/G1WX/RuYwx8pTCPIzat3nIVLRQ=");
    }

    #[test]
    fn token_signature_uses_timestamp_hash_secret_format() {
        let signature = token_signature(1_660_285_440, "secret");
        assert_eq!(
            signature,
            format!("{:x}", md5::compute("1660285440#secret"))
        );
    }

    #[test]
    fn build_add_team_payload_encrypts_leader_identity() {
        let form = build_add_team_form(
            &credentials(),
            &TeamPayload {
                team_name: "测试班组".to_string(),
                leader_name: "张三".to_string(),
                leader_identity: "331004199405081819".to_string(),
                leader_phone: "13900000000".to_string(),
            },
        )
        .expect("build team payload");

        assert!(form.contains(&("TeamName".to_string(), "测试班组".to_string())));
        assert!(form.contains(&(
            "TeamLeaderIDNumber".to_string(),
            "dHyExkHU1idkJQ9wADWAr7R6v7dsfj5xZrPVeQhtFc8=".to_string(),
        )));
    }

    #[test]
    fn build_worker_payload_uses_zhenhai_field_names() {
        let payload = build_add_worker_v2_json(
            &credentials(),
            &WorkerPayload {
                staff_sex: "1".to_string(),
                team_id: "110115".to_string(),
                staff_identity: "331004199405081819".to_string(),
                staff_name: "张三".to_string(),
                staff_place: "浙江宁波".to_string(),
                staff_mobile: "13000000000".to_string(),
                staff_study_type: "本科".to_string(),
                staff_race: "汉".to_string(),
                staff_in_time: "2026-01-01".to_string(),
                staff_type: "砌筑工".to_string(),
                staff_job: "安全员".to_string(),
                staff_state: 1,
                staff_device_id: "123".to_string(),
                staff_images: vec!["https://example.test/photo.jpg".to_string()],
                grant_org: "浙江宁波".to_string(),
                old_team_id: None,
                location: None,
            },
        )
        .expect("build worker payload");

        assert_eq!(payload["teamId"], "110115");
        assert_eq!(payload["staff_name"], "张三");
        assert_eq!(
            payload["staff_identity"],
            "dHyExkHU1idkJQ9wADWAr7R6v7dsfj5xZrPVeQhtFc8="
        );
        assert_eq!(payload["staff_images"][0], "https://example.test/photo.jpg");
    }

    #[test]
    fn response_success_parser_accepts_code_1000() {
        assert!(response_is_success(
            &json!({"code": 1000, "message": "SUCCESS"})
        ));
        assert!(!response_is_success(
            &json!({"code": 30001, "message": "Param Invalid"})
        ));
    }
}
