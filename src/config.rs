//! Configuration management for the policy engine.
//!
//! This module provides hierarchical configuration support with environment
//! variable overrides, following the LLM Dev Ops platform configuration patterns.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Main configuration structure for the policy engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Server configuration
    pub server: ServerConfig,
    /// Cache configuration
    pub cache: CacheConfig,
    /// Telemetry/observability configuration
    pub telemetry: TelemetryConfig,
    /// Integration configuration for external services
    pub integrations: IntegrationsConfig,
    /// Performance tuning configuration
    pub performance: PerformanceConfig,
    /// Security configuration
    pub security: SecurityConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            cache: CacheConfig::default(),
            telemetry: TelemetryConfig::default(),
            integrations: IntegrationsConfig::default(),
            performance: PerformanceConfig::default(),
            security: SecurityConfig::default(),
        }
    }
}

/// Server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    /// HTTP server host
    pub host: String,
    /// HTTP server port
    pub port: u16,
    /// gRPC server port
    pub grpc_port: u16,
    /// Request timeout in milliseconds
    pub request_timeout_ms: u64,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 3000,
            grpc_port: 50051,
            request_timeout_ms: 30000,
        }
    }
}

impl ServerConfig {
    /// Get the request timeout as a Duration.
    pub fn request_timeout(&self) -> Duration {
        Duration::from_millis(self.request_timeout_ms)
    }
}

/// Cache configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CacheConfig {
    /// Whether caching is enabled
    pub enabled: bool,
    /// Maximum number of entries in L1 (in-memory) cache
    pub l1_max_entries: usize,
    /// L1 cache TTL in seconds
    pub l1_ttl_seconds: u64,
    /// Whether L2 (Redis) cache is enabled
    pub l2_enabled: bool,
    /// Redis URL for L2 cache
    pub redis_url: Option<String>,
    /// Redis key prefix
    pub redis_prefix: String,
    /// L2 cache TTL in seconds
    pub l2_ttl_seconds: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            l1_max_entries: 10000,
            l1_ttl_seconds: 300,
            l2_enabled: false,
            redis_url: None,
            redis_prefix: "llm-policy:".to_string(),
            l2_ttl_seconds: 600,
        }
    }
}

impl CacheConfig {
    /// Get L1 TTL as Duration.
    pub fn l1_ttl(&self) -> Duration {
        Duration::from_secs(self.l1_ttl_seconds)
    }

    /// Get L2 TTL as Duration.
    pub fn l2_ttl(&self) -> Duration {
        Duration::from_secs(self.l2_ttl_seconds)
    }
}

/// Telemetry and observability configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TelemetryConfig {
    /// Whether telemetry is enabled
    pub enabled: bool,
    /// Service name for telemetry
    pub service_name: String,
    /// OpenTelemetry collector endpoint
    pub otlp_endpoint: Option<String>,
    /// Metrics port (Prometheus)
    pub metrics_port: u16,
    /// Metrics path
    pub metrics_path: String,
    /// Log level
    pub log_level: String,
    /// Whether to enable JSON log format
    pub json_logs: bool,
    /// Trace sampling ratio (0.0 to 1.0)
    pub trace_sampling_ratio: f64,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            service_name: "llm-policy-engine".to_string(),
            otlp_endpoint: None,
            metrics_port: 9090,
            metrics_path: "/metrics".to_string(),
            log_level: "info".to_string(),
            json_logs: false,
            trace_sampling_ratio: 1.0,
        }
    }
}

/// External service integration configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct IntegrationsConfig {
    /// LLM Shield service URL
    pub shield_url: Option<String>,
    /// LLM CostOps service URL
    pub costops_url: Option<String>,
    /// LLM Governance service URL
    pub governance_url: Option<String>,
    /// LLM Edge Agent service URL
    pub edge_agent_url: Option<String>,
    /// Incident Manager service URL
    pub incident_manager_url: Option<String>,
    /// Sentinel service URL
    pub sentinel_url: Option<String>,
    /// Integration request timeout in milliseconds
    pub timeout_ms: u64,
    /// Whether to fail evaluation if integration fails
    pub fail_on_error: bool,
}

impl Default for IntegrationsConfig {
    fn default() -> Self {
        Self {
            shield_url: None,
            costops_url: None,
            governance_url: None,
            edge_agent_url: None,
            incident_manager_url: None,
            sentinel_url: None,
            timeout_ms: 5000,
            fail_on_error: false,
        }
    }
}

impl IntegrationsConfig {
    /// Get integration timeout as Duration.
    pub fn timeout(&self) -> Duration {
        Duration::from_millis(self.timeout_ms)
    }
}

/// Performance tuning configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PerformanceConfig {
    /// Maximum policy size in MB
    pub max_policy_size_mb: usize,
    /// Maximum evaluation time in milliseconds
    pub max_evaluation_time_ms: u64,
    /// Whether to enable parallel policy evaluation
    pub parallel_evaluation: bool,
    /// Maximum concurrent evaluations
    pub max_concurrent_evaluations: usize,
    /// WASM sandbox memory limit in MB
    pub wasm_memory_limit_mb: usize,
    /// CEL expression evaluation timeout in milliseconds
    pub cel_timeout_ms: u64,
}

