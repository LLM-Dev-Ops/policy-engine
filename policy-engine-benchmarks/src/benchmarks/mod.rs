//! Benchmarks module
//!
//! Contains the canonical benchmark infrastructure including:
//! - `BenchmarkResult` struct
//! - `run_all_benchmarks()` entrypoint
//! - Markdown report generation
//! - I/O utilities for results

pub mod result;
pub mod markdown;
pub mod io;

pub use result::BenchmarkResult;

use crate::adapters::{all_targets, BenchTarget};

/// Run all registered benchmarks and return results.
///
/// This is the canonical entrypoint for the benchmark suite.
/// It iterates through all registered `BenchTarget` implementations,
/// executes each benchmark, and collects the results.
///
/// # Returns
///
/// A vector of `BenchmarkResult` containing metrics for each benchmark target.
///
/// # Example
///
/// ```rust
/// use policy_engine_benchmarks::benchmarks::run_all_benchmarks;
///
/// #[tokio::main]
/// async fn main() {
///     let results = run_all_benchmarks().await;
///     for result in results {
///         println!("Target: {}, Metrics: {}", result.target_id, result.metrics);
///     }
/// }
/// ```
pub async fn run_all_benchmarks() -> Vec<BenchmarkResult> {
    let targets = all_targets();
    let mut results = Vec::with_capacity(targets.len());

    tracing::info!("Running {} benchmark targets", targets.len());

    for target in targets {
        let target_id = target.id().to_string();
        tracing::info!("Running benchmark: {}", target_id);

        match target.run().await {
            Ok(result) => {
                tracing::info!("Benchmark {} completed successfully", target_id);
                results.push(result);
            }
            Err(e) => {
                tracing::error!("Benchmark {} failed: {}", target_id, e);
                // Create a failed result entry
                results.push(BenchmarkResult::failed(&target_id, &e.to_string()));
            }
        }
    }

    tracing::info!("Completed {} benchmarks", results.len());
    results
}
