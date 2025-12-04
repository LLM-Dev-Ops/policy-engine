//! Policy action definitions.

use super::DecisionType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// An action to take when a rule matches.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    /// The type of action (allow, deny, warn, modify)
    #[serde(rename = "type")]
    pub action_type: ActionType,
    /// The decision to return
    #[serde(default)]
    pub decision: DecisionType,
    /// Human-readable reason for the decision
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Modifications to apply (for modify actions)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modifications: Vec<Modification>,
    /// Additional metadata to include in the decision
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Action {
    /// Create an allow action.
    pub fn allow() -> Self {
        Self {
            action_type: ActionType::Allow,
            decision: DecisionType::Allow,
            reason: None,
            modifications: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    /// Create a deny action with a reason.
    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            action_type: ActionType::Deny,
            decision: DecisionType::Deny,
            reason: Some(reason.into()),
            modifications: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    /// Create a warn action with a reason.
    pub fn warn(reason: impl Into<String>) -> Self {
        Self {
            action_type: ActionType::Warn,
            decision: DecisionType::Warn,
            reason: Some(reason.into()),
            modifications: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    /// Create a modify action with modifications.
    pub fn modify(modifications: Vec<Modification>) -> Self {
        Self {
            action_type: ActionType::Modify,
            decision: DecisionType::Modify,
            reason: None,
            modifications,
            metadata: HashMap::new(),
        }
    }

    /// Add a reason to the action.
    pub fn with_reason(mut self, reason: impl Into<String>) -> Self {
        self.reason = Some(reason.into());
        self
    }

    /// Add metadata to the action.
    pub fn with_metadata(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }

    /// Add a modification to the action.
    pub fn with_modification(mut self, modification: Modification) -> Self {
        self.modifications.push(modification);
        self
    }
}

/// The type of action to take.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionType {
    /// Allow the request
    Allow,
    /// Deny the request
    Deny,
    /// Allow with a warning
    Warn,
    /// Allow with modifications
    Modify,
    /// Log the request (no decision change)
    Log,
    /// Rate limit the request
    RateLimit,
}

impl Default for ActionType {
    fn default() -> Self {
        ActionType::Allow
    }
}

/// A modification to apply to the request or response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Modification {
    /// Type of modification
    #[serde(rename = "type")]
    pub modification_type: ModificationType,
    /// Field path to modify
    pub field: String,
    /// New value to set (for set operations)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

impl Modification {
    /// Create a set modification.
    pub fn set(field: impl Into<String>, value: serde_json::Value) -> Self {
        Self {
            modification_type: ModificationType::Set,
            field: field.into(),
            value: Some(value),
        }
    }

    /// Create a remove modification.
    pub fn remove(field: impl Into<String>) -> Self {
        Self {
            modification_type: ModificationType::Remove,
            field: field.into(),
            value: None,
        }
    }

    /// Create an append modification.
    pub fn append(field: impl Into<String>, value: serde_json::Value) -> Self {
        Self {
            modification_type: ModificationType::Append,
            field: field.into(),
            value: Some(value),
        }
    }

    /// Create a mask modification (for sensitive data).
    pub fn mask(field: impl Into<String>) -> Self {
        Self {
            modification_type: ModificationType::Mask,
            field: field.into(),
            value: None,
        }
    }
}

/// Type of modification to apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModificationType {
    /// Set a field to a new value
    Set,
    /// Remove a field
    Remove,
    /// Append to an array field
    Append,
    /// Mask a field (replace with placeholder)
    Mask,
    /// Truncate a string field
    Truncate,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allow_action() {
        let action = Action::allow();
        assert_eq!(action.action_type, ActionType::Allow);
        assert_eq!(action.decision, DecisionType::Allow);
    }

    #[test]
    fn test_deny_action() {
        let action = Action::deny("Not authorized");
        assert_eq!(action.action_type, ActionType::Deny);
        assert_eq!(action.reason, Some("Not authorized".to_string()));
    }

    #[test]
    fn test_modify_action() {
        let action = Action::modify(vec![
            Modification::set("llm.maxTokens", serde_json::json!(1000)),
            Modification::mask("llm.prompt"),
        ]);
        assert_eq!(action.action_type, ActionType::Modify);
        assert_eq!(action.modifications.len(), 2);
    }

    #[test]
    fn test_action_serialization() {
        let action = Action::deny("Rate limit exceeded")
            .with_metadata("limit", serde_json::json!(100));
        let json = serde_json::to_string(&action).unwrap();
        let parsed: Action = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.reason, action.reason);
    }
}
