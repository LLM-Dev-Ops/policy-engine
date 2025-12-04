//! Telemetry and observability for the policy engine.
//!
//! This module provides OpenTelemetry integration for distributed tracing
//! and Prometheus metrics collection, aligned with the LLM Dev Ops platform
//! unified telemetry stack (OpenTelemetry v0.27).

use crate::config::TelemetryConfig;
use crate::policy::DecisionType;
use crate::Result;

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Telemetry instance for recording metrics and traces.
pub struct Telemetry {
    /// Configuration
    config: TelemetryConfig,
    /// Evaluation counters by decision type
    evaluations_allow: AtomicU64,
    evaluations_deny: AtomicU64,
    evaluations_warn: AtomicU64,
    evaluations_modify: AtomicU64,
    /// Cache hit/miss counters
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
    /// Error counter
    errors: AtomicU64,
    /// Total evaluation time in microseconds
    total_evaluation_time_us: AtomicU64,
}

impl Telemetry {
    /// Create a new telemetry instance.
    pub fn new(config: &TelemetryConfig) -> Result<Self> {
        // In a full implementation, this would initialize OpenTelemetry
        // For now, we provide a metrics-tracking implementation
        Ok(Self {
            config: config.clone(),
            evaluations_allow: AtomicU64::new(0),
            evaluations_deny: AtomicU64::new(0),
            evaluations_warn: AtomicU64::new(0),
            evaluations_modify: AtomicU64::new(0),
            cache_hits: AtomicU64::new(0),
            cache_misses: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            total_evaluation_time_us: AtomicU64::new(0),
        })
    }

    /// Record a policy evaluation.
    pub fn record_evaluation(&self, decision: &DecisionType, duration_ms: f64, cached: bool) {
        // Increment decision counter
        match decision {
            DecisionType::Allow => self.evaluations_allow.fetch_add(1, Ordering::Relaxed),
            DecisionType::Deny => self.evaluations_deny.fetch_add(1, Ordering::Relaxed),
            DecisionType::Warn => self.evaluations_warn.fetch_add(1, Ordering::Relaxed),
            DecisionType::Modify => self.evaluations_modify.fetch_add(1, Ordering::Relaxed),
        };

        // Increment cache counter
        if cached {
            self.cache_hits.fetch_add(1, Ordering::Relaxed);
        } else {
            self.cache_misses.fetch_add(1, Ordering::Relaxed);
        }

        // Record duration
        let duration_us = (duration_ms * 1000.0) as u64;
        self.total_evaluation_time_us
            .fetch_add(duration_us, Ordering::Relaxed);
    }

    /// Record an error.
    pub fn record_error(&self, _error_type: &str) {
        self.errors.fetch_add(1, Ordering::Relaxed);
    }

    /// Get current metrics.
    pub fn metrics(&self) -> TelemetryMetrics {
        let total_evaluations = self.evaluations_allow.load(Ordering::Relaxed)
            + self.evaluations_deny.load(Ordering::Relaxed)
            + self.evaluations_warn.load(Ordering::Relaxed)
            + self.evaluations_modify.load(Ordering::Relaxed);

        let cache_hits = self.cache_hits.load(Ordering::Relaxed);
        let cache_misses = self.cache_misses.load(Ordering::Relaxed);
        let cache_total = cache_hits + cache_misses;
        let cache_hit_rate = if cache_total > 0 {
            (cache_hits as f64 / cache_total as f64) * 100.0
        } else {
            0.0
        };

        let total_time_us = self.total_evaluation_time_us.load(Ordering::Relaxed);
        let avg_evaluation_time_ms = if total_evaluations > 0 {
            (total_time_us as f64 / total_evaluations as f64) / 1000.0
        } else {
            0.0
        };

        TelemetryMetrics {
            total_evaluations,
            evaluations_allow: self.evaluations_allow.load(Ordering::Relaxed),
            evaluations_deny: self.evaluations_deny.load(Ordering::Relaxed),
            evaluations_warn: self.evaluations_warn.load(Ordering::Relaxed),
            evaluations_modify: self.evaluations_modify.load(Ordering::Relaxed),
            cache_hits,
            cache_misses,
            cache_hit_rate,
            avg_evaluation_time_ms,
            errors: self.errors.load(Ordering::Relaxed),
        }
    }

    /// Check if telemetry is enabled.
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    /// Get the service name.
    pub fn service_name(&self) -> &str {
        &self.config.service_name
    }
}

/// Metrics collected by telemetry.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TelemetryMetrics {
    /// Total number of evaluations
    pub total_evaluations: u64,
    /// Number of allow decisions
    pub evaluations_allow: u64,
    /// Number of deny decisions
    pub evaluations_deny: u64,
    /// Number of warn decisions
    pub evaluations_warn: u64,
    /// Number of modify decisions
    pub evaluations_modify: u64,
    /// Cache hits
    pub cache_hits: u64,
    /// Cache misses
    pub cache_misses: u64,
    /// Cache hit rate percentage
    pub cache_hit_rate: f64,
    /// Average evaluation time in milliseconds
    pub avg_evaluation_time_ms: f64,
    /// Total errors
    pub errors: u64,
}

/// A span for tracing operations.
pub struct Span {
    name: String,
    start: Instant,
    attributes: Vec<(String, String)>,
}

impl Span {
    /// Create a new span.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            start: Instant::now(),
            attributes: Vec::new(),
        }
    }

    /// Add an attribute to the span.
    pub fn set_attribute(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.attributes.push((key.into(), value.into()));
    }

    /// Get the span name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the elapsed time in milliseconds.
    pub fn elapsed_ms(&self) -> f64 {
        self.start.elapsed().as_secs_f64() * 1000.0
    }

    /// End the span and return the duration.
    pub fn end(self) -> f64 {
        self.elapsed_ms()
    }
}

/// Create a new span for tracing.
pub fn span(name: impl Into<String>) -> Span {
    Span::new(name)
}

/// Record a metric value.
pub fn record_metric(_name: &str, _value: f64, _labels: &[(&str, &str)]) {
    // In a full implementation, this would record to Prometheus
}

/// Increment a counter.
pub fn increment_counter(_name: &str, _labels: &[(&str, &str)]) {
    // In a full implementation, this would increment a Prometheus counter
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_telemetry_creation() {
        let config = TelemetryConfig::default();
        let telemetry = Telemetry::new(&config).unwrap();
        assert!(telemetry.is_enabled());
    }

    #[test]
    fn test_record_evaluation() {
        let config = TelemetryConfig::default();
        let telemetry = Telemetry::new(&config).unwrap();

        telemetry.record_evaluation(&DecisionType::Allow, 5.0, false);
        telemetry.record_evaluation(&DecisionType::Deny, 3.0, true);
        telemetry.record_evaluation(&DecisionType::Allow, 2.0, false);

        let metrics = telemetry.metrics();
        assert_eq!(metrics.total_evaluations, 3);
        assert_eq!(metrics.evaluations_allow, 2);
        assert_eq!(metrics.evaluations_deny, 1);
        assert_eq!(metrics.cache_hits, 1);
        assert_eq!(metrics.cache_misses, 2);
    }

    #[test]
    fn test_span() {
        let mut span = Span::new("test_operation");
        span.set_attribute("key", "value");
        assert_eq!(span.name(), "test_operation");

        // Let some time pass
        std::thread::sleep(std::time::Duration::from_millis(10));

        let duration = span.end();
        assert!(duration >= 10.0);
    }
}