impl Default for PerformanceConfig {
    fn default() -> Self {
        Self {
            max_policy_size_mb: 10,
            max_evaluation_time_ms: 100,
            parallel_evaluation: true,
            max_concurrent_evaluations: 1000,
            wasm_memory_limit_mb: 64,
            cel_timeout_ms: 50,
        }
    }
}

impl PerformanceConfig {
    /// Get max evaluation time as Duration.
    pub fn max_evaluation_time(&self) -> Duration {
        Duration::from_millis(self.max_evaluation_time_ms)
    }

    /// Get CEL timeout as Duration.
    pub fn cel_timeout(&self) -> Duration {
        Duration::from_millis(self.cel_timeout_ms)
    }
}

/// Security configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SecurityConfig {
    /// Whether authentication is required
    pub auth_enabled: bool,
    /// JWT secret (should be provided via environment variable)
    pub jwt_secret: Option<String>,
    /// JWT algorithm
    pub jwt_algorithm: String,
    /// JWT expiration in seconds
    pub jwt_expiration_seconds: u64,
    /// API key header name
    pub api_key_header: String,
    /// Rate limiting enabled
    pub rate_limit_enabled: bool,
    /// Rate limit requests per second
    pub rate_limit_rps: u32,
    /// Rate limit burst size
    pub rate_limit_burst: u32,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            auth_enabled: false,
            jwt_secret: None,
            jwt_algorithm: "HS256".to_string(),
            jwt_expiration_seconds: 3600,
            api_key_header: "X-API-Key".to_string(),
            rate_limit_enabled: true,
            rate_limit_rps: 1000,
            rate_limit_burst: 100,
        }
    }
}

impl Config {
    /// Load configuration from environment variables.
    pub fn from_env() -> crate::Result<Self> {
        let mut config = Self::default();

        // Server config
        if let Ok(port) = std::env::var("PORT") {
            config.server.port = port.parse().unwrap_or(3000);
        }
        if let Ok(grpc_port) = std::env::var("GRPC_PORT") {
            config.server.grpc_port = grpc_port.parse().unwrap_or(50051);
        }
        if let Ok(host) = std::env::var("HOST") {
            config.server.host = host;
        }

        // Cache config
        if let Ok(enabled) = std::env::var("CACHE_ENABLED") {
            config.cache.enabled = enabled.parse().unwrap_or(true);
        }
        if let Ok(redis_url) = std::env::var("REDIS_URL") {
            config.cache.redis_url = Some(redis_url);
            config.cache.l2_enabled = true;
        }

        // Telemetry config
        if let Ok(enabled) = std::env::var("TELEMETRY_ENABLED") {
            config.telemetry.enabled = enabled.parse().unwrap_or(true);
        }
        if let Ok(endpoint) = std::env::var("OTLP_ENDPOINT") {
            config.telemetry.otlp_endpoint = Some(endpoint);
        }
        if let Ok(level) = std::env::var("LOG_LEVEL") {
            config.telemetry.log_level = level;
        }

        // Integration URLs
        if let Ok(url) = std::env::var("LLM_SHIELD_URL") {
            config.integrations.shield_url = Some(url);
        }
        if let Ok(url) = std::env::var("LLM_COSTOPS_URL") {
            config.integrations.costops_url = Some(url);
        }
        if let Ok(url) = std::env::var("LLM_GOVERNANCE_URL") {
            config.integrations.governance_url = Some(url);
        }
        if let Ok(url) = std::env::var("LLM_EDGE_AGENT_URL") {
            config.integrations.edge_agent_url = Some(url);
        }
        if let Ok(url) = std::env::var("INCIDENT_MANAGER_URL") {
            config.integrations.incident_manager_url = Some(url);
        }
        if let Ok(url) = std::env::var("SENTINEL_URL") {
            config.integrations.sentinel_url = Some(url);
        }

        // Security config
        if let Ok(secret) = std::env::var("JWT_SECRET") {
            config.security.jwt_secret = Some(secret);
        }
        if let Ok(enabled) = std::env::var("AUTH_ENABLED") {
            config.security.auth_enabled = enabled.parse().unwrap_or(false);
        }

        Ok(config)
    }

    /// Validate the configuration.
    pub fn validate(&self) -> crate::Result<()> {
        // Validate security config
        if self.security.auth_enabled && self.security.jwt_secret.is_none() {
            return Err(crate::Error::config(
                "JWT_SECRET must be set when authentication is enabled",
            ));
        }

        // Validate cache config
        if self.cache.l2_enabled && self.cache.redis_url.is_none() {
            return Err(crate::Error::config(
                "REDIS_URL must be set when L2 cache is enabled",
            ));
        }

        // Validate performance config
        if self.performance.max_evaluation_time_ms == 0 {
            return Err(crate::Error::config(
                "max_evaluation_time_ms must be greater than 0",
            ));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.port, 3000);
        assert!(config.cache.enabled);
        assert!(config.telemetry.enabled);
    }

    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        assert!(config.validate().is_ok());

        // Test auth validation
        config.security.auth_enabled = true;
        config.security.jwt_secret = None;
        assert!(config.validate().is_err());

        config.security.jwt_secret = Some("secret".to_string());
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_duration_helpers() {
        let config = CacheConfig::default();
        assert_eq!(config.l1_ttl(), Duration::from_secs(300));
        assert_eq!(config.l2_ttl(), Duration::from_secs(600));
    }
}
