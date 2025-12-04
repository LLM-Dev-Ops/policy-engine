//! Policy decision types.

use crate::policy::DecisionType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// The result of a policy evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    /// The type of decision
    pub decision: DecisionType,
    /// Whether the request is allowed
    pub allowed: bool,
    /// Human-readable reason for the decision
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// IDs of policies that matched
    #[serde(default)]
    pub matched_policies: Vec<String>,
    /// IDs of rules that matched
    #[serde(default)]
    pub matched_rules: Vec<String>,
    /// Time taken for evaluation in milliseconds
    pub evaluation_time_ms: f64,
    /// Modifications to apply (for modify decisions)
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub modifications: HashMap<String, serde_json::Value>,
    /// Additional metadata
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,
    /// Evaluation trace for debugging
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trace: Option<EvaluationTrace>,
}

impl PolicyDecision {
    /// Create a new allow decision.
    pub fn allow() -> Self {
        Self {
            decision: DecisionType::Allow,
            allowed: true,
            reason: None,
            matched_policies: Vec::new(),
            matched_rules: Vec::new(),
            evaluation_time_ms: 0.0,
            modifications: HashMap::new(),
            metadata: HashMap::new(),
            trace: None,
        }
    }

    /// Create a new deny decision.
    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            decision: DecisionType::Deny,
            allowed: false,
            reason: Some(reason.into()),
            matched_policies: Vec::new(),
            matched_rules: Vec::new(),
            evaluation_time_ms: 0.0,
            modifications: HashMap::new(),
            metadata: HashMap::new(),
            trace: None,
        }
    }

    /// Create a new warn decision.
    pub fn warn(reason: impl Into<String>) -> Self {
        Self {
            decision: DecisionType::Warn,
            allowed: true,
            reason: Some(reason.into()),
            matched_policies: Vec::new(),
            matched_rules: Vec::new(),
            evaluation_time_ms: 0.0,
            modifications: HashMap::new(),
            metadata: HashMap::new(),
            trace: None,
        }
    }

    /// Create a new modify decision.
    pub fn modify(modifications: HashMap<String, serde_json::Value>) -> Self {
        Self {
            decision: DecisionType::Modify,
            allowed: true,
            reason: None,
            matched_policies: Vec::new(),
            matched_rules: Vec::new(),
            evaluation_time_ms: 0.0,
            modifications,
            metadata: HashMap::new(),
            trace: None,
        }
    }

    /// Set the reason.
    pub fn with_reason(mut self, reason: impl Into<String>) -> Self {
        self.reason = Some(reason.into());
        self
    }

    /// Add a matched policy.
    pub fn with_matched_policy(mut self, policy_id: impl Into<String>) -> Self {
        self.matched_policies.push(policy_id.into());
        self
    }

    /// Add a matched rule.
    pub fn with_matched_rule(mut self, rule_id: impl Into<String>) -> Self {
        self.matched_rules.push(rule_id.into());
        self
    }

    /// Set the evaluation time.
    pub fn with_evaluation_time(mut self, duration: Duration) -> Self {
        self.evaluation_time_ms = duration.as_secs_f64() * 1000.0;
        self
    }

    /// Set the evaluation time in milliseconds.
    pub fn with_evaluation_time_ms(mut self, ms: f64) -> Self {
        self.evaluation_time_ms = ms;
        self
    }

    /// Add metadata.
    pub fn with_metadata(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }

    /// Add a modification.
    pub fn with_modification(mut self, field: impl Into<String>, value: serde_json::Value) -> Self {
        self.modifications.insert(field.into(), value);
        self
    }

    /// Set the evaluation trace.
    pub fn with_trace(mut self, trace: EvaluationTrace) -> Self {
        self.trace = Some(trace);
        self
    }

    /// Check if this decision is a success (not an error).
    pub fn is_success(&self) -> bool {
        true // Policy decisions are always successful; errors are handled separately
    }
}

impl Default for PolicyDecision {
    fn default() -> Self {
        Self::allow()
    }
}

