//! 每套先生成进场图，再以进场图生成出场图；套与套之间并发。
use axum::extract::{Extension, Path, State};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use uuid::Uuid;

use super::{composite::CompositeClient, internal_error, invalid_input, ok};
use crate::{
    feature::auth::AuthUser,
    infrastructure::web::{response::ApiResult, trimmed_json::TrimmedJson},
    state::AppState,
};

// 跨请求限制内存占用，允许单次30套同时运行。
static GENERATIONS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(30);

#[derive(Deserialize, Serialize)]
pub struct GenerateRequest {
    person_id: Uuid,
    model: Option<String>,
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

#[derive(Clone, Serialize)]
pub struct GenerateResponse {
    /// 兼容刷新前仍使用旧页面的客户端。
    image: String,
    in_image: String,
    out_image: Option<String>,
    out_error: Option<String>,
}

impl GenerateRequest {
    fn resolved_model(&self) -> Result<&str, crate::infrastructure::web::response::ApiError> {
        match self
            .model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            None | Some("gemini-3.1-flash-lite-image") => Ok("gemini-3.1-flash-lite-image"),
            Some("gpt-image-2-dev") => Err(invalid_input(
                "Dev模型上游当前异常，已暂停使用；请刷新页面选择Nano Banana Lite",
            )),
            Some("gpt-image-2") => Ok("gpt-image-2"),
            _ => Err(invalid_input("请选择页面支持的图片模型")),
        }
    }

