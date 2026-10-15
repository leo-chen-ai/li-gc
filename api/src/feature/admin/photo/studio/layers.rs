//! 一批只准备两个场景；人物在单色底上生成，背景像素由程序合成，不交给每套模型重画。
use super::*;
use image::{DynamicImage, Rgb, RgbImage};

pub(super) async fn prepare(
    client: &CompositeClient,
    entry: &[u8],
    exit: &[u8],
) -> Result<GenerateResponse, String> {
    async fn scene(
        client: &CompositeClient,
        source: &[u8],
        direction: &str,
    ) -> Result<Vec<u8>, String> {
        let prompt = format!(
            "这是项目真实{direction}考勤原图。本次只准备空背景，不生成人像：完整移除画面中的全部人员、脸、头发、衣服、帽子及其影子，保留原图已见的墙面、门窗、物品、颜色和相机视角。被人遮挡区域只延续周围可见背景的材质和颜色，不新增门窗、标语、设备、文字、物品或其他场景。原图是近景就保持近景，不向四周扩图。最终画面必须没有任何人、脸、人体、衣服、帽子或人形轮廓，仅保留该方向的空环境。普通低清摄像头画质。"
        );
        let output = client
            .compose_images(&[source], &prompt)
            .await
            .map_err(|e| e.to_string())?;
        shrink_output(output.bytes).await
    }
    let (entry, exit) =
        tokio::try_join!(scene(client, entry, "进场"), scene(client, exit, "出场"))?;
    let in_image = image_uri(&entry);
    Ok(GenerateResponse {
        image: in_image.clone(),
        in_image,
        out_image: Some(image_uri(&exit)),
        out_error: None,
        entry_layer: None,
        pipeline: Some(STUDIO_PIPELINE),
    })
}

const SCREEN: &str = "背景必须是均匀纯色绿幕RGB(0,255,0)，从头顶到身体外侧的所有非人物区域都只能是这一种纯绿色，没有场景、墙、门、窗、渐变、文字、物品、阴影、反射或摄影棚设备。这是供程序提取人物的单色背景，绝对不要使用参考照片里的背景。人物完整位于画面中央，头顶留空间，胸口以上近景；双手自然放低留在画外，不操作设备、不摆手势。五官自然真实，双眼始终看镜头。保留原人物五官、年龄、眼镜、发型、肤色；眼镜的有无、形状、颜色不得改变，不能添加或摘掉眼镜。原人像没有安全帽时不得添加帽子、帽檐、帽绳、下巴带；不能复制衣服参考人物的帽子。人物衣服不要使用亮绿色，墨绿或橄榄绿必须是低亮度深色，避免与绿幕相同。";

fn entry_prompt(body: &GenerateRequest) -> String {
    let mut prompt = String::from(
        "第一张是目标人物唯一身份依据。保留同一个人，不美颜。第二张（如有）只参考完整衣服的款式、版型、布料、自然褶皱与使用感；不复制第二人的脸、眼镜、帽子、发型、体型、背景或其他穿戴。",
    );
    if body.change_clothes {
        let color = [
            "藏蓝",
            "灰色",
            "卡其",
            "深墨绿",
            "棕色",
            "黑色",
            "浅蓝",
            "米白",
            "深红",
            "深橄榄绿",
        ][body.variant % 10];
        prompt.push_str(&format!("按第二张原图的同类衣服换装，颜色适当改成{color}，小改接缝并去掉标识，按{}季节只调整必要厚薄。保留普通劳动衣服自然的洗旧、松垮和褶皱，不做新制服或广告服装，不额外增加反光背心、安全帽或装备。",body.season));
    } else {
        prompt.push_str("保持第一张人像的全部衣服和穿戴。");
    }
    if body.change_pose {
        prompt.push_str("这是进场帧，严格按以下绝对角度呈现，身体基本正对镜头：");
        prompt.push_str(ENTRY_POSES[body.variant % ENTRY_POSES.len()]);
    } else {
        prompt.push_str("保持原人像姿态。");
    }
    prompt.push_str(SCREEN);
    prompt
}
fn exit_prompt(body: &GenerateRequest) -> String {
    let mut prompt = String::from(
        "只有一张参考图：这是本套已经生成的进场人物。保留这个人的所有身份特征、眼镜、头发和同一套衣服，款式、颜色、领口、袖子、口袋、图案、接缝、磨损与层次必须完全一致，绝对不能换衣服或换颜色。无帽就保持无帽，无帽绳就保持无帽绳；眼镜必须原样保留，不增减任何穿戴。",
    );
    if body.change_pose {
        prompt.push_str("首要编辑任务是重新转头：这是另一时刻的出场帧，头部必须转到下面指定的不同角度，左右朝向应与进场帧相反，形成自然可见的角度差。保留同一个人不是保留相同脸部角度，必须重新绘制脸颊与耳朵的可见比例、鼻尖朝向及下巴角度；不是只改变光线、背景、清晰度或移动整个人物。脸可轻转，但双眼要回看镜头，不能看向画外。目标姿态：");
        prompt.push_str(EXIT_POSES[body.variant % EXIT_POSES.len()]);
    } else {
        prompt.push_str("保持同样的头部和人物姿态。");
    }
    prompt.push_str(SCREEN);
    prompt
}

