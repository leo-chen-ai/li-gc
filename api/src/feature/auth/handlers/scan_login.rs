use axum::{
    Extension,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use qrcode::{QrCode, render::svg};
use serde::Serialize;

use crate::{
    feature::auth::{
        AuthUser,
        repository::AuthError,
        scan_login::{SCAN_LOGIN_TTL_SECS, ScanLoginError, ScanLoginStatus, qr_payload},
        session::DeviceInfo,
        types::AuthResponse,
    },
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{auth as auth_codes, generic as generic_codes},
    },
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct ScanLoginSessionResponse {
    scan_token: String,
    qr_payload: String,
    expires_in: i64,
    status: ScanLoginStatus,
}

#[derive(Debug, Serialize)]
pub struct ScanLoginStatusResponse {
    status: ScanLoginStatus,
    expires_in: i64,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum ScanLoginPollResponse {
    Status(ScanLoginStatusResponse),
    Auth(AuthResponse),
}

pub async fn create_scan_login_session(
    State(state): State<AppState>,
) -> ApiResult<ScanLoginSessionResponse> {
    let session = state.scan_login_store.create_session();

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(ScanLoginSessionResponse {
            scan_token: session.scan_token.clone(),
            qr_payload: qr_payload(&session.scan_token),
            expires_in: SCAN_LOGIN_TTL_SECS,
            status: session.status,
        })
        .with_message("Scan login session created"))
}

pub async fn get_scan_login_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scan_token): Path<String>,
) -> ApiResult<ScanLoginPollResponse> {
    match state.scan_login_store.consume(&scan_token) {
        Ok(user_id) => {
            let device_info = device_info_from_headers(&headers);
            let (response, refresh_cookie) = state
                .auth_service
                .login_user_by_id(user_id, Some(&device_info))
                .await
                .map_err(map_auth_error)?;

            Ok(ApiSuccess::default()
                .with_data(ScanLoginPollResponse::Auth(response))
                .with_cookie(refresh_cookie)
                .with_message("Scan login successful"))
        }
        Err(ScanLoginError::NotConfirmed) => {
            let session = state
                .scan_login_store
                .get_session(&scan_token)
                .map_err(map_scan_login_error)?;

            Ok(ApiSuccess::default()
                .with_data(ScanLoginPollResponse::Status(ScanLoginStatusResponse {
                    status: session.status,
                    expires_in: (session.expires_at - chrono::Utc::now().timestamp()).max(0),
                }))
                .with_message("Scan login pending"))
        }
        Err(err) => Err(map_scan_login_error(err)),
    }
}

pub async fn get_scan_login_qr_svg(
    State(state): State<AppState>,
    Path(scan_token): Path<String>,
) -> Result<Response, ApiError> {
    let session = state
        .scan_login_store
        .get_session(&scan_token)
        .map_err(map_scan_login_error)?;

    let code = QrCode::new(qr_payload(&session.scan_token).as_bytes()).map_err(|_| {
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_error_code(auth_codes::INTERNAL_ERROR)
            .with_message("二维码生成失败")
    })?;
    let image = code
        .render::<svg::Color<'_>>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .build();

    Ok(([(header::CONTENT_TYPE, "image/svg+xml")], image).into_response())
}

pub async fn confirm_scan_login_session(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(scan_token): Path<String>,
) -> ApiResult<ScanLoginStatusResponse> {
    let session = state
        .scan_login_store
        .confirm(&scan_token, auth_user.user_id)
        .map_err(map_scan_login_error)?;

    Ok(ApiSuccess::default()
        .with_data(ScanLoginStatusResponse {
            status: session.status,
            expires_in: (session.expires_at - chrono::Utc::now().timestamp()).max(0),
        })
        .with_message("Scan login confirmed"))
}

fn device_info_from_headers(headers: &HeaderMap) -> DeviceInfo {
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown");

    let ip_address = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .unwrap_or("0.0.0.0");

    DeviceInfo::from_user_agent(user_agent, ip_address)
}

fn map_scan_login_error(err: ScanLoginError) -> ApiError {
    match err {
        ScanLoginError::NotFound => ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(generic_codes::NOT_FOUND)
            .with_message("扫码登录二维码不存在，请刷新后重试"),
        ScanLoginError::Expired => ApiError::default()
            .with_code(StatusCode::GONE)
            .with_error_code(auth_codes::TOKEN_EXPIRED)
            .with_message("扫码登录二维码已过期，请刷新后重试"),
        ScanLoginError::AlreadyUsed => ApiError::default()
            .with_code(StatusCode::CONFLICT)
            .with_error_code(auth_codes::TOKEN_INVALID)
            .with_message("扫码登录已完成，请刷新二维码后重试"),
        ScanLoginError::NotConfirmed => ApiError::default()
            .with_code(StatusCode::CONFLICT)
            .with_error_code(auth_codes::TOKEN_INVALID)
            .with_message("扫码登录尚未确认"),
    }
}

fn map_auth_error(err: AuthError) -> ApiError {
    match err {
        AuthError::InvalidCredentials => ApiError::default()
            .with_code(StatusCode::UNAUTHORIZED)
            .with_error_code(auth_codes::INVALID_CREDENTIALS)
            .with_message("当前扫码账号不可登录"),
        _ => ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_error_code(auth_codes::INTERNAL_ERROR)
            .with_message("扫码登录失败"),
    }
}
