//! API routes

pub mod health;
pub mod metrics;
pub mod orderbook;
pub mod pairs;
pub mod quote;
pub mod ws;

use axum::{routing::get, Router};
use std::sync::Arc;

use crate::state::AppState;

/// Create the main API router
pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // Health check
        .route("/health", get(health::health_check))
        .route("/metrics/cache", get(metrics::cache_metrics))
        // API v1 routes
        .route("/api/v1/pairs", get(pairs::list_pairs))
        .route(
            "/api/v1/orderbook/:base/:quote",
            get(orderbook::get_orderbook),
        )
        .route("/api/v1/quote/:base/:quote", get(quote::get_quote))
        // WebSocket quote stream
        // NOTE: ConnectInfo requires `into_make_service_with_connect_info::<SocketAddr>()`
        // in server.rs (axum::serve call) for the addr extractor to work.
        .route("/ws", get(ws::ws_handler))
        .with_state(state)
}
