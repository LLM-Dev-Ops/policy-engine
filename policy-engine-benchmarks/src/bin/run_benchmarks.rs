//! Policy Engine Benchmark Runner CLI
//!
//! Command-line interface for running the canonical benchmark suite
//! and writing results to the standard output directories.
//!
//! Usage:
//!   run_benchmarks [OPTIONS]
//!
//! Options:
//!   -o, --output <DIR>    Output directory for results (default: benchmarks/output)
//!   -f, --filter <PATTERN>  Only run benchmarks matching pattern
//!   -v, --verbose         Enable verbose output
//!   --json                Output results as JSON to stdout
//!   --no-write            Don't write results to files

use clap::Parser;
use policy_engine_benchmarks::benchmarks::{self, io, BenchmarkResult};
use policy_engine_benchmarks::adapters::all_targets;
use std::path::PathBuf;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

/// Policy Engine Benchmark Runner
///
/// Runs the canonical benchmark suite for the Policy Engine and outputs
/// results in the standardized format used across all benchmark-target repositories.
#[derive(Parser, Debug)]
#[command(name = "run_benchmarks")]
#[command(author = "LLM Policy Engine Team")]
#[command(version = "0.1.0")]
#[command(about = "Run Policy Engine benchmarks and generate reports")]
struct Args {
    /// Output directory for benchmark results
    #[arg(short, long, default_value = ".")]
    output: PathBuf,

    /// Only run benchmarks matching this pattern
    #[arg(short, long)]
    filter: Option<String>,

    /// Enable verbose output
    #[arg(short, long)]
    verbose: bool,

    /// Output results as JSON to stdout
    #[arg(long)]
    json: bool,

    /// Don't write results to files
    #[arg(long)]
    no_write: bool,

    /// List available benchmarks without running them
    #[arg(long)]
    list: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    // Initialize logging
    let log_level = if args.verbose { Level::DEBUG } else { Level::INFO };
    let subscriber = FmtSubscriber::builder()
        .with_max_level(log_level)
        .with_target(false)
        .with_thread_ids(false)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    // Handle --list flag
    if args.list {
        println!("Available benchmark targets:\n");
        for target in all_targets() {
            println!("  {} - {}", target.id(), target.description());
        }
        return Ok(());
    }

    info!("Policy Engine Benchmark Suite");
    info!("==============================\n");

    // Get targets, optionally filtering
    let targets = all_targets();
    let filtered_targets: Vec<_> = if let Some(pattern) = &args.filter {
        targets
            .into_iter()
            .filter(|t| t.id().contains(pattern.as_str()))
            .collect()
    } else {
        targets
    };

    if filtered_targets.is_empty() {
        eprintln!("No benchmarks match the filter pattern");
        return Ok(());
    }

    info!("Running {} benchmarks...\n", filtered_targets.len());

    // Run benchmarks
    let mut results: Vec<BenchmarkResult> = Vec::new();

    for target in &filtered_targets {
        info!("[{}] Running...", target.id());

        match target.run().await {
            Ok(result) => {
                if let Some(duration) = result.duration_ms() {
                    info!("[{}] Completed in {:.2}ms", target.id(), duration);
                } else {
                    info!("[{}] Completed", target.id());
                }
                results.push(result);
            }
            Err(e) => {
                info!("[{}] Failed: {}", target.id(), e);
                results.push(BenchmarkResult::failed(target.id(), e.to_string()));
            }
        }
    }

    info!("\n==============================");
    info!("Benchmark run complete!\n");

    // Output results
    if args.json {
        let json = serde_json::to_string_pretty(&results)?;
        println!("{}", json);
    } else {
        // Print summary table
        println!("\nResults Summary:");
        println!("{:-<70}", "");
        println!("{:<30} {:>15} {:>10} {:>10}", "Target", "Duration (ms)", "Throughput", "Status");
        println!("{:-<70}", "");

        for result in &results {
            let duration = result
                .duration_ms()
                .map(|d| format!("{:.2}", d))
                .unwrap_or_else(|| "N/A".to_string());

            let throughput = result
                .throughput()
                .map(|t| format!("{:.1}", t))
                .unwrap_or_else(|| "N/A".to_string());

            let status = if result.is_success() { "OK" } else { "FAIL" };

            println!("{:<30} {:>15} {:>10} {:>10}", result.target_id, duration, throughput, status);
        }

        println!("{:-<70}\n", "");
    }

    // Write results to files
    if !args.no_write {
        info!("Writing results to {}...", args.output.display());
        io::write_results(&results, &args.output)?;
        info!("Results written successfully!");
        info!("  - Summary: {}/benchmarks/output/summary.md", args.output.display());
        info!("  - Raw data: {}/benchmarks/output/raw/", args.output.display());
    }

    // Exit with error code if any benchmarks failed
    let failed_count = results.iter().filter(|r| !r.is_success()).count();
    if failed_count > 0 {
        eprintln!("\n{} benchmark(s) failed", failed_count);
        std::process::exit(1);
    }

    Ok(())
}