// 这是近重复检查，不是头部姿态识别。只比较绿幕人物的上半部，背景与下方衣服不参与；
// 消除整体亮度差，避免模型仅改变曝光就把复制帧当作新动作。
fn head_difference(entry: &[u8], exit: &[u8]) -> Result<f32, String> {
    fn head(bytes: &[u8]) -> Result<[(f32, bool); 96 * 56], String> {
        let image = image::load_from_memory(bytes)
            .map_err(|_| "人物图层格式错误")?
            .resize_exact(96, 96, image::imageops::FilterType::Triangle)
            .to_rgb8();
        let mut result = [(0.0, false); 96 * 56];
        for (index, value) in result.iter_mut().enumerate() {
            let p = image.get_pixel((index % 96) as u32, (index / 96) as u32);
            *value = (
                0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32,
                foreground_alpha(p[0], p[1], p[2]) > 0.95,
            );
        }
        Ok(result)
    }
    let (a, b) = (head(entry)?, head(exit)?);
    let mean = |head: &[(f32, bool)]| {
        let (sum, n) = head
            .iter()
            .filter(|(_, mask)| *mask)
            .fold((0.0, 0usize), |(sum, n), (v, _)| (sum + v, n + 1));
        sum / n.max(1) as f32
    };
    let (a_mean, b_mean) = (mean(&a), mean(&b));
    let (mut sum, mut count) = (0.0, 0usize);
    for ((a, a_mask), (b, b_mask)) in a.into_iter().zip(b) {
        if a_mask || b_mask {
            sum += if a_mask != b_mask {
                80.0
            } else {
                ((a - a_mean) - (b - b_mean)).abs()
            };
            count += 1;
        }
    }
    if count < 100 {
        return Err("人物头部区域不足，请重试出场".into());
    }
    Ok(sum / count as f32)
}
const MIN_HEAD_DIFFERENCE: f32 = 8.0;

async fn generate_exit(
    client: &CompositeClient,
    body: &GenerateRequest,
    entry_layer: &[u8],
    exit_bg: &[u8],
) -> Result<Vec<u8>, String> {
    let base_prompt = exit_prompt(body);
    for attempt in 0..=usize::from(body.change_pose) {
        let prompt = if attempt == 0 {
            base_prompt.clone()
        } else {
            format!(
                "{base_prompt} 上次结果与进场人物头部几乎重复。本次必须重新绘制头部到指定的相反朝向，让鼻尖朝向、两侧脸颊可见比例、下巴和眉眼口型都有可见自然变化；不能靠平移、缩放、曝光变化或重画衣服代替转头。继续保留身份、原眼镜和全部衣服，双眼回看镜头，双手留在画外。"
            )
        };
        let output = client
            .compose_images(&[entry_layer], &prompt)
            .await
            .map_err(|e| e.to_string())?;
        // 先确认图层可分离，错误绿幕不应触发付费的动作重试。
        let image = finish(output.bytes.clone(), exit_bg.to_vec()).await?;
        if !body.change_pose {
            return Ok(image);
        }
        let difference = head_difference(entry_layer, &output.bytes)?;
        tracing::info!(
            variant = body.variant,
            attempt,
            head_difference = difference,
            "进出场人物头部近重复检查"
        );
        if difference >= MIN_HEAD_DIFFERENCE {
            return Ok(image);
        }
    }
    Err("出场头部与进场过于相似，已尝试调整一次；进场已保留，请重试出场".into())
}

