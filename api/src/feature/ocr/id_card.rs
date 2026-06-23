use std::collections::BTreeMap;

use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    infrastructure::{
        config::OcrConfig,
        web::response::{ApiError, ApiResult, ApiSuccess},
    },
    state::AppState,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdCardSide {
    Front,
    Back,
}

impl IdCardSide {
    pub fn jd_code(self) -> &'static str {
        match self {
            Self::Front => "P",
            Self::Back => "N",
        }
    }

    pub fn as_api_value(self) -> &'static str {
        match self {
            Self::Front => "front",
            Self::Back => "back",
        }
    }
}

impl Serialize for IdCardSide {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_api_value())
    }
}

impl<'de> Deserialize<'de> for IdCardSide {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        match value.trim().to_ascii_lowercase().as_str() {
            "front" | "p" => Ok(Self::Front),
            "back" | "n" => Ok(Self::Back),
            _ => Err(serde::de::Error::custom("side must be front/back or P/N")),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct JdIdCardOcrRequest {
    #[serde(rename = "serialNo")]
    pub serial_no: String,
    #[serde(rename = "imgBase64", skip_serializing_if = "Option::is_none")]
    pub img_base64: Option<String>,
    #[serde(rename = "imgUrl", skip_serializing_if = "Option::is_none")]
    pub img_url: Option<String>,
    #[serde(rename = "idcardType", skip_serializing_if = "Option::is_none")]
    pub idcard_type: Option<String>,
}

impl JdIdCardOcrRequest {
    pub fn from_image_url(serial_no: String, image_url: String, side: IdCardSide) -> Self {
        Self {
            serial_no,
            img_base64: None,
            img_url: Some(image_url),
            idcard_type: Some(side.jd_code().to_string()),
        }
    }

