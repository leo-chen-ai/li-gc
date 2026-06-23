use axum::{Router, middleware, routing::post};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::id_card;

pub fn ocr_routes() -> Router<AppState> {
    Router::new()
        .route("/id-card", post(id_card::recognize_id_card))
        .route_layer(middleware::from_fn(auth_middleware))
}
