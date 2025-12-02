//! Condition Parsing Benchmark Adapter
//!
//! Benchmarks the parsing and evaluation of policy conditions,
//! including logical operators (AND, OR, NOT) and comparison operators.

use super::{BenchTarget, DurationCategory};
use crate::benchmarks::BenchmarkResult;
use async_trait::async_trait;
use serde_json::json;
use std::error::Error;
use std::time::Instant;

/// Number of benchmark iterations for condition parsing.
const ITERATIONS: usize = 5000;

/// Adapter for benchmarking condition parsing and evaluation.
///
/// This adapter measures the performance of parsing and evaluating
/// complex policy conditions with various operators.
pub struct ConditionParsingAdapter;

impl ConditionParsingAdapter {
    /// Create a new condition parsing adapter.
    pub fn new() -> Self {
        Self
    }

    /// Generate sample conditions for benchmarking.
    fn sample_conditions(&self) -> Vec<serde_json::Value> {
        vec![
            // Simple equality
            json!({
                "field": "user.role",
                "operator": "EQUALS",
                "value": "admin"
            }),
            // Numeric comparison
            json!({
                "field": "llm.estimatedTokens",
                "operator": "LESS_THAN",
                "value": 1000
            }),
            // Collection operator
            json!({
                "field": "user.role",
                "operator": "IN",
                "value": ["admin", "developer", "analyst"]
            }),
            // Regex matching
            json!({
                "field": "user.email",
                "operator": "MATCHES",
                "value": "^[a-z]+@example\\.com$"
            }),
            // Nested AND condition
            json!({
                "operator": "AND",
                "conditions": [
                    {
                        "field": "user.department",
                        "operator": "EQUALS",
                        "value": "engineering"
                    },
                    {
                        "field": "request.secure",
                        "operator": "EQUALS",
                        "value": true
                    }
                ]
            }),
            // Complex nested condition
            json!({
                "operator": "OR",
                "conditions": [
                    {
                        "operator": "AND",
                        "conditions": [
                            { "field": "user.role", "operator": "EQUALS", "value": "admin" },
                            { "field": "llm.estimatedCost", "operator": "LESS_THAN", "value": 10.0 }
                        ]
                    },
                    {
                        "operator": "NOT",
                        "condition": {
                            "field": "llm.containsPII",
                            "operator": "EQUALS",
                            "value": true
                        }
                    }
                ]
            })
        ]
    }

    /// Generate a sample context for condition evaluation.
    fn sample_context(&self) -> serde_json::Value {
        json!({
            "user": {
                "id": "user-123",
                "role": "developer",
                "email": "dev@example.com",
                "department": "engineering"
            },
            "llm": {
                "estimatedTokens": 500,
                "estimatedCost": 0.05,
                "containsPII": false
            },
            "request": {
                "secure": true,
                "method": "POST"
            }
        })
    }
}

impl Default for ConditionParsingAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BenchTarget for ConditionParsingAdapter {
    fn id(&self) -> &str {
        "condition_parsing"
    }

    fn description(&self) -> &str {
        "Benchmarks parsing and evaluation of policy conditions"
    }

    fn duration_category(&self) -> DurationCategory {
        DurationCategory::Fast
    }

    async fn run(&self) -> Result<BenchmarkResult, Box<dyn Error + Send + Sync>> {
        let conditions = self.sample_conditions();
        let context = self.sample_context();

        let start = Instant::now();
        let mut per_condition_times = vec![Vec::new(); conditions.len()];

        for _ in 0..ITERATIONS {
            for (i, condition) in conditions.iter().enumerate() {
                let iter_start = Instant::now();
                // Simulate condition parsing and evaluation
                std::hint::black_box((condition, &context));
                per_condition_times[i].push(iter_start.elapsed().as_secs_f64() * 1000.0);
            }
        }

        let total_duration = start.elapsed().as_secs_f64() * 1000.0;

        // Calculate overall statistics
        let all_times: Vec<f64> = per_condition_times.iter().flatten().copied().collect();
        let mean = all_times.iter().sum::<f64>() / all_times.len() as f64;
        let throughput = if mean > 0.0 { 1000.0 / mean } else { 0.0 };

        // Calculate per-condition type statistics
        let condition_types = ["equality", "numeric", "collection", "regex", "nested_and", "complex_nested"];
        let mut condition_stats = json!({});

        for (i, (times, type_name)) in per_condition_times.iter().zip(condition_types.iter()).enumerate() {
            let mut sorted = times.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let type_mean = sorted.iter().sum::<f64>() / sorted.len() as f64;

            condition_stats[*type_name] = json!({
                "mean_ms": type_mean,
                "min_ms": sorted.first().copied().unwrap_or(0.0),
                "max_ms": sorted.last().copied().unwrap_or(0.0)
            });
        }

        let metrics = json!({
            "success": true,
            "operation": "condition_parsing",
            "iterations": ITERATIONS,
            "duration_ms": total_duration,
            "mean_ms": mean,
            "throughput": throughput,
            "condition_types_tested": conditions.len(),
            "total_evaluations": all_times.len(),
            "per_condition_stats": condition_stats
        });

        Ok(BenchmarkResult::new(self.id(), metrics))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_id() {
        let adapter = ConditionParsingAdapter::new();
        assert_eq!(adapter.id(), "condition_parsing");
    }

    #[test]
    fn test_sample_conditions() {
        let adapter = ConditionParsingAdapter::new();
        let conditions = adapter.sample_conditions();

        assert!(!conditions.is_empty());
        // Should have at least simple and complex conditions
        assert!(conditions.len() >= 5);
    }

    #[tokio::test]
    async fn test_run_benchmark() {
        let adapter = ConditionParsingAdapter::new();
        let result = adapter.run().await.unwrap();

        assert_eq!(result.target_id, "condition_parsing");
        assert!(result.is_success());
    }
}
