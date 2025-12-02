//! Policy Engine Benchmarks
//!
//! Canonical benchmark suite for the LLM Policy Engine, compatible with
//! the standardized benchmark interface used across all 25 benchmark-target repositories.
//!
//! This crate provides:
//! - `BenchmarkResult` struct with standardized fields
//! - `BenchTarget` trait for benchmark adapters
//! - `run_all_benchmarks()` entrypoint returning `Vec<BenchmarkResult>`
//! - TypeScript-Rust bridge adapters for Policy Engine operations

pub mod benchmarks;
pub mod adapters;

pub use benchmarks::{run_all_benchmarks, BenchmarkResult};
pub use adapters::{BenchTarget, all_targets};
