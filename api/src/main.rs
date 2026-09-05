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
        // Homepage warnings: device offline and management-team attendance.
        quax::feature::admin::system_warning::spawn_system_warning_scheduler(state.clone());
        // Managed attendance scheduler (generate next month on the last day of each month).
        quax::feature::admin::managed_attendance_scheduler::spawn_managed_attendance_scheduler(
            state.clone(),
        );
        // Push due managed attendance records to the vendor B photo endpoint.
        quax::feature::admin::managed_attendance_dispatcher::spawn_managed_attendance_dispatcher(
            state.clone(),
        );
        // Attendance device MQTT consumers and integration outbox consumers.
        quax::feature::device_mqtt::worker::spawn_device_mqtt_worker(state.clone());
        quax::feature::device_mqtt::qianyi_worker::spawn_qianyi_mqtt_worker(state.clone());
        quax::feature::device_mqtt::retry::spawn_device_issue_retry_worker(state.clone());
        quax::feature::integration::outbox_worker::spawn_integration_outbox_workers(state.clone());
        quax::feature::integration::xinleda_job_worker::spawn_xinleda_job_workers(state.clone());
        quax::feature::integration::yongxin_job_worker::spawn_yongxin_job_workers(state.clone());
        // Face enrollment queue: push worker faces to the face-recognition service.
        quax::feature::face::spawn_face_enrollment_worker(state.clone());
    } else {
        info!("background workers disabled for this API process");
    }

    // 人脸入库队列与生产队列无关，本地联调考勤机模式时可单独开启：
    // FACE_ENROLLMENT_WORKER_ENABLED=true
    if !background_workers_enabled {
        let face_worker_enabled = std::env::var("FACE_ENROLLMENT_WORKER_ENABLED")
            .map(|value| {
                matches!(
                    value.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "on"
                )
            })
            .unwrap_or(false);
        if face_worker_enabled {
            info!("face enrollment worker enabled standalone (BACKGROUND_WORKERS_ENABLED=false)");
            quax::feature::face::spawn_face_enrollment_worker(state.clone());
        }
    }

    // 8. Start server (dual-stack, graceful shutdown)
    server::serve(state).await
}
