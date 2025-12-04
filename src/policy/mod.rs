//! Policy data structures and representations.
//!
//! This module defines the core policy types including policies, rules,
//! conditions, and actions.

mod action;
mod condition;
mod decision;
mod document;
mod metadata;
mod rule;

pub use action::{Action, ActionType, Modification};
pub use condition::{Condition, ConditionOperator, ConditionValue};
pub use decision::DecisionType;
pub use document::PolicyDocument;
pub use metadata::PolicyMetadata;
pub use rule::PolicyRule;

use serde::{Deserialize, Serialize};

/// A policy definition containing metadata and rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    /// Unique identifier for the policy
    pub id: String,
    /// Policy metadata
    pub metadata: PolicyMetadata,
    /// List of rules in this policy
    pub rules: Vec<PolicyRule>,
    /// Whether this policy is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Policy priority (higher = evaluated first)
    #[serde(default)]
    pub priority: i32,
}

fn default_enabled() -> bool {
    true
}

impl Policy {
    /// Create a new policy with the given ID and name.
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            metadata: PolicyMetadata::new(name),
            rules: Vec::new(),
            enabled: true,
            priority: 0,
        }
    }

    /// Create a policy builder.
    pub fn builder(id: impl Into<String>) -> PolicyBuilder {
        PolicyBuilder::new(id)
    }

    /// Add a rule to this policy.
    pub fn add_rule(&mut self, rule: PolicyRule) {
        self.rules.push(rule);
    }

    /// Get enabled rules only.
    pub fn enabled_rules(&self) -> impl Iterator<Item = &PolicyRule> {
        self.rules.iter().filter(|r| r.enabled)
    }

    /// Check if the policy is valid.
    pub fn validate(&self) -> crate::Result<()> {
        if self.id.is_empty() {
            return Err(crate::Error::validation_field("Policy ID cannot be empty", "id"));
        }

        if self.metadata.name.is_empty() {
            return Err(crate::Error::validation_field(
                "Policy name cannot be empty",
                "metadata.name",
            ));
        }

        for (i, rule) in self.rules.iter().enumerate() {
            rule.validate().map_err(|e| {
                crate::Error::validation(format!("Rule {} validation failed: {}", i, e))
            })?;
        }

        Ok(())
    }
}

/// Builder for creating policies.
#[derive(Debug, Default)]
pub struct PolicyBuilder {
    id: String,
    name: Option<String>,
    description: Option<String>,
    namespace: Option<String>,
    version: Option<String>,
    tags: Vec<String>,
    rules: Vec<PolicyRule>,
    enabled: bool,
    priority: i32,
}

impl PolicyBuilder {
    /// Create a new policy builder with the given ID.
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            enabled: true,
            ..Default::default()
        }
    }

    /// Set the policy name.
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    /// Set the policy description.
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the policy namespace.
    pub fn namespace(mut self, namespace: impl Into<String>) -> Self {
        self.namespace = Some(namespace.into());
        self
    }

    /// Set the policy version.
    pub fn version(mut self, version: impl Into<String>) -> Self {
        self.version = Some(version.into());
        self
    }

    /// Add a tag to the policy.
    pub fn tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Add multiple tags to the policy.
    pub fn tags(mut self, tags: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.tags.extend(tags.into_iter().map(|t| t.into()));
        self
    }

    /// Add a rule to the policy.
    pub fn rule(mut self, rule: PolicyRule) -> Self {
        self.rules.push(rule);
        self
    }

    /// Set whether the policy is enabled.
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set the policy priority.
    pub fn priority(mut self, priority: i32) -> Self {
        self.priority = priority;
        self
    }

    /// Build the policy.
    pub fn build(self) -> Policy {
        let name = self.name.unwrap_or_else(|| self.id.clone());
        let mut metadata = PolicyMetadata::new(&name);

        if let Some(desc) = self.description {
            metadata.description = Some(desc);
        }
        if let Some(ns) = self.namespace {
            metadata.namespace = Some(ns);
        }
        if let Some(ver) = self.version {
            metadata.version = ver;
        }
        metadata.tags = self.tags;

        Policy {
            id: self.id,
            metadata,
            rules: self.rules,
            enabled: self.enabled,
            priority: self.priority,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_creation() {
        let policy = Policy::new("test-policy", "Test Policy");
        assert_eq!(policy.id, "test-policy");
        assert_eq!(policy.metadata.name, "Test Policy");
        assert!(policy.enabled);
    }

    #[test]
    fn test_policy_builder() {
        let policy = Policy::builder("test-policy")
            .name("Test Policy")
            .description("A test policy")
            .namespace("test")
            .version("1.0.0")
            .tag("test")
            .tag("example")
            .priority(10)
            .build();

        assert_eq!(policy.id, "test-policy");
        assert_eq!(policy.metadata.name, "Test Policy");
        assert_eq!(policy.metadata.description, Some("A test policy".to_string()));
        assert_eq!(policy.metadata.namespace, Some("test".to_string()));
        assert_eq!(policy.metadata.version, "1.0.0");
        assert_eq!(policy.metadata.tags, vec!["test", "example"]);
        assert_eq!(policy.priority, 10);
    }

    #[test]
    fn test_policy_validation() {
        let policy = Policy::new("test", "Test");
        assert!(policy.validate().is_ok());

        let invalid_policy = Policy {
            id: "".to_string(),
            metadata: PolicyMetadata::new("test"),
            rules: vec![],
            enabled: true,
            priority: 0,
        };
        assert!(invalid_policy.validate().is_err());
    }
}
