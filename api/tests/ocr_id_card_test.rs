use quax::feature::ocr::id_card::{
    IdCardOcrParsedFields, IdCardSide, JdIdCardOcrRequest, JdIdCardOcrResponse,
};
use serde_json::json;

#[test]
fn builds_jdcloud_id_card_request_for_front_and_back() {
    let front = JdIdCardOcrRequest::from_image_url(
        "serial-front".to_string(),
        "https://cdn.example.com/front.jpg".to_string(),
        IdCardSide::Front,
    );
    let back = JdIdCardOcrRequest::from_image_url(
        "serial-back".to_string(),
        "https://cdn.example.com/back.jpg".to_string(),
        IdCardSide::Back,
    );

    assert_eq!(front.idcard_type.as_deref(), Some("P"));
    assert_eq!(
        front.img_url.as_deref(),
        Some("https://cdn.example.com/front.jpg")
    );
    assert_eq!(front.img_base64, None);
    assert_eq!(back.idcard_type.as_deref(), Some("N"));
}

#[test]
fn maps_front_ocr_result_to_worker_form_fields() {
    let response: JdIdCardOcrResponse = serde_json::from_value(json!({
        "code": 100000,
        "msg": "Success",
        "serialNo": "serial-front",
        "timestamp": 1781836000,
        "idCardInfo": {
            "name": "张三",
            "cardNo": "320800199001011234",
            "sex": "男",
            "nation": "汉",
            "address": "江苏省淮安市清江浦区测试路1号",
            "brith": "19900101"
        },
        "idCardBackInfo": null,
        "extMap": null
    }))
    .expect("valid OCR response");

    let fields = IdCardOcrParsedFields::from_response(IdCardSide::Front, &response);

    assert_eq!(fields.values.get("name").map(String::as_str), Some("张三"));
    assert_eq!(
        fields.values.get("id_card").map(String::as_str),
        Some("320800199001011234")
    );
    assert_eq!(fields.values.get("gender").map(String::as_str), Some("1"));
    assert_eq!(fields.values.get("nation").map(String::as_str), Some("汉"));
    assert_eq!(
        fields.values.get("address").map(String::as_str),
        Some("江苏省淮安市清江浦区测试路1号")
    );
}