/// 绿幕作为明确的分离色；不接受任意重绘背景混进最终输出。
fn foreground_alpha(r: u8, g: u8, b: u8) -> f32 {
    let excess = g as f32 - (r.max(b) as f32);
    if g < 100 || excess < 25.0 {
        return 1.0;
    }
    (1.0 - (excess - 25.0) / 60.0).clamp(0.0, 1.0)
}
fn combine(layer: &[u8], background: &[u8]) -> Result<DynamicImage, String> {
    let fg = image::load_from_memory(layer)
        .map_err(|_| "人物图层格式错误")?
        .resize_to_fill(480, 480, image::imageops::FilterType::Triangle)
        .to_rgb8();
    let bg = image::load_from_memory(background)
        .map_err(|_| "固定背景格式错误")?
        .resize_to_fill(480, 480, image::imageops::FilterType::Triangle)
        .to_rgb8();
    let keys = fg
        .pixels()
        .filter(|p| foreground_alpha(p[0], p[1], p[2]) < 0.05)
        .count();
    if keys < 480 * 480 / 20 || keys > 480 * 480 * 95 / 100 {
        return Err("模型未返回可分离的人物图层，请重试本套；未使用错误背景".into());
    }
    let mut result = RgbImage::new(480, 480);
    for (x, y, pixel) in result.enumerate_pixels_mut() {
        let front = fg.get_pixel(x, y);
        let back = bg.get_pixel(x, y);
        let alpha = foreground_alpha(front[0], front[1], front[2]);
        let mut rgb = [0; 3];
        for c in 0..3 {
            rgb[c] = (front[c] as f32 * alpha + back[c] as f32 * (1.0 - alpha)).round() as u8;
        }
        // 去掉轮廓上的绿幕溢色，衣服的深墨绿不参与抠除。
        if alpha > 0.0 && alpha < 1.0 {
            rgb[1] = rgb[1].min(rgb[0].max(rgb[2]).saturating_add(12));
        }
        *pixel = Rgb(rgb);
    }
    Ok(DynamicImage::ImageRgb8(result))
}
async fn finish(layer: Vec<u8>, background: Vec<u8>) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        let image = combine(&layer, &background)?;
        let mut encoded = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, 85)
            .encode_image(&image)
            .map_err(|_| "合成人物失败")?;
        attendance_jpeg(&encoded)
    })
    .await
    .map_err(|_| "人物合成任务失败".to_string())?
}

