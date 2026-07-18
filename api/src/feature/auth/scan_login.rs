use std::sync::Arc;

use chrono::Utc;
use dashmap::DashMap;
use rand::RngCore;
use serde::Serialize;
use uuid::Uuid;

pub const SCAN_LOGIN_TTL_SECS: i64 = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanLoginStatus {
    Pending,
    Confirmed,
    Consumed,
}

#[derive(Debug, Clone)]
pub struct ScanLoginSession {
    pub scan_token: String,
    pub status: ScanLoginStatus,
    pub expires_at: i64,
    pub confirmed_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanLoginError {
    NotFound,
    Expired,
    AlreadyUsed,
    NotConfirmed,
}

#[derive(Debug, Clone, Default)]
pub struct ScanLoginStore {
    sessions: Arc<DashMap<String, ScanLoginSession>>,
}

impl ScanLoginStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_session(&self) -> ScanLoginSession {
        self.cleanup_expired();

        let scan_token = random_token();
        let session = ScanLoginSession {
            scan_token: scan_token.clone(),
            status: ScanLoginStatus::Pending,
            expires_at: Utc::now().timestamp() + SCAN_LOGIN_TTL_SECS,
            confirmed_user_id: None,
        };
        self.sessions.insert(scan_token, session.clone());
        session
    }

    pub fn get_session(&self, scan_token: &str) -> Result<ScanLoginSession, ScanLoginError> {
        let Some(session) = self.sessions.get(scan_token) else {
            return Err(ScanLoginError::NotFound);
        };

        if is_expired(session.expires_at) {
            drop(session);
            self.sessions.remove(scan_token);
            return Err(ScanLoginError::Expired);
        }

        Ok(session.clone())
    }

    pub fn confirm(
        &self,
        scan_token: &str,
        user_id: Uuid,
    ) -> Result<ScanLoginSession, ScanLoginError> {
        let Some(mut session) = self.sessions.get_mut(scan_token) else {
            return Err(ScanLoginError::NotFound);
        };

        if is_expired(session.expires_at) {
            drop(session);
            self.sessions.remove(scan_token);
            return Err(ScanLoginError::Expired);
        }

        match session.status {
            ScanLoginStatus::Pending => {
                session.status = ScanLoginStatus::Confirmed;
                session.confirmed_user_id = Some(user_id);
                Ok(session.clone())
            }
            ScanLoginStatus::Confirmed => Ok(session.clone()),
            ScanLoginStatus::Consumed => Err(ScanLoginError::AlreadyUsed),
        }
    }

    pub fn consume(&self, scan_token: &str) -> Result<Uuid, ScanLoginError> {
        let Some(mut session) = self.sessions.get_mut(scan_token) else {
            return Err(ScanLoginError::NotFound);
        };

        if is_expired(session.expires_at) {
            drop(session);
            self.sessions.remove(scan_token);
            return Err(ScanLoginError::Expired);
        }

        match session.status {
            ScanLoginStatus::Pending => Err(ScanLoginError::NotConfirmed),
            ScanLoginStatus::Confirmed => {
                let user_id = session
                    .confirmed_user_id
                    .ok_or(ScanLoginError::NotConfirmed)?;
                session.status = ScanLoginStatus::Consumed;
                Ok(user_id)
            }
            ScanLoginStatus::Consumed => Err(ScanLoginError::AlreadyUsed),
        }
    }

    fn cleanup_expired(&self) {
        let now = Utc::now().timestamp();
        self.sessions.retain(|_, session| session.expires_at > now);
    }
}

pub fn qr_payload(scan_token: &str) -> String {
    format!("shanhuai://scan-login?token={scan_token}")
}

fn is_expired(expires_at: i64) -> bool {
    expires_at <= Utc::now().timestamp()
}

fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}
