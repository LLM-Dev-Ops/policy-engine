//! Policy Engine Daemon
//!
//! A standalone daemon that provides policy evaluation services via gRPC and HTTP APIs.

use llm_policy_engine::{Config, PolicyEngine, Result};

use clap::Parser;
use std::path::PathBuf;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

/// Policy Engine Daemon
#[derive(Parser, Debug)]
#[command(name = "policy-engine")]
#[command(about = "High-performance policy engine for LLM operations")]
#[command(version)]
struct Args {
    /// Configuration file path
    #[arg(short, long, env = "CONFIG_FILE")]
    config: Option<PathBuf>,

    /// Policy directory to load
    #[arg(short, long, env = "POLICY_DIR")]
    policy_dir: Option<PathBuf>,

    /// Policy file to load
    #[arg(short = 'f', long, env = "POLICY_FILE")]
    policy_file: Option<PathBuf>,

    /// HTTP server port
    #[arg(long, env = "PORT", default_value = "3000")]
    port: u16,

    /// gRPC server port
    #[arg(long, env = "GRPC_PORT", default_value = "50051")]
    grpc_port: u16,

    /// Log level
    #[arg(long, env = "LOG_LEVEL", default_value = "info")]
    log_level: String,

    /// Enable JSON log format
    #[arg(long, env = "JSON_LOGS")]
    json_logs: bool,

    /// Disable cache
    #[arg(long)]
    no_cache: bool,

    /// Disable telemetry
    #[arg(long)]
    no_telemetry: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize logging
    init_logging(&args.log_level, args.json_logs)?;

    info!("Starting Policy Engine Daemon v{}", llm_policy_engine::VERSION);

    // Load configuration
    let mut config = Config::from_env()?;

    // Apply command line overrides
    config.server.port = args.port;
    config.server.grpc_port = args.grpc_port;

    if args.no_cache {
        config.cache.enabled = false;
    }

    if args.no_telemetry {
        config.telemetry.enabled = false;
    }

    // Validate configuration
    config.validate()?;

    // Build the policy engine
    let mut builder = PolicyEngine::builder()
        .with_config(config.clone())
        .with_cache_enabled(config.cache.enabled)
        .with_telemetry_enabled(config.telemetry.enabled);

    // Load policy file if specified
    if let Some(policy_file) = &args.policy_file {
        info!("Loading policy file: {:?}", policy_file);
        builder = builder.with_policy_file(policy_file.to_string_lossy().to_string());
    }

    let engine = builder.build().await?;

    // Load policies from directory if specified
    if let Some(policy_dir) = &args.policy_dir {
        info!("Loading policies from directory: {:?}", policy_dir);
        load_policies_from_dir(&engine, policy_dir).await?;
    }

    info!(
        "Policy Engine started. HTTP: {}, gRPC: {}",
        config.server.port, config.server.grpc_port
    );
    info!("Loaded {} policies", engine.policy_count());
    info!("Cache enabled: {}", config.cache.enabled);
    info!("Telemetry enabled: {}", config.telemetry.enabled);

    // In a full implementation, this would start the HTTP and gRPC servers
    // For now, we just demonstrate the daemon can be initialized
    info!("Policy Engine Daemon ready");

    // Keep running until shutdown signal
    tokio::signal::ctrl_c().await.map_err(|e| {
        llm_policy_engine::Error::internal(format!("Failed to listen for shutdown signal: {}", e))
    })?;

    info!("Shutting down Policy Engine Daemon");
    Ok(())
}

/// Initialize the logging system.
fn init_logging(level: &str, _json_format: bool) -> Result<()> {
    let level = match level.to_lowercase().as_str() {
        "trace" => Level::TRACE,
        "debug" => Level::DEBUG,
        "info" => Level::INFO,
        "warn" => Level::WARN,
        "error" => Level::ERROR,
        _ => Level::INFO,
    };

    let subscriber = FmtSubscriber::builder()
        .with_max_level(level)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .finish();

    tracing::subscriber::set_global_default(subscriber).map_err(|e| {
        llm_policy_engine::Error::internal(format!("Failed to set logging subscriber: {}", e))
    })?;

    Ok(())
}

/// Load policies from a directory.
async fn load_policies_from_dir(engine: &PolicyEngine, dir: &PathBuf) -> Result<()> {
    let entries = std::fs::read_dir(dir)?;
    let mut loaded = 0;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if matches!(extension.to_lowercase().as_str(), "yaml" | "yml" | "json") {
                match engine.load_policy_file(&path).await {
                    Ok(ids) => {
                        info!("Loaded {} policies from {:?}", ids.len(), path);
                        loaded += ids.len();
                    }
                    Err(e) => {
                        tracing::warn!("Failed to load policies from {:?}: {}", path, e);
                    }
                }
            }
        }
    }

    info!("Loaded {} total policies from directory", loaded);
    Ok(())
}
