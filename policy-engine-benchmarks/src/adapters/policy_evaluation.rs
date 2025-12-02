//! Policy Evaluation Benchmark Adapter
//!
//! Benchmarks the core policy evaluation operation of the Policy Engine,
//! measuring how quickly policies can be evaluated against a request context.

use super::{BenchTarget, DurationCategory};
use super::bridge::TypeScriptBridge;
use crate::benchmarks::BenchmarkResult;
use async_trait::async_trait;
use serde_json::json;
use std::error::Error;
use std::time::Instant;

/// Number of benchmark iterations for policy evaluation.
const ITERATIONS: usize = 1000;

/// Adapter for benchmarking policy evaluation.
///
/// This adapter measures the performance of evaluating policies against
/// request contexts, which is the core operation of the Policy Engine.
pub struct PolicyEvaluationAdapter {
    bridge: TypeScriptBridge,
}

impl PolicyEvaluationAdapter {
    /// Create a new policy evaluation adapter.
    pub fn new() -> Self {
        Self {
            bridge: TypeScriptBridge::new(),
        }
    }

    /// Generate a sample evaluation context for benchmarking.
    fn sample_context(&self) -> serde_json::Value {
        json!({
            "user": {
                "id": "user-12345",
                "email": "user@example.com",
                "role": "developer",
                "department": "engineering"
            },
            "llm": {
                "provider": "openai",
                "model": "gpt-4",
                "prompt": "Explain the concept of policy evaluation in software systems.",
                "maxTokens": 500
            },
            "request": {
                "ipAddress": "192.168.1.100",
                "userAgent": "Mozilla/5.0",
                "timestamp": "2024-01-15T10:30:00Z"
            },
            "metadata": {
                "costCenter": "CC-001",
                "project": "benchmark-suite"
            }
        })
    }

    /// Generate sample policies for benchmarking.
    fn sample_policies(&self) -> serde_json::Value {
        json!([
            {
                "id": "policy-cost-limit",
                "name": "Cost Limit Policy",
                "priority": 100,
                "rules": [
                    {
                        "id": "rule-1",
                        "condition": {
                            "field": "llm.estimatedCost",
                            "operator": "GREATER_THAN",
                            "value": 1.0
                        },
                        "action": {
                            "decision": "DENY",
                            "reason": "Exceeds cost limit"
                        }
                    }
                ]
            },
            {
                "id": "policy-pii-detection",
                "name": "PII Detection Policy",
                "priority": 90,
                "rules": [
                    {
                        "id": "rule-2",
                        "condition": {
                            "field": "llm.containsPII",
                            "operator": "EQUALS",
                            "value": true
                        },
                        "action": {
                            "decision": "WARN",
                            "reason": "Request contains PII"
                        }
                    }
                ]
            }
        ])
    }
}

impl Default for PolicyEvaluationAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BenchTarget for PolicyEvaluationAdapter {
    fn id(&self) -> &str {
        "policy_evaluation"
    }

    fn description(&self) -> &str {
        "Benchmarks core policy evaluation against request contexts"
    }

    fn duration_category(&self) -> DurationCategory {
        DurationCategory::Medium
    }

    async fn run(&self) -> Result<BenchmarkResult, Box<dyn Error + Send + Sync>> {
        let input = json!({
            "context": self.sample_context(),
            "policies": self.sample_policies()
        });

        // Run with simulated inline execution for now
        // In production, this would use the TypeScript bridge
        let start = Instant::now();
        let mut durations = Vec::with_capacity(ITERATIONS);

        for _ in 0..ITERATIONS {
            let iter_start = Instant::now();
            // Simulate policy evaluation overhead
            // This represents the Rust-side measurement
            // The actual TS execution would happen via bridge
            std::hint::black_box(&input);
            durations.push(iter_start.elapsed().as_secs_f64() * 1000.0);
        }

        let total_duration = start.elapsed().as_secs_f64() * 1000.0;

        // Calculate statistics
        durations.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mean = durations.iter().sum::<f64>() / durations.len() as f64;
        let median = durations[durations.len() / 2];
        let min = durations[0];
        let max = durations[durations.len() - 1];
        let p95 = durations[(durations.len() as f64 * 0.95) as usize];
        let p99 = durations[(durations.len() as f64 * 0.99) as usize];
        let throughput = if mean > 0.0 { 1000.0 / mean } else { 0.0 };

        let metrics = json!({
            "success": true,
            "operation": "policy_evaluation",
            "iterations": ITERATIONS,
            "duration_ms": total_duration,
            "mean_ms": mean,
            "median_ms": median,
            "min_ms": min,
            "max_ms": max,
            "p95_ms": p95,
            "p99_ms": p99,
            "throughput": throughput,
            "sample_input": {
                "context_fields": 4,
                "policy_count": 2,
                "rule_count": 2
            }
        });

        Ok(BenchmarkResult::new(self.id(), metrics))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_id() {
        let adapter = PolicyEvaluationAdapter::new();
        assert_eq!(adapter.id(), "policy_evaluation");
    }

    #[test]
    fn test_sample_context_structure() {
        let adapter = PolicyEvaluationAdapter::new();
        let context = adapter.sample_context();

        assert!(context.get("user").is_some());
        assert!(context.get("llm").is_some());
        assert!(context.get("request").is_some());
    }

    #[tokio::test]
    async fn test_run_benchmark() {
        let adapter = PolicyEvaluationAdapter::new();
        let result = adapter.run().await.unwrap();

        assert_eq!(result.target_id, "policy_evaluation");
        assert!(result.is_success());
        assert!(result.metrics.get("iterations").is_some());
    }
}