    pub fn from_image_base64(serial_no: String, image_base64: String, side: IdCardSide) -> Self {
        Self {
            serial_no,
            img_base64: Some(image_base64),
            img_url: None,
            idcard_type: Some(side.jd_code().to_string()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JdIdCardOcrResponse {
    pub code: i64,
    pub msg: Option<String>,
    #[serde(rename = "serialNo")]
    pub serial_no: Option<String>,
    pub timestamp: Option<i64>,
    #[serde(rename = "idCardInfo")]
    pub id_card_info: Option<Value>,
    #[serde(rename = "idCardBackInfo")]
    pub id_card_back_info: Option<Value>,
    #[serde(rename = "extMap")]
    pub ext_map: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdCardOcrParsedFields {
    pub side: IdCardSide,
    pub values: BTreeMap<String, String>,
}

impl IdCardOcrParsedFields {
    pub fn from_response(side: IdCardSide, response: &JdIdCardOcrResponse) -> Self {
        let source = match side {
            IdCardSide::Front => response.id_card_info.as_ref(),
            IdCardSide::Back => response.id_card_back_info.as_ref(),
        };
        let mut values = BTreeMap::new();

        if let Some(source) = source {
            match side {
                IdCardSide::Front => {
                    insert_alias(&mut values, "name", source, &["name"]);
                    insert_alias(
                        &mut values,
                        "id_card",
                        source,
                        &["cardNo", "card_no", "idCardNo"],
                    );
                    insert_gender(&mut values, source);
                    insert_alias(&mut values, "nation", source, &["nation"]);
                    insert_alias(&mut values, "address", source, &["address"]);
                }
                IdCardSide::Back => {
                    insert_alias(
                        &mut values,
                        "visa_office",
                        source,
                        &[
                            "visaOffice",
                            "visa_office",
                            "issueAuthority",
                            "issuingAuthority",
                            "authority",
                            "office",
                        ],
                    );
                    insert_alias(
                        &mut values,
                        "validity_period",
                        source,
                        &["validityPeriod", "validPeriod", "validDate", "validity"],
                    );
                    insert_alias(
                        &mut values,
                        "validity_period_end",
                        source,
                        &[
                            "validityPeriodEnd",
                            "validEndDate",
                            "endDate",
                            "validityEndDate",
                        ],
                    );
                }
            }
        }

        Self { side, values }
    }
}

#[derive(Debug, Deserialize)]
pub struct IdCardOcrApiRequest {
    pub side: IdCardSide,
    pub image_url: Option<String>,
    pub image_base64: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct IdCardOcrApiResponse {
    pub side: IdCardSide,
    pub fields: BTreeMap<String, String>,
    pub raw: JdIdCardOcrResponse,
}

#[derive(Debug, thiserror::Error)]
pub enum OcrError {
    #[error("{0}")]
    Config(String),
    #[error("OCR provider request failed: {0}")]
    Request(String),
    #[error("OCR provider returned status {status}: {body}")]
    Provider { status: u16, body: String },
}

#[derive(Debug, Clone)]
pub struct JdIdCardOcrClient {
    api_key: String,
    endpoint: String,
}

impl JdIdCardOcrClient {
    pub fn from_config(config: &OcrConfig) -> Result<Self, OcrError> {
        let api_key = config
            .jd_ocr_api_key
            .as_ref()
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .ok_or_else(|| OcrError::Config("JD_OCR_API_KEY is not configured".to_string()))?;

        Ok(Self {
            api_key,
            endpoint: config.jd_ocr_idcard_endpoint.clone(),
        })
    }

    pub async fn recognize(
        &self,
        request: JdIdCardOcrRequest,
    ) -> Result<JdIdCardOcrResponse, OcrError> {
        let client = self.clone();
        tokio::task::spawn_blocking(move || client.recognize_blocking(request))
            .await
            .map_err(|err| OcrError::Request(format!("OCR task failed: {err}")))?
    }

    fn recognize_blocking(
        &self,
        request: JdIdCardOcrRequest,
    ) -> Result<JdIdCardOcrResponse, OcrError> {
        let body = serde_json::to_string(&request)
            .map_err(|err| OcrError::Request(format!("failed to serialize OCR request: {err}")))?;
        let mut response = ureq::post(&self.endpoint)
            .header("Authorization", self.authorization_header())
            .header("Content-Type", "application/json")
            .send(body)
            .map_err(|err| OcrError::Request(err.to_string()))?;

        let status = response.status().as_u16();
        let body = response
            .body_mut()
            .read_to_string()
            .map_err(|err| OcrError::Request(format!("failed to read OCR response: {err}")))?;

        if !response.status().is_success() {
            return Err(OcrError::Provider { status, body });
        }

        serde_json::from_str::<JdIdCardOcrResponse>(&body)
            .map_err(|err| OcrError::Request(format!("failed to parse OCR response: {err}")))
    }

    fn authorization_header(&self) -> String {
        let trimmed = self.api_key.trim();
        if trimmed.to_ascii_lowercase().starts_with("bearer ") {
            trimmed.to_string()
        } else {
            format!("Bearer {trimmed}")
        }
    }
}

pub async fn recognize_id_card(
    State(state): State<AppState>,
    Json(payload): Json<IdCardOcrApiRequest>,
) -> ApiResult<IdCardOcrApiResponse> {
    let serial_no = Uuid::new_v4().to_string();
    let request = match (
        payload
            .image_base64
            .filter(|value| !value.trim().is_empty()),
        payload.image_url.filter(|value| !value.trim().is_empty()),
    ) {
        (Some(image_base64), _) => {
            JdIdCardOcrRequest::from_image_base64(serial_no, image_base64, payload.side)
        }
        (None, Some(image_url)) => {
            JdIdCardOcrRequest::from_image_url(serial_no, image_url, payload.side)
        }
        (None, None) => {
            return Err(ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("image_url or image_base64 is required"));
        }
    };

    let client = JdIdCardOcrClient::from_config(&state.config.ocr).map_err(ocr_to_api_error)?;
    let raw = client.recognize(request).await.map_err(ocr_to_api_error)?;

    if raw.code != 0 && raw.code != 100000 {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_GATEWAY)
            .with_message(
                raw.msg
                    .clone()
                    .unwrap_or_else(|| "OCR recognition failed".to_string()),
            ));
    }

    let fields = IdCardOcrParsedFields::from_response(payload.side, &raw).values;
    Ok(ApiSuccess::default()
        .with_data(IdCardOcrApiResponse {
            side: payload.side,
            fields,
            raw,
        })
        .with_message("ID card recognized successfully"))
}

fn insert_alias(
    values: &mut BTreeMap<String, String>,
    target: &str,
    source: &Value,
    aliases: &[&str],
) {
    if let Some(value) = aliases.iter().find_map(|key| get_string(source, key)) {
        values.insert(target.to_string(), value);
    }
}

fn insert_gender(values: &mut BTreeMap<String, String>, source: &Value) {
    if let Some(value) = get_string(source, "sex").or_else(|| get_string(source, "gender")) {
        let normalized = match value.as_str() {
            "女" | "0" => "0",
            "男" | "1" => "1",
            _ => value.as_str(),
        };
        values.insert("gender".to_string(), normalized.to_string());
    }
}

fn get_string(source: &Value, key: &str) -> Option<String> {
    source
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn ocr_to_api_error(error: OcrError) -> ApiError {
    match error {
        OcrError::Config(message) => ApiError::default()
            .with_code(StatusCode::SERVICE_UNAVAILABLE)
            .with_message(message),
        OcrError::Provider { status, body } => ApiError::default()
            .with_code(StatusCode::BAD_GATEWAY)
            .with_message(format!("OCR provider returned status {status}"))
            .with_debug(body),
        OcrError::Request(message) => ApiError::default()
            .with_code(StatusCode::BAD_GATEWAY)
            .with_message("OCR provider request failed")
            .with_debug(message),
    }
}
