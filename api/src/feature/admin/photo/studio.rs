//! 每套先生成进场图，再以进场图生成出场图；套与套之间并发。
use axum::extract::{Extension, State};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{composite::CompositeClient, internal_error, invalid_input, ok};
use crate::{
    feature::auth::AuthUser,
    infrastructure::web::{response::ApiResult, trimmed_json::TrimmedJson},
    state::AppState,
};

// 跨请求限制内存占用，允许单次30套同时运行。
static GENERATIONS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(30);

#[derive(Deserialize)]
pub struct GenerateRequest {
    person_id: Uuid,
    foreground_id: Option<Uuid>,
    background_id: Option<Uuid>,
    season: String,
    change_clothes: bool,
    change_pose: bool,
    variant: usize,
    count: usize,
    /// 出场失败重试时复用已生成的进场JPEG，不重新换装。
    entry_image: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateResponse {
    /// 兼容刷新前仍使用旧页面的客户端。
    image: String,
    in_image: String,
    out_image: Option<String>,
    out_error: Option<String>,
}

impl GenerateRequest {
    fn prompt(&self) -> Result<String, crate::infrastructure::web::response::ApiError> {
        if !(1..=30).contains(&self.count) || self.variant >= self.count {
            return Err(invalid_input(
                "生成数量必须为1–30，序号必须在生成数量范围内",
            ));
        }
        let season = match self.season.as_str() {
            "spring" => "春季，轻薄长袖外套",
            "summer" => "夏季，透气短袖上衣",
            "autumn" => "秋季，长袖夹克",
            "winter" => "冬季，保暖厚外套",
            _ => return Err(invalid_input("请选择春、夏、秋、冬")),
        };
        let mut prompt = String::from(
            "对第一张人像照片做局部编辑，不要重新设计人物、拍摄地点或镜头。严格保留同一个人的五官、年龄、发型及身份特征。原图戴安全帽才保留同一顶；原图没有安全帽时绝对不要添加任何安全帽或帽子。保留原图的眼镜、表情、肤色、脸部纹理和真实年龄，不美化、不改变身份。人物为画面主体，只能有一个人，不加文字、水印或边框。自然匹配光照和透视。“进场”仅用于文件分类，不代表要拍摄进门、签到或操作设备的场景。",
        );
        prompt.push_str(CAMERA_STYLE);
        let mut reference = 2;
        if self.foreground_id.is_some() {
            prompt.push_str(&format!("第{reference}张图是前景参考，将其中前景物体自然置于人物前方，不遮挡脸部，不复制参考图中的人物。"));
            reference += 1;
        }
        if self.background_id.is_some() {
            prompt.push_str(&format!(
                "第{reference}张图是背景参考，严格以其环境替换人像原背景，固定建筑、墙面、地面、门窗及物体的位置、形状、材质和细节，不添加或重新设计物品，不复制参考图中的人物。"
            ));
        } else {
            prompt
                .push_str("保持人像原图的背景环境、构图、镜头视角和人物占画面的比例，不替换场景。");
        }
        let colors = [
            "藏蓝",
            "灰色",
            "卡其",
            "墨绿",
            "棕色",
            "黑色",
            "浅蓝",
            "米白",
            "深红",
            "橄榄绿",
        ];
        if self.change_clothes {
            let style = ["简洁纯色款", "拼色款", "带口袋的工装款"][self.variant / 10];
            prompt.push_str(&format!(
                "换成适合{season}的{}{}，本批共{}套，这是第{}套，每套服装款式和颜色应不同。只编辑衣服所在区域，使用普通日常工作服的真实布料和自然褶皱，适度使用感要与原照片一致，不刻意制造污渍、不做整洁精致的服装广告；不能因为换衣服重绘人物的脸或背景。",
                colors[self.variant % 10],
                style,
                self.count,
                self.variant + 1
            ));
        } else {
            prompt.push_str("保持原图服装完全不变。");
        }
        if self.change_pose {
            let poses = [
                "肩膀保持放松，仅轻微调整身体重心",
                "肩膀轻微向左转，幅度不超过5度",
                "肩膀轻微向右转，幅度不超过5度",
                "肩膀一侧轻微降低，保持原图的自然姿态",
                "身体轻微前倾，保持原图的自然姿态",
                "身体轻微后移，保持原图的自然姿态",
            ];
            let head_poses = [
                "头部保持正直",
                "头部轻微向左倾斜",
                "头部轻微向右倾斜",
                "下巴微抬，目光看向镜头",
                "下巴微收，目光看向镜头",
            ];
            prompt.push_str(&format!(
                "只做轻微自然姿态变化：{}，{}。这是第{}张，动作必须与原图有小幅区别，但不改变人物大小、取景范围、光照或背景。保持自然随意，不摆拍，不做夸张手势；手部若原图未入镜，则不得为展示动作扩大取景或新增手部。脸部正常可辨认，保持人体比例自然，不要过度锐化。",
                poses[self.variant % poses.len()],
                head_poses[self.variant / poses.len()],
                self.variant + 1
            ));
        } else {
            prompt.push_str("保持原图动作和姿态不变。");
        }
        Ok(prompt)
    }
}

async fn load_image(
    state: &AppState,
    id: Uuid,
    user_id: Uuid,
) -> Result<Vec<u8>, crate::infrastructure::web::response::ApiError> {
    // 只读取当前用户上传的图片，不接受外部URL，避免越权和SSRF。
    let key = sqlx::query_scalar::<_, String>("SELECT object_key FROM upload_files WHERE id=$1 AND uploaded_by=$2 AND is_deleted=FALSE AND content_type LIKE 'image/%'")
        .bind(id).bind(user_id).fetch_optional(state.db.pool()).await
        .map_err(|_| internal_error("读取图片记录失败"))?
        .ok_or_else(|| invalid_input("图片不存在或不是本人上传的图片"))?;
    let bytes = state
        .storage
        .get(&key)
        .await
        .map_err(|_| internal_error("读取上传图片失败"))?;
    crate::infrastructure::image_compression::compress_to_jpeg_below_async(
        bytes.to_vec(),
        2 * 1024 * 1024,
    )
    .await
    .map_err(|_| invalid_input("图片格式无法解析"))
}

// 实测考勤样本主要为480×480 JPEG、约14–18KB；输出上限20KB。
const ATTENDANCE_SIZE: u32 = 480;
const ATTENDANCE_MAX_BYTES: usize = 20 * 1024;
const CAMERA_STYLE: &str = "只输出普通现场近景照片，保持来源照片的真实光照、白平衡、曝光、皮肤纹理和自然成像质感。固定参考图中的场景与物体；参考图里没有的考勤机、刷卡器、闸机、屏幕、卡片、门禁及其他设备一律不得添加，原本存在的物体也不能移动、替换或重绘。不得新增刷卡、按键、摸机器、举卡、走路或摆拍等情节。不要高清商业摄影、棚拍布光、美颜磨皮、过度锐化、电影感或精致广告效果。不要人为添加噪点、运动模糊、灰尘、污渍或杂乱材料来伪装真实，也不要清理、美化或重建原场景。匹配原人像的近景取景，不扩展成半身、全身或全景照；保留原有照片内容，再适配正方形输出，不凭空补出环境、手臂或道具。";

impl GenerateRequest {
    fn exit_prompt(&self) -> String {
        let mut prompt = String::from(
            "第一张图是本套已经生成的第一张照片。以它作为唯一图像依据做最小范围局部编辑，得到同一个人的第二张自然近景照片。“出场”仅用于文件分类，不代表离场动作或任何操作设备的情节。严格保持五官、发型、衣服的款式、颜色、图案、口袋、层次、褶皱和污渍完全一致，绝对不能换衣服或换颜色。进场图有安全帽才保留同一顶，进场图没有安全帽时绝对不要添加帽子。保留同样的前景和背景环境、画面中只能有一个人。",
        );
        if self.change_pose {
            prompt.push_str("只改变人物的小幅姿态：头部左右轻转或轻微倾斜不超过5度，或肩膀轻微放松；动作必须与进场图有自然区别，面部仍自然朝向镜头。保持原图的手臂位置和取景，不迈步、不伸手、不刷卡、不按键、不叉腰、不摆拍、不改变衣服，不移动镜头或场景中的任何物体。");
        } else {
            prompt.push_str(
                "保持进场图的人物动作和姿态不变，仅允许自然轻微的表情变化，不改变衣服、镜头或场景。",
            );
        }
        prompt.push_str(CAMERA_STYLE);
        prompt
    }
}

fn attendance_jpeg(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|_| "AI返回的图片格式无法解析".to_string())?
        .resize_to_fill(
            ATTENDANCE_SIZE,
            ATTENDANCE_SIZE,
            image::imageops::FilterType::Triangle,
        );
    // 噪点/纹理极多的图仅降低JPEG质量仍可能超限。逐步轻微软化，
    // 保持480×480尺寸，避免压缩失败或重新缩成超小缩略图。
    for softness in [0.4, 0.8, 1.4, 2.0] {
        let softened = image.blur(softness);
        for quality in [60, 52, 44, 36, 28, 20, 12, 8] {
            let mut encoded = Vec::new();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, quality)
                .encode_image(&softened)
                .map_err(|_| "考勤图片压缩失败".to_string())?;
            if encoded.len() <= ATTENDANCE_MAX_BYTES {
                return Ok(encoded);
            }
        }
    }
    Err("考勤图片无法压缩到20KB以内".into())
}

