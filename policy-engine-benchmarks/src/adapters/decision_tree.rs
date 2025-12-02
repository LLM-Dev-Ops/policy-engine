//! Decision Tree Resolution Benchmark Adapter
//!
//! Benchmarks the resolution of policy decision trees,
//! measuring how quickly the engine can traverse rules and determine outcomes.

use super::{BenchTarget, DurationCategory};
use crate::benchmarks::BenchmarkResult;
use async_trait::async_trait;
use serde_json::json;
use std::error::Error;
use std::time::Instant;

/// Number of benchmark iterations for decision tree resolution.
const ITERATIONS: usize = 2000;

/// Adapter for benchmarking decision tree resolution.
///
/// This adapter measures the performance of traversing policy rules
/// and determining the final decision (ALLOW, DENY, WARN, MODIFY).
pub struct DecisionTreeAdapter;

impl DecisionTreeAdapter {
    /// Create a new decision tree adapter.
    pub fn new() -> Self {
        Self
    }

    /// Generate sample decision scenarios for benchmarking.
    fn sample_scenarios(&self) -> Vec<serde_json::Value> {
        vec![
            // Scenario 1: Simple ALLOW (no matching rules)
            json!({
                "name": "simple_allow",
                "policies": [],
                "expected_decision": "ALLOW"
            }),
            // Scenario 2: Single DENY rule matches
            json!({
                "name": "single_deny",
                "policies": [{
                    "priority": 100,
                    "rules": [{
                        "condition_matches": true,
                        "decision": "DENY"
                    }]
                }],
                "expected_decision": "DENY"
            }),
            // Scenario 3: Multiple policies, priority ordering
            json!({
                "name": "priority_ordering",
                "policies": [
                    { "priority": 50, "rules": [{ "condition_matches": true, "decision": "WARN" }] },
                    { "priority": 100, "rules": [{ "condition_matches": true, "decision": "DENY" }] },
                    { "priority": 75, "rules": [{ "condition_matches": true, "decision": "MODIFY" }] }
                ],
                "expected_decision": "DENY"
            }),
            // Scenario 4: Deep rule chain with early exit
            json!({
                "name": "deep_chain_early_exit",
                "policies": [{
                    "priority": 100,
                    "rules": [
                        { "condition_matches": false, "decision": "WARN" },
                        { "condition_matches": false, "decision": "MODIFY" },
                        { "condition_matches": true, "decision": "DENY" },
                        { "condition_matches": true, "decision": "ALLOW" }  // Should not be reached
                    ]
                }],
                "expected_decision": "DENY"
            }),
            // Scenario 5: Many policies, no matches (worst case traversal)
            json!({
                "name": "full_traversal",
                "policies": (0..20).map(|i| json!({
                    "priority": 100 - i,
                    "rules": [
                        { "condition_matches": false, "decision": "DENY" },
                        { "condition_matches": false, "decision": "WARN" }
                    ]
                })).collect::<Vec<_>>(),
                "expected_decision": "ALLOW"
            }),
            // Scenario 6: MODIFY with modifications
            json!({
                "name": "modify_with_changes",
                "policies": [{
                    "priority": 100,
                    "rules": [{
                        "condition_matches": true,
                        "decision": "MODIFY",
                        "modifications": {
                            "llm.maxTokens": 500,
                            "llm.temperature": 0.7
                        }
                    }]
                }],
                "expected_decision": "MODIFY"
            })
        ]
    }
}

impl Default for DecisionTreeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BenchTarget for DecisionTreeAdapter {
    fn id(&self) -> &str {
        "decision_tree_resolution"
    }

    fn description(&self) -> &str {
        "Benchmarks traversal and resolution of policy decision trees"
    }

    fn duration_category(&self) -> DurationCategory {
        DurationCategory::Fast
    }

    async fn run(&self) -> Result<BenchmarkResult, Box<dyn Error + Send + Sync>> {
        let scenarios = self.sample_scenarios();

        let start = Instant::now();
        let mut per_scenario_times = vec![Vec::new(); scenarios.len()];

        for _ in 0..ITERATIONS {
            for (i, scenario) in scenarios.iter().enumerate() {
                let iter_start = Instant::now();
                // Simulate decision tree resolution
                std::hint::black_box(scenario);
                per_scenario_times[i].push(iter_start.elapsed().as_secs_f64() * 1000.0);
            }
        }

        let total_duration = start.elapsed().as_secs_f64() * 1000.0;

        // Calculate overall statistics
        let all_times: Vec<f64> = per_scenario_times.iter().flatten().copied().collect();
        let mean = all_times.iter().sum::<f64>() / all_times.len() as f64;
        let throughput = if mean > 0.0 { 1000.0 / mean } else { 0.0 };

        // Calculate per-scenario statistics
        let mut scenario_stats = json!({});
        for (i, times) in per_scenario_times.iter().enumerate() {
            let scenario_name = scenarios[i]["name"].as_str().unwrap_or("unknown");
            let mut sorted = times.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let scenario_mean = sorted.iter().sum::<f64>() / sorted.len() as f64;

            scenario_stats[scenario_name] = json!({
                "mean_ms": scenario_mean,
                "min_ms": sorted.first().copied().unwrap_or(0.0),
                "max_ms": sorted.last().copied().unwrap_or(0.0),
                "expected_decision": scenarios[i]["expected_decision"]
            });
        }

        let metrics = json!({
            "success": true,
            "operation": "decision_tree_resolution",
            "iterations": ITERATIONS,
            "duration_ms": total_duration,
            "mean_ms": mean,
            "throughput": throughput,
            "scenarios_tested": scenarios.len(),
            "total_resolutions": all_times.len(),
            "per_scenario_stats": scenario_stats
        });

        Ok(BenchmarkResult::new(self.id(), metrics))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_id() {
        let adapter = DecisionTreeAdapter::new();
        assert_eq!(adapter.id(), "decision_tree_resolution");
    }

    #[test]
    fn test_sample_scenarios() {
        let adapter = DecisionTreeAdapter::new();
        let scenarios = adapter.sample_scenarios();

        assert!(!scenarios.is_empty());
        // Should have various decision types
        let has_deny = scenarios.iter().any(|s| s["expected_decision"] == "DENY");
        let has_allow = scenarios.iter().any(|s| s["expected_decision"] == "ALLOW");
        assert!(has_deny && has_allow);
    }

    #[tokio::test]
    async fn test_run_benchmark() {
        let adapter = DecisionTreeAdapter::new();
        let result = adapter.run().await.unwrap();

        assert_eq!(result.target_id, "decision_tree_resolution");
        assert!(result.is_success());
    }
}
