use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

use aes::{Aes128, Aes192, Aes256};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use cbc::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use reqwest::{Client, Url, multipart};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

type Aes128CbcEnc = cbc::Encryptor<Aes128>;
type Aes192CbcEnc = cbc::Encryptor<Aes192>;
type Aes256CbcEnc = cbc::Encryptor<Aes256>;

pub const PLATFORM_CODE: &str = "xinleda";
pub const PLATFORM_NAME: &str = "薪乐达";
pub const DEFAULT_BASE_URL: &str = "https://openapi.hwxld.com";
pub const OPENAPI_PATH: &str = "openapi";
pub const UPLOAD_PATH: &str = "upfiles";
pub const VERSION: &str = "1.0";

pub const LOG_GET: &str = "unifiedlog.get";
pub const COMPANY_IMPORT: &str = "company.import";
pub const COMPANY_SAFEGUARD: &str = "company.safeguard";
pub const PROJECT_IMPORT: &str = "project.import";
pub const LABOURER_ENTRY: &str = "project.labourer.entry";
pub const ATTENDANCE_IMPORT: &str = "project.labourer.attendance";
pub const MANAGER_ENTRY: &str = "project.manager.entry";
pub const LABOURER_IMPORT: &str = "labourer.import";

pub const ALL_METHODS: &[&str] = &[
    LOG_GET,
    COMPANY_IMPORT,
    COMPANY_SAFEGUARD,
    PROJECT_IMPORT,
    LABOURER_ENTRY,
    ATTENDANCE_IMPORT,
    MANAGER_ENTRY,
    LABOURER_IMPORT,
];

const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub enum XinledaError {
    #[error("薪乐达平台配置缺少 {0}")]
    MissingConfig(&'static str),
    #[error("薪乐达平台接口地址无效")]
    InvalidBaseUrl,
    #[error("薪乐达 AppSecret 必须是 16、24 或 32 个 ASCII 字节才能用于 AES-CBC")]
    InvalidSecretLength,
    #[error("薪乐达 AES-CBC 初始化失败")]
    AesInit,
    #[error("薪乐达请求失败：{0}")]
    Request(String),
    #[error("薪乐达响应超过 1 MiB 限制")]
    ResponseTooLarge,
    #[error("薪乐达返回了无法解析的响应")]
    InvalidResponse,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeMode {
    DryRun,
    Production,
}

#[derive(Debug, Clone)]
pub struct XinledaCredentials {
    pub base_url: Url,
    pub app_id: String,
    pub app_secret: String,
    pub project_code: String,
    pub mode: RuntimeMode,
}

impl XinledaCredentials {
    pub fn from_config(config: &Value) -> Result<Self, XinledaError> {
        let base_url = config_string(config, &["base_url", "url", "endpoint"])
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_owned());
        let mut base_url = Url::parse(&base_url).map_err(|_| XinledaError::InvalidBaseUrl)?;
        if !matches!(base_url.scheme(), "http" | "https")
            || base_url.host_str().is_none()
            || !base_url.username().is_empty()
            || base_url.password().is_some()
        {
            return Err(XinledaError::InvalidBaseUrl);
        }
        if !base_url.path().ends_with('/') {
            base_url.set_path(&format!("{}/", base_url.path().trim_end_matches('/')));
        }
        let app_id = required_string(config, &["app_id", "appid", "appId"], "AppID")?;
        let app_secret = required_string(
            config,
            &["app_secret", "appsecret", "appSecret"],
            "AppSecret",
        )?;
        validate_secret(&app_secret)?;
        let project_code = required_string(config, &["project_code", "projectCode"], "项目编码")?;
        let mode = config_string(config, &["mode", "runtime_mode", "environment"])
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| matches!(value.as_str(), "production" | "prod" | "live"))
            .map(|_| RuntimeMode::Production)
            .unwrap_or(RuntimeMode::DryRun);
        Ok(Self {
            base_url,
            app_id,
            app_secret,
            project_code,
            mode,
        })
    }

    pub fn endpoint(&self, path: &str) -> Result<Url, XinledaError> {
        self.base_url
            .join(path.trim_start_matches('/'))
            .map_err(|_| XinledaError::InvalidBaseUrl)
    }

    pub fn is_dry_run(&self) -> bool {
        self.mode == RuntimeMode::DryRun
    }
}

