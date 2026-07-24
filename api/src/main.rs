use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

use quax::{
    bootstrap,
    infrastructure::{config, env, logging, server},
    state::AppState,
};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    // 0. Initialize crypto provider for rustls
    quax::init_crypto();

    // 1. Load environment variables
    env::load();

    // 2. Set up error handling
    color_eyre::install()?;

    // 3. Load configuration (fail-fast validation)
    let config = config::Config::load()?;

    // 4. Set up logging
    let (subscriber, reload_handle) = logging::setup_subscriber();
    subscriber.init();
    info!(
        port = config.server.port,
        rust_env = %config.rust_env,
        "🚀 Application starting..."
    );

    // 5. Initialize application state
    let state = AppState::new(config.clone(), reload_handle).await?;
    info!("✅ Application state initialized");

    // 6. Bootstrap (create initial admin if needed)
    bootstrap::bootstrap(&state.db, &config).await?;

    // 7. Local report-forwarding development shares the K3s database but must
    // not consume unrelated production queues or subscribe to production MQTT.
    let background_workers_enabled = std::env::var("BACKGROUND_WORKERS_ENABLED")
        .map(|value| {
            !matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "off"
            )
        })
        .unwrap_or(true);
    if background_workers_enabled {
        // Attendance alert scheduler (daily 14:00 Asia/Shanghai).
        quax::feature::admin::attendance_alert::spawn_attendance_alert_scheduler(state.clone());
        // Attendance device MQTT consumers and integration outbox consumers.
        quax::feature::device_mqtt::worker::spawn_device_mqtt_worker(state.clone());
        quax::feature::device_mqtt::retry::spawn_device_issue_retry_worker(state.clone());
        quax::feature::integration::outbox_worker::spawn_integration_outbox_workers(state.clone());
    } else {
        info!("background workers disabled for this API process");
    }

    // 8. Start server (dual-stack, graceful shutdown)
    server::serve(state).await
}
