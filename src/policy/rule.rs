//! Policy rule definitions.

use super::{Action, Condition};
use serde::{Deserialize, Serialize};

/// A rule within a policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    /// Unique identifier for the rule within the policy
    pub id: String,
    /// Human-readable name of the rule
    pub name: String,
    /// Optional description
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The condition that triggers this rule
    pub condition: Condition,
    /// The action to take when the condition matches
    pub action: Action,
    /// Whether this rule is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Rule priority within the policy (higher = evaluated first)
    #[serde(default)]
    pub priority: i32,
}

fn default_enabled() -> bool {
    true
}

impl PolicyRule {
    /// Create a new rule with basic settings.
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        condition: Condition,
        action: Action,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            description: None,
            condition,
            action,
            enabled: true,
            priority: 0,
        }
    }

    /// Create a rule builder.
    pub fn builder(id: impl Into<String>) -> PolicyRuleBuilder {
        PolicyRuleBuilder::new(id)
    }

    /// Set the description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the priority.
    pub fn with_priority(mut self, priority: i32) -> Self {
        self.priority = priority;
        self
    }

    /// Set whether the rule is enabled.
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Validate the rule.
    pub fn validate(&self) -> crate::Result<()> {
        if self.id.is_empty() {
            return Err(crate::Error::validation_field("Rule ID cannot be empty", "id"));
        }

        if self.name.is_empty() {
            return Err(crate::Error::validation_field("Rule name cannot be empty", "name"));
        }

        self.condition.validate()?;

        Ok(())
    }
}

/// Builder for creating policy rules.
#[derive(Debug)]
pub struct PolicyRuleBuilder {
    id: String,
    name: Option<String>,
    description: Option<String>,
    condition: Option<Condition>,
    action: Option<Action>,
    enabled: bool,
    priority: i32,
}

impl PolicyRuleBuilder {
    /// Create a new rule builder.
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: None,
            description: None,
            condition: None,
            action: None,
            enabled: true,
            priority: 0,
        }
    }

    /// Set the rule name.
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Set the rule description.
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the rule condition.
    pub fn condition(mut self, condition: Condition) -> Self {
        self.condition = Some(condition);
        self
    }

    /// Set the rule action.
    pub fn action(mut self, action: Action) -> Self {
        self.action = Some(action);
        self
    }

    /// Set whether the rule is enabled.
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set the rule priority.
    pub fn priority(mut self, priority: i32) -> Self {
        self.priority = priority;
        self
    }

    /// Build the rule.
    pub fn build(self) -> crate::Result<PolicyRule> {
        let name = self.name.unwrap_or_else(|| self.id.clone());
        let condition = self.condition.ok_or_else(|| {
            crate::Error::validation("Rule must have a condition")
        })?;
        let action = self.action.unwrap_or_else(Action::allow);

        Ok(PolicyRule {
            id: self.id,
            name,
            description: self.description,
            condition,
            action,
            enabled: self.enabled,
            priority: self.priority,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::ConditionOperator;

    #[test]
    fn test_rule_creation() {
        let rule = PolicyRule::new(
            "rule-1",
            "Test Rule",
            Condition::equals("user.role", "admin"),
            Action::allow(),
        );
        assert_eq!(rule.id, "rule-1");
        assert_eq!(rule.name, "Test Rule");
        assert!(rule.enabled);
    }

    #[test]
    fn test_rule_builder() {
        let rule = PolicyRule::builder("rule-1")
            .name("Test Rule")
            .description("A test rule")
            .condition(Condition::equals("user.role", "admin"))
            .action(Action::allow())
            .priority(10)
            .build()
            .unwrap();

        assert_eq!(rule.id, "rule-1");
        assert_eq!(rule.name, "Test Rule");
        assert_eq!(rule.description, Some("A test rule".to_string()));
        assert_eq!(rule.priority, 10);
    }

    #[test]
    fn test_rule_validation() {
        let valid_rule = PolicyRule::new(
            "rule-1",
            "Test Rule",
            Condition::equals("field", "value"),
            Action::allow(),
        );
        assert!(valid_rule.validate().is_ok());

        let invalid_rule = PolicyRule {
            id: "".to_string(),
            name: "Test".to_string(),
            description: None,
            condition: Condition::equals("field", "value"),
            action: Action::allow(),
            enabled: true,
            priority: 0,
        };
        assert!(invalid_rule.validate().is_err());
    }
}
