use chrono::Utc;
use serde_json::{Value, json};
use uuid::Uuid;

pub const DEVICE_TYPE: &str = "芊熠厂家";
pub const REGISTER_TOPIC: &str = "/serverAll";
pub const DEFAULT_UPLINK_FILTER: &str = "aiot/face/#";

pub fn message_id() -> String {
    let millis = Utc::now().timestamp_millis();
    let random = Uuid::new_v4().simple().to_string();
    format!("{millis}{}", &random[..7])
}

pub fn worker_person_id(worker_id: Uuid) -> String {
    worker_id.simple().to_string()
}

pub fn parse_worker_person_id(value: &str) -> Option<Uuid> {
    let trimmed = value.trim();
    if trimmed.len() != 32 || !trimmed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Uuid::parse_str(trimmed).ok()
}

pub fn command(payload: &Value) -> Option<&str> {
    payload.get("cmd")?.as_str()
}

pub fn text(payload: &Value, key: &str) -> Option<String> {
    match payload.get(key)? {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

pub fn response(command: &str, inbound_message_id: Option<&str>) -> Value {
    json!({
        "cmd": format!("{command}_rsp"),
        "status": "ok",
        "msg_id": inbound_message_id.unwrap_or_default()
    })
}

pub fn build_person_add(
    message_id: &str,
    worker_id: Uuid,
    name: &str,
    id_card: Option<&str>,
    avatar: &str,
) -> Value {
    let mut payload = json!({
        "cmd": "person_add",
        "msg_id": message_id,
        "personId": worker_person_id(worker_id),
        "personName": name,
        "type": 1,
        "passMode": 0,
        "credentials": [{
            "type": 1,
            "content": avatar
        }]
    });
    if let Some(id_card) = id_card.filter(|value| !value.trim().is_empty()) {
        payload["idNum"] = json!(id_card);
    }
    payload
}

pub fn build_person_delete(message_id: &str, worker_id: Uuid) -> Value {
    json!({
        "cmd": "person_delete",
        "msg_id": message_id,
        "personIdList": [worker_person_id(worker_id)]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn person_id_is_protocol_compliant_and_reversible() {
        let worker_id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let encoded = worker_person_id(worker_id);
        assert_eq!(encoded, "550e8400e29b41d4a716446655440000");
        assert_eq!(parse_worker_person_id(&encoded), Some(worker_id));
    }

    #[test]
    fn builds_minimal_person_messages() {
        let worker_id = Uuid::nil();
        let add = build_person_add(
            "1234567890123Ab12Cd3",
            worker_id,
            "张三",
            Some("330100199001011234"),
            "https://example.test/face.jpg",
        );
        assert_eq!(add["cmd"], "person_add");
        assert_eq!(add["personId"], "00000000000000000000000000000000");
        assert_eq!(add["credentials"][0]["type"], 1);

        let delete = build_person_delete("1234567890123Ab12Cd3", worker_id);
        assert_eq!(delete["cmd"], "person_delete");
        assert_eq!(delete["personIdList"][0], add["personId"]);
    }
}