async fn shrink_output(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || attendance_jpeg(&bytes))
        .await
        .map_err(|_| "考勤图片压缩任务失败".to_string())?
}

fn image_uri(bytes: &[u8]) -> String {
    format!(
        "data:image/jpeg;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    )
}

fn decode_entry_image(uri: &str) -> Result<Vec<u8>, String> {
    if uri.len() > ATTENDANCE_MAX_BYTES * 2 {
        return Err("进场图片超过大小限制".into());
    }
    let encoded = uri
        .strip_prefix("data:image/jpeg;base64,")
        .ok_or("重试需要本套已生成的进场JPEG图片")?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "进场图片格式错误")?;
    if bytes.len() > ATTENDANCE_MAX_BYTES {
        return Err("进场图片超过20KB".into());
    }
    if !bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Err("进场图片必须为JPEG".into());
    }
    let (width, height) = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| "进场图片无法解析")?
        .into_dimensions()
        .map_err(|_| "进场图片无法解析")?;
    if width != ATTENDANCE_SIZE || height != ATTENDANCE_SIZE {
        return Err("进场图片尺寸必须为480×480".into());
    }
    Ok(bytes)
}

/// 保持套内依赖顺序；出场失败也返回进场图，供客户端单独重试出场。
async fn generate_pair(
    client: &CompositeClient,
    body: &GenerateRequest,
    images: &[Vec<u8>],
    prompt: &str,
) -> Result<GenerateResponse, String> {
    let entry = if let Some(uri) = &body.entry_image {
        decode_entry_image(uri)?
    } else {
        let refs: Vec<&[u8]> = images.iter().map(Vec::as_slice).collect();
        let output = client
            .compose_images(&refs, prompt)
            .await
            .map_err(|e| e.to_string())?;
        shrink_output(output.bytes).await?
    };
    // 出场只使用本套进场图，不能再次从原人像独立生成而导致换装。
    let exit = match client.compose_images(&[&entry], &body.exit_prompt()).await {
        Ok(output) => shrink_output(output.bytes).await,
        Err(error) => Err(error.to_string()),
    };
    let (out_image, out_error) = match exit {
        Ok(bytes) => (Some(image_uri(&bytes)), None),
        Err(error) => (None, Some(error)),
    };
    let in_image = image_uri(&entry);
    Ok(GenerateResponse {
        image: in_image.clone(),
        in_image,
        out_image,
        out_error,
    })
}

