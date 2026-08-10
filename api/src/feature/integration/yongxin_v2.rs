use std::time::{Duration, Instant};

use aes::{Aes128, Aes192, Aes256};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use cbc::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use reqwest::{Client, Url};
use serde_json::Value;
use thiserror::Error;

type Aes128CbcEnc = cbc::Encryptor<Aes128>;
type Aes192CbcEnc = cbc::Encryptor<Aes192>;
type Aes256CbcEnc = cbc::Encryptor<Aes256>;

pub const PLATFORM_CODE: &str = "yongxin_v2";
pub const PLATFORM_NAME: &str = "甬薪";
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

pub const PROJECT_QUERY_PATH: &str = "project/V2/query";
pub const UNIT_ADD_PATH: &str = "projectCorp/V2/add";
pub const TEAM_ADD_PATH: &str = "team/V2/add";
pub const WORKER_ADD_PATH: &str = "worker/V2/add";
pub const ENTRY_EXIT_ADD_PATH: &str = "entryExit/V2/add";
pub const ATTENDANCE_ADD_PATH: &str = "attend/V2/add";
pub const ASYNC_RESULT_PATH: &str = "asyncHandleResult/V2/query";
pub const IMAGE_UPLOAD_PATH: &str = "sysFile/V2/uploadImg";

#[derive(Debug, Error)]
pub enum YongxinError {
    #[error("甬薪平台配置缺少 {0}")]
    MissingConfig(&'static str),
    #[error("甬薪平台接口地址无效")]
    InvalidBaseUrl,
    #[error("甬薪平台 AppSecret 必须是 16、24 或 32 个 ASCII 字节才能用于 AES-CBC")]
    InvalidSecretLength,
    #[error("甬薪平台 AES-CBC 初始化失败")]
    AesInit,
    #[error("甬薪平台请求失败：{0}")]
    Request(String),
    #[error("甬薪平台响应超过 1 MiB 限制")]
    ResponseTooLarge,
    #[error("甬薪平台返回了无法解析的响应")]
    InvalidResponse,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeMode {
    DryRun,
    Production,
}

#[derive(Debug, Clone)]
pub struct YongxinCredentials {
    pub base_url: Url,
    pub project_code: String,
    pub app_key: String,
    pub app_secret: String,
    pub mode: RuntimeMode,
}

impl YongxinCredentials {
    pub fn from_config(config: &Value) -> Result<Self, YongxinError> {
        let base_url = required_string(config, &["base_url", "url", "endpoint"], "接口地址")?;
        let mut base_url = Url::parse(&base_url).map_err(|_| YongxinError::InvalidBaseUrl)?;
        if !matches!(base_url.scheme(), "http" | "https")
            || base_url.host_str().is_none()
            || !base_url.username().is_empty()
            || base_url.password().is_some()
        {
            return Err(YongxinError::InvalidBaseUrl);
        }
        if !base_url.path().ends_with('/') {
            base_url.set_path(&format!("{}/", base_url.path().trim_end_matches('/')));
        }

        let project_code = required_string(
            config,
            &["project_code", "projectCode", "ProjectCode"],
            "项目对接码",
        )?;
        let app_key = required_string(config, &["app_key", "appKey", "AppKey"], "AppKey")?;
        let app_secret = required_string(
            config,
            &["app_secret", "appSecret", "AppSecret"],
            "AppSecret",
        )?;
        let mode = config_string(config, &["mode", "runtime_mode", "environment"])
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| matches!(value.as_str(), "production" | "prod" | "live"))
            .map(|_| RuntimeMode::Production)
            .unwrap_or(RuntimeMode::Production);

        Ok(Self {
            base_url,
            project_code,
            app_key,
            app_secret,
            mode,
        })
    }

    pub fn endpoint(&self, path: &str) -> Result<Url, YongxinError> {
        self.base_url
            .join(path.trim_start_matches('/'))
            .map_err(|_| YongxinError::InvalidBaseUrl)
    }

    pub fn is_dry_run(&self) -> bool {
        self.mode == RuntimeMode::DryRun
    }
}

#[derive(Debug, Clone)]
pub struct YongxinResponse {
    pub status: u16,
    pub body: Value,
    pub duration_ms: i32,
}

impl YongxinResponse {
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status) && response_code(&self.body) == Some(0)
    }

    pub fn message(&self) -> String {
        self.body
            .get("msg")
            .or_else(|| self.body.get("message"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("HTTP {}", self.status))
    }

    pub fn data(&self) -> Option<&Value> {
        self.body.get("data")
    }
}

pub fn build_client() -> Result<Client, YongxinError> {
    Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| YongxinError::Request(error.to_string()))
}

pub fn signature(app_key: &str, app_secret: &str, timestamp_millis: i64) -> String {
    let source = format!("{app_key}&{app_secret}&{timestamp_millis}");
    format!("{:x}", md5::compute(source.as_bytes()))
}

