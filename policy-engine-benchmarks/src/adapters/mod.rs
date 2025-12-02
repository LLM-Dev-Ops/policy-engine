//! Adapters Module
//!
//! Contains the canonical `BenchTarget` trait and adapter implementations
//! for Policy Engine operations.
//!
//! This module provides:
//! - `BenchTarget` trait with `id()` and `run()` methods
//! - `all_targets()` registry returning `Vec<Box<dyn BenchTarget>>`
//! - TypeScript-Rust bridge adapters for Policy Engine operations

pub mod policy_evaluation;
pub mod condition_parsing;
pub mod decision_tree;
pub mod policy_bundle;
pub mod bridge;

use crate::benchmarks::BenchmarkResult;
use async_trait::async_trait;
use std::error::Error;

pub use policy_evaluation::PolicyEvaluationAdapter;
pub use condition_parsing::ConditionParsingAdapter;
pub use decision_tree::DecisionTreeAdapter;
pub use policy_bundle::PolicyBundleAdapter;

/// Canonical benchmark target trait.
///
/// All benchmark adapters must implement this trait to be registered
/// in the benchmark suite. The trait provides a standard interface
/// for identifying and running benchmarks.
///
/// # Required Methods
///
/// * `id()` - Returns a unique identifier for this benchmark target
/// * `run()` - Executes the benchmark and returns results
///
/// # Example
///
/// ```rust
/// use policy_engine_benchmarks::adapters::BenchTarget;
/// use policy_engine_benchmarks::benchmarks::BenchmarkResult;
/// use async_trait::async_trait;
///
/// struct MyBenchmark;
///
/// #[async_trait]
/// impl BenchTarget for MyBenchmark {
///     fn id(&self) -> &str {
///         "my_benchmark"
///     }
///
///     async fn run(&self) -> Result<BenchmarkResult, Box<dyn std::error::Error + Send + Sync>> {
///         // Run benchmark logic
///         Ok(BenchmarkResult::new("my_benchmark", serde_json::json!({"duration_ms": 10.0})))
///     }
/// }
/// ```
#[async_trait]
pub trait BenchTarget: Send + Sync {
    /// Returns the unique identifier for this benchmark target.
    ///
    /// The ID should be:
    /// - Descriptive of what is being benchmarked
    /// - Valid as a filename (alphanumeric, hyphens, underscores)
    /// - Unique across all benchmark targets
    fn id(&self) -> &str;

    /// Execute the benchmark and return results.
    ///
    /// This method should:
    /// 1. Set up any required test data
    /// 2. Execute the operation being benchmarked (possibly multiple times)
    /// 3. Measure timing and collect metrics
    /// 4. Return a `BenchmarkResult` with the collected metrics
    ///
    /// # Errors
    ///
    /// Returns an error if the benchmark cannot be executed.
    async fn run(&self) -> Result<BenchmarkResult, Box<dyn Error + Send + Sync>>;

    /// Optional: Get a human-readable description of this benchmark.
    fn description(&self) -> &str {
        "No description provided"
    }

    /// Optional: Get the expected duration category.
    fn duration_category(&self) -> DurationCategory {
        DurationCategory::Medium
    }
}

/// Duration category for benchmarks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurationCategory {
    /// Fast benchmarks (< 1 second)
    Fast,
    /// Medium benchmarks (1-10 seconds)
    Medium,
    /// Slow benchmarks (> 10 seconds)
    Slow,
}

/// Registry of all benchmark targets.
///
/// Returns a vector of all registered benchmark target implementations.
/// This is the canonical way to discover and run all benchmarks.
///
/// # Returns
///
/// A vector of boxed `BenchTarget` implementations.
///
/// # Example
///
/// ```rust
/// use policy_engine_benchmarks::adapters::all_targets;
///
/// let targets = all_targets();
/// println!("Found {} benchmark targets", targets.len());
/// for target in &targets {
///     println!("  - {}: {}", target.id(), target.description());
/// }
/// ```
pub fn all_targets() -> Vec<Box<dyn BenchTarget>> {
    vec![
        Box::new(PolicyEvaluationAdapter::new()),
        Box::new(ConditionParsingAdapter::new()),
        Box::new(DecisionTreeAdapter::new()),
        Box::new(PolicyBundleAdapter::new()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_targets_not_empty() {
        let targets = all_targets();
        assert!(!targets.is_empty(), "Should have at least one benchmark target");
    }

    #[test]
    fn test_unique_ids() {
        let targets = all_targets();
        let mut ids: Vec<&str> = targets.iter().map(|t| t.id()).collect();
        ids.sort();
        let original_len = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), original_len, "All target IDs should be unique");
    }
}
