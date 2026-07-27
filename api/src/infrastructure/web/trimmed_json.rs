use axum::{
    Json,
    extract::{FromRequest, Request},
    http::StatusCode,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::infrastructure::web::response::ApiError;

/// JSON extractor for configuration write endpoints.
///
/// Every string value is trimmed recursively before it is deserialized into
/// the handler's target type. Object keys and whitespace inside a string are
/// deliberately left unchanged.
pub struct TrimmedJson<T>(pub T);

impl<S, T> FromRequest<S> for TrimmedJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(mut value) =
            Json::<Value>::from_request(request, state)
                .await
                .map_err(|rejection| {
                    ApiError::default()
                        .with_code(rejection.status())
                        .with_message(rejection.body_text())
                })?;

        trim_string_values(&mut value);

        serde_json::from_value(value).map(Self).map_err(|error| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message(format!("Invalid JSON payload: {error}"))
        })
    }
}

pub fn trim_string_values(value: &mut Value) {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.len() != text.len() {
                *text = trimmed.to_owned();
            }
        }
        Value::Array(items) => {
            for item in items {
                trim_string_values(item);
            }
        }
        Value::Object(object) => {
            for item in object.values_mut() {
                trim_string_values(item);
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::trim_string_values;

    #[test]
    fn trims_string_values_recursively_and_keeps_inner_spaces() {
        let mut value = json!({
            "name": "  张 三  ",
            "config": {
                "account": "\u{3000}worker01\u{3000}",
                "items": ["\t项目 A\n", 1, true, null]
            }
        });

        trim_string_values(&mut value);

        assert_eq!(value["name"], "张 三");
        assert_eq!(value["config"]["account"], "worker01");
        assert_eq!(value["config"]["items"][0], "项目 A");
        assert_eq!(value["config"]["items"][1], 1);
    }

    #[test]
    fn trims_whitespace_only_values_to_empty_strings() {
        let mut value = json!({ "remark": " \t\u{3000}\n" });

        trim_string_values(&mut value);

        assert_eq!(value["remark"], "");
    }
}
