//! # LLM Policy Engine
//!
//! High-performance policy engine for LLM operations. This crate provides a comprehensive
//! policy evaluation framework that integrates with the LLM Dev Ops platform stack.
//!
//! ## Features
//!
//! - **Policy Validation**: Validate policy documents against schema
//! - **Rule Evaluation**: Evaluate policy rules against request contexts
//! - **Decision Making**: Return allow/deny/warn/modify decisions
//! - **Telemetry Integration**: Full OpenTelemetry support for distributed tracing
//! - **High Performance**: Optimized for low-latency policy evaluation
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use llm_policy_engine::{PolicyEngine, EvaluationContext, PolicyDecision};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create a policy engine with default configuration
//!     let engine = PolicyEngine::builder()
//!         .with_cache_enabled(true)
//!         .with_telemetry_enabled(true)
//!         .build()
//!         .await?;
//!
//!     // Create an evaluation context
//!     let context = EvaluationContext::builder()
//!         .with_user_id("user-123")
//!         .with_model("gpt-4")
//!         .with_provider("openai")
//!         .build();
//!
//!     // Evaluate policies
//!     let decision = engine.evaluate(&context).await?;
//!
//!     match decision.decision {
//!         DecisionType::Allow => println!("Request allowed"),
//!         DecisionType::Deny => println!("Request denied: {}", decision.reason.unwrap_or_default()),
//!         _ => {}
//!     }
//!
//!     Ok(())
//! }
//! ```
//!
//! ## Integration with LLM Dev Ops Platform
//!
//! This crate is designed to work seamlessly with other LLM Dev Ops repositories:
//!
//! - **incident-manager**: Policy violation alerting and incident creation
//! - **shield**: Prompt injection and threat detection integration
//! - **sentinel**: Security monitoring and compliance
//! - **cost-ops**: Budget enforcement and cost tracking
//! - **edge-agent**: Policy distribution to edge locations

#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

pub mod api;
pub mod cache;
pub mod config;
pub mod core;
pub mod error;
pub mod integration;
pub mod policy;
pub mod telemetry;

// Re-export main types for convenience
pub use api::{
    EvaluationContext, EvaluationContextBuilder, PolicyDecision, PolicyEngine, PolicyEngineBuilder,
};
pub use config::Config;
pub use error::{Error, Result};
pub use policy::{
    Action, ActionType, Condition, ConditionOperator, DecisionType, Policy, PolicyDocument,
    PolicyMetadata, PolicyRule,
};

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Library name
pub const NAME: &str = env!("CARGO_PKG_NAME");
