use async_trait::async_trait;
use bytes::Bytes;
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use crate::infrastructure::config::UploadConfig;

use super::provider::{StorageError, StorageProvider};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct JdCloudOssStorage {
    access_key_id: String,
    access_key_secret: String,
    bucket: String,
    endpoint: String,
    region: String,
    public_base_url: String,
}

impl JdCloudOssStorage {
    pub fn from_config(config: &UploadConfig) -> eyre::Result<Self> {
        Ok(Self {
            access_key_id: required("JD_OSS_ACCESS_KEY_ID", &config.jd_oss_access_key_id)?,
            access_key_secret: required(
                "JD_OSS_ACCESS_KEY_SECRET",
                &config.jd_oss_access_key_secret,
            )?,
            bucket: required("JD_OSS_BUCKET", &config.jd_oss_bucket)?,
            endpoint: required("JD_OSS_ENDPOINT", &config.jd_oss_endpoint)?,
            region: config.jd_oss_region.clone(),
            public_base_url: required("JD_OSS_PUBLIC_BASE_URL", &config.jd_oss_public_base_url)?,
        })
    }

    fn endpoint_host(&self) -> String {
        self.endpoint
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string()
    }

    fn object_host(&self) -> String {
        format!("{}.{}", self.bucket, self.endpoint_host())
    }

    fn object_url(&self, key: &str) -> String {
        format!("https://{}/{}", self.object_host(), encode_key(key))
    }
}

#[async_trait]
impl StorageProvider for JdCloudOssStorage {
    async fn put(&self, key: &str, data: Bytes, content_type: &str) -> Result<(), StorageError> {
        let client = self.clone();
        let key = key.to_string();
        let content_type = content_type.to_string();

        tokio::task::spawn_blocking(move || client.put_blocking(&key, data, &content_type))
            .await
            .map_err(|e| StorageError::Other(format!("OSS upload task failed: {e}")))?
    }

    async fn get(&self, key: &str) -> Result<Bytes, StorageError> {
        let url = self.public_url(key);
        tokio::task::spawn_blocking(move || {
            let response = ureq::get(&url)
                .call()
                .map_err(|e| StorageError::Other(format!("OSS read failed: {e}")))?;
            if !response.status().is_success() {
                return Err(StorageError::Other(format!(
                    "OSS read failed with status {}",
                    response.status()
                )));
            }
            let mut reader = response.into_body().into_reader();
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut reader, &mut bytes)?;
            Ok(Bytes::from(bytes))
        })
        .await
        .map_err(|e| StorageError::Other(format!("OSS read task failed: {e}")))?
    }

    async fn delete(&self, _key: &str) -> Result<(), StorageError> {
        // Public-read business files are retained for auditability. Soft delete is handled in DB.
        Ok(())
    }

    fn public_url(&self, key: &str) -> String {
        let base = self.public_base_url.trim_end_matches('/');
        format!("{base}/{}", encode_key(key))
    }

    fn driver(&self) -> &str {
        "jdcloud_oss"
    }

    fn bucket(&self) -> Option<&str> {
        Some(&self.bucket)
    }

    fn endpoint(&self) -> Option<&str> {
        Some(&self.endpoint)
    }

    fn public_base_url(&self) -> &str {
        &self.public_base_url
    }
}

impl JdCloudOssStorage {
    fn put_blocking(&self, key: &str, data: Bytes, content_type: &str) -> Result<(), StorageError> {
        let payload_hash = hex::encode(Sha256::digest(&data));
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();
        let host = self.object_host();
        let canonical_uri = format!("/{}", encode_key(key));

        let canonical_headers = format!(
            "content-type:{content_type}\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
        );
        let signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date";
        let canonical_request = format!(
            "PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
        );
        let canonical_request_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
        let credential_scope = format!("{date_stamp}/{}/s3/aws4_request", self.region);
        let string_to_sign =
            format!("AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{canonical_request_hash}");
        let signing_key = signing_key(&self.access_key_secret, &date_stamp, &self.region);
        let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));
        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}",
            self.access_key_id
        );

        let response = ureq::put(self.object_url(key))
            .header("content-type", content_type)
            .header("host", &host)
            .header("x-amz-content-sha256", &payload_hash)
            .header("x-amz-date", &amz_date)
            .header("authorization", &authorization)
            .send(data.to_vec())
            .map_err(|e| StorageError::Other(format!("OSS upload failed: {e}")))?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(StorageError::Other(format!(
                "OSS upload failed with status {}",
                response.status()
            )))
        }
    }
}

fn required(name: &str, value: &Option<String>) -> eyre::Result<String> {
    value
        .as_ref()
        .filter(|v| !v.trim().is_empty())
        .cloned()
        .ok_or_else(|| eyre::eyre!("{name} is required when STORAGE_DRIVER=jdcloud_oss"))
}

fn signing_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    hmac_sha256(&k_service, b"aws4_request")
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

fn encode_key(key: &str) -> String {
    key.split('/')
        .map(encode_segment)
        .collect::<Vec<_>>()
        .join("/")
}

fn encode_segment(segment: &str) -> String {
    let mut encoded = String::new();
    for byte in segment.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}
