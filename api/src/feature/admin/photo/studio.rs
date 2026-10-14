//! 无照片组的单张合成；浏览器同时提交最多30个请求并逐张展示结果。
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
}

#[derive(Serialize)]
pub struct GenerateResponse {
    image: String,
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
            "根据第一张人像照片生成写实照片，严格保留同一个人的五官、年龄、发型及身份特征，保留原有安全帽。人物为画面主体，只能有一个人，不加文字、水印或边框。自然匹配光照和透视。",
        );
        let mut reference = 2;
        if self.foreground_id.is_some() {
            prompt.push_str(&format!("第{reference}张图是前景参考，将其中前景物体自然置于人物前方，不遮挡脸部，不复制参考图中的人物。"));
            reference += 1;
        }
        if self.background_id.is_some() {
            prompt.push_str(&format!(
                "第{reference}张图是背景参考，以其环境替换人像原背景，不复制参考图中的人物。"
            ));
        } else {
            prompt.push_str("保持人像原图的背景环境。");
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
                "换成适合{season}的{}{}，本批共{}套，这是第{}套，每套服装款式和颜色应不同。",
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
                "正面自然站立",
                "身体轻微向左转，面部朝镜头",
                "身体轻微向右转，面部朝镜头",
                "自然迈步，面部朝镜头",
                "双手自然放在身前",
                "一只手自然叉腰，面部朝镜头",
            ];
            let head_poses = [
                "头部保持正直",
                "头部轻微向左倾斜",
                "头部轻微向右倾斜",
                "下巴微抬，目光看向镜头",
                "下巴微收，目光看向镜头",
            ];
            prompt.push_str(&format!(
                "动作：{}，{}。这是第{}张，使用此动作组合形成独立变化。面部清晰可见，保持人体比例自然。",
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

pub async fn generate(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    TrimmedJson(body): TrimmedJson<GenerateRequest>,
) -> ApiResult<GenerateResponse> {
    let prompt = body.prompt()?;
    let client = CompositeClient::new(state.config.photo_composite.clone());
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
    let refs: Vec<&[u8]> = images.iter().map(Vec::as_slice).collect();
    let output = client
        .compose_images(&refs, &prompt)
        .await
        .map_err(|error| internal_error(error.to_string()))?;
    ok(GenerateResponse {
        image: format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(output.bytes)
        ),
    })
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
}
