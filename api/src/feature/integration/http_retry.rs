use std::{error::Error as _, time::Duration};

use reqwest::{RequestBuilder, StatusCode};
use tokio::time::sleep;

pub(super) const MAX_NETWORK_RETRIES: usize = 3;

pub(super) struct BufferedResponse {
    pub status: StatusCode,
    pub body: Vec<u8>,
}

#[derive(Debug)]
pub(super) enum BufferedRequestError {
    Network(reqwest::Error),
    ResponseTooLarge,
}

/// Send and fully buffer an HTTP response, retrying only transport failures.
///
/// `MAX_NETWORK_RETRIES` means three retries after the initial attempt. HTTP
/// responses, including 4xx and 5xx, are returned immediately and are never
/// retried here because their business-level retry safety is platform-specific.
pub(super) async fn send_buffered_with_network_retry(
    request: RequestBuilder,
    max_response_bytes: usize,
) -> Result<BufferedResponse, BufferedRequestError> {
    let template = request.try_clone();
    let mut initial_request = Some(request);

    for retry_number in 0..=MAX_NETWORK_RETRIES {
        let request = if retry_number == 0 {
            initial_request
                .take()
                .expect("initial request is available")
        } else {
            template
                .as_ref()
                .and_then(RequestBuilder::try_clone)
                .expect("retryable request builder can be cloned")
        };

        match send_buffered_once(request, max_response_bytes).await {
            Ok(response) => return Ok(response),
            Err(BufferedRequestError::Network(error))
                if retry_number < MAX_NETWORK_RETRIES
                    && template.is_some()
                    && is_retryable_network_error(&error) =>
            {
                let delay = retry_delay(retry_number);
                tracing::warn!(
                    retry = retry_number + 1,
                    max_retries = MAX_NETWORK_RETRIES,
                    delay_ms = delay.as_millis(),
                    error = %error,
                    "platform HTTP transport failed; retrying"
                );
                sleep(delay).await;
            }
            Err(error) => return Err(error),
        }
    }

    unreachable!("network retry loop always returns")
}

async fn send_buffered_once(
    request: RequestBuilder,
    max_response_bytes: usize,
) -> Result<BufferedResponse, BufferedRequestError> {
    let mut response = request
        .send()
        .await
        .map_err(BufferedRequestError::Network)?;
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > max_response_bytes as u64)
    {
        return Err(BufferedRequestError::ResponseTooLarge);
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(BufferedRequestError::Network)?
    {
        if body.len().saturating_add(chunk.len()) > max_response_bytes {
            return Err(BufferedRequestError::ResponseTooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(BufferedResponse { status, body })
}

fn is_retryable_network_error(error: &reqwest::Error) -> bool {
    if error.is_timeout() || error.is_connect() || error.is_request() || error.is_body() {
        return true;
    }

    let mut source = error.source();
    while let Some(current) = source {
        if current.downcast_ref::<std::io::Error>().is_some() {
            return true;
        }
        source = current.source();
    }
    false
}

fn retry_delay(retry_number: usize) -> Duration {
    Duration::from_millis(250 * (1_u64 << retry_number.min(2)))
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    use super::*;

    #[tokio::test]
    async fn retries_three_transport_failures_then_returns_response() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let attempts = Arc::new(AtomicUsize::new(0));
        let server_attempts = Arc::clone(&attempts);
        let server = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let attempt = server_attempts.fetch_add(1, Ordering::SeqCst) + 1;
                let mut request = [0_u8; 1024];
                let _ = stream.read(&mut request).await;
                if attempt <= MAX_NETWORK_RETRIES {
                    drop(stream);
                    continue;
                }
                stream
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                    )
                    .await
                    .unwrap();
                break;
            }
        });

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let response = send_buffered_with_network_retry(
            client.post(format!("http://{address}/retry")).body("{}"),
            1024,
        )
        .await
        .unwrap();

        assert_eq!(response.status, StatusCode::OK);
        assert_eq!(response.body, b"{}");
        assert_eq!(attempts.load(Ordering::SeqCst), 4);
        server.await.unwrap();
    }

    #[tokio::test]
    async fn does_not_retry_http_error_responses() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let attempts = Arc::new(AtomicUsize::new(0));
        let server_attempts = Arc::clone(&attempts);
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            server_attempts.fetch_add(1, Ordering::SeqCst);
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request).await;
            stream
                .write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
                .await
                .unwrap();
        });

        let client = reqwest::Client::new();
        let response = send_buffered_with_network_retry(
            client.get(format!("http://{address}/no-retry")),
            1024,
        )
        .await
        .unwrap();

        assert_eq!(response.status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        server.await.unwrap();
    }
}
