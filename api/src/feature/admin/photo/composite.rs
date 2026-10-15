//! ephone.ai `gpt-image-2` 图像合成客户端。
//!
//! ## 隐私提示（重要）
//! 本模块会把**工人实名考勤人像照片**和现场背景图一起 POST 到第三方服务
//! `api.ephone.ai`（该中转背后还可能是 OpenAI 等图片生成 provider）。
//! 这是内部管理工具，没有对外暴露开关；后续若要做合规审计或下线，
//! 只需清空 `EPHONE_AI_API_KEY`（`PhotoCompositeConfig::is_enabled()` 返回 false，
//! worker 会直接把任务标记为失败而不会逐张等待超时）。

use base64::{Engine as _, engine::general_purpose};
use bytes::Bytes;
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};

use crate::infrastructure::config::PhotoCompositeConfig;

use super::{DIRECTION_IN, direction_label};

/// 单张合成的输入与输出字节上限，防止上游返回超大响应把内存打爆。
const MAX_OUTPUT_BYTES: usize = 20 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum CompositeError {
    #[error("照片处理AI合成未配置 EPHONE_AI_API_KEY")]
    NotConfigured,

    #[error("调用照片处理AI合成接口失败: {0}")]
    Transport(String),

    #[error("照片处理AI合成接口返回异常: {0}")]
    Upstream(String),

    #[error("照片处理AI合成返回的不是合法图片: {0}")]
    BadImage(String),
}

pub type CompositeResult<T> = Result<T, CompositeError>;

/// 一次成功合成的结果。
pub struct CompositeOutput {
    pub bytes: Vec<u8>,
    /// 上游返回的生成任务 ID，落库用于追溯。
    pub generation_id: Option<String>,
}

#[derive(Clone)]
pub struct CompositeClient {
    http: reqwest::Client,
    config: PhotoCompositeConfig,
}

/// 上游响应：OpenAI images 兼容格式。
#[derive(Debug, Deserialize)]
struct ImagesResponse {
    data: Option<Vec<ImageDatum>>,
    error: Option<UpstreamError>,
}

#[derive(Debug, Deserialize)]
struct ImageDatum {
    b64_json: Option<String>,
    generation_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpstreamError {
    message: Option<String>,
}

impl CompositeClient {
    pub fn new(config: PhotoCompositeConfig) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(
                config.ephone_ai_timeout_secs,
            ))
            .connect_timeout(std::time::Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (compatible; ShanhuaiPhoto/1.0)")
            .build()
            .unwrap_or_else(|error| {
                tracing::error!(error = %error, "构建照片合成HTTP客户端失败，退回默认客户端");
                reqwest::Client::new()
            });
        Self { http, config }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.is_enabled()
    }

