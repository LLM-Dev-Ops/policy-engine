//! Benchmark Result Definition
//!
//! Contains the standardized `BenchmarkResult` struct with the exact fields
//! required by the canonical benchmark interface:
//! - `target_id: String`
//! - `metrics: serde_json::Value`
//! - `timestamp: chrono::DateTime<chrono::Utc>`

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Standardized benchmark result structure.
///
/// This struct follows the canonical benchmark interface used across
/// all 25 benchmark-target repositories, ensuring consistency in
/// how benchmark results are captured and reported.
///
/// # Fields
///
/// * `target_id` - Unique identifier for the benchmark target
/// * `metrics` - JSON value containing benchmark metrics (duration, throughput, etc.)
/// * `timestamp` - UTC timestamp when the benchmark was executed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    /// Unique identifier for the benchmark target
    pub target_id: String,

    /// JSON object containing benchmark metrics
    ///
    /// Common metrics include:
    /// - `duration_ms`: Execution time in milliseconds
    /// - `iterations`: Number of iterations performed
    /// - `throughput`: Operations per second
    /// - `memory_bytes`: Memory usage in bytes
    /// - `success`: Boolean indicating success/failure
    /// - `error`: Error message if failed
    pub metrics: Value,

    /// UTC timestamp when the benchmark was executed
    pub timestamp: DateTime<Utc>,
}

impl BenchmarkResult {
    /// Create a new benchmark result with the current timestamp.
    ///
    /// # Arguments
    ///
    /// * `target_id` - Unique identifier for the benchmark target
    /// * `metrics` - JSON value containing benchmark metrics
    ///
    /// # Example
    ///
    /// ```rust
    /// use policy_engine_benchmarks::benchmarks::result::BenchmarkResult;
    /// use serde_json::json;
    ///
    /// let result = BenchmarkResult::new(
    ///     "policy_evaluation",
    ///     json!({
    ///         "duration_ms": 42.5,
    ///         "iterations": 1000,
    ///         "throughput": 23529.41
    ///     })
    /// );
    /// ```
    pub fn new(target_id: impl Into<String>, metrics: Value) -> Self {
        Self {
            target_id: target_id.into(),
            metrics,
            timestamp: Utc::now(),
        }
    }

    /// Create a benchmark result with a specific timestamp.
    ///
    /// Useful for testing or when replaying historical benchmark data.
    pub fn with_timestamp(
        target_id: impl Into<String>,
        metrics: Value,
        timestamp: DateTime<Utc>,
    ) -> Self {
        Self {
            target_id: target_id.into(),
            metrics,
            timestamp,
        }
    }

    /// Create a failed benchmark result.
    ///
    /// # Arguments
    ///
    /// * `target_id` - Unique identifier for the benchmark target
    /// * `error` - Error message describing the failure
    pub fn failed(target_id: impl Into<String>, error: impl Into<String>) -> Self {
        Self::new(
            target_id,
            serde_json::json!({
                "success": false,
                "error": error.into()
            }),
        )
    }

    /// Check if the benchmark succeeded.
    pub fn is_success(&self) -> bool {
        self.metrics
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(true) // Default to true if not specified
    }

    /// Get the duration in milliseconds if available.
    pub fn duration_ms(&self) -> Option<f64> {
        self.metrics.get("duration_ms").and_then(|v| v.as_f64())
    }

    /// Get the throughput if available.
    pub fn throughput(&self) -> Option<f64> {
        self.metrics.get("throughput").and_then(|v| v.as_f64())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_new_result() {
        let result = BenchmarkResult::new(
            "test_target",
            json!({
                "duration_ms": 100.0,
                "success": true
            }),
        );

        assert_eq!(result.target_id, "test_target");
        assert!(result.is_success());
        assert_eq!(result.duration_ms(), Some(100.0));
    }

    #[test]
    fn test_failed_result() {
        let result = BenchmarkResult::failed("test_target", "Connection timeout");

        assert_eq!(result.target_id, "test_target");
        assert!(!result.is_success());
        assert!(result.metrics["error"].as_str().unwrap().contains("timeout"));
    }

    #[test]
    fn test_serialization() {
        let result = BenchmarkResult::new("test", json!({"value": 42}));
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: BenchmarkResult = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.target_id, result.target_id);
    }
}
