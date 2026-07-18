use std::time::Duration;

use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS};
use serde_json::Value;
use tokio::time::{Instant, timeout};
use uuid::Uuid;

const MQTT_MAX_PACKET_SIZE: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone)]
struct BrokerUrl {
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
}

pub fn build_mqtt_options(client_id: String, broker_url: &str) -> Result<MqttOptions, String> {
    let broker = parse_broker_url(broker_url)?;
    let mut options = MqttOptions::new(client_id, broker.host, broker.port);
    options.set_keep_alive(Duration::from_secs(30));
    options.set_max_packet_size(MQTT_MAX_PACKET_SIZE, MQTT_MAX_PACKET_SIZE);
    if let Some(username) = broker.username {
        options.set_credentials(username, broker.password.unwrap_or_default());
    }
    Ok(options)
}

pub async fn publish_json(broker_url: &str, topic: &str, payload: &Value) -> Result<(), String> {
    let client_id = format!(
        "shanhuai-api-mqtt-publisher-{}-{}",
        std::process::id(),
        Uuid::new_v4()
    );
    let options = build_mqtt_options(client_id, broker_url)?;
    let (client, mut event_loop) = AsyncClient::new(options, 10);
    let bytes = serde_json::to_vec(payload).map_err(|error| error.to_string())?;

    client
        .publish(topic, QoS::AtLeastOnce, false, bytes)
        .await
        .map_err(|error| error.to_string())?;

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("MQTT publish timeout".to_string());
        }

        match timeout(remaining, event_loop.poll()).await {
            Ok(Ok(Event::Incoming(Incoming::PubAck(_)))) => {
                let _ = client.disconnect().await;
                return Ok(());
            }
            Ok(Ok(_)) => {}
            Ok(Err(error)) => return Err(error.to_string()),
            Err(_) => return Err("MQTT publish timeout".to_string()),
        }
    }
}

fn parse_broker_url(raw: &str) -> Result<BrokerUrl, String> {
    let trimmed = raw.trim();
    let without_scheme = trimmed
        .strip_prefix("mqtt://")
        .or_else(|| trimmed.strip_prefix("tcp://"))
        .unwrap_or(trimmed);
    let (auth, host_port) = match without_scheme.rsplit_once('@') {
        Some((auth, host_port)) => (Some(auth), host_port),
        None => (None, without_scheme),
    };
    let (host, port) = match host_port.rsplit_once(':') {
        Some((host, port)) => {
            let port = port
                .parse::<u16>()
                .map_err(|_| format!("invalid MQTT broker port: {port}"))?;
            (host.to_string(), port)
        }
        None => (host_port.to_string(), 1883),
    };
    if host.is_empty() {
        return Err("MQTT broker host is empty".to_string());
    }

    let (username, password) = match auth.and_then(|value| value.split_once(':')) {
        Some((username, password)) if !username.is_empty() => {
            (Some(username.to_string()), Some(password.to_string()))
        }
        _ => (None, None),
    };

    Ok(BrokerUrl {
        host,
        port,
        username,
        password,
    })
}
