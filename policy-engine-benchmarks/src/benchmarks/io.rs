//! I/O Utilities for Benchmark Results
//!
//! Provides functionality for reading and writing benchmark results
//! to the canonical output directories.

use super::BenchmarkResult;
use std::fs;
use std::io;
use std::path::Path;

/// Default output directory for benchmark results.
pub const OUTPUT_DIR: &str = "benchmarks/output";

/// Default directory for raw JSON results.
pub const RAW_OUTPUT_DIR: &str = "benchmarks/output/raw";

/// Write benchmark results to the output directories.
///
/// This function:
/// 1. Creates the output directories if they don't exist
/// 2. Writes raw JSON results to `benchmarks/output/raw/`
/// 3. Generates and writes `summary.md` to `benchmarks/output/`
///
/// # Arguments
///
/// * `results` - Vector of benchmark results to write
/// * `base_path` - Base path for the output directories (usually the crate root)
///
/// # Errors
///
/// Returns an error if directory creation or file writing fails.
pub fn write_results(results: &[BenchmarkResult], base_path: &Path) -> io::Result<()> {
    let output_dir = base_path.join(OUTPUT_DIR);
    let raw_dir = base_path.join(RAW_OUTPUT_DIR);

    // Create directories
    fs::create_dir_all(&output_dir)?;
    fs::create_dir_all(&raw_dir)?;

    // Write raw JSON results
    for result in results {
        let filename = format!("{}.json", sanitize_filename(&result.target_id));
        let filepath = raw_dir.join(filename);
        let json = serde_json::to_string_pretty(result)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(filepath, json)?;
    }

    // Write combined results
    let all_results_path = raw_dir.join("all_results.json");
    let all_json = serde_json::to_string_pretty(results)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(all_results_path, all_json)?;

    // Generate and write summary.md
    let summary = super::markdown::generate_summary(results);
    let summary_path = output_dir.join("summary.md");
    fs::write(summary_path, summary)?;

    tracing::info!(
        "Wrote {} results to {}",
        results.len(),
        output_dir.display()
    );

    Ok(())
}

/// Read all benchmark results from the raw output directory.
///
/// # Arguments
///
/// * `base_path` - Base path for the output directories
///
/// # Returns
///
/// A vector of benchmark results, or an error if reading fails.
pub fn read_results(base_path: &Path) -> io::Result<Vec<BenchmarkResult>> {
    let all_results_path = base_path.join(RAW_OUTPUT_DIR).join("all_results.json");

    if !all_results_path.exists() {
        return Ok(Vec::new());
    }

    let json = fs::read_to_string(all_results_path)?;
    let results: Vec<BenchmarkResult> = serde_json::from_str(&json)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    Ok(results)
}

/// Read a single benchmark result by target ID.
///
/// # Arguments
///
/// * `base_path` - Base path for the output directories
/// * `target_id` - The target ID to look up
///
/// # Returns
///
/// The benchmark result if found, None otherwise.
pub fn read_result(base_path: &Path, target_id: &str) -> io::Result<Option<BenchmarkResult>> {
    let filename = format!("{}.json", sanitize_filename(target_id));
    let filepath = base_path.join(RAW_OUTPUT_DIR).join(filename);

    if !filepath.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(filepath)?;
    let result: BenchmarkResult = serde_json::from_str(&json)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    Ok(Some(result))
}

/// Sanitize a string for use as a filename.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Ensure output directories exist.
pub fn ensure_output_dirs(base_path: &Path) -> io::Result<()> {
    fs::create_dir_all(base_path.join(OUTPUT_DIR))?;
    fs::create_dir_all(base_path.join(RAW_OUTPUT_DIR))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    #[test]
    fn test_write_and_read_results() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        let results = vec![
            BenchmarkResult::new("test_1", json!({"duration_ms": 10.0})),
            BenchmarkResult::new("test_2", json!({"duration_ms": 20.0})),
        ];

        write_results(&results, base_path).unwrap();

        // Verify files exist
        assert!(base_path.join(OUTPUT_DIR).join("summary.md").exists());
        assert!(base_path.join(RAW_OUTPUT_DIR).join("all_results.json").exists());
        assert!(base_path.join(RAW_OUTPUT_DIR).join("test_1.json").exists());
        assert!(base_path.join(RAW_OUTPUT_DIR).join("test_2.json").exists());

        // Read back results
        let read_results = read_results(base_path).unwrap();
        assert_eq!(read_results.len(), 2);

        // Read single result
        let single = read_result(base_path, "test_1").unwrap();
        assert!(single.is_some());
        assert_eq!(single.unwrap().target_id, "test_1");
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("simple"), "simple");
        assert_eq!(sanitize_filename("with spaces"), "with_spaces");
        assert_eq!(sanitize_filename("with/slashes"), "with_slashes");
        assert_eq!(sanitize_filename("kebab-case"), "kebab-case");
        assert_eq!(sanitize_filename("under_score"), "under_score");
    }
}
