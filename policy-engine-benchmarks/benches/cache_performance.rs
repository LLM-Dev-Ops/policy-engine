//! Cache Performance Benchmark (Criterion)
//!
//! This benchmark measures cache hit/miss performance simulation
//! for policy evaluation caching.

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId, Throughput};
use std::collections::HashMap;
use serde_json::json;

/// Simulated cache for benchmarking.
struct MockCache {
    data: HashMap<String, serde_json::Value>,
}

impl MockCache {
    fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.data.get(key)
    }

    fn set(&mut self, key: String, value: serde_json::Value) {
        self.data.insert(key, value);
    }

    fn populate(&mut self, count: usize) {
        for i in 0..count {
            let key = format!("policy-{}", i);
            let value = json!({
                "id": key.clone(),
                "decision": "ALLOW",
                "cached": true
            });
            self.set(key, value);
        }
    }
}

fn benchmark_cache_hit(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache_hit");

    for size in [100, 1000, 10000].iter() {
        let mut cache = MockCache::new();
        cache.populate(*size);

        group.throughput(Throughput::Elements(1));
        group.bench_with_input(
            BenchmarkId::new("size", size),
            &cache,
            |b, cache| {
                let key = "policy-50";
                b.iter(|| {
                    std::hint::black_box(cache.get(key));
                });
            },
        );
    }

    group.finish();
}

fn benchmark_cache_miss(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache_miss");

    for size in [100, 1000, 10000].iter() {
        let mut cache = MockCache::new();
        cache.populate(*size);

        group.throughput(Throughput::Elements(1));
        group.bench_with_input(
            BenchmarkId::new("size", size),
            &cache,
            |b, cache| {
                let key = "nonexistent-policy";
                b.iter(|| {
                    std::hint::black_box(cache.get(key));
                });
            },
        );
    }

    group.finish();
}

fn benchmark_cache_set(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache_set");

    let value = json!({
        "id": "new-policy",
        "decision": "ALLOW",
        "cached": true,
        "metadata": {
            "created": "2024-01-15T10:30:00Z",
            "priority": 100
        }
    });

    for size in [100, 1000, 10000].iter() {
        group.throughput(Throughput::Elements(1));
        group.bench_function(
            BenchmarkId::new("size", size),
            |b| {
                let mut cache = MockCache::new();
                cache.populate(*size);
                let mut counter = 0;

                b.iter(|| {
                    let key = format!("new-policy-{}", counter);
                    cache.set(key, value.clone());
                    counter += 1;
                });
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    benchmark_cache_hit,
    benchmark_cache_miss,
    benchmark_cache_set
);

criterion_main!(benches);