/// Trace information for debugging policy evaluation.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EvaluationTrace {
    /// Steps taken during evaluation
    pub steps: Vec<TraceStep>,
    /// Total number of policies evaluated
    pub policies_evaluated: usize,
    /// Total number of rules evaluated
    pub rules_evaluated: usize,
    /// Whether the result was cached
    pub cached: bool,
}

impl EvaluationTrace {
    /// Create a new empty trace.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a trace step.
    pub fn add_step(&mut self, step: TraceStep) {
        self.steps.push(step);
    }

    /// Mark as cached.
    pub fn mark_cached(&mut self) {
        self.cached = true;
    }
}

/// A single step in the evaluation trace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceStep {
    /// Type of step
    pub step_type: TraceStepType,
    /// ID of the policy or rule
    pub id: String,
    /// Result of this step
    pub result: String,
    /// Duration of this step in microseconds
    pub duration_us: u64,
}

impl TraceStep {
    /// Create a policy evaluation step.
    pub fn policy(id: impl Into<String>, result: impl Into<String>, duration: Duration) -> Self {
        Self {
            step_type: TraceStepType::PolicyEvaluated,
            id: id.into(),
            result: result.into(),
            duration_us: duration.as_micros() as u64,
        }
    }

    /// Create a rule evaluation step.
    pub fn rule(id: impl Into<String>, result: impl Into<String>, duration: Duration) -> Self {
        Self {
            step_type: TraceStepType::RuleEvaluated,
            id: id.into(),
            result: result.into(),
            duration_us: duration.as_micros() as u64,
        }
    }

    /// Create a condition evaluation step.
    pub fn condition(id: impl Into<String>, result: impl Into<String>, duration: Duration) -> Self {
        Self {
            step_type: TraceStepType::ConditionEvaluated,
            id: id.into(),
            result: result.into(),
            duration_us: duration.as_micros() as u64,
        }
    }
}

/// Type of trace step.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TraceStepType {
    /// A policy was evaluated
    PolicyEvaluated,
    /// A rule was evaluated
    RuleEvaluated,
    /// A condition was evaluated
    ConditionEvaluated,
    /// Cache was checked
    CacheCheck,
    /// Integration was called
    IntegrationCall,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allow_decision() {
        let decision = PolicyDecision::allow();
        assert!(decision.allowed);
        assert_eq!(decision.decision, DecisionType::Allow);
    }

    #[test]
    fn test_deny_decision() {
        let decision = PolicyDecision::deny("Access denied");
        assert!(!decision.allowed);
        assert_eq!(decision.decision, DecisionType::Deny);
        assert_eq!(decision.reason, Some("Access denied".to_string()));
    }

    #[test]
    fn test_decision_builder_pattern() {
        let decision = PolicyDecision::deny("Policy violation")
            .with_matched_policy("policy-1")
            .with_matched_rule("rule-1")
            .with_evaluation_time_ms(5.5)
            .with_metadata("source", serde_json::json!("admin-policy"));

        assert_eq!(decision.matched_policies, vec!["policy-1"]);
        assert_eq!(decision.matched_rules, vec!["rule-1"]);
        assert_eq!(decision.evaluation_time_ms, 5.5);
        assert!(decision.metadata.contains_key("source"));
    }

    #[test]
    fn test_modify_decision() {
        let mut modifications = HashMap::new();
        modifications.insert("llm.maxTokens".to_string(), serde_json::json!(1000));

        let decision = PolicyDecision::modify(modifications);
        assert!(decision.allowed);
        assert_eq!(decision.decision, DecisionType::Modify);
        assert!(decision.modifications.contains_key("llm.maxTokens"));
    }

    #[test]
    fn test_decision_serialization() {
        let decision = PolicyDecision::deny("Test")
            .with_matched_policy("policy-1")
            .with_evaluation_time_ms(10.0);

        let json = serde_json::to_string(&decision).unwrap();
        let parsed: PolicyDecision = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.decision, decision.decision);
        assert_eq!(parsed.matched_policies, decision.matched_policies);
    }
}
