use serde_json::{Value, json};
use thiserror::Error;

pub const TOPIC_PREFIX: &str = "mqtt/face";
pub const HEARTBEAT_TOPIC: &str = "mqtt/face/heartbeat";
pub const BASIC_TOPIC: &str = "mqtt/face/basic";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FaceTopic {
    Heartbeat,
    Basic,
    Command {
        serial_number: String,
    },
    Ack {
        serial_number: String,
    },
    Rec {
        serial_number: String,
    },
    Snap {
        serial_number: String,
    },
    Other {
        serial_number: String,
        suffix: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FaceHeartbeat {
    pub facesluice_id: String,
    pub time: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FaceAck {
    pub message_id: Option<String>,
    pub operator: String,
    pub code: Option<String>,
    pub facesluice_id: Option<String>,
    pub custom_id: Option<String>,
    pub result: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FaceAttendanceRecord {
    pub custom_id: Option<String>,
    pub person_id: Option<String>,
    pub record_id: Option<String>,
    pub verify_status: Option<String>,
    pub direction: Option<String>,
    pub person_name: Option<String>,
    pub facesluice_id: Option<String>,
    pub record_time: Option<String>,
    pub photo_base64: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FacePersonPayload {
    pub custom_id: String,
    pub name: String,
    pub id_card: Option<String>,
    pub phone: Option<String>,
    pub photo_uri: Option<String>,
    pub photo_base64: Option<String>,
    pub person_type: i32,
    pub temp_card_type: i32,
}

#[derive(Debug, Error)]
pub enum FaceMqttError {
    #[error("invalid mqtt topic")]
    InvalidTopic,
    #[error("invalid payload json: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("missing info object")]
    MissingInfo,
    #[error("missing required field: {0}")]
    MissingField(&'static str),
}

pub fn command_topic(serial_number: &str) -> String {
    format!("{TOPIC_PREFIX}/{serial_number}")
}

pub fn parse_topic(topic: &str) -> Result<FaceTopic, FaceMqttError> {
    if topic == HEARTBEAT_TOPIC {
        return Ok(FaceTopic::Heartbeat);
    }
    if topic == BASIC_TOPIC {
        return Ok(FaceTopic::Basic);
    }

    let mut parts = topic.split('/');
    if parts.next() != Some("mqtt") || parts.next() != Some("face") {
        return Err(FaceMqttError::InvalidTopic);
    }
    let serial_number = parts.next().ok_or(FaceMqttError::InvalidTopic)?;
    let suffix = parts.next();
    if parts.next().is_some() {
        return Err(FaceMqttError::InvalidTopic);
    }

    match suffix {
        None => Ok(FaceTopic::Command {
            serial_number: serial_number.to_string(),
        }),
        Some("Ack") => Ok(FaceTopic::Ack {
            serial_number: serial_number.to_string(),
        }),
        Some("Rec") => Ok(FaceTopic::Rec {
            serial_number: serial_number.to_string(),
        }),
        Some("Snap") => Ok(FaceTopic::Snap {
            serial_number: serial_number.to_string(),
        }),
        Some(other) => Ok(FaceTopic::Other {
            serial_number: serial_number.to_string(),
            suffix: other.to_string(),
        }),
    }
}

pub fn parse_heartbeat(payload: &str) -> Result<FaceHeartbeat, FaceMqttError> {
    let value: Value = serde_json::from_str(payload)?;
    let info = value.get("info").ok_or(FaceMqttError::MissingInfo)?;
    let facesluice_id =
        text_field(info, "facesluiceId").ok_or(FaceMqttError::MissingField("facesluiceId"))?;

    Ok(FaceHeartbeat {
        facesluice_id,
        time: text_field(info, "time"),
    })
}

pub fn build_online_ack(facesluice_id: &str) -> Value {
    json!({
        "operator": "Online-Ack",
        "info": {
            "facesluiceId": facesluice_id,
            "result": "ok"
        }
    })
}

pub fn build_edit_person(message_id: &str, person: &FacePersonPayload) -> Value {
    let mut info = json!({
        "customId": person.custom_id,
        "name": person.name,
        "personType": person.person_type,
        "tempCardType": person.temp_card_type,
    });

    if let Some(id_card) = &person.id_card {
        info["idCard"] = json!(id_card);
        info["cardType"] = json!(0);
    }
    if let Some(phone) = &person.phone {
        info["telnum1"] = json!(phone);
    }
    if let Some(photo_uri) = &person.photo_uri {
        info["picURI"] = json!(photo_uri);
    }
    if let Some(photo_base64) = &person.photo_base64 {
        info["pic"] = json!(photo_base64);
    }

    json!({
        "operator": "EditPerson",
        "messageId": message_id,
        "info": info
    })
}

pub fn build_delete_person(message_id: &str, custom_id: &str) -> Value {
    json!({
        "operator": "DelPerson",
        "messageId": message_id,
        "info": {
            "customId": custom_id
        }
    })
}

pub fn build_rec_push_ack(message_id: &str, record_id: &str) -> Value {
    json!({
        "operator": "PushAck",
        "messageId": message_id,
        "info": {
            "PushAckType": 2,
            "SnapOrRecordID": record_id
        }
    })
}

pub fn parse_ack(payload: &str) -> Result<FaceAck, FaceMqttError> {
    let value: Value = serde_json::from_str(payload)?;
    let operator = text_field(&value, "operator").ok_or(FaceMqttError::MissingField("operator"))?;
    let info = value.get("info");

    Ok(FaceAck {
        message_id: text_field(&value, "messageId"),
        operator,
        code: text_field(&value, "code"),
        facesluice_id: info.and_then(|info| text_field(info, "facesluiceId")),
        custom_id: info.and_then(|info| text_field(info, "customId")),
        result: info.and_then(|info| text_field(info, "result")),
        detail: info.and_then(|info| text_field(info, "detail")),
    })
}

pub fn parse_attendance_record(payload: &str) -> Result<FaceAttendanceRecord, FaceMqttError> {
    let value: Value = serde_json::from_str(payload)?;
    let operator = text_field(&value, "operator").ok_or(FaceMqttError::MissingField("operator"))?;
    if operator != "RecPush" {
        return Err(FaceMqttError::MissingField("operator=RecPush"));
    }

    let info = value.get("info").ok_or(FaceMqttError::MissingInfo)?;
    Ok(FaceAttendanceRecord {
        custom_id: text_field(info, "customId"),
        person_id: text_field(info, "personId"),
        record_id: text_field(info, "RecordID"),
        verify_status: text_field(info, "VerifyStatus"),
        direction: text_field(info, "direction"),
        person_name: text_field(info, "personName"),
        facesluice_id: text_field(info, "facesluiceId"),
        record_time: text_field(info, "time"),
        photo_base64: text_field(info, "pic"),
    })
}

fn text_field(value: &Value, key: &str) -> Option<String> {
    match value.get(key)? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(boolean) => Some(boolean.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_topics() {
        assert_eq!(parse_topic(HEARTBEAT_TOPIC).unwrap(), FaceTopic::Heartbeat);
        assert_eq!(
            parse_topic("mqtt/face/1306612/Ack").unwrap(),
            FaceTopic::Ack {
                serial_number: "1306612".to_string()
            }
        );
        assert_eq!(
            parse_topic("mqtt/face/1306612/Rec").unwrap(),
            FaceTopic::Rec {
                serial_number: "1306612".to_string()
            }
        );
        assert_eq!(
            parse_topic("mqtt/face/1306612").unwrap(),
            FaceTopic::Command {
                serial_number: "1306612".to_string()
            }
        );
    }

    #[test]
    fn parse_heartbeat_payload() {
        let heartbeat = parse_heartbeat(
            r#"{"operator":"HeartBeat","info":{"facesluiceId":"1306612","time":"2023-01-01 00:00:00"}}"#,
        )
        .unwrap();

        assert_eq!(heartbeat.facesluice_id, "1306612");
        assert_eq!(heartbeat.time.as_deref(), Some("2023-01-01 00:00:00"));
    }

    #[test]
    fn build_edit_and_delete_person_messages() {
        let edit = build_edit_person(
            "msg-1",
            &FacePersonPayload {
                custom_id: "330100199001011234".to_string(),
                name: "张三".to_string(),
                id_card: Some("330100199001011234".to_string()),
                phone: Some("13900000000".to_string()),
                photo_uri: Some("https://example.test/a.jpg".to_string()),
                photo_base64: None,
                person_type: 0,
                temp_card_type: 0,
            },
        );
        assert_eq!(edit["operator"], "EditPerson");
        assert_eq!(edit["messageId"], "msg-1");
        assert_eq!(edit["info"]["customId"], "330100199001011234");
        assert_eq!(edit["info"]["picURI"], "https://example.test/a.jpg");

        let delete = build_delete_person("msg-2", "330100199001011234");
        assert_eq!(delete["operator"], "DelPerson");
        assert_eq!(delete["info"]["customId"], "330100199001011234");
    }

    #[test]
    fn parse_device_ack() {
        let ack = parse_ack(
            r#"{"messageId":"msg-1","operator":"EditPerson-Ack","code":"200","info":{"facesluiceId":"1306612","customId":"330100199001011234","result":"ok"}}"#,
        )
        .unwrap();

        assert_eq!(ack.message_id.as_deref(), Some("msg-1"));
        assert_eq!(ack.operator, "EditPerson-Ack");
        assert_eq!(ack.code.as_deref(), Some("200"));
        assert_eq!(ack.result.as_deref(), Some("ok"));
    }

    #[test]
    fn parse_rec_push_attendance_record() {
        let record = parse_attendance_record(
            r#"{"operator":"RecPush","info":{"customId":"063c81e0fce184c696cdb7e049230f5e","personId":"3","RecordID":"2","VerifyStatus":"1","direction":"unknow","personName":"测试","facesluiceId":"1787156","time":"2023-01-01 00:00:00","pic":"data:image/jpeg;base64,abc"}}"#,
        )
        .unwrap();

        assert_eq!(record.record_id.as_deref(), Some("2"));
        assert_eq!(record.verify_status.as_deref(), Some("1"));
        assert_eq!(record.facesluice_id.as_deref(), Some("1787156"));
        assert_eq!(record.record_time.as_deref(), Some("2023-01-01 00:00:00"));
    }
}
