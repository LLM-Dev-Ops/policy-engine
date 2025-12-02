//! Policy Bundle Loading Benchmark Adapter
//!
//! Benchmarks the loading and parsing of policy bundles,
//! measuring how quickly policy definitions can be loaded into memory.

use super::{BenchTarget, DurationCategory};
use crate::benchmarks::BenchmarkResult;
use async_trait::async_trait;
use serde_json::json;
use std::error::Error;
use std::time::Instant;

/// Number of benchmark iterations for policy bundle loading.
const ITERATIONS: usize = 500;

/// Adapter for benchmarking policy bundle loading.
///
/// This adapter measures the performance of loading and parsing
/// policy bundles of various sizes and complexities.
pub struct PolicyBundleAdapter;

impl PolicyBundleAdapter {
    /// Create a new policy bundle adapter.
    pub fn new() -> Self {
        Self
    }

    /// Generate sample policy bundles of various sizes.
    fn sample_bundles(&self) -> Vec<(String, serde_json::Value)> {
        vec![
            ("small_bundle".to_string(), self.generate_bundle(5, 2)),
            ("medium_bundle".to_string(), self.generate_bundle(20, 5)),
            ("large_bundle".to_string(), self.generate_bundle(50, 10)),
            ("complex_bundle".to_string(), self.generate_complex_bundle()),
        ]
    }

    /// Generate a policy bundle with the specified number of policies and rules.
    fn generate_bundle(&self, policy_count: usize, rules_per_policy: usize) -> serde_json::Value {
        let policies: Vec<serde_json::Value> = (0..policy_count)
            .map(|p| {
                let rules: Vec<serde_json::Value> = (0..rules_per_policy)
                    .map(|r| {
                        json!({
                            "id": format!("rule-{}-{}", p, r),
                            "enabled": true,
                            "condition": {
                                "field": format!("context.field_{}", r % 10),
                                "operator": ["EQUALS", "GREATER_THAN", "LESS_THAN", "IN"][r % 4],
                                "value": r * 10
                            },
                            "action": {
                                "decision": ["ALLOW", "DENY", "WARN", "MODIFY"][r % 4],
                                "reason": format!("Rule {} of policy {}", r, p)
                            }
                        })
                    })
                    .collect();

                json!({
                    "metadata": {
                        "id": format!("policy-{}", p),
                        "name": format!("Test Policy {}", p),
                        "version": "1.0.0",
                        "priority": 100 - p as i32
                    },
                    "status": "active",
                    "rules": rules
                })
            })
            .collect();

        json!({
            "version": "1.0",
            "policies": policies
        })
    }

    /// Generate a complex policy bundle with nested conditions.
    fn generate_complex_bundle(&self) -> serde_json::Value {
        json!({
            "version": "1.0",
            "policies": [
                {
                    "metadata": {
                        "id": "complex-policy-1",
                        "name": "Complex Cost and Security Policy",
                        "version": "2.0.0",
                        "priority": 100
                    },
                    "status": "active",
                    "rules": [
                        {
                            "id": "rule-complex-1",
                            "enabled": true,
                            "condition": {
                                "operator": "AND",
                                "conditions": [
                                    {
                                        "operator": "OR",
                                        "conditions": [
                                            { "field": "user.role", "operator": "EQUALS", "value": "admin" },
                                            { "field": "user.role", "operator": "EQUALS", "value": "superuser" }
                                        ]
                                    },
                                    {
                                        "field": "llm.estimatedCost",
                                        "operator": "GREATER_THAN",
                                        "value": 5.0
                                    },
                                    {
                                        "operator": "NOT",
                                        "condition": {
                                            "field": "request.approved",
                                            "operator": "EQUALS",
                                            "value": true
                                        }
                                    }
                                ]
                            },
                            "action": {
                                "decision": "DENY",
                                "reason": "High-cost request requires pre-approval"
                            }
                        },
                        {
                            "id": "rule-complex-2",
                            "enabled": true,
                            "condition": {
                                "operator": "AND",
                                "conditions": [
                                    { "field": "llm.containsPII", "operator": "EQUALS", "value": true },
                                    {
                                        "field": "user.piiAccessLevel",
                                        "operator": "NOT_IN",
                                        "value": ["full", "partial"]
                                    }
                                ]
                            },
                            "action": {
                                "decision": "DENY",
                                "reason": "Insufficient PII access permissions"
                            }
                        }
                    ]
                },
                {
                    "metadata": {
                        "id": "complex-policy-2",
                        "name": "Rate Limiting Policy",
                        "version": "1.5.0",
                        "priority": 90
                    },
                    "status": "active",
                    "rules": [
                        {
                            "id": "rule-rate-1",
                            "enabled": true,
                            "condition": {
                                "operator": "AND",
                                "conditions": [
                                    { "field": "user.requestsToday", "operator": "GREATER_THAN", "value": 100 },
                                    { "field": "user.tier", "operator": "EQUALS", "value": "free" }
                                ]
                            },
                            "action": {
                                "decision": "DENY",
                                "reason": "Daily request limit exceeded for free tier"
                            }
                        }
                    ]
                }
            ]
        })
    }
}

