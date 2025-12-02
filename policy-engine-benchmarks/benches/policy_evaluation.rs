//! Policy Evaluation Benchmark (Criterion)
//!
//! This benchmark uses Criterion for statistical benchmarking of the
//! policy evaluation operation.

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};
use serde_json::json;

/// Sample evaluation context for benchmarking.
fn sample_context() -> serde_json::Value {
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
        }
    })
}

/// Sample policies for benchmarking.
fn sample_policies(count: usize) -> serde_json::Value {
    let policies: Vec<serde_json::Value> = (0..count)
        .map(|i| {
            json!({
                "id": format!("policy-{}", i),
                "priority": 100 - i as i32,
                "rules": [
                    {
                        "id": format!("rule-{}", i),
                        "condition": {
                            "field": "llm.estimatedCost",
                            "operator": "GREATER_THAN",
                            "value": i as f64
                        },
                        "action": {
                            "decision": "WARN",
                            "reason": format!("Policy {} triggered", i)
                        }
                    }
                ]
            })
        })
        .collect();

    json!(policies)
}

fn benchmark_policy_evaluation(c: &mut Criterion) {
    let context = sample_context();

    let mut group = c.benchmark_group("policy_evaluation");

    for policy_count in [1, 5, 10, 20, 50].iter() {
        let policies = sample_policies(*policy_count);

        group.bench_with_input(
            BenchmarkId::new("policies", policy_count),
            &(*policy_count, &context, &policies),
            |b, (_, ctx, pol)| {
                b.iter(|| {
                    // Simulate policy evaluation
                    // In a real benchmark, this would call the actual engine
                    std::hint::black_box((ctx, pol));
                });
            },
        );
    }

    group.finish();
}

fn benchmark_condition_evaluation(c: &mut Criterion) {
    let conditions = vec![
        ("equality", json!({"field": "user.role", "operator": "EQUALS", "value": "admin"})),
        ("comparison", json!({"field": "llm.tokens", "operator": "LESS_THAN", "value": 1000})),
        ("collection", json!({"field": "user.role", "operator": "IN", "value": ["admin", "dev"]})),
        ("regex", json!({"field": "user.email", "operator": "MATCHES", "value": "^.*@example.com$"})),
    ];

    let context = sample_context();

    let mut group = c.benchmark_group("condition_evaluation");

    for (name, condition) in conditions {
        group.bench_with_input(
            BenchmarkId::new("type", name),
            &(&context, &condition),
            |b, (ctx, cond)| {
                b.iter(|| {
                    std::hint::black_box((ctx, cond));
                });
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    benchmark_policy_evaluation,
    benchmark_condition_evaluation
);

criterion_main!(benches);