pub(super) async fn generate(
    client: &CompositeClient,
    body: &GenerateRequest,
    refs: &[Vec<u8>],
    entry_bg: &[u8],
    exit_bg: &[u8],
) -> Result<GenerateResponse, String> {
    let layer = if body.entry_image.is_some() {
        decode_entry_image(
            body.entry_layer
                .as_deref()
                .ok_or("重试出场缺少本套人物图层，请重新生成本套")?,
        )?
    } else {
        let refs: Vec<&[u8]> = refs.iter().map(Vec::as_slice).collect();
        let result = client
            .compose_images(&refs, &entry_prompt(body))
            .await
            .map_err(|e| e.to_string())?;
        // 小图层用于出场和断线重试；画质与最终考勤图相同。
        shrink_output(result.bytes).await?
    };
    let entry = finish(layer.clone(), entry_bg.to_vec()).await?;
    // 出场模型仅看到本套进场人物，完全不接触其他人员或背景的图片。
    let exit = generate_exit(client, body, &layer, exit_bg).await;
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
        entry_layer: Some(image_uri(&layer)),
        pipeline: Some(STUDIO_PIPELINE),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;
    fn png(image: RgbImage) -> Vec<u8> {
        let mut c = std::io::Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut c, image::ImageFormat::Png)
            .unwrap();
        c.into_inner()
    }
    fn head_layer(offset: i32, brightness: u8, lower_color: u8) -> Vec<u8> {
        png(RgbImage::from_fn(480, 480, |x, y| {
            let head = (180 + offset..300 + offset).contains(&(x as i32)) && (30..225).contains(&y);
            if head {
                let detail = ((x / 12 + y / 12) % 3 * 25) as u8;
                Rgb([
                    90 + detail + brightness,
                    80 + detail + brightness,
                    70 + detail + brightness,
                ])
            } else if (140..340).contains(&x) && y >= 290 {
                Rgb([lower_color; 3])
            } else {
                Rgb([0, 255, 0])
            }
        }))
    }
    #[tokio::test]
    #[ignore = "Paid live pose-pair verification; explicit opt-in only"]
    async fn live_ephone_pose_pairs() {
        dotenvy::from_path(".env").ok();
        let client = CompositeClient::new(crate::infrastructure::config::PhotoCompositeConfig {
            ephone_ai_api_key: Some(std::env::var("EPHONE_AI_API_KEY").unwrap()),
            ephone_ai_base_url: std::env::var("PHOTO_REAL_BASE_URL").unwrap(),
            ephone_ai_image_model: "gemini-3.1-flash-lite-image".into(),
            ephone_ai_image_size: "1024x1024".into(),
            ephone_ai_timeout_secs: 240,
            concurrency: 30,
            poll_seconds: 5,
            lease_secs: 60,
        });
        let person = std::fs::read("/tmp/shanhuai-fixed-scenes-person.jpg").unwrap();
        let entry_bg = std::fs::read("/tmp/shanhuai-fixed-bg-in.jpg").unwrap();
        let exit_bg = std::fs::read("/tmp/shanhuai-fixed-bg-out.jpg").unwrap();
        let mut tasks = vec![];
        let variants: Vec<usize> = std::env::var("PHOTO_POSE_VARIANTS")
            .unwrap_or("1,3,4".into())
            .split(',')
            .map(|v| v.parse().unwrap())
            .collect();
        let expected = variants.len();
        for variant in variants {
            let (client, person, a, b) = (
                client.clone(),
                person.clone(),
                entry_bg.clone(),
                exit_bg.clone(),
            );
            tasks.push(tokio::spawn(async move {
                let mut req = super::super::tests::request();
                req.variant = variant;
                req.count = 6;
                let outfit = std::fs::read(format!(
                    "/tmp/shanhuai-fixed-scenes-ref/{}-entry.jpg",
                    variant + 1
                ))
                .unwrap();
                let pair = generate(&client, &req, &[person, outfit], &a, &b)
                    .await
                    .unwrap();
                std::fs::write(
                    format!("/tmp/shanhuai-pose-{variant}-entry.jpg"),
                    decode_entry_image(&pair.in_image).unwrap(),
                )
                .unwrap();
                if let Some(output) = pair.out_image {
                    std::fs::write(
                        format!("/tmp/shanhuai-pose-{variant}-exit.jpg"),
                        decode_entry_image(&output).unwrap(),
                    )
                    .unwrap();
                    println!("pose pair {variant}: both generated");
                    true
                } else {
                    println!("pose pair {variant}: {:?}", pair.out_error);
                    false
                }
            }));
        }
        let mut completed = 0;
        for task in tasks {
            if task.await.unwrap() {
                completed += 1;
            }
        }
        assert_eq!(completed, expected);
    }

    #[test]
    fn near_duplicate_check_ignores_background_lower_clothes_and_exposure() {
        let entry = head_layer(0, 0, 30);
        assert!(head_difference(&entry, &entry).unwrap() < MIN_HEAD_DIFFERENCE);
        let exposure = head_layer(0, 20, 180);
        assert!(
            head_difference(&entry, &exposure).unwrap() < MIN_HEAD_DIFFERENCE,
            "只改曝光或下方衣服不能冒充动作变化"
        );
        let jpeg = attendance_jpeg(&entry).unwrap();
        assert!(
            head_difference(&entry, &jpeg).unwrap() < MIN_HEAD_DIFFERENCE,
            "JPEG压缩差异不能冒充动作变化"
        );
        let moved = head_layer(35, 0, 30);
        assert!(head_difference(&entry, &moved).unwrap() >= MIN_HEAD_DIFFERENCE);
    }
    #[tokio::test]
    async fn duplicate_exit_has_one_bounded_retry_and_keeps_entry_as_only_reference() {
        use axum::{Router, body::Bytes, extract::State, routing::post};
        use std::sync::{Arc, Mutex};
        struct Mock {
            calls: Mutex<Vec<Vec<u8>>>,
            images: Vec<String>,
        }
        async fn run(
            different_on_retry: bool,
            change_pose: bool,
        ) -> (Result<Vec<u8>, String>, usize) {
            let entry = head_layer(0, 0, 30);
            let moved = head_layer(35, 0, 30);
            let mock = Arc::new(Mock {
                calls: Mutex::new(vec![]),
                images: vec![
                    general_purpose::STANDARD.encode(&entry),
                    general_purpose::STANDARD.encode(if different_on_retry {
                        &moved
                    } else {
                        &entry
                    }),
                ],
            });
            let app = Router::new()
                .route(
                    "/images/edits",
                    post(|State(mock): State<Arc<Mock>>, body: Bytes| async move {
                        let index = {
                            let mut calls = mock.calls.lock().unwrap();
                            calls.push(body.to_vec());
                            calls.len() - 1
                        };
                        axum::Json(
                            serde_json::json!({"data":[{"b64_json":mock.images[index.min(1)]}]}),
                        )
                    }),
                )
                .with_state(mock.clone());
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
            let client =
                CompositeClient::new(crate::infrastructure::config::PhotoCompositeConfig {
                    ephone_ai_api_key: Some("test".into()),
                    ephone_ai_base_url: format!("http://{addr}"),
                    ephone_ai_image_model: "test".into(),
                    ephone_ai_image_size: "1024x1024".into(),
                    ephone_ai_timeout_secs: 5,
                    concurrency: 30,
                    poll_seconds: 5,
                    lease_secs: 60,
                });
            let mut req = super::super::tests::request();
            req.change_pose = change_pose;
            let bg = png(RgbImage::from_pixel(480, 480, Rgb([120, 130, 140])));
            let result = generate_exit(&client, &req, &entry, &bg).await;
            let calls = mock.calls.lock().unwrap();
            for call in calls.iter() {
                assert_eq!(
                    String::from_utf8_lossy(call)
                        .matches("name=\"image\"")
                        .count(),
                    1
                );
                assert!(call.windows(entry.len()).any(|bytes| bytes == entry));
                assert!(!call.windows(bg.len()).any(|bytes| bytes == bg));
            }
            if calls.len() == 2 {
                assert!(String::from_utf8_lossy(&calls[1]).contains("上次结果"));
            }
            server.abort();
            (result, calls.len())
        }
        let (failed, calls) = run(false, true).await;
        assert!(failed.unwrap_err().contains("过于相似"));
        assert_eq!(calls, 2);
        let (success, calls) = run(true, true).await;
        assert!(success.is_ok());
        assert_eq!(calls, 2);
        let (unchanged, calls) = run(false, false).await;
        assert!(unchanged.is_ok());
        assert_eq!(calls, 1, "不勾换动作时不能自动重试");
    }

    #[tokio::test]
    async fn failed_exit_retry_keeps_entry_layer_and_sends_no_background_to_model() {
        use axum::{
            Router, body::Bytes, extract::State, http::StatusCode, response::IntoResponse,
            routing::post,
        };
        use std::sync::{Arc, Mutex};
        struct Mock {
            calls: Mutex<Vec<Vec<u8>>>,
            image: String,
        }
        let green = png(RgbImage::from_fn(480, 480, |x, y| {
            if (150..330).contains(&x) && (80..480).contains(&y) {
                Rgb([30, 40, 70])
            } else {
                Rgb([0, 255, 0])
            }
        }));
        let mock = Arc::new(Mock {
            calls: Mutex::new(vec![]),
            image: general_purpose::STANDARD.encode(green),
        });
        let app = Router::new()
            .route(
                "/images/edits",
                post(|State(mock): State<Arc<Mock>>, body: Bytes| async move {
                    let count = {
                        let mut calls = mock.calls.lock().unwrap();
                        calls.push(body.to_vec());
                        calls.len()
                    };
                    if count == 2 {
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
            .with_state(mock.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = CompositeClient::new(crate::infrastructure::config::PhotoCompositeConfig {
            ephone_ai_api_key: Some("test".into()),
            ephone_ai_base_url: format!("http://{addr}"),
            ephone_ai_image_model: "test".into(),
            ephone_ai_image_size: "1024x1024".into(),
            ephone_ai_timeout_secs: 5,
            concurrency: 30,
            poll_seconds: 5,
            lease_secs: 60,
        });
        let bg = png(RgbImage::from_pixel(480, 480, Rgb([120, 130, 140])));
        let mut req = super::super::tests::request();
        req.change_pose = false;
        let refs = vec![b"person-identity".to_vec(), b"real-outfit".to_vec()];
        let first = generate(&client, &req, &refs, &bg, &bg).await.unwrap();
        assert!(first.out_image.is_none());
        assert!(first.entry_layer.is_some());
        req.entry_image = Some(first.in_image.clone());
        req.entry_layer = first.entry_layer.clone();
        let retried = generate(&client, &req, &refs, &bg, &bg).await.unwrap();
        assert!(retried.out_image.is_some());
        assert_eq!(retried.in_image, first.in_image);
        let calls = mock.calls.lock().unwrap();
        assert_eq!(calls.len(), 3);
        for call in &calls[1..] {
            assert_eq!(
                String::from_utf8_lossy(call)
                    .matches("name=\"image\"")
                    .count(),
                1
            );
            assert!(!String::from_utf8_lossy(call).contains("real-outfit"));
            let layer = decode_entry_image(first.entry_layer.as_deref().unwrap()).unwrap();
            assert!(call.windows(layer.len()).any(|b| b == layer));
            assert!(!call.windows(bg.len()).any(|b| b == bg));
        }
        server.abort();
    }

    #[test]
    fn two_fixed_backgrounds_do_not_depend_on_outfit_or_pose() {
        let green = png(RgbImage::from_fn(480, 480, |x, y| {
            if (150..330).contains(&x) && (80..480).contains(&y) {
                Rgb([30, 40, 70])
            } else {
                Rgb([0, 255, 0])
            }
        }));
        let bg_in = png(RgbImage::from_pixel(480, 480, Rgb([120, 130, 140])));
        let bg_out = png(RgbImage::from_pixel(480, 480, Rgb([70, 80, 90])));
        let a = combine(&green, &bg_in).unwrap();
        let b = combine(&green, &bg_out).unwrap();
        assert_eq!(a.get_pixel(1, 1).0[..3], [120, 130, 140]);
        assert_eq!(b.get_pixel(1, 1).0[..3], [70, 80, 90]);
        assert_eq!(a.get_pixel(200, 200), b.get_pixel(200, 200));
        assert_eq!(a.get_pixel(200, 200).0[..3], [30, 40, 70]);
        assert_eq!(foreground_alpha(20, 70, 40), 1.0, "深色绿衣服应保留");
        let wrong = png(RgbImage::from_pixel(480, 480, Rgb([240, 240, 240])));
        assert!(
            combine(&wrong, &bg_in).is_err(),
            "模型未分离人物时不能把错误背景作为成功结果"
        );
    }
}
