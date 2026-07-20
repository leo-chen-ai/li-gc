use std::io::Cursor;

use image::{
    DynamicImage, GenericImageView, ImageDecoder, ImageReader, codecs::jpeg::JpegEncoder,
    imageops::FilterType,
};

pub const WORKER_AVATAR_MAX_BYTES: usize = 20 * 1024;
pub const WORKER_ID_CARD_MAX_BYTES: usize = 50 * 1024;

pub async fn compress_to_jpeg_below_async(
    bytes: Vec<u8>,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || compress_to_jpeg_below(&bytes, max_bytes))
        .await
        .map_err(|error| format!("图片压缩任务异常：{error}"))?
}

/// Converts an uploaded image to JPEG and keeps shrinking it until its encoded
/// size is strictly below the platform limit.
pub fn compress_to_jpeg_below(bytes: &[u8], max_bytes: usize) -> Result<Vec<u8>, String> {
    if max_bytes == 0 {
        return Err("图片大小限制必须大于 0".to_string());
    }

    if bytes.len() < max_bytes && bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok(bytes.to_vec());
    }

    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("图片格式识别失败：{error}"))?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("图片解码失败：{error}"))?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut source =
        DynamicImage::from_decoder(decoder).map_err(|error| format!("图片解码失败：{error}"))?;
    source.apply_orientation(orientation);
    let (original_width, original_height) = source.dimensions();
    if original_width == 0 || original_height == 0 {
        return Err("图片尺寸无效".to_string());
    }

    let mut width = original_width;
    let mut height = original_height;
    let qualities = [88, 80, 72, 64, 56, 48, 40, 32, 24];

    loop {
        let resized = if width == original_width && height == original_height {
            source.clone()
        } else {
            source.resize_exact(width, height, FilterType::Triangle)
        };

        for quality in qualities {
            let encoded = encode_jpeg(&resized, quality)?;
            if encoded.len() < max_bytes {
                return Ok(encoded);
            }
        }

        if width <= 160 && height <= 160 {
            break;
        }
        width = ((width as f32 * 0.82).round() as u32).max(160);
        height = ((height as f32 * 0.82).round() as u32).max(160);
    }

    Err(format!("图片无法压缩到小于 {}KB", max_bytes / 1024))
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut output = Cursor::new(Vec::new());
    JpegEncoder::new_with_quality(&mut output, quality)
        .encode_image(image)
        .map_err(|error| format!("JPG 编码失败：{error}"))?;
    Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    #[test]
    fn compression_is_strictly_below_limit_and_outputs_jpeg() {
        let image = ImageBuffer::from_fn(1200, 900, |x, y| {
            Rgb([
                ((x * 17 + y * 7) % 256) as u8,
                ((x * 3 + y * 19) % 256) as u8,
                ((x * 11 + y * 13) % 256) as u8,
            ])
        });
        let mut png = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();

        let result = compress_to_jpeg_below(&png.into_inner(), WORKER_AVATAR_MAX_BYTES).unwrap();

        assert!(result.len() < WORKER_AVATAR_MAX_BYTES);
        assert!(result.starts_with(&[0xff, 0xd8, 0xff]));
    }
}