    fn prompt(&self) -> Result<String, crate::infrastructure::web::response::ApiError> {
        if !(1..=30).contains(&self.count) || self.variant >= self.count {
            return Err(invalid_input(
                "生成数量必须为1–30，序号必须在生成数量范围内",
            ));
        }
        let (season, clothes) = match self.season.as_str() {
            "spring" => (
                "春季",
                [
                    "耐磨棉布薄工装夹克",
                    "穿旧的棉质拉链工作外套",
                    "普通棉布长袖劳动衬衫",
                ],
            ),
            "summer" => (
                "夏季",
                [
                    "洗旧的宽松棉质短袖T恤",
                    "普通短袖劳动衬衫",
                    "耐磨透气工装短袖",
                ],
            ),
            "autumn" => (
                "秋季",
                ["棉布工装夹克", "耐磨拉链工作外套", "穿旧的厚棉劳动衬衫"],
            ),
            "winter" => (
                "冬季",
                ["普通旧棉工作服", "厚棉布工装外套", "宽松耐磨保暖工作外套"],
            ),
            _ => return Err(invalid_input("请选择春、夏、秋、冬")),
        };
        let mut prompt = String::from(
            "根据第一张人像照片编辑服装和人物姿态，不要重新设计拍摄地点或换一个人。严格保留同一个人的五官、年龄、发型及身份特征。原图戴安全帽才保留同一顶；原图没有安全帽时绝对不要添加任何安全帽或帽子。保留原图的眼镜、肤色、脸部纹理和真实年龄，不美化、不改变身份。表情自然平静，嘴部放松，不微笑营业，不表演，不美化成宣传照。人物为画面主体，只能有一个人，不加文字、水印或边框。自然匹配光照和透视。“进场”仅用于文件分类，不代表要拍摄走路进门、刷卡或按键等动作。",
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
            let style = clothes[self.variant % clothes.len()];
            prompt.push_str(&format!(
                "换成适合{season}的{}{}，本批共{}套，这是第{}套，每套服装款式和颜色应不同。衣服应像普通建筑工人平时穿着劳动的旧工作服：棉布或涤棉面料、宽松实用，有不规则自然褶皱、轻微洗旧褪色、领口袖口自然磨损，以及衣服局部少量浅灰浮尘和劳动留下的轻微灰印。不要全新干净、熨烫平整、挺括修身、时装卫衣、广告展示或统一新制服。灰尘仅限衣服且少量自然，不用夸张泥点、油污、破洞或全身脏污；不能给脸、头发或背景加污渍。身体位置轻微改变时布料随姿态自然变化，不改变人物身份或场景。",
                colors[self.variant % 10],
                style,
                self.count,
                self.variant + 1
            ));
        } else {
            prompt.push_str("保持原图服装完全不变。");
        }
        if self.change_pose {
            prompt.push_str(&format!(
                "人物像在工地面对画面外的人脸机镜头自然站定。{}仅做符合自然站立的小幅变化：{}。{}。脸和胸口始终基本朝向镜头，不能大幅左右扭身、看向远处、歪头耍酷或侧脸拍照。不用手做动作，不触摸设备或衣物，不整理领口袖口，不抬手不叉腰；双手自然放低，位于胸口以下画面之外。两张的区别来自站位、站立重心、肩膀位置和很轻的头部角度变化，不靠手势或表演。保持原近景取景、背景和自然表情。",
                FACE_SCAN_STANCE,
                ENTRY_POSES[self.variant % ENTRY_POSES.len()],
                GAZES[(self.variant / ENTRY_POSES.len()) % GAZES.len()],
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
const ENTRY_POSES: [&str; 6] = [
    "身体自然正对镜头站立，重心稍偏左脚，头保持端正",
    "身体自然正对镜头站立，重心稍偏右脚，肩膀自然放松",
    "站位相对原图轻微偏左，脸朝镜头，头部仅向右轻转约3度",
    "站位相对原图轻微偏右，脸朝镜头，头部仅向左轻转约3度",
    "身体自然正对镜头，头部略微抬起但不仰头，肩膀放松",
    "身体自然正对镜头，下巴轻收但不低头，头部保持端正",
];
const EXIT_POSES: [&str; 6] = [
    "站立重心从左脚自然换到右脚，肩膀位置略有变化，脸仍朝镜头",
    "站立重心从右脚自然换到左脚，肩膀位置略有变化，脸仍朝镜头",
    "站位比第一张稍向右移动，头部回正朝镜头",
    "站位比第一张稍向左移动，头部回正朝镜头",
    "下巴从第一张的位置轻收一点，仍看向镜头",
    "头部比第一张略微抬起一点，仍看向镜头",
];
const GAZES: [&str; 5] = [
    "目光自然看向镜头中心，神情平静",
    "目光看向镜头，眉眼自然放松",
    "视线保持朝向镜头，嘴部放松",
    "自然看向镜头，不刻意摆出表情",
    "目光朝镜头，保留普通人自然的神情",
];
const FACE_SCAN_STANCE: &str = "人物基本正对镜头自然站定，肩颈放松，目光看向镜头；头部和身体左右偏转均不超过8度，不能转成明显侧身或侧脸。双手自然垂下并留在画面外，不需要任何手势。";
const CAMERA_STYLE: &str = "输出普通现场固定镜头拍到的近景照片，构图和视点像人站在画面外的人脸机镜头前，但机器本身不入画。保持参考图的实际光照、白平衡、曝光、皮肤纹理和年龄特征，不刻意摆姿势，不挺胸展示服装，不要证件照棚拍、时尚大片、广告或宣传照效果。只保留参考图里的场景和物品；没有的考勤机、刷卡器、闸机、屏幕、卡片、门禁及其他设备一律不得添加。不要高清商业摄影、棚拍布光、美颜磨皮、过度锐化或电影感。不要人为添加噪点、运动模糊或重建背景；背景不添加灰尘、污渍或杂乱材料，衣服是否有使用痕迹以换装指令为准。保持原来的胸口以上近景取景，不扩展成全身或全景照，不为了显示手部动作扩大构图。";

impl GenerateRequest {
    fn exit_prompt(&self) -> String {
        let mut prompt = String::from(
            "第一张图是本套已经生成的第一张照片。以它作为唯一图像依据，保持同一个人和同一套衣服，得到同一次现场固定镜头下第二张自然站立近景照片。“出场”仅用于文件分类，不代表离场动作或任何操作设备的情节。严格保持五官、发型、衣服的款式、颜色、图案、口袋和层次一致，进场衣服已有的洗旧褪色、磨损和浅灰浮尘须原样保留，不能把旧衣变成新衣，也不能新增第一张没有的污渍；褶皱可以随站立位置自然变化，绝对不能换衣服或换颜色。进场图有安全帽才保留同一顶，进场图没有安全帽时绝对不要添加帽子。保留同样的前景和背景环境、画面中只能有一个人。",
        );
        if self.change_pose {
            prompt.push_str(&format!(
                "{}第二张与第一张只做自然站立时的小幅变化：{}。站立重心、肩膀位置、站位或轻微头部角度至少有一项自然不同，不要求夸张显著的动作差别。脸和胸口始终基本正对镜头，目光看向镜头，禁止用左右大幅反转、侧身侧脸或移开视线制造差异。双手自然放低留在画外，不抬手、不摆手势、不碰领口袖口、不拿东西；若第一张意外出现手势，第二张将手自然放下但不要因此改变衣服和构图。不要完全复制第一张，但自然真实的站定状态优先于动作差异。保持同一个人、同一套有使用痕迹的衣服、同一光照和背景，不增加设备或道具。",
                FACE_SCAN_STANCE,
                EXIT_POSES[self.variant % EXIT_POSES.len()],
            ));
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
    let _permit = GENERATIONS
        .try_acquire()
        .map_err(|_| invalid_input("当前合成请求较多，请稍后重试"))?;
    generate_inner(state, user.user_id, body)
        .await
        .map(|pair| crate::infrastructure::web::response::ApiSuccess::default().with_data(pair))
}

async fn generate_inner(
    state: AppState,
    user_id: Uuid,
    body: GenerateRequest,
) -> Result<GenerateResponse, crate::infrastructure::web::response::ApiError> {
    let prompt = body.prompt()?;
    let mut config = state.config.photo_composite.clone();
    config.ephone_ai_image_size = "1024x1024".into();
    config.ephone_ai_image_model = body.resolved_model()?.to_string();
    let client = CompositeClient::new(config);
    if !client.is_enabled() {
        return Err(invalid_input("AI合成服务尚未配置"));
    }
    let mut images = vec![load_image(&state, body.person_id, user_id).await?];
    for id in [body.foreground_id, body.background_id]
        .into_iter()
        .flatten()
    {
        images.push(load_image(&state, id, user_id).await?);
    }
    if let Some(uri) = &body.entry_image {
        decode_entry_image(uri).map_err(invalid_input)?;
    }
    let pair = generate_pair(&client, &body, &images, &prompt)
        .await
        .map_err(internal_error)?;
    Ok(pair)
}

// 临时任务与页面结果同生命周期；不创建照片组或数据库记录。
// 限量缓存避免结果图片无限占用内存，已完成结果保留30分钟。
static JOBS: OnceLock<Mutex<HashMap<Uuid, PhotoJob>>> = OnceLock::new();
const JOB_TTL: Duration = Duration::from_secs(30 * 60);
#[derive(Clone)]
struct PhotoJob {
    owner: Uuid,
    signature: String,
    updated: Instant,
    result: Option<Result<GenerateResponse, String>>,
}
fn jobs() -> &'static Mutex<HashMap<Uuid, PhotoJob>> {
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}
#[derive(Deserialize)]
pub struct StartRequest {
    request_id: Uuid,
    #[serde(flatten)]
    body: GenerateRequest,
}
#[derive(Serialize)]
pub struct JobResponse {
    job_id: Uuid,
    status: &'static str,
    result: Option<GenerateResponse>,
    error: Option<String>,
}
impl PhotoJob {
    fn response(&self, id: Uuid) -> JobResponse {
        match &self.result {
            None => JobResponse {
                job_id: id,
                status: "running",
                result: None,
                error: None,
            },
            Some(Ok(result)) => JobResponse {
                job_id: id,
                status: "completed",
                result: Some(result.clone()),
                error: None,
            },
            Some(Err(error)) => JobResponse {
                job_id: id,
                status: "failed",
                result: None,
                error: Some(error.clone()),
            },
        }
    }
}

fn reserve_job(
    id: Uuid,
    owner: Uuid,
    signature: String,
) -> Result<
    (JobResponse, Option<tokio::sync::SemaphorePermit<'static>>),
    crate::infrastructure::web::response::ApiError,
> {
    let mut store = jobs()
        .lock()
        .map_err(|_| internal_error("任务状态暂不可用"))?;
    store.retain(|_, job| job.updated.elapsed() < JOB_TTL);
    if let Some(job) = store.get(&id) {
        if job.owner != owner || job.signature != signature {
            return Err(invalid_input("任务编号已使用，请重新发起"));
        }
        return Ok((job.response(id), None));
    }
    if store.len() >= 256 {
        return Err(invalid_input("临时任务较多，请稍后重试"));
    }
    let permit = GENERATIONS
        .try_acquire()
        .map_err(|_| invalid_input("当前合成请求较多，请稍后重试"))?;
    let job = PhotoJob {
        owner,
        signature,
        updated: Instant::now(),
        result: None,
    };
    let response = job.response(id);
    store.insert(id, job);
    Ok((response, Some(permit)))
}

pub async fn start_job(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    TrimmedJson(request): TrimmedJson<StartRequest>,
) -> ApiResult<JobResponse> {
    request.body.prompt()?;
    request.body.resolved_model()?;
    if let Some(uri) = &request.body.entry_image {
        decode_entry_image(uri).map_err(invalid_input)?;
    }
    let signature =
        serde_json::to_string(&request.body).map_err(|_| internal_error("任务参数编码失败"))?;
    let id = request.request_id;
    let (response, permit) = reserve_job(id, user.user_id, signature)?;
    let Some(permit) = permit else {
        return ok(response);
    };
    tokio::spawn(async move {
        let _permit = permit;
        // 后台任务独立于HTTP连接；断线后仍可查询，不重复提交付费生成。
        let result = match tokio::time::timeout(
            Duration::from_secs(600),
            generate_inner(state, user.user_id, request.body),
        )
        .await
        {
            Ok(result) => result.map_err(|e| e.message),
            Err(_) => Err("本套生成超时，请稍后重试".into()),
        };
        if let Ok(mut store) = jobs().lock() {
            if let Some(job) = store.get_mut(&id) {
                job.result = Some(result);
                job.updated = Instant::now();
            }
        }
    });
    ok(response)
}

pub async fn get_job(
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<JobResponse> {
    let mut store = jobs()
        .lock()
        .map_err(|_| internal_error("任务状态暂不可用"))?;
    store.retain(|_, job| job.updated.elapsed() < JOB_TTL);
    let job = store
        .get(&id)
        .filter(|job| job.owner == user.user_id)
        .ok_or_else(|| super::not_found("任务已过期或服务已重启，请重新生成"))?;
    ok(job.response(id))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn jobs_are_idempotent_private_and_expire() {
        let id = Uuid::new_v4();
        let owner = Uuid::new_v4();
        let other = Uuid::new_v4();
        let (_, permit) = reserve_job(id, owner, "same".into()).unwrap();
        assert!(permit.is_some());
        let (again, duplicate_permit) = reserve_job(id, owner, "same".into()).unwrap();
        assert_eq!(again.status, "running");
        assert!(duplicate_permit.is_none(), "重复POST不得启动第二个付费任务");
        assert!(reserve_job(id, other, "same".into()).is_err());
        assert!(reserve_job(id, owner, "changed".into()).is_err());
        let auth = |user_id| {
            Extension(AuthUser {
                user_id,
                email: "test@example.invalid".into(),
                roles: vec![],
                session_id: "test".into(),
            })
        };
        assert!(get_job(auth(other), Path(id)).await.is_err());
        // 模拟请求连接结束后，后台仍写入结果，并能通过短GET取回。
        jobs().lock().unwrap().get_mut(&id).unwrap().result = Some(Ok(GenerateResponse {
            image: "entry".into(),
            in_image: "entry".into(),
            out_image: Some("exit".into()),
            out_error: None,
        }));
        let response = get_job(auth(owner), Path(id)).await.unwrap().data.unwrap();
        assert_eq!(response.status, "completed");
        assert_eq!(response.result.unwrap().out_image.as_deref(), Some("exit"));
        jobs().lock().unwrap().get_mut(&id).unwrap().updated = Instant::now() - JOB_TTL;
        assert!(get_job(auth(owner), Path(id)).await.is_err());
        drop(permit);
    }

    fn request() -> GenerateRequest {
        GenerateRequest {
            person_id: Uuid::nil(),
            model: None,
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
    fn studio_models_are_budget_bounded_and_pose_pairs_are_distinct() {
        let mut req = request();
        assert_eq!(req.resolved_model().unwrap(), "gemini-3.1-flash-lite-image");
        req.model = Some("gpt-image-2-dev".into());
        assert!(req.resolved_model().is_err());
        req.model = Some("gemini-3.1-flash-lite-image".into());
        assert_eq!(req.resolved_model().unwrap(), "gemini-3.1-flash-lite-image");
        req.model = Some("arbitrary-expensive-model".into());
        assert!(req.resolved_model().is_err());
        for variant in 0..30 {
            req.variant = variant;
            assert_ne!(ENTRY_POSES[variant % 6], EXIT_POSES[variant % 6]);
            assert!(req.prompt().unwrap().contains("仅做符合自然站立的小幅变化"));
            assert!(
                req.exit_prompt()
                    .contains("自然真实的站定状态优先于动作差异")
            );
            assert!(!req.prompt().unwrap().contains("不超过5度"));
        }
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
        assert!(exit.contains("至少有一项自然不同"));
        assert!(exit.contains("进场图没有安全帽时绝对不要添加"));
        assert!(exit.contains("不要高清商业摄影"));
        req.change_pose = false;
        assert!(req.exit_prompt().contains("动作和姿态不变"));
        assert!(!req.exit_prompt().contains("至少有一项自然不同"));
    }

    #[test]
    fn prompts_edit_references_without_inventing_devices_or_staged_actions() {
        let mut req = request();
        for prompt in [req.prompt().unwrap(), req.exit_prompt()] {
            assert!(prompt.contains("一律不得添加"));
            assert!(prompt.contains("不要证件照"));
            assert!(!prompt.contains("在考勤设备前"));
            assert!(!prompt.contains("朝向考勤设备"));
            assert!(!prompt.contains("正准备离开工地"));
            assert!(!prompt.contains("工地考勤机近景抓拍"));
            assert!(prompt.contains("不扩展成全身或全景照"));
            assert!(prompt.contains("不要人为添加噪点"));
        }
        for variant in 0..30 {
            req.variant = variant;
            let prompt = req.prompt().unwrap();
            assert!(!prompt.contains("一只手自然叉腰"));
            assert!(!prompt.contains("双手自然放在身前"));
            assert!(!prompt.contains("自然迈步"));
            assert!(prompt.contains("不需要任何手势"));
            assert!(prompt.contains("不超过8度"));
            assert!(prompt.contains("轻微洗旧褪色"));
            assert!(prompt.contains("衣服局部少量浅灰浮尘"));
            assert!(!prompt.contains("约30度"));
            assert!(!prompt.contains("不超过5度"));
            assert!(!prompt.contains("最小范围局部编辑"));
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
    #[tokio::test]
    #[ignore = "Paid live ephone parallel pair verification; explicit opt-in only"]
    async fn live_ephone_lite_parallel_pairs() {
        dotenvy::from_path(".env").ok();
        let person = crate::infrastructure::image_compression::compress_to_jpeg_below_async(
            std::fs::read(std::env::var("PHOTO_REAL_REF_IMAGE").unwrap()).unwrap(),
            2 * 1024 * 1024,
        )
        .await
        .unwrap();
        let client = CompositeClient::new(crate::infrastructure::config::PhotoCompositeConfig {
            ephone_ai_api_key: Some(std::env::var("EPHONE_AI_API_KEY").unwrap()),
            ephone_ai_base_url: std::env::var("PHOTO_REAL_BASE_URL")
                .unwrap_or("https://api.ephone.ai/v1".into()),
            ephone_ai_image_model: "gemini-3.1-flash-lite-image".into(),
            ephone_ai_image_size: "1024x1024".into(),
            ephone_ai_timeout_secs: 240,
            concurrency: 30,
            poll_seconds: 5,
            lease_secs: 60,
        });
        let mut tasks = Vec::new();
        let pair_count = std::env::var("PHOTO_REAL_PAIR_COUNT")
            .ok()
            .map(|v| v.parse::<usize>().unwrap())
            .unwrap_or(6);
        assert!((1..=6).contains(&pair_count));
        for variant in 0..pair_count {
            let (client, person) = (client.clone(), person.clone());
            tasks.push(tokio::spawn(async move {
                let mut req = request();
                req.count = pair_count;
                req.variant = variant;
                let result = generate_pair(&client, &req, &[person], &req.prompt().unwrap()).await;
                match result {
                    Ok(pair) => {
                        let entry = decode_entry_image(&pair.in_image).unwrap();
                        std::fs::write(format!("/tmp/shanhuai-lite-{variant}-entry.jpg"), &entry)
                            .unwrap();
                        if let Some(exit) = &pair.out_image {
                            let exit = decode_entry_image(exit).unwrap();
                            std::fs::write(format!("/tmp/shanhuai-lite-{variant}-exit.jpg"), &exit)
                                .unwrap();
                            println!(
                                "Lite set {variant}: both passed, entry {} bytes / exit {} bytes",
                                entry.len(),
                                exit.len()
                            );
                            true
                        } else {
                            println!("Lite set {variant}: exit failed {:?}", pair.out_error);
                            false
                        }
                    }
                    Err(error) => {
                        println!("Lite set {variant}: entry failed {error}");
                        false
                    }
                }
            }));
        }
        let mut complete = 0;
        for task in tasks {
            if task.await.unwrap() {
                complete += 1;
            }
        }
        assert_eq!(complete, pair_count, "All real pairs must complete");
    }

    #[tokio::test]
    #[ignore = "Live ephone verification; performs paid image requests only when explicitly run"]
    async fn live_ephone_dev_pair_smoke() {
        dotenvy::from_path(".env").ok();
        let source = std::env::var("PHOTO_REAL_REF_IMAGE").expect("test reference path required");
        let bytes = std::fs::read(source).unwrap();
        let person = crate::infrastructure::image_compression::compress_to_jpeg_below_async(
            bytes,
            2 * 1024 * 1024,
        )
        .await
        .unwrap();
        let client = CompositeClient::new(crate::infrastructure::config::PhotoCompositeConfig {
            ephone_ai_api_key: Some(std::env::var("EPHONE_AI_API_KEY").unwrap()),
            ephone_ai_base_url: "https://api.ephone.ai/v1".into(),
            ephone_ai_image_model: "gpt-image-2-dev".into(),
            ephone_ai_image_size: "1024x1024".into(),
            ephone_ai_timeout_secs: 240,
            concurrency: 30,
            poll_seconds: 5,
            lease_secs: 60,
        });
        let mut req = request();
        req.count = 1;
        if let Ok(path) = std::env::var("PHOTO_REAL_ENTRY_IMAGE") {
            req.entry_image = Some(image_uri(&std::fs::read(path).unwrap()));
        }
        let pair = generate_pair(&client, &req, &[person], &req.prompt().unwrap())
            .await
            .unwrap();
        assert!(
            pair.out_error.is_none(),
            "exit failed: {:?}",
            pair.out_error
        );
        let entry = decode_entry_image(&pair.in_image).unwrap();
        let exit = decode_entry_image(pair.out_image.as_deref().unwrap()).unwrap();
        std::fs::write("/tmp/shanhuai-live-entry.jpg", &entry).unwrap();
        std::fs::write("/tmp/shanhuai-live-exit.jpg", &exit).unwrap();
        println!(
            "Live Dev pair passed: entry {} bytes, exit {} bytes, both 480x480 JPEG",
            entry.len(),
            exit.len()
        );
    }
}