pub async fn generate(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    TrimmedJson(body): TrimmedJson<GenerateRequest>,
) -> ApiResult<GenerateResponse> {
    let prompt = body.prompt()?;
    let mut config = state.config.photo_composite.clone();
    config.ephone_ai_image_size = "1024x1024".into();
    let client = CompositeClient::new(config);
    if !client.is_enabled() {
        return Err(invalid_input("AI合成服务尚未配置"));
    }
    let _permit = GENERATIONS
        .try_acquire()
        .map_err(|_| invalid_input("当前合成请求较多，请稍后重试"))?;
    let mut images = vec![load_image(&state, body.person_id, user.user_id).await?];
    for id in [body.foreground_id, body.background_id]
        .into_iter()
        .flatten()
    {
        images.push(load_image(&state, id, user.user_id).await?);
    }
    if let Some(uri) = &body.entry_image {
        decode_entry_image(uri).map_err(invalid_input)?;
    }
    let pair = generate_pair(&client, &body, &images, &prompt)
        .await
        .map_err(internal_error)?;
    ok(pair)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> GenerateRequest {
        GenerateRequest {
            person_id: Uuid::nil(),
            foreground_id: None,
            background_id: None,
            season: "spring".into(),
            change_clothes: true,
            change_pose: true,
            variant: 0,
            count: 30,
            entry_image: None,
        }
    }
    #[test]
    fn optional_references_and_switches() {
        let mut req = request();
        assert!(req.prompt().unwrap().contains("保持人像原图的背景"));
        req.background_id = Some(Uuid::nil());
        assert!(req.prompt().unwrap().contains("第2张图是背景"));
        req.foreground_id = Some(Uuid::nil());
        req.change_clothes = false;
        req.change_pose = false;
        let prompt = req.prompt().unwrap();
        assert!(prompt.contains("第2张图是前景"));
        assert!(prompt.contains("第3张图是背景"));
        assert!(prompt.contains("服装完全不变"));
        assert!(prompt.contains("动作和姿态不变"));
    }
    #[test]
    fn validates_limits_and_seasons_and_varies_outfits() {
        let mut req = request();
        let mut prompts = std::collections::HashSet::new();
        for season in ["spring", "summer", "autumn", "winter"] {
            req.season = season.into();
            for variant in 0..30 {
                req.variant = variant;
                prompts.insert(req.prompt().unwrap());
            }
        }
        assert_eq!(prompts.len(), 120);
        req.count = 31;
        assert!(req.prompt().is_err());
        req.count = 30;
        req.variant = 30;
        assert!(req.prompt().is_err());
        req.variant = 0;
        req.season = "bad".into();
        assert!(req.prompt().is_err());
    }
    fn test_png() -> Vec<u8> {
        let image = image::ImageBuffer::from_fn(900, 900, |x, y| {
            image::Rgb([
                ((x * 17 + y * 7) % 256) as u8,
                ((x * 3 + y * 19) % 256) as u8,
                ((x * 11 + y * 13) % 256) as u8,
            ])
        });
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }

    #[test]
    fn attendance_output_matches_camera_size_and_retry_limits() {
        let jpeg = attendance_jpeg(&test_png()).unwrap();
        assert!(jpeg.len() <= 20 * 1024);
        assert!(jpeg.starts_with(&[0xff, 0xd8, 0xff]));
        let decoded = image::load_from_memory(&jpeg).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (480, 480));
        assert_eq!(decode_entry_image(&image_uri(&jpeg)).unwrap(), jpeg);
        assert!(decode_entry_image("data:image/png;base64,aGVsbG8=").is_err());
        assert!(
            decode_entry_image(&format!("data:image/jpeg;base64,{}", "x".repeat(50_000))).is_err()
        );
    }

    #[test]
    fn prompts_preserve_helmet_state_and_exit_clothes_and_camera_style() {
        let mut req = request();
        assert!(
            req.prompt()
                .unwrap()
                .contains("原图没有安全帽时绝对不要添加")
        );
        let exit = req.exit_prompt();
        assert!(exit.contains("绝对不能换衣服或换颜色"));
        assert!(exit.contains("动作必须与进场图有自然区别"));
        assert!(exit.contains("进场图没有安全帽时绝对不要添加"));
        assert!(exit.contains("不要高清商业摄影"));
        req.change_pose = false;
        assert!(req.exit_prompt().contains("动作和姿态不变"));
        assert!(!req.exit_prompt().contains("动作必须与进场图有自然区别"));
    }

    #[test]
    fn prompts_edit_references_without_inventing_devices_or_staged_actions() {
        let mut req = request();
        for prompt in [req.prompt().unwrap(), req.exit_prompt()] {
            assert!(prompt.contains("一律不得添加"));
            assert!(prompt.contains("不摆拍"));
            assert!(!prompt.contains("在考勤设备前"));
            assert!(!prompt.contains("朝向考勤设备"));
            assert!(!prompt.contains("正准备离开工地"));
            assert!(!prompt.contains("工地考勤机近景抓拍"));
            assert!(prompt.contains("不扩展成半身、全身或全景照"));
            assert!(prompt.contains("不要人为添加噪点"));
        }
        for variant in 0..30 {
            req.variant = variant;
            let prompt = req.prompt().unwrap();
            assert!(!prompt.contains("一只手自然叉腰"));
            assert!(!prompt.contains("双手自然放在身前"));
            assert!(!prompt.contains("自然迈步"));
            assert!(prompt.contains("不改变人物大小"));
        }
    }

    #[tokio::test]
    async fn exit_uses_entry_bytes_and_failed_exit_retry_keeps_same_entry() {
        use axum::{
            Router, body::Bytes, extract::State, http::StatusCode, response::IntoResponse,
            routing::post,
        };
        use std::sync::{Arc, Mutex};
        struct Mock {
            calls: Mutex<Vec<Vec<u8>>>,
            image: String,
        }
        let mock = Arc::new(Mock {
            calls: Mutex::new(Vec::new()),
            image: general_purpose::STANDARD.encode(test_png()),
        });
        let app = Router::new()
            .route(
                "/images/edits",
                post(|State(mock): State<Arc<Mock>>, body: Bytes| async move {
                    let call = {
                        let mut calls = mock.calls.lock().unwrap();
                        calls.push(body.to_vec());
                        calls.len()
                    };
                    if call == 2 {
                        return (
                            StatusCode::BAD_GATEWAY,
                            axum::Json(serde_json::json!({"error":{"message":"exit failed"}})),
                        )
                            .into_response();
                    }
                    axum::Json(serde_json::json!({"data":[{"b64_json":mock.image}]}))
                        .into_response()
                }),
            )
            .with_state(Arc::clone(&mock));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = CompositeClient::new(crate::infrastructure::config::PhotoCompositeConfig {
            ephone_ai_api_key: Some("test".into()),
            ephone_ai_base_url: format!("http://{address}"),
            ephone_ai_image_model: "test".into(),
            ephone_ai_image_size: "1024x1024".into(),
            ephone_ai_timeout_secs: 5,
            concurrency: 30,
            poll_seconds: 5,
            lease_secs: 60,
        });
        let mut req = request();
        let images = vec![b"original-person".to_vec(), b"foreground".to_vec()];
        let first = generate_pair(&client, &req, &images, &req.prompt().unwrap())
            .await
            .unwrap();
        assert!(first.out_image.is_none());
        assert!(first.out_error.is_some());
        req.entry_image = Some(first.in_image.clone());
        let retried = generate_pair(&client, &req, &images, &req.prompt().unwrap())
            .await
            .unwrap();
        assert_eq!(retried.in_image, first.in_image);
        assert!(retried.out_image.is_some());
        assert!(retried.out_error.is_none());
        let calls = mock.calls.lock().unwrap();
        assert_eq!(calls.len(), 3); // 两次首次生成，重试仅调用出场一次。
        let entry = decode_entry_image(&first.in_image).unwrap();
        assert_eq!(
            String::from_utf8_lossy(&calls[0])
                .matches("name=\"image\"")
                .count(),
            2
        );
        for call in &calls[1..] {
            assert_eq!(
                String::from_utf8_lossy(call)
                    .matches("name=\"image\"")
                    .count(),
                1
            );
            assert!(call.windows(entry.len()).any(|part| part == entry));
            assert!(!String::from_utf8_lossy(call).contains("original-person"));
        }
        server.abort();
    }
}
