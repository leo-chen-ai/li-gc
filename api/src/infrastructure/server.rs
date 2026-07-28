use std::net::{IpAddr, Ipv6Addr, SocketAddr};

use axum::middleware::from_fn;
use tokio::net::TcpListener;
use tracing::info;

use crate::{
    infrastructure::web::{
        cors::build_cors_layer,
        middleware::{http_trace_middleware, request_id_middleware},
    },
    routes::app_routes,
    state::AppState,
};

/// Start the server: build app, bind listener, serve with graceful shutdown
pub async fn serve(state: AppState) -> eyre::Result<()> {
    let port = state.port();
    let cors = build_cors_layer(&state.config);

    // Build app — middleware applied bottom-up (last = outermost = runs first):
    // cors → request_id → http_trace → routes
    let app = app_routes(state)
        .layer(from_fn(http_trace_middleware))
        .layer(from_fn(request_id_middleware))
        .layer(cors);

    let listener = create_listener(port).await?;

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|e| eyre::eyre!("Server error: {}", e))?;

    info!("✅ Server shut down gracefully");
    Ok(())
}

/// Attempt dual-stack (IPv6+IPv4), fall back to IPv4-only
async fn create_listener(port: u16) -> eyre::Result<TcpListener> {
    let addr_v6 = SocketAddr::from((IpAddr::V6(Ipv6Addr::UNSPECIFIED), port));

    match bind_dual_stack(addr_v6) {
        Ok(listener) => {
            info!(
                address = %listener.local_addr()?,
                stack = "dual-stack (IPv4+IPv6)",
                "🌐 Server listening"
            );
            Ok(listener)
        }
        Err(e) => {
            tracing::debug!("Dual-stack bind failed ({}), falling back to IPv4", e);
            let addr_v4 = SocketAddr::from(([0, 0, 0, 0], port));
            let listener = TcpListener::bind(addr_v4)
                .await
                .map_err(|e| eyre::eyre!("Failed to bind to port {}: {}", port, e))?;
            info!(
                address = %listener.local_addr()?,
                stack = "IPv4 only",
                "🌐 Server listening"
            );
            Ok(listener)
        }
    }
}

/// Bind an IPv6 socket with IPV6_V6ONLY disabled so IPv4 clients can connect.
/// On Windows the OS default is v6-only, so a plain `[::]` bind rejects IPv4.
fn bind_dual_stack(addr: SocketAddr) -> std::io::Result<TcpListener> {
    use socket2::{Domain, Protocol, Socket, Type};

    let socket = Socket::new(Domain::IPV6, Type::STREAM, Some(Protocol::TCP))?;
    socket.set_only_v6(false)?;
    socket.bind(&addr.into())?;
    socket.listen(1024)?;
    socket.set_nonblocking(true)?;
    TcpListener::from_std(socket.into())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { tracing::info!("Received Ctrl+C, shutting down..."); },
        _ = terminate => { tracing::info!("Received SIGTERM, shutting down..."); },
    }
}