pub fn encrypt_sensitive(app_secret: &str, plaintext: &str) -> Result<String, YongxinError> {
    let key = app_secret.as_bytes();
    if !app_secret.is_ascii() || !matches!(key.len(), 16 | 24 | 32) {
        return Err(YongxinError::InvalidSecretLength);
    }
    let iv = &key[..16];
    let ciphertext = match key.len() {
        16 => Aes128CbcEnc::new_from_slices(key, iv)
            .map_err(|_| YongxinError::AesInit)?
            .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()),
        24 => Aes192CbcEnc::new_from_slices(key, iv)
            .map_err(|_| YongxinError::AesInit)?
            .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()),
        32 => Aes256CbcEnc::new_from_slices(key, iv)
            .map_err(|_| YongxinError::AesInit)?
            .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes()),
        _ => return Err(YongxinError::InvalidSecretLength),
    };
    Ok(BASE64_STANDARD.encode(ciphertext))
}

pub async fn post_json(
    client: &Client,
    credentials: &YongxinCredentials,
    path: &str,
    payload: &Value,
) -> Result<YongxinResponse, YongxinError> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let request = client
        .post(credentials.endpoint(path)?)
        .header("projectCode", &credentials.project_code)
        .header("appKey", &credentials.app_key)
        .header("timestamp", timestamp.to_string())
        .header(
            "sign",
            signature(&credentials.app_key, &credentials.app_secret, timestamp),
        )
        .json(payload);
    send(request).await
}

pub async fn upload_image(
    client: &Client,
    credentials: &YongxinCredentials,
    file_base64: &str,
    file_type: &str,
) -> Result<YongxinResponse, YongxinError> {
    let payload = serde_json::json!({
        "appKey": credentials.app_key,
        "fileBase": file_base64,
        "fileType": file_type,
    });
    let request = client
        .post(credentials.endpoint(IMAGE_UPLOAD_PATH)?)
        .json(&payload);
    send(request).await
}

async fn send(request: reqwest::RequestBuilder) -> Result<YongxinResponse, YongxinError> {
    let started = Instant::now();
    let response = request
        .send()
        .await
        .map_err(|error| YongxinError::Request(error.to_string()))?;
    let status = response.status().as_u16();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(YongxinError::ResponseTooLarge);
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| YongxinError::Request(error.to_string()))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(YongxinError::ResponseTooLarge);
    }
    let body =
        serde_json::from_slice::<Value>(&bytes).map_err(|_| YongxinError::InvalidResponse)?;
    Ok(YongxinResponse {
        status,
        body,
        duration_ms: i32::try_from(started.elapsed().as_millis()).unwrap_or(i32::MAX),
    })
}

pub fn response_code(body: &Value) -> Option<i64> {
    body.get("code").and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_str().and_then(|raw| raw.trim().parse().ok()))
    })
}

pub fn request_serial_code(body: &Value) -> Option<String> {
    body.get("data")
        .and_then(|data| data.get("requestSerialCode"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub fn team_system_number(body: &Value) -> Option<String> {
    body.get("data")
        .and_then(|data| data.get("teamSysNo"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub fn async_state(body: &Value) -> Option<String> {
    body.get("data")
        .and_then(|data| data.get("state"))
        .and_then(|value| {
            value
                .as_str()
                .map(ToOwned::to_owned)
                .or_else(|| value.as_i64().map(|number| number.to_string()))
        })
}

fn required_string(
    config: &Value,
    keys: &[&str],
    label: &'static str,
) -> Result<String, YongxinError> {
    config_string(config, keys).ok_or(YongxinError::MissingConfig(label))
}

fn config_string(config: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        config
            .get(*key)
            .and_then(|value| {
                value
                    .as_str()
                    .map(ToOwned::to_owned)
                    .or_else(|| value.as_i64().map(|number| number.to_string()))
            })
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_matches_protocol_example_calculation() {
        assert_eq!(
            signature("app", "secret", 123),
            "09ec796200818ee1c1770087334ec106"
        );
    }

    #[test]
    fn aes_cbc_uses_secret_as_key_and_first_sixteen_bytes_as_iv() {
        assert_eq!(
            encrypt_sensitive("1234567890abcdef", "330200199001010011").unwrap(),
            "drxp2X88pR1tYZcDoz8QHJ4a4RRgpQc4qwGnU845tyQ="
        );
    }

    #[test]
    fn runtime_defaults_to_production() {
        let credentials = YongxinCredentials::from_config(&serde_json::json!({
            "base_url": "https://example.com/open/",
            "project_code": "project",
            "app_key": "app",
            "app_secret": "1234567890abcdef"
        }))
        .unwrap();
        assert!(!credentials.is_dry_run());
    }
}