#[derive(Debug, Clone)]
pub struct XinledaResponse {
    pub status: u16,
    pub body: Value,
    pub duration_ms: i32,
    pub request_url: String,
    pub request_headers: Value,
    pub request_body: Value,
}

impl XinledaResponse {
    pub fn code(&self) -> Option<i64> {
        response_code(&self.body)
    }

    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status) && self.code() == Some(0)
    }

    pub fn is_pending(&self) -> bool {
        (200..300).contains(&self.status) && self.code() == Some(20)
    }

    pub fn message(&self) -> String {
        self.body
            .get("message")
            .or_else(|| self.body.get("msg"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("HTTP {}", self.status))
    }
}

pub fn build_client() -> Result<Client, XinledaError> {
    Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| XinledaError::Request(error.to_string()))
}

pub fn signature(parameters: &BTreeMap<String, String>, app_secret: &str) -> String {
    let mut source = parameters
        .iter()
        .filter(|(key, _)| key.as_str() != "sign")
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    source.push_str("&appsecret=");
    source.push_str(app_secret);
    let digest = Sha256::digest(source.to_lowercase().as_bytes());
    format!("{digest:x}")
}

pub fn encrypt_sensitive(app_secret: &str, plaintext: &str) -> Result<String, XinledaError> {
    validate_secret(app_secret)?;
    let key = app_secret.as_bytes();
    let iv = &key[..16];
    let ciphertext = match key.len() {
        16 => Aes128CbcEnc::new_from_slices(key, iv)
            .map_err(|_| XinledaError::AesInit)?
            .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()),
        24 => Aes192CbcEnc::new_from_slices(key, iv)
            .map_err(|_| XinledaError::AesInit)?
            .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()),
        32 => Aes256CbcEnc::new_from_slices(key, iv)
            .map_err(|_| XinledaError::AesInit)?
            .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()),
        _ => return Err(XinledaError::InvalidSecretLength),
    };
    Ok(BASE64_STANDARD.encode(ciphertext))
}

pub fn build_request_body(
    credentials: &XinledaCredentials,
    method: &str,
    data: &Value,
    timestamp: i64,
    nonce: &str,
) -> Result<Value, XinledaError> {
    let data = if data.is_string() {
        data.as_str().unwrap_or_default().to_owned()
    } else {
        serde_json::to_string(data).map_err(|error| XinledaError::Request(error.to_string()))?
    };
    let mut parameters = BTreeMap::from([
        ("appid".to_owned(), credentials.app_id.clone()),
        ("data".to_owned(), data.clone()),
        ("format".to_owned(), "json".to_owned()),
        ("method".to_owned(), method.to_owned()),
        ("nonce".to_owned(), nonce.to_owned()),
        ("timestamp".to_owned(), timestamp.to_string()),
        ("version".to_owned(), VERSION.to_owned()),
    ]);
    let sign = signature(&parameters, &credentials.app_secret);
    parameters.insert("sign".to_owned(), sign);
    Ok(json!(parameters))
}

pub async fn call(
    client: &Client,
    credentials: &XinledaCredentials,
    method: &str,
    data: &Value,
) -> Result<XinledaResponse, XinledaError> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let nonce = Uuid::new_v4().simple().to_string();
    let body = build_request_body(credentials, method, data, timestamp, &nonce)?;
    let request_url = credentials.endpoint(OPENAPI_PATH)?;
    send(
        client.post(request_url.clone()).json(&body),
        request_url.to_string(),
        json!({"Content-Type": "application/json"}),
        body,
    )
    .await
}

pub async fn upload_file(
    client: &Client,
    credentials: &XinledaCredentials,
    file_name: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<XinledaResponse, XinledaError> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let parameters = BTreeMap::from([
        ("appid".to_owned(), credentials.app_id.clone()),
        ("timestamp".to_owned(), timestamp.to_string()),
    ]);
    let sign = signature(&parameters, &credentials.app_secret);
    let mut url = credentials.endpoint(UPLOAD_PATH)?;
    url.query_pairs_mut()
        .append_pair("appid", &credentials.app_id)
        .append_pair("timestamp", &timestamp.to_string())
        .append_pair("sign", &sign);
    let part = multipart::Part::bytes(bytes)
        .file_name(file_name.to_owned())
        .mime_str(content_type)
        .map_err(|error| XinledaError::Request(error.to_string()))?;
    let request_url = url.to_string();
    send(
        client
            .post(url)
            .multipart(multipart::Form::new().part("files", part)),
        request_url,
        json!({"Content-Type": "multipart/form-data"}),
        json!({
            "files": format!("[BINARY_OMITTED:{file_name}]"),
        }),
    )
    .await
}

