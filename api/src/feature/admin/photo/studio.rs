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
    reference_project_id: Option<Uuid>,
    reference_record_id: Option<Uuid>,
    reference_out_record_id: Option<Uuid>,
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
        self.prompt_with_outfit(None)
    }

    fn prompt_with_outfit(
        &self,
        outfit_index: Option<usize>,
    ) -> Result<String, crate::infrastructure::web::response::ApiError> {
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
        if let Some(index) = outfit_index.filter(|_| self.reference_out_record_id.is_some()) {
            return Ok(self.paired_entry_prompt(index, season));
        }
        let mut prompt = String::from(
            "根据第一张人像照片编辑服装和人物姿态，不要重新设计拍摄地点或换一个人。严格保留同一个人的五官、年龄、发型及身份特征。原图戴安全帽才保留同一顶；原图没有安全帽时绝对不要添加任何安全帽或帽子。保留原图的眼镜、肤色、脸部纹理和真实年龄，不美化、不改变身份。保留身份特征，但不要锁死原图表情；允许自然的眉眼、嘴角和口型变化，像人看屏幕、调整头部时的普通神情，不夸张表演、不美化成宣传照。人物为画面主体，只能有一个人，不加文字、水印或边框。自然匹配光照和透视。“进场”仅用于文件分类，不代表要拍摄走路进门、刷卡或按键等动作。",
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
            if let Some(index) = outfit_index {
                prompt.push_str(&format!("第{index}张图是另一位人员真实考勤的完整原图，不是衣服裁片。整张图仅用作服装参考，姿态是否参考以本次动作开关要求为准，需要结合完整可见衣服的轮廓、领口、肩线、袖子、版型和穿着方式进行换装。人的脸、眼镜、发型、年龄和身形只能来自第一张人像，第{index}张完整参考图中的人物只是一位穿衣模特，绝对不能复制其脸、眼睛、发型、皮肤、年龄、体型、帽子或背景；不要把第一张人像换成第二个人。只参考完整原图中可见的整件衣服，依据其真实领型、布料纹理、接缝、松紧、自然褶皱、日常使用程度来换装，不再凭空设计统一工装或新制服。颜色改成{}，与参考原色有区别但仍是普通日常穿衣配色；略微改变领口边缘或接缝细节，去掉文字、标识、工牌和大面积图案，不能完整照搬参考。保持普通劳动者实际穿着的松垮和自然垂坠，不熨平、不修身、不做新品广告，不额外制造斑点、夸张泥污或破损。按{season}温度仅作必要的厚薄调整，不擅自将普通T恤、Polo衫改成制式工装夹克。原图背景和人物身份不变。", colors[self.variant % 10]));
            } else {
                let style = clothes[self.variant % clothes.len()];
                prompt.push_str(&format!(
                "换成适合{season}的{}{}，本批共{}套，这是第{}套，每套服装款式和颜色应不同。衣服应像普通建筑工人平时穿着劳动的旧工作服：棉布或涤棉面料、宽松实用，有不规则自然褶皱、轻微洗旧褪色、领口袖口自然磨损，以及衣服局部少量浅灰浮尘和劳动留下的轻微灰印。不要全新干净、熨烫平整、挺括修身、时装卫衣、广告展示或统一新制服。灰尘仅限衣服且少量自然，不用夸张泥点、油污、破洞或全身脏污；不能给脸、头发或背景加污渍。身体位置轻微改变时布料随姿态自然变化，不改变人物身份或场景。",
                colors[self.variant % 10],
                style,
                self.count,
                self.variant + 1
            ));
            }
        } else {
            prompt.push_str("保持原图服装完全不变。");
        }
        if self.change_pose && outfit_index.is_some() {
            let index = outfit_index.unwrap();
            prompt.push_str(&format!("第{index}张完整真实考勤图同时提供姿态参考：参考其肩颈放松程度、头部朝向、轻微俯仰、自然嘴部状态和人物占画面比例，将这些姿态适配到第一张人物身上。只转移姿态，不复制参考人的五官、眼睛形状、发型、年龄、肤色、身形或身份。眼睛仍注视镜头，身体基本正对镜头，避免大幅侧脸；如参考图有抬手、操作设备或遮脸，忽略手部动作，双手自然放低留在画外。不采用统一摆拍姿势，不照搬参考背景、设备或光照。"));
        } else if self.change_pose {
            prompt.push_str(&format!(
                "人物在现场固定镜头前自然站立。{}本张的头部动作与表情要求：{}。{}。变化重点是头部转动或俯仰与自然表情，眼睛始终保持看着镜头，不能只有身体重心变化而脸部完全一样。身体和胸口仍基本朝向镜头，不大幅扭身，不看远处，不做摆拍表演。不用手做动作，不触摸设备或衣物，不整理领口袖口，不抬手不叉腰；双手自然放低并留在画外。取头部正在轻微调整但双眼仍注视镜头中心的一帧，保持近景和原有背景。",
                FACE_SCAN_STANCE,
                ENTRY_POSES[self.variant % ENTRY_POSES.len()],
                EXPRESSIONS[(self.variant / ENTRY_POSES.len()) % EXPRESSIONS.len()],
            ));
        } else {
            prompt.push_str("保持原图动作和姿态不变。");
        }
        if outfit_index.is_some() {
            prompt.push_str("最终背景仅来自明确标注的背景图；没有单独上传背景时仅来自第一张人像。衣服和姿态参考图中的场景、墙面、门窗、设备、前景及其拍摄环境一律不使用。");
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
    "头部向左转约12度，双眼仍看镜头中心，眉头略微集中，嘴唇自然闭合",
    "头部向右转约12度，双眼仍看镜头中心，眉毛自然放松，嘴唇轻抿",
    "头部略低约6度并向左转约8度，眼睛自然上抬回看镜头，嘴唇微微分开如自然呼吸",
    "头部略抬约5度并向右转约10度，眼睛自然下看镜头中心，眉毛轻微抬起，嘴唇自然闭合",
    "头部向右转约15度、下巴轻收，双眼仍看镜头中心，嘴角有很轻微的放松变化",
    "头部向左转约10度、下巴稍抬，双眼仍看镜头中心，眉眼略带专注，嘴部自然放松",
];
const EXIT_POSES: [&str; 6] = [
    "头部轻转向右约10度，双眼仍看镜头中心，眉头放松，嘴唇微微分开如自然呼吸",
    "头部轻转向左约10度，双眼仍看镜头中心，眉毛略微抬起，嘴唇从轻抿变为自然放松",
    "头部从低头状态抬回端正并向右转约10度，双眼仍看镜头中心，嘴唇自然闭合",
    "下巴轻收约4度并向左转约8度，双眼仍看镜头中心，眉眼从微抬变为放松",
    "头部轻转向左约10度，双眼仍看镜头中心，嘴唇微微分开，保留普通自然神情",
    "头部轻转向右约10度、下巴轻收，双眼仍看镜头中心，眉头放松、嘴唇自然闭合",
];
const EXPRESSIONS: [&str; 5] = [
    "双眼自然注视镜头，神情专注但不刻意瞪眼",
    "看着镜头，眉眼和嘴部自然放松，不僵硬复制原表情",
    "始终看着镜头，可有轻微思考或专注的神情，不大笑",
    "双眼仍对着镜头，眉毛和嘴角有自然的小变化",
    "眼睛看着镜头，像普通人调整头部时的一瞬间，神情自然不表演",
];
const FACE_SCAN_STANCE: &str = "身体基本朝向镜头、肩颈放松；头部可左右转动约8至18度，并轻微抬头或低头，但双眼始终注视镜头中心。头部角度变化时眼睛自然回看镜头，与观察者保持对视，不看画面两侧、上方、下方或屏幕角落。变化的是头部姿态和表情，不是视线落点。不要转成完全侧脸或大幅扭动上身。双臂贴近身体两侧自然下垂，不前伸、不平举、不摆操作姿势；双手留在画外，不需要任何手势。";
const CAMERA_STYLE: &str = "输出普通现场固定镜头连续抓拍中的一帧，由画面外的普通固定摄像头拍摄，双眼始终注视镜头中心，头部动作与表情可以不同，但视线不得偏离镜头。保留现场光照、曝光、白平衡、肤色纹理和真实年龄，不做摆拍、精致证件照、时尚大片或宣传照。采用低细节、略软的普通摄像头画质，有轻微JPEG压缩感；头部微动时允许极轻的短距离运动软边，像头刚转动或轻微晃动的一瞬间，不要高清锐利、毛孔纤毫毕现、过度锐化或电影感。五官仍应自然可辨认，不制造双脸、双眼重影、明显拖影、整幅严重模糊或夸张噪点，不通过磨皮美颜制造柔焦。只保留参考图里的环境和物品；原图没有的考勤机、刷卡器、闸机、屏幕、卡片、门禁及其他设备一律不得添加。画面四角和下边缘也不能出现设备局部、黑色矩形挡板、屏幕边框、桌面或键盘，不在人物前方新增任何物体。背景不添加灰尘、污渍或杂乱材料，不重建背景，衣服使用痕迹按换装要求保留。保持胸口以上近景取景，不扩展成全身或全景照，不为了显示手部动作扩大构图。";

const PAIRED_CAMERA_STYLE: &str = "采用普通人脸抓拍摄像头的低细节画质，轻微软化和JPEG压缩感，允许头部微动产生极轻的运动软边，五官仍可辨认。不要高清锐化、磨皮、美颜、证件照、宣传照或时装广告，不加明显拖影、双脸双眼或夸张噪声。取景范围、人物在画面中的大小和遮挡关系必须与当前方向的真实参考原图一致；参考图是脸部近景就输出脸部近景，不扩展成半身、全身或全景。参考图没有露出的墙面、地面、门口和画外区域不得补画。背景只保留当前方向真实参考原图已有的墙面、门窗、地面和物品，固定它们的位置、形状、材质、镜头视角及透视；不添加参考图没有的考勤机、屏幕、闸机、卡片、键盘、黑色挡板或其他设备。不重新布置背景，不加文字、水印或边框。人物自然融入该背景的光照、曝光和白平衡，只出现目标人物一个人。原人像没有帽子时绝对不要添加帽子，不能复制参考人员的帽子。双手自然放低留在画外，不抬手、不操作设备、不碰衣领或袖口，不摆拍。";

impl GenerateRequest {
    fn paired_entry_prompt(&self, index: usize, season: &str) -> String {
        let mut prompt = format!(
            "第二张图是目标人物的唯一身份依据，严格保留其五官、眼镜、发型、肤色、真实年龄、身形和帽子状态，不复制其他人的身份。第{index}张图是所选项目真实进场考勤的完整原图，也是本次编辑的底图。直接编辑第{index}张完整底图，不重新生成场景，不改变原图取景或相机位置，不向四周扩图；只将底图中的人员身份替换为第二张目标人物，并按开关处理衣服和姿态。进场背景必须采用第{index}张真实进场图的背景和拍摄视角，替换目标人像原背景；不要把出场场景当作进场场景。参考图中的人只提供衣服和姿态参考，将其替换成第二张目标人物，不保留第二个人或叠加第二张脸。完整原图参与参考，不裁剪成衣服局部。"
        );
        if self.change_clothes {
            let color = [
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
            ][self.variant % 10];
            prompt.push_str(&format!("参考第{index}张图中实际可见衣服的领口、肩线、袖子、版型、布料纹理、自然褶皱和穿着方式，给目标人物换上同类日常衣服。服装类别不得改动，连帽衫仍为连帽衫、T恤仍为T恤，不能凭空添加翻领、工装胸兜或改成制服。颜色适当改为{color}或与原色有区别的自然色调，略改接缝细节并去掉标识文字，按{season}只调整必要厚薄。保留洗旧、松垮和自然使用感，不改成统一新制服、修身时装或挺括新品；不凭空制造夸张泥污、破损或脸部污渍。"));
        } else {
            prompt.push_str("目标人物的衣服必须沿用第二张人像原衣服，不复制参考人员的衣服。");
        }
        if self.change_pose {
            prompt.push_str(&format!("参考第{index}张真实进场图里自然的头部朝向、俯仰、肩颈状态和普通表情，将姿态适配到目标人物身上；双眼仍自然看向镜头，避免大幅侧脸，不复制参考人的五官。忽略参考图任何手部操作，不表演动作。"));
        } else {
            prompt.push_str("保留第二张目标人物的头部朝向和姿态，只更换到对应进场背景。");
        }
        prompt.push_str(PAIRED_CAMERA_STYLE);
        prompt
    }

    fn paired_exit_prompt(&self) -> String {
        let mut prompt = String::from(
            "第一张图是同一参考人员同一天真实出场考勤的完整原图，是本次编辑底图；第二张图是本套已经生成的进场照片，是目标人物身份和衣服的唯一依据。直接在第一张真实出场底图中替换人物，不重新生成场景，不改变取景或相机位置，不向四周扩图。出场背景必须采用第一张真实出场图，不能使用第二张进场照片的背景；进场和出场是不同方向的场景，不能沿用进场背景，也不能混合两张背景。严格保留第二张进场人物的五官、眼镜、发型、肤色、年龄、帽子状态和同一套衣服；衣服款式、颜色、领口、接缝、口袋、图案、层次和使用痕迹完全一致，绝对不能换衣服或换颜色，不能复制第一张真实出场底图中参考人员的脸、帽子或衣服。将目标人物自然放到出场背景里，只出现一个人。",
        );
        if self.change_pose {
            prompt.push_str("参考第一张真实出场图的自然头部朝向、俯仰、肩颈状态和普通表情，双眼仍看着镜头；头部角度和眉眼口型应与本套进场图有细微自然差异，不能只改背景而完全复制同一张脸部姿态。忽略参考图的手势和设备操作，不抬手、不整理衣服。");
        } else {
            prompt.push_str("保持本套进场图的头部和人物姿态，只换成真实出场背景。");
        }
        prompt.push_str(PAIRED_CAMERA_STYLE);
        prompt
    }
}

impl GenerateRequest {
    fn exit_prompt(&self) -> String {
        if self.reference_out_record_id.is_some() {
            return self.paired_exit_prompt();
        }
        let mut prompt = String::from(
            "第一张图是本套已经生成的第一张照片。以它作为唯一图像依据，保持同一个人和同一套衣服，得到同一次现场固定镜头下第二张自然站立近景照片。“出场”仅用于文件分类，不代表离场动作或任何操作设备的情节。严格保持五官、发型、衣服的款式、颜色、图案、口袋和层次一致，进场衣服已有的洗旧褪色、磨损和浅灰浮尘须原样保留，不能把旧衣变成新衣，也不能新增第一张没有的污渍；褶皱可以随站立位置自然变化，绝对不能换衣服或换颜色。进场图有安全帽才保留同一顶，进场图没有安全帽时绝对不要添加帽子。保留同样的前景和背景环境、画面中只能有一个人。",
        );
        if self.change_pose {
            prompt.push_str(&format!(
                "{}第二张的动作与表情参考：{}。必须与第一张实际结果比较：头部朝向或俯仰、眉毛状态和口型之中至少两项有可见但自然的变化，其中头部角度必须变化；双眼始终注视镜头中心，不能用移开视线制造差异，不能复制第一张的正脸和表情，也不能只移动肩膀或站位。若第一张脸朝画面右方，第二张头部须轻转向画面左方约10度，反之亦然，身体不要随头部反转；若第一张正面，则第二张轻转向任意一侧约10度。若参考动作恰好与第一张相同，应选择另一侧的小角度转头，眼睛仍回看镜头，同时改变自然口型或眉眼。保留同一张脸的身份特征；自然的转头、抬低头和表情变化必须体现，眼睛始终看着镜头，不做夸张表演。身体仍基本朝向镜头，双手放低留在画外，不抬手、不做手势、不碰衣领袖口、不拿东西；若第一张意外出现手势，将手自然放下。衣服款式、颜色、使用痕迹、光照、前景和背景必须一致，不添加设备或道具。",
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
        )
        .resize_exact(360, 360, image::imageops::FilterType::Triangle)
        .resize_exact(
            ATTENDANCE_SIZE,
            ATTENDANCE_SIZE,
            image::imageops::FilterType::Triangle,
        );
    // 先降低有效细节，让480像素输出更接近普通摄像头；不制造重影或大幅拖影。
    // 噪点/纹理极多的图仅降低JPEG质量仍可能超限。逐步轻微软化，
    // 保持480×480尺寸，避免压缩失败或重新缩成超小缩略图。
    for softness in [0.7, 1.0, 1.4, 2.0] {
        let softened = image.blur(softness);
        for quality in [48, 42, 36, 28, 20, 12, 8] {
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
    exit_reference: Option<&[u8]>,
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
    // 真实出场原图作编辑底图；已生成进场图约束身份与服装，旧客户端仍只用进场图。
    let exit_images: Vec<&[u8]> = if let Some(reference) = exit_reference {
        vec![reference, &entry]
    } else {
        vec![&entry]
    };
    let exit = match client
        .compose_images(&exit_images, &body.exit_prompt())
        .await
    {
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
    generate_inner(state, user, body)
        .await
        .map(|pair| crate::infrastructure::web::response::ApiSuccess::default().with_data(pair))
}

async fn generate_inner(
    state: AppState,
    user: AuthUser,
    body: GenerateRequest,
) -> Result<GenerateResponse, crate::infrastructure::web::response::ApiError> {
    body.prompt()?;
    let mut config = state.config.photo_composite.clone();
    config.ephone_ai_image_size = "1024x1024".into();
    config.ephone_ai_image_model = body.resolved_model()?.to_string();
    let client = CompositeClient::new(config);
    if !client.is_enabled() {
        return Err(invalid_input("AI合成服务尚未配置"));
    }
    let mut images = vec![load_image(&state, body.person_id, user.user_id).await?];
    let mut exit_reference = None;
    let reference_index;
    if let Some(exit_id) = body.reference_out_record_id {
        let project_id = body
            .reference_project_id
            .ok_or_else(|| invalid_input("请选择参考项目"))?;
        let entry_id = body
            .reference_record_id
            .ok_or_else(|| invalid_input("缺少进场参考照片，请重新抽取"))?;
        let (entry, exit) =
            super::studio_references::load_pair(&state, &user, project_id, entry_id, exit_id)
                .await?;
        images.insert(0, entry);
        reference_index = Some(1);
        exit_reference = Some(exit);
    } else {
        // 兼容刷新前的客户端；新页面不再上传前景/背景。
        for id in [body.foreground_id, body.background_id]
            .into_iter()
            .flatten()
        {
            images.push(load_image(&state, id, user.user_id).await?);
        }
        reference_index = if body.entry_image.is_none()
            && (body.change_clothes || body.change_pose)
            && body.reference_record_id.is_some()
        {
            let project_id = body
                .reference_project_id
                .ok_or_else(|| invalid_input("请选择真实衣服参考项目"))?;
            images.push(
                super::studio_references::load_reference(
                    &state,
                    &user,
                    project_id,
                    body.reference_record_id.unwrap(),
                )
                .await?,
            );
            Some(images.len())
        } else {
            None
        };
    }
    if let Some(uri) = &body.entry_image {
        decode_entry_image(uri).map_err(invalid_input)?;
    }
    let prompt = body.prompt_with_outfit(reference_index)?;
    let pair = generate_pair(&client, &body, &images, &prompt, exit_reference.as_deref())
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
            generate_inner(state, user, request.body),
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
            reference_project_id: None,
            reference_record_id: None,
            reference_out_record_id: None,
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
    fn whole_attendance_reference_separates_identity_clothes_pose_and_background() {
        let mut req = request();
        req.foreground_id = Some(Uuid::nil());
        req.background_id = Some(Uuid::nil());
        let prompt = req.prompt_with_outfit(Some(4)).unwrap();
        assert!(prompt.contains("第2张图是前景"));
        assert!(prompt.contains("第3张图是背景"));
        assert!(prompt.contains("第4张图是另一位人员真实考勤的完整原图"));
        assert!(prompt.contains("第4张完整真实考勤图同时提供姿态参考"));
        assert!(prompt.contains("不照搬参考背景、设备或光照"));
        assert!(
            !prompt.contains("头部动作与表情要求"),
            "有真实参考时不再叠加模板姿态"
        );
        req.change_pose = false;
        let prompt = req.prompt_with_outfit(Some(4)).unwrap();
        assert!(prompt.contains("保持原图动作和姿态不变"));
        assert!(!prompt.contains("同时提供姿态参考"));
        req.change_clothes = false;
        req.change_pose = true;
        let prompt = req.prompt_with_outfit(Some(4)).unwrap();
        assert!(prompt.contains("保持原图服装完全不变"));
        assert!(prompt.contains("同时提供姿态参考"));
        assert!(!prompt.contains("颜色改成"));
    }

    #[test]
    fn paired_backgrounds_use_entry_then_exit_without_conflicting_scene_rules() {
        let mut req = request();
        req.reference_out_record_id = Some(Uuid::new_v4());
        let entry = req.prompt_with_outfit(Some(1)).unwrap();
        assert!(entry.contains("第1张真实进场图的背景"));
        assert!(
            !entry
                .contains("衣服和姿态参考图中的场景、墙面、门窗、设备、前景及其拍摄环境一律不使用")
        );
        assert!(!entry.contains("保持人像原图的背景环境"));
        let exit = req.exit_prompt();
        assert!(exit.contains("第一张真实出场图"));
        assert!(exit.contains("不能沿用进场背景"));
        assert!(exit.contains("绝对不能换衣服或换颜色"));
        req.change_clothes = false;
        req.change_pose = false;
        assert!(req.prompt_with_outfit(Some(2)).unwrap().contains("原衣服"));
        assert!(req.exit_prompt().contains("只换成真实出场背景"));
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
            assert!(req.prompt().unwrap().contains("头部动作与表情要求"));
            assert!(req.exit_prompt().contains("至少两项有可见但自然的变化"));
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
        assert!(exit.contains("至少两项有可见但自然的变化"));
        assert!(exit.contains("进场图没有安全帽时绝对不要添加"));
        assert!(exit.contains("不要高清锐利"));
        req.change_pose = false;
        assert!(req.exit_prompt().contains("动作和姿态不变"));
        assert!(!req.exit_prompt().contains("至少两项有可见但自然的变化"));
    }

    #[test]
    fn prompts_edit_references_without_inventing_devices_or_staged_actions() {
        let mut req = request();
        for prompt in [req.prompt().unwrap(), req.exit_prompt()] {
            assert!(prompt.contains("一律不得添加"));
            assert!(prompt.contains("精致证件照"));
            assert!(!prompt.contains("在考勤设备前"));
            assert!(!prompt.contains("朝向考勤设备"));
            assert!(!prompt.contains("正准备离开工地"));
            assert!(!prompt.contains("工地考勤机近景抓拍"));
            assert!(prompt.contains("不扩展成全身或全景照"));
            assert!(prompt.contains("不制造双脸、双眼重影"));
        }
        for variant in 0..30 {
            req.variant = variant;
            let prompt = req.prompt().unwrap();
            assert!(!prompt.contains("一只手自然叉腰"));
            assert!(!prompt.contains("双手自然放在身前"));
            assert!(!prompt.contains("自然迈步"));
            assert!(prompt.contains("不需要任何手势"));
            assert!(prompt.contains("8至18度"));
            assert!(prompt.contains("双眼始终注视镜头中心"));
            assert!(req.exit_prompt().contains("双眼始终注视镜头中心"));
            assert!(!prompt.contains("不必始终直盯"));
            assert!(!prompt.contains("目光落在镜头附近的不同位置"));
            assert!(!req.exit_prompt().contains("另一落点的视线"));
            assert!(prompt.contains("低细节、略软"));
            assert!(prompt.contains("极轻的短距离运动软边"));
            assert!(prompt.contains("轻微洗旧褪色"));
            assert!(prompt.contains("衣服局部少量浅灰浮尘"));
            assert!(!prompt.contains("约30度"));
            assert!(!prompt.contains("不超过5度"));
            assert!(!prompt.contains("最小范围局部编辑"));
        }
    }

    #[tokio::test]
    async fn exit_uses_entry_bytes_and_failed_exit_retry_keeps_same_entry() {
        verify_exit_retry(false).await;
    }
    #[tokio::test]
    async fn exit_keeps_entry_and_direction_background_on_retry() {
        verify_exit_retry(true).await;
    }
    async fn verify_exit_retry(paired: bool) {
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
        let exit_ref = paired.then_some(b"actual-exit-background".as_slice());
        if paired {
            req.reference_out_record_id = Some(Uuid::new_v4());
        }
        let images = vec![
            b"original-person".to_vec(),
            b"foreground".to_vec(),
            b"background".to_vec(),
            b"real-attendance-reference".to_vec(),
        ];
        let first = generate_pair(&client, &req, &images, &req.prompt().unwrap(), exit_ref)
            .await
            .unwrap();
        assert!(first.out_image.is_none());
        assert!(first.out_error.is_some());
        req.entry_image = Some(first.in_image.clone());
        let retried = generate_pair(&client, &req, &images, &req.prompt().unwrap(), exit_ref)
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
            4
        );
        for call in &calls[1..] {
            assert_eq!(
                String::from_utf8_lossy(call)
                    .matches("name=\"image\"")
                    .count(),
                if paired { 2 } else { 1 }
            );
            assert_eq!(
                String::from_utf8_lossy(call).contains("actual-exit-background"),
                paired
            );
            if paired {
                let source = exit_ref.unwrap();
                let source_position = call
                    .windows(source.len())
                    .position(|part| part == source)
                    .unwrap();
                let entry_position = call
                    .windows(entry.len())
                    .position(|part| part == entry)
                    .unwrap();
                assert!(
                    source_position < entry_position,
                    "真实出场图必须作为第一张编辑底图"
                );
            }
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
                req.season = std::env::var("PHOTO_REAL_SEASON").unwrap_or("autumn".into());
                let mut refs = vec![person];
                let outfit_index = if let Ok(paths) = std::env::var("PHOTO_REAL_OUTFIT_FILES") {
                    let paths: Vec<_> = paths.split(',').collect();
                    assert!(
                        variant < paths.len(),
                        "Each pair requires a distinct real outfit"
                    );
                    refs.push(std::fs::read(paths[variant]).unwrap());
                    Some(refs.len())
                } else {
                    None
                };
                let exit_ref = std::env::var("PHOTO_REAL_EXIT_FILES").ok().map(|paths| {
                    req.reference_out_record_id = Some(Uuid::nil());
                    std::fs::read(paths.split(',').nth(variant).unwrap()).unwrap()
                });
                let outfit_index = if exit_ref.is_some() {
                    refs.swap(0, 1);
                    Some(1)
                } else {
                    outfit_index
                };
                let prompt = req.prompt_with_outfit(outfit_index).unwrap();
                let result =
                    generate_pair(&client, &req, &refs, &prompt, exit_ref.as_deref()).await;
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
        let pair = generate_pair(&client, &req, &[person], &req.prompt().unwrap(), None)
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
