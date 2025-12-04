//! Policy evaluator implementation.

use crate::api::{EvaluationContext, PolicyDecision};
use crate::policy::{
    Condition, ConditionOperator, ConditionValue, DecisionType, Policy, PolicyRule,
};
use crate::Result;

use std::time::Instant;

/// The policy evaluator that processes policies against contexts.
pub struct Evaluator {
    /// Whether to include trace information in decisions
    enable_tracing: bool,
}

impl Evaluator {
    /// Create a new evaluator.
    pub fn new() -> Self {
        Self {
            enable_tracing: false,
        }
    }

    /// Enable or disable tracing.
    pub fn with_tracing(mut self, enabled: bool) -> Self {
        self.enable_tracing = enabled;
        self
    }

    /// Evaluate policies against the given context.
    ///
    /// Policies are evaluated in priority order (highest first).
    /// Rules within each policy are also evaluated in priority order.
    /// The first deny decision takes precedence.
    pub fn evaluate(&self, policies: &[Policy], context: &EvaluationContext) -> Result<PolicyDecision> {
        let start = Instant::now();
        let mut result = PolicyDecision::allow();
        let mut matched_policies = Vec::new();
        let mut matched_rules = Vec::new();

        for policy in policies {
            if !policy.enabled {
                continue;
            }

            let policy_result = self.evaluate_policy(policy, context)?;

            if policy_result.decision == DecisionType::Deny {
                // Deny takes precedence
                result = policy_result;
                result.matched_policies = vec![policy.id.clone()];
                break;
            }

            if policy_result.decision == DecisionType::Warn {
                // Collect warnings
                if result.decision == DecisionType::Allow {
                    result = policy_result;
                }
                matched_policies.push(policy.id.clone());
            }

            if policy_result.decision == DecisionType::Modify {
                // Merge modifications
                result.decision = DecisionType::Modify;
                for (key, value) in policy_result.modifications {
                    result.modifications.insert(key, value);
                }
                matched_policies.push(policy.id.clone());
            }

            matched_rules.extend(policy_result.matched_rules);
        }

        if !matched_policies.is_empty() {
            result.matched_policies = matched_policies;
        }
        if !matched_rules.is_empty() {
            result.matched_rules = matched_rules;
        }

        result.evaluation_time_ms = start.elapsed().as_secs_f64() * 1000.0;
        Ok(result)
    }

    /// Evaluate a single policy.
    fn evaluate_policy(&self, policy: &Policy, context: &EvaluationContext) -> Result<PolicyDecision> {
        let mut result = PolicyDecision::allow();
        let mut matched_rules = Vec::new();

        // Get enabled rules sorted by priority
        let mut rules: Vec<_> = policy.enabled_rules().collect();
        rules.sort_by(|a, b| b.priority.cmp(&a.priority));

        for rule in rules {
            let rule_matched = self.evaluate_condition(&rule.condition, context)?;

            if rule_matched {
                matched_rules.push(rule.id.clone());

                // Apply the rule's action
                let decision = match rule.action.decision {
                    DecisionType::Allow => PolicyDecision::allow(),
                    DecisionType::Deny => {
                        let mut d = PolicyDecision::deny(
                            rule.action.reason.clone().unwrap_or_else(|| {
                                format!("Denied by rule: {}", rule.name)
                            }),
                        );
                        d.metadata = rule
                            .action
                            .metadata
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect();
                        d
                    }
                    DecisionType::Warn => {
                        let mut d = PolicyDecision::warn(
                            rule.action.reason.clone().unwrap_or_else(|| {
                                format!("Warning from rule: {}", rule.name)
                            }),
                        );
                        d.metadata = rule
                            .action
                            .metadata
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect();
                        d
                    }
                    DecisionType::Modify => {
                        let mut modifications = std::collections::HashMap::new();
                        for modification in &rule.action.modifications {
                            if let Some(value) = &modification.value {
                                modifications.insert(modification.field.clone(), value.clone());
                            }
                        }
                        PolicyDecision::modify(modifications)
                    }
                };

                // Deny takes immediate precedence
                if decision.decision == DecisionType::Deny {
                    result = decision;
                    result.matched_rules = matched_rules;
                    return Ok(result);
                }

                // Update result for non-deny decisions
                if result.decision == DecisionType::Allow {
                    result = decision;
                } else if result.decision == DecisionType::Modify && decision.decision == DecisionType::Modify {
                    // Merge modifications
                    for (key, value) in decision.modifications {
                        result.modifications.insert(key, value);
                    }
                }
            }
        }

        result.matched_rules = matched_rules;
        Ok(result)
    }