impl Default for PolicyBundleAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BenchTarget for PolicyBundleAdapter {
    fn id(&self) -> &str {
        "policy_bundle_loading"
    }

    fn description(&self) -> &str {
        "Benchmarks loading and parsing of policy bundles"
    }

    fn duration_category(&self) -> DurationCategory {
        DurationCategory::Medium
    }

    async fn run(&self) -> Result<BenchmarkResult, Box<dyn Error + Send + Sync>> {
        let bundles = self.sample_bundles();

        let start = Instant::now();
        let mut per_bundle_times: Vec<(String, Vec<f64>)> = bundles
            .iter()
            .map(|(name, _)| (name.clone(), Vec::new()))
            .collect();

        for _ in 0..ITERATIONS {
            for (i, (_, bundle)) in bundles.iter().enumerate() {
                let iter_start = Instant::now();
                // Simulate bundle parsing
                // In production, this would deserialize and validate the bundle
                let serialized = serde_json::to_string(bundle).unwrap();
                let _parsed: serde_json::Value = serde_json::from_str(&serialized).unwrap();
                std::hint::black_box(&_parsed);
                per_bundle_times[i].1.push(iter_start.elapsed().as_secs_f64() * 1000.0);
            }
        }

        let total_duration = start.elapsed().as_secs_f64() * 1000.0;

        // Calculate overall statistics
        let all_times: Vec<f64> = per_bundle_times.iter().flat_map(|(_, t)| t.iter().copied()).collect();
        let mean = all_times.iter().sum::<f64>() / all_times.len() as f64;
        let throughput = if mean > 0.0 { 1000.0 / mean } else { 0.0 };

        // Calculate per-bundle statistics
        let mut bundle_stats = json!({});
        for (name, times) in &per_bundle_times {
            let mut sorted = times.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let bundle_mean = sorted.iter().sum::<f64>() / sorted.len() as f64;

            // Get bundle info
            let bundle = bundles.iter().find(|(n, _)| n == name).map(|(_, b)| b);
            let policy_count = bundle
                .and_then(|b| b["policies"].as_array())
                .map(|a| a.len())
                .unwrap_or(0);

            bundle_stats[name] = json!({
                "mean_ms": bundle_mean,
                "min_ms": sorted.first().copied().unwrap_or(0.0),
                "max_ms": sorted.last().copied().unwrap_or(0.0),
                "policy_count": policy_count
            });
        }

        let metrics = json!({
            "success": true,
            "operation": "policy_bundle_loading",
            "iterations": ITERATIONS,
            "duration_ms": total_duration,
            "mean_ms": mean,
            "throughput": throughput,
            "bundles_tested": bundles.len(),
            "total_loads": all_times.len(),
            "per_bundle_stats": bundle_stats
        });

        Ok(BenchmarkResult::new(self.id(), metrics))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adapter_id() {
        let adapter = PolicyBundleAdapter::new();
        assert_eq!(adapter.id(), "policy_bundle_loading");
    }

    #[test]
    fn test_generate_bundle() {
        let adapter = PolicyBundleAdapter::new();
        let bundle = adapter.generate_bundle(5, 3);

        let policies = bundle["policies"].as_array().unwrap();
        assert_eq!(policies.len(), 5);

        let first_policy_rules = policies[0]["rules"].as_array().unwrap();
        assert_eq!(first_policy_rules.len(), 3);
    }

    #[test]
    fn test_complex_bundle() {
        let adapter = PolicyBundleAdapter::new();
        let bundle = adapter.generate_complex_bundle();

        let policies = bundle["policies"].as_array().unwrap();
        assert!(!policies.is_empty());

        // Check for nested conditions
        let first_rule = &policies[0]["rules"][0];
        assert!(first_rule["condition"]["operator"].as_str() == Some("AND"));
    }

    #[tokio::test]
    async fn test_run_benchmark() {
        let adapter = PolicyBundleAdapter::new();
        let result = adapter.run().await.unwrap();

        assert_eq!(result.target_id, "policy_bundle_loading");
        assert!(result.is_success());
    }
}