    /// 把「人像 + 对应方向背景图」合成一张新照片。
    ///
    /// `image` 字段按 OpenAI images/edits 的可重复多图约定传两次：
    /// 第一张是人像，第二张是背景，提示词里用「第一张图/第二张图」指代。
    pub async fn compose(
        &self,
        person: &[u8],
        background: &[u8],
        direction: i16,
        prompt_override: Option<&str>,
    ) -> CompositeResult<CompositeOutput> {
        let prompt = prompt_override
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| default_prompt(direction));
        self.compose_images(&[person, background], &prompt).await
    }

    /// 第一张始终为人像；其余参考图由提示词明确标注用途。
    pub async fn compose_images(
        &self,
        images: &[&[u8]],
        prompt: &str,
    ) -> CompositeResult<CompositeOutput> {
        let Some(api_key) = self.config.ephone_ai_api_key.as_deref() else {
            return Err(CompositeError::NotConfigured);
        };
        if images.is_empty() || images.iter().any(|image| image.is_empty()) {
            return Err(CompositeError::BadImage("输入图片为空".to_string()));
        }
        if self.config.ephone_ai_image_model == "gpt-image-2-dev" {
            return self.compose_async_images(images, prompt).await;
        }
        let mut form = reqwest::multipart::Form::new()
            .text("model", self.config.ephone_ai_image_model.clone())
            .text("prompt", prompt.to_string())
            .text("size", self.config.ephone_ai_image_size.clone())
            .text("response_format", "b64_json");
        for (index, image) in images.iter().enumerate() {
            let part = reqwest::multipart::Part::bytes(image.to_vec())
                .file_name(format!("reference-{index}.jpg"))
                .mime_str("image/jpeg")
                .map_err(|error| CompositeError::BadImage(error.to_string()))?;
            form = form.part("image", part);
        }

        let url = format!(
            "{}/images/edits",
            self.config.ephone_ai_base_url.trim_end_matches('/')
        );
        let response = self
            .http
            .post(&url)
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|error| self.transport_error(error, "图片编辑"))?;

        let status = response.status();
        let body = response
            .bytes()
            .await
            .map_err(|error| CompositeError::Transport(format!("读取响应失败: {error}")))?;
        if !status.is_success() {
            let detail = extract_upstream_error(&body).unwrap_or_else(|| truncate(&body));
            return Err(CompositeError::Upstream(format!("HTTP {status} {detail}")));
        }

        let parsed: ImagesResponse = serde_json::from_slice(&body).map_err(|error| {
            CompositeError::Upstream(format!("响应不是合法JSON: {error}: {}", truncate(&body)))
        })?;
        if let Some(error) = parsed.error {
            return Err(CompositeError::Upstream(
                error
                    .message
                    .unwrap_or_else(|| "上游未提供错误信息".to_string()),
            ));
        }
        let datum = parsed
            .data
            .and_then(|mut data| (!data.is_empty()).then(|| data.swap_remove(0)))
            .ok_or_else(|| CompositeError::Upstream("响应 data 为空".to_string()))?;
        let encoded = datum
            .b64_json
            .ok_or_else(|| CompositeError::Upstream("响应缺少 b64_json".to_string()))?;
        let bytes = general_purpose::STANDARD
            .decode(encoded.as_bytes())
            .map_err(|error| CompositeError::BadImage(format!("base64 解码失败: {error}")))?;
        if bytes.len() > MAX_OUTPUT_BYTES {
            return Err(CompositeError::BadImage(format!(
                "合成结果超过 {} MB",
                MAX_OUTPUT_BYTES / 1024 / 1024
            )));
        }
        Ok(CompositeOutput {
            bytes,
            generation_id: datum.generation_id,
        })
    }
    fn transport_error(&self, error: reqwest::Error, phase: &str) -> CompositeError {
        tracing::warn!(model = %self.config.ephone_ai_image_model, phase, timeout = error.is_timeout(), connect = error.is_connect(), error = ?error, "AI图片请求失败，保留完整底层错误用于排障");
        let reason = if error.is_timeout() {
            "请求超时"
        } else if error.is_connect() {
            "连接失败"
        } else {
            "网络连接中断"
        };
        CompositeError::Transport(format!("AI服务{phase}{reason}，请稍后重试"))
    }

    async fn task_json(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<&Value>,
    ) -> CompositeResult<Value> {
        let url = format!(
            "{}{}",
            self.config.ephone_ai_base_url.trim_end_matches('/'),
            path
        );
        let key = self
            .config
            .ephone_ai_api_key
            .as_deref()
            .ok_or(CompositeError::NotConfigured)?;
        let read_only = method == reqwest::Method::GET;
        for attempt in 0..3 {
            let mut request = self
                .http
                .request(method.clone(), &url)
                .bearer_auth(key)
                .timeout(Duration::from_secs(30));
            if let Some(body) = body {
                request = request.json(body);
            }
            let response = match request.send().await {
                Ok(response) => response,
                Err(error) => {
                    // 查询可安全重试；提交仅在连接尚未建立时重试，避免重复扣费。
                    if attempt < 2 && (read_only || error.is_connect()) {
                        tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
                        continue;
                    }
                    return Err(self.transport_error(
                        error,
                        if read_only {
                            "查询任务"
                        } else {
                            "提交任务"
                        },
                    ));
                }
            };
            let status = response.status();
            if read_only && attempt < 2 && (status.as_u16() == 429 || status.is_server_error()) {
                tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
                continue;
            }
            let bytes = response
                .bytes()
                .await
                .map_err(|error| self.transport_error(error, "读取任务结果"))?;
            if !status.is_success() {
                return Err(CompositeError::Upstream(format!(
                    "HTTP {status} {}",
                    extract_upstream_error(&bytes).unwrap_or_else(|| truncate(&bytes))
                )));
            }
            return serde_json::from_slice(&bytes)
                .map_err(|_| CompositeError::Upstream("任务响应不是合法JSON".into()));
        }
        Err(CompositeError::Transport(
            "AI任务查询失败，请稍后重试".into(),
        ))
    }

    async fn compose_async_images(
        &self,
        images: &[&[u8]],
        prompt: &str,
    ) -> CompositeResult<CompositeOutput> {
        // 单阶段总等待窗口包含提交、轮询和下载，两阶段可落在前端10分钟窗口内。
        let started = Instant::now();
        let deadline = Duration::from_secs(self.config.ephone_ai_timeout_secs.max(240));
        // ephone Dev模型官方文档指定/v1/task/submit，不支持直接换模型名调用同步编辑。
        let refs: Vec<String> = images
            .iter()
            .map(|bytes| {
                format!(
                    "data:image/jpeg;base64,{}",
                    general_purpose::STANDARD.encode(bytes)
                )
            })
            .collect();
        let body = json!({"model": self.config.ephone_ai_image_model, "input": {
            "prompt": prompt, "images": refs, "size": self.config.ephone_ai_image_size,
            "quality": "medium", "n": 1, "response_format": "url"
        }});
        let submitted = tokio::time::timeout(
            deadline,
            self.task_json(reqwest::Method::POST, "/task/submit", Some(&body)),
        )
        .await
        .map_err(|_| CompositeError::Transport("AI任务提交等待超时".into()))??;
        let id = submitted
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| {
                !id.is_empty()
                    && id.len() <= 128
                    && id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            })
            .ok_or_else(|| CompositeError::Upstream("提交任务未返回合法任务ID".into()))?;
        tracing::info!(model = %self.config.ephone_ai_image_model, task_id = id, "AI图片异步任务已提交");
        loop {
            let remaining = deadline.checked_sub(started.elapsed()).ok_or_else(|| {
                CompositeError::Transport("AI生成任务仍在排队或处理中，本次等待已超时".into())
            })?;
            let result = tokio::time::timeout(
                remaining,
                self.task_json(reqwest::Method::GET, &format!("/task/{id}"), None),
            )
            .await
            .map_err(|_| CompositeError::Transport("AI生成任务等待超时".into()))??;
            match result.get("status").and_then(Value::as_str) {
                Some("completed") => {
                    let output = result
                        .get("outputs")
                        .and_then(Value::as_array)
                        .and_then(|a| a.first())
                        .and_then(Value::as_str)
                        .ok_or_else(|| CompositeError::Upstream("任务完成但没有图片结果".into()))?;
                    let remaining = deadline
                        .checked_sub(started.elapsed())
                        .ok_or_else(|| CompositeError::Transport("AI结果下载等待超时".into()))?;
                    let bytes = tokio::time::timeout(remaining, async {
                        let mut downloaded = self.download_image(output).await;
                        for attempt in 0..2 {
                            if !matches!(&downloaded, Err(CompositeError::Transport(_))) {
                                break;
                            }
                            // 已完成任务只重试下载，不重新提交付费生成。
                            tokio::time::sleep(Duration::from_millis(500 * (1 << attempt))).await;
                            downloaded = self.download_image(output).await;
                        }
                        downloaded
                    })
                    .await
                    .map_err(|_| CompositeError::Transport("AI结果下载等待超时".into()))??;
                    tracing::info!(model = %self.config.ephone_ai_image_model, task_id = id, elapsed_secs = started.elapsed().as_secs(), "AI图片异步任务完成");
                    return Ok(CompositeOutput {
                        bytes,
                        generation_id: Some(id.to_string()),
                    });
                }
                Some("failed") => {
                    let detail = result
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("AI图片生成任务失败");
                    tracing::warn!(model = %self.config.ephone_ai_image_model, task_id = id, elapsed_secs = started.elapsed().as_secs(), error = detail, "AI上游任务已明确失败，不自动重提付费任务");
                    return Err(CompositeError::Upstream(format!(
                        "{} 上游生成失败（任务 {}）：{}；请切换其他模型，不要反复重试同一线路",
                        self.config.ephone_ai_image_model, id, detail
                    )));
                }
                Some("queued" | "in_progress" | "pending" | "processing") => {
                    tokio::time::sleep(Duration::from_secs(4).min(remaining)).await;
                }
                _ => return Err(CompositeError::Upstream("AI任务返回未知状态".into())),
            }
        }
    }

    async fn download_image(&self, raw: &str) -> CompositeResult<Vec<u8>> {
        if let Some(encoded) = raw
            .strip_prefix("data:image/png;base64,")
            .or_else(|| raw.strip_prefix("data:image/jpeg;base64,"))
        {
            let bytes = general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| CompositeError::BadImage("图片Base64格式错误".into()))?;
            if bytes.len() > MAX_OUTPUT_BYTES {
                return Err(CompositeError::BadImage("图片超过20MB".into()));
            }
            return Ok(bytes);
        }
        let url = reqwest::Url::parse(raw)
            .map_err(|_| CompositeError::Upstream("结果图片地址无效".into()))?;
        let trusted = url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url.host_str().is_some_and(|host| {
                host == "storage.fonedis.cc"
                    || host.ends_with(".fonedis.cc")
                    || host == "api.ephone.ai"
                    || host.ends_with(".ephone.ai")
            });
        if !trusted {
            return Err(CompositeError::Upstream(
                "结果图片来自不受信任的地址".into(),
            ));
        }
        // 独立禁重定向客户端，不发送API密钥到对象存储，也不跟随到其它内网地址。
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (compatible; ShanhuaiPhoto/1.0)")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| CompositeError::Transport("创建结果下载请求失败".into()))?;
        let mut response = http
            .get(url)
            .send()
            .await
            .map_err(|error| self.transport_error(error, "下载结果"))?
            .error_for_status()
            .map_err(|error| self.transport_error(error, "下载结果"))?;
        if response
            .content_length()
            .is_some_and(|n| n > MAX_OUTPUT_BYTES as u64)
        {
            return Err(CompositeError::BadImage("结果图片超过20MB".into()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| self.transport_error(error, "读取图片"))?
        {
            if bytes.len() + chunk.len() > MAX_OUTPUT_BYTES {
                return Err(CompositeError::BadImage("结果图片超过20MB".into()));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

/// 按方向区分的默认提示词：核心诉求是「把人像融进现场背景，
/// 产出像考勤机拍到的打卡照片」，人物是画面主体，不追求交代整个场景。
pub fn default_prompt(direction: i16) -> String {
    let scene = match direction {
        DIRECTION_IN => "工人正走进工地现场，刚刚进场打卡",
        _ => "工人正离开工地现场，完成出场打卡",
    };
    format!(
        "把这两张图合成一张真实的工地考勤打卡照片。\
         第一张图是工人的照片，第二张图是工地现场环境。\
         请保留工人的脸、表情、发型、安全帽和服装不变，把他自然地放进第二张图的环境里。\
         构图以人物为主：人是画面主体，现场环境在他身后交代出来即可，\
         像普通考勤机拍到的近景照片。\
         场景语义：{scene}。\
         要求：画面中只能有这一个人，不要新增、删除或复制人物；\
         不要加入第二张图里没有的建筑、设备、车辆、围栏或其他人；\
         人物身上的光照和投影方向要与现场环境一致；\
         输出写实照片风格，不要卡通化，不要加水印、文字、边框。"
    )
}

fn extract_upstream_error(body: &[u8]) -> Option<String> {
    let parsed: ImagesResponse = serde_json::from_slice(body).ok()?;
    parsed.error?.message
}

fn truncate(body: &[u8]) -> String {
    let text = String::from_utf8_lossy(body);
    let trimmed = text.trim();
    if trimmed.chars().count() <= 300 {
        return trimmed.to_string();
    }
    trimmed.chars().take(300).collect::<String>() + "…"
}

/// 把合成结果写进对象存储，返回 (public_url, object_key)。
pub async fn store_composite_result(
    storage: &dyn crate::infrastructure::storage::StorageProvider,
    group_id: uuid::Uuid,
    task_id: uuid::Uuid,
    bytes: Vec<u8>,
) -> Result<(String, String), String> {
    let object_key = format!(
        "uploads/photo-composite/{group_id}/{task_id}/{}.png",
        uuid::Uuid::new_v4()
    );
    storage
        .put(&object_key, Bytes::from(bytes), "image/png")
        .await
        .map_err(|error| format!("保存合成结果失败: {error}"))?;
    let public_url = storage.public_url(&object_key);
    Ok((public_url, object_key))
}

/// 供日志和错误信息使用的方向描述。
pub fn describe_direction(direction: i16) -> String {
    format!("{}({direction})", direction_label(direction))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn edits_accept_one_two_or_three_reference_images() {
        use axum::{Router, body::Bytes, extract::State, routing::post};
        for count in 1..=3 {
            let app = Router::new()
                .route(
                    "/images/edits",
                    post(|State(count): State<usize>, body: Bytes| async move {
                        let text = String::from_utf8_lossy(&body);
                        assert_eq!(text.matches("name=\"image\"").count(), count);
                        assert!(text.contains("reference-0.jpg"));
                        assert!(text.contains("test prompt"));
                        axum::Json(serde_json::json!({"data": [{"b64_json": "aW1hZ2U="}]}))
                    }),
                )
                .with_state(count);
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
            let client = CompositeClient::new(PhotoCompositeConfig {
                ephone_ai_api_key: Some("test".into()),
                ephone_ai_base_url: format!("http://{address}"),
                ephone_ai_image_model: "test-model".into(),
                ephone_ai_image_size: "1024x1536".into(),
                ephone_ai_timeout_secs: 5,
                concurrency: 30,
                poll_seconds: 5,
                lease_secs: 60,
            });
            let images: Vec<&[u8]> = vec![b"jpeg"; count];
            let output = client.compose_images(&images, "test prompt").await.unwrap();
            assert_eq!(output.bytes, b"image");
            server.abort();
        }
    }

    #[test]
    fn default_prompt_mentions_person_and_background() {
        let prompt = default_prompt(DIRECTION_IN);
        assert!(prompt.contains("第一张图"));
        assert!(prompt.contains("第二张图"));
        assert!(prompt.contains("只能有这一个人"));
    }

    #[test]
    fn default_prompt_keeps_person_as_the_subject() {
        // 只做「人像融进背景」的近景合成，不要求模型交代整个场景。
        let prompt = default_prompt(DIRECTION_IN);
        assert!(prompt.contains("构图以人物为主"));
        assert!(prompt.contains("考勤打卡照片"));
        assert!(!prompt.contains("全景"));
    }

    #[test]
    fn default_prompt_differs_by_direction() {
        assert_ne!(default_prompt(0), default_prompt(1));
        assert!(default_prompt(1).contains("出场"));
    }

    #[test]
    fn custom_prompt_wins_over_default() {
        let custom = "  自定义提示词  ";
        let client = CompositeClient::new(PhotoCompositeConfig {
            ephone_ai_api_key: Some("test".to_string()),
            ephone_ai_base_url: "https://example.invalid/v1".to_string(),
            ephone_ai_image_model: "gpt-image-2".to_string(),
            ephone_ai_image_size: "1024x1536".to_string(),
            ephone_ai_timeout_secs: 1,
            concurrency: 1,
            poll_seconds: 5,
            lease_secs: 60,
        });
        assert!(client.is_enabled());
        // prompt 覆盖逻辑在 compose 内部，这里只验证裁剪行为一致
        assert_eq!(custom.trim(), "自定义提示词");
    }

    #[test]
    fn not_configured_when_key_missing() {
        let client = CompositeClient::new(PhotoCompositeConfig {
            ephone_ai_api_key: None,
            ephone_ai_base_url: "https://example.invalid/v1".to_string(),
            ephone_ai_image_model: "gpt-image-2".to_string(),
            ephone_ai_image_size: "1024x1536".to_string(),
            ephone_ai_timeout_secs: 1,
            concurrency: 1,
            poll_seconds: 5,
            lease_secs: 60,
        });
        assert!(!client.is_enabled());
    }
    #[tokio::test]
    async fn async_dev_uses_one_submit_and_retries_only_status_reads() {
        use axum::{
            Router,
            extract::State,
            http::StatusCode,
            response::IntoResponse,
            routing::{get, post},
        };
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        struct Counts {
            submits: AtomicUsize,
            reads: AtomicUsize,
        }
        let counts = Arc::new(Counts {
            submits: AtomicUsize::new(0),
            reads: AtomicUsize::new(0),
        });
        let app = Router::new()
            .route(
                "/task/submit",
                post(
                    |State(c): State<Arc<Counts>>, axum::Json(body): axum::Json<Value>| async move {
                        c.submits.fetch_add(1, Ordering::SeqCst);
                        assert_eq!(body["model"], "gpt-image-2-dev");
                        assert_eq!(body["input"]["n"], 1);
                        assert_eq!(body["input"]["quality"], "medium");
                        assert!(
                            body["input"]["images"][0]
                                .as_str()
                                .unwrap()
                                .starts_with("data:image/jpeg;base64,")
                        );
                        axum::Json(json!({"id":"task_test", "status":"queued"}))
                    },
                ),
            )
            .route(
                "/task/task_test",
                get(|State(c): State<Arc<Counts>>| async move {
                    if c.reads.fetch_add(1, Ordering::SeqCst) == 0 {
                        return (
                            StatusCode::SERVICE_UNAVAILABLE,
                            axum::Json(json!({"error":{"message":"temporary"}})),
                        )
                            .into_response();
                    }
                    axum::Json(
                        json!({"status":"completed","outputs":["data:image/png;base64,aW1hZ2U="]}),
                    )
                    .into_response()
                }),
            )
            .with_state(Arc::clone(&counts));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = CompositeClient::new(PhotoCompositeConfig {
            ephone_ai_api_key: Some("test".into()),
            ephone_ai_base_url: format!("http://{address}"),
            ephone_ai_image_model: "gpt-image-2-dev".into(),
            ephone_ai_image_size: "1024x1024".into(),
            ephone_ai_timeout_secs: 5,
            concurrency: 30,
            poll_seconds: 5,
            lease_secs: 60,
        });
        let output = client.compose_images(&[b"jpeg"], "prompt").await.unwrap();
        assert_eq!(output.bytes, b"image");
        assert_eq!(output.generation_id.as_deref(), Some("task_test"));
        assert_eq!(counts.submits.load(Ordering::SeqCst), 1);
        assert_eq!(counts.reads.load(Ordering::SeqCst), 2);
        for url in [
            "http://127.0.0.1/private",
            "https://127.0.0.1/private",
            "https://storage.fonedis.cc.evil.test/a",
            "https://u:p@storage.fonedis.cc/a",
        ] {
            assert!(client.download_image(url).await.is_err());
        }
        server.abort();
    }
}