    /// Evaluate a condition against the context.
    pub fn evaluate_condition(&self, condition: &Condition, context: &EvaluationContext) -> Result<bool> {
        match condition.operator {
            ConditionOperator::And => {
                for nested in &condition.conditions {
                    if !self.evaluate_condition(nested, context)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            ConditionOperator::Or => {
                for nested in &condition.conditions {
                    if self.evaluate_condition(nested, context)? {
                        return Ok(true);
                    }
                }
                Ok(false)
            }
            ConditionOperator::Not => {
                if condition.conditions.is_empty() {
                    return Err(crate::Error::evaluation("NOT condition requires a nested condition"));
                }
                Ok(!self.evaluate_condition(&condition.conditions[0], context)?)
            }
            _ => self.evaluate_comparison(condition, context),
        }
    }

    /// Evaluate a comparison condition.
    fn evaluate_comparison(&self, condition: &Condition, context: &EvaluationContext) -> Result<bool> {
        let field = condition.field.as_ref().ok_or_else(|| {
            crate::Error::evaluation("Condition requires a field")
        })?;

        let context_value = context.get(field);

        match condition.operator {
            ConditionOperator::Exists => Ok(context_value.is_some()),
            ConditionOperator::NotExists => Ok(context_value.is_none()),
            _ => {
                let expected = condition.value.as_ref().ok_or_else(|| {
                    crate::Error::evaluation("Condition requires a value")
                })?;

                match context_value {
                    Some(actual) => self.compare_values(&condition.operator, &actual, expected),
                    None => Ok(false), // Field doesn't exist, comparison fails
                }
            }
        }
    }

    /// Compare two values using the given operator.
    fn compare_values(
        &self,
        operator: &ConditionOperator,
        actual: &serde_json::Value,
        expected: &ConditionValue,
    ) -> Result<bool> {
        match operator {
            ConditionOperator::Equals => Ok(values_equal(actual, expected)),
            ConditionOperator::NotEquals => Ok(!values_equal(actual, expected)),
            ConditionOperator::GreaterThan => compare_numeric(actual, expected, |a, b| a > b),
            ConditionOperator::GreaterThanOrEquals => compare_numeric(actual, expected, |a, b| a >= b),
            ConditionOperator::LessThan => compare_numeric(actual, expected, |a, b| a < b),
            ConditionOperator::LessThanOrEquals => compare_numeric(actual, expected, |a, b| a <= b),
            ConditionOperator::In => {
                if let ConditionValue::Array(arr) = expected {
                    Ok(arr.iter().any(|v| values_equal(actual, v)))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::NotIn => {
                if let ConditionValue::Array(arr) = expected {
                    Ok(!arr.iter().any(|v| values_equal(actual, v)))
                } else {
                    Ok(true)
                }
            }
            ConditionOperator::Contains => {
                if let (serde_json::Value::String(actual_str), ConditionValue::String(expected_str)) =
                    (actual, expected)
                {
                    Ok(actual_str.contains(expected_str))
                } else if let serde_json::Value::Array(arr) = actual {
                    let expected_json = condition_value_to_json(expected);
                    Ok(arr.contains(&expected_json))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::StartsWith => {
                if let (serde_json::Value::String(actual_str), ConditionValue::String(expected_str)) =
                    (actual, expected)
                {
                    Ok(actual_str.starts_with(expected_str))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::EndsWith => {
                if let (serde_json::Value::String(actual_str), ConditionValue::String(expected_str)) =
                    (actual, expected)
                {
                    Ok(actual_str.ends_with(expected_str))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::Matches => {
                if let (serde_json::Value::String(actual_str), ConditionValue::String(pattern)) =
                    (actual, expected)
                {
                    let regex = regex::Regex::new(pattern).map_err(|e| {
                        crate::Error::expression_with_expr(
                            format!("Invalid regex: {}", e),
                            pattern.clone(),
                        )
                    })?;
                    Ok(regex.is_match(actual_str))
                } else {
                    Ok(false)
                }
            }
            _ => Ok(false),
        }
    }
}

impl Default for Evaluator {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if a JSON value equals a condition value.
fn values_equal(actual: &serde_json::Value, expected: &ConditionValue) -> bool {
    match (actual, expected) {
        (serde_json::Value::String(a), ConditionValue::String(e)) => a == e,
        (serde_json::Value::Number(a), ConditionValue::Integer(e)) => {
            a.as_i64().map(|n| n == *e).unwrap_or(false)
        }
        (serde_json::Value::Number(a), ConditionValue::Float(e)) => {
            a.as_f64().map(|n| (n - e).abs() < f64::EPSILON).unwrap_or(false)
        }
        (serde_json::Value::Bool(a), ConditionValue::Boolean(e)) => a == e,
        (serde_json::Value::Null, ConditionValue::Null) => true,
        (serde_json::Value::Array(actual_arr), ConditionValue::Array(expected_arr)) => {
            if actual_arr.len() != expected_arr.len() {
                return false;
            }
            actual_arr
                .iter()
                .zip(expected_arr.iter())
                .all(|(a, e)| values_equal(a, e))
        }
        _ => false,
    }
}

/// Compare numeric values using a comparison function.
fn compare_numeric<F>(actual: &serde_json::Value, expected: &ConditionValue, cmp: F) -> Result<bool>
where
    F: Fn(f64, f64) -> bool,
{
    let actual_num = actual.as_f64().ok_or_else(|| {
        crate::Error::evaluation("Expected numeric value for comparison")
    })?;

    let expected_num = match expected {
        ConditionValue::Integer(n) => *n as f64,
        ConditionValue::Float(n) => *n,
        _ => {
            return Err(crate::Error::evaluation(
                "Expected numeric value for comparison",
            ))
        }
    };

    Ok(cmp(actual_num, expected_num))
}

/// Convert a ConditionValue to a JSON value.
fn condition_value_to_json(value: &ConditionValue) -> serde_json::Value {
    match value {
        ConditionValue::String(s) => serde_json::Value::String(s.clone()),
        ConditionValue::Integer(n) => serde_json::json!(n),
        ConditionValue::Float(n) => serde_json::json!(n),
        ConditionValue::Boolean(b) => serde_json::Value::Bool(*b),
        ConditionValue::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(condition_value_to_json).collect())
        }
        ConditionValue::Null => serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::EvaluationContext;
    use crate::policy::{Action, PolicyRule};

    fn sample_policy() -> Policy {
        Policy::builder("test-policy")
            .name("Test Policy")
            .rule(PolicyRule::new(
                "deny-guests",
                "Deny guest users",
                Condition::equals("user.roles", vec!["guest".to_string()]),
                Action::deny("Guests are not allowed"),
            ))
            .rule(PolicyRule::new(
                "allow-admins",
                "Allow admin users",
                Condition::is_in(
                    "user.roles",
                    vec!["admin".into(), "superadmin".into()],
                ),
                Action::allow(),
            ))
            .build()
    }

    #[test]
    fn test_evaluator_allow() {
        let evaluator = Evaluator::new();
        let policies = vec![sample_policy()];

        let context = EvaluationContext::builder()
            .with_user("user-123", None, vec!["admin".to_string()])
            .build();

        let result = evaluator.evaluate(&policies, &context).unwrap();
        assert!(result.allowed);
        assert_eq!(result.decision, DecisionType::Allow);
    }

    #[test]
    fn test_condition_equals() {
        let evaluator = Evaluator::new();
        let context = EvaluationContext::builder()
            .with_model("gpt-4")
            .build();

        let condition = Condition::equals("llm.model", "gpt-4");
        assert!(evaluator.evaluate_condition(&condition, &context).unwrap());

        let condition = Condition::equals("llm.model", "gpt-3.5-turbo");
        assert!(!evaluator.evaluate_condition(&condition, &context).unwrap());
    }

    #[test]
    fn test_condition_greater_than() {
        let evaluator = Evaluator::new();
        let context = EvaluationContext::builder()
            .with_max_tokens(2000)
            .build();

        let condition = Condition::greater_than("llm.maxTokens", 1000i64);
        assert!(evaluator.evaluate_condition(&condition, &context).unwrap());

        let condition = Condition::greater_than("llm.maxTokens", 3000i64);
        assert!(!evaluator.evaluate_condition(&condition, &context).unwrap());
    }

    #[test]
    fn test_condition_and() {
        let evaluator = Evaluator::new();
        let context = EvaluationContext::builder()
            .with_model("gpt-4")
            .with_provider("openai")
            .build();

        let condition = Condition::and(vec![
            Condition::equals("llm.model", "gpt-4"),
            Condition::equals("llm.provider", "openai"),
        ]);
        assert!(evaluator.evaluate_condition(&condition, &context).unwrap());

        let condition = Condition::and(vec![
            Condition::equals("llm.model", "gpt-4"),
            Condition::equals("llm.provider", "anthropic"),
        ]);
        assert!(!evaluator.evaluate_condition(&condition, &context).unwrap());
    }

    #[test]
    fn test_condition_or() {
        let evaluator = Evaluator::new();
        let context = EvaluationContext::builder()
            .with_model("gpt-4")
            .build();

        let condition = Condition::or(vec![
            Condition::equals("llm.model", "gpt-4"),
            Condition::equals("llm.model", "claude-3"),
        ]);
        assert!(evaluator.evaluate_condition(&condition, &context).unwrap());
    }

    #[test]
    fn test_condition_exists() {
        let evaluator = Evaluator::new();
        let context = EvaluationContext::builder()
            .with_model("gpt-4")
            .build();

        let condition = Condition::exists("llm.model");
        assert!(evaluator.evaluate_condition(&condition, &context).unwrap());

        let condition = Condition::exists("user.id");
        assert!(!evaluator.evaluate_condition(&condition, &context).unwrap());
    }
}