pub fn async_token(method: &str, body: &Value) -> Option<String> {
    if method == PROJECT_IMPORT {
        body.get("token").and_then(value_string)
    } else {
        body.get("data").and_then(value_string)
    }
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(ToOwned::to_owned)
}

pub fn log_status(body: &Value) -> Option<i64> {
    body.pointer("/data/status").and_then(value_i64)
}

pub fn response_code(body: &Value) -> Option<i64> {
    body.get("code").and_then(value_i64)
}

async fn send(
    request: reqwest::RequestBuilder,
    request_url: String,
    request_headers: Value,
    request_body: Value,
) -> Result<XinledaResponse, XinledaError> {
    let started = Instant::now();
    let response = request
        .send()
        .await
        .map_err(|error| XinledaError::Request(error.to_string()))?;
    let status = response.status().as_u16();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(XinledaError::ResponseTooLarge);
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| XinledaError::Request(error.to_string()))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(XinledaError::ResponseTooLarge);
    }
    let body = serde_json::from_slice(&bytes).map_err(|_| XinledaError::InvalidResponse)?;
    Ok(XinledaResponse {
        status,
        body,
        duration_ms: started.elapsed().as_millis().min(i32::MAX as u128) as i32,
        request_url,
        request_headers,
        request_body,
    })
}

fn validate_secret(app_secret: &str) -> Result<(), XinledaError> {
    if app_secret.is_ascii() && matches!(app_secret.len(), 16 | 24 | 32) {
        Ok(())
    } else {
        Err(XinledaError::InvalidSecretLength)
    }
}

fn required_string(
    config: &Value,
    keys: &[&str],
    label: &'static str,
) -> Result<String, XinledaError> {
    config_string(config, keys).ok_or(XinledaError::MissingConfig(label))
}

fn config_string(config: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        config
            .get(*key)
            .and_then(value_string)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn value_string(value: &Value) -> Option<&str> {
    value.as_str()
}

fn value_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str()?.trim().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credentials() -> XinledaCredentials {
        XinledaCredentials::from_config(&json!({
            "base_url": "https://openapi.hwxld.com",
            "app_id": "demo-app",
            "app_secret": "1234567890abcdef",
            "project_code": "330200-DEMO",
            "mode": "production"
        }))
        .unwrap()
    }

    #[test]
    fn request_signature_covers_every_standard_parameter_in_dictionary_order() {
        let body = build_request_body(
            &credentials(),
            LABOURER_IMPORT,
            &json!([{"real_name": "张三"}]),
            1_590_027_113_409,
            "f050fcaee0bc490390e5d61aa5140351",
        )
        .unwrap();
        assert_eq!(body["method"], LABOURER_IMPORT);
        assert_eq!(body["version"], VERSION);
        assert_eq!(body["appid"], "demo-app");
        assert_eq!(
            body["sign"],
            "261b94f5d6026de8f2eff8d6bda22ac06aa7f361a9b066607df0bff11bd4c95a"
        );
        assert_eq!(body["data"], r#"[{"real_name":"张三"}]"#);
    }

    #[test]
    fn aes_cbc_is_deterministic_and_rejects_invalid_keys() {
        let encrypted = encrypt_sensitive("1234567890abcdef", "330203199001011234").unwrap();
        assert_eq!(encrypted, "OfDWmRwUgDIlLukbah2sySov3suxn9M0zEw3TYnmlmo=");
        assert!(matches!(
            encrypt_sensitive("short", "x"),
            Err(XinledaError::InvalidSecretLength)
        ));
    }

    #[test]
    fn every_documented_openapi_method_is_registered() {
        assert_eq!(ALL_METHODS.len(), 8);
        assert!(ALL_METHODS.contains(&COMPANY_SAFEGUARD));
        assert!(ALL_METHODS.contains(&MANAGER_ENTRY));
    }
}
