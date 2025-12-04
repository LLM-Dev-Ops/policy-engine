//! Policy document parsing and management.

use super::Policy;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A policy document that can contain one or more policies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDocument {
    /// API version of the policy document format
    #[serde(default = "default_api_version")]
    pub api_version: String,
    /// Kind of document
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Policies defined in this document
    #[serde(default)]
    pub policies: Vec<Policy>,
}

fn default_api_version() -> String {
    "policy.llm-dev-ops.io/v1".to_string()
}

fn default_kind() -> String {
    "PolicyDocument".to_string()
}

impl PolicyDocument {
    /// Create a new empty policy document.
    pub fn new() -> Self {
        Self {
            api_version: default_api_version(),
            kind: default_kind(),
            policies: Vec::new(),
        }
    }

    /// Create a policy document with the given policies.
    pub fn with_policies(policies: Vec<Policy>) -> Self {
        Self {
            api_version: default_api_version(),
            kind: default_kind(),
            policies,
        }
    }

    /// Add a policy to the document.
    pub fn add_policy(&mut self, policy: Policy) {
        self.policies.push(policy);
    }

    /// Parse a policy document from YAML.
    pub fn from_yaml(yaml: &str) -> crate::Result<Self> {
        serde_yaml::from_str(yaml).map_err(crate::Error::from)
    }

    /// Parse a policy document from JSON.
    pub fn from_json(json: &str) -> crate::Result<Self> {
        serde_json::from_str(json).map_err(crate::Error::from)
    }

    /// Load a policy document from a file.
    pub fn from_file(path: impl AsRef<Path>) -> crate::Result<Self> {
        let path = path.as_ref();
        let content = std::fs::read_to_string(path)?;

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        match extension.to_lowercase().as_str() {
            "yaml" | "yml" => Self::from_yaml(&content),
            "json" => Self::from_json(&content),
            _ => {
                // Try YAML first, then JSON
                Self::from_yaml(&content).or_else(|_| Self::from_json(&content))
            }
        }
    }

    /// Convert the document to YAML.
    pub fn to_yaml(&self) -> crate::Result<String> {
        serde_yaml::to_string(self).map_err(crate::Error::from)
    }

    /// Convert the document to JSON.
    pub fn to_json(&self) -> crate::Result<String> {
        serde_json::to_string_pretty(self).map_err(crate::Error::from)
    }

    /// Validate all policies in the document.
    pub fn validate(&self) -> crate::Result<()> {
        for policy in &self.policies {
            policy.validate()?;
        }
        Ok(())
    }

    /// Get enabled policies sorted by priority.
    pub fn enabled_policies(&self) -> Vec<&Policy> {
        let mut policies: Vec<_> = self.policies.iter().filter(|p| p.enabled).collect();
        policies.sort_by(|a, b| b.priority.cmp(&a.priority));
        policies
    }

    /// Find a policy by ID.
    pub fn get_policy(&self, id: &str) -> Option<&Policy> {
        self.policies.iter().find(|p| p.id == id)
    }

    /// Find a policy by ID (mutable).
    pub fn get_policy_mut(&mut self, id: &str) -> Option<&mut Policy> {
        self.policies.iter_mut().find(|p| p.id == id)
    }
}

impl Default for PolicyDocument {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::{Action, Condition, PolicyRule};

    fn sample_policy() -> Policy {
        Policy::builder("test-policy")
            .name("Test Policy")
            .description("A test policy")
            .rule(PolicyRule::new(
                "rule-1",
                "Test Rule",
                Condition::equals("user.role", "admin"),
                Action::allow(),
            ))
            .build()
    }

    #[test]
    fn test_document_creation() {
        let doc = PolicyDocument::new();
        assert_eq!(doc.api_version, "policy.llm-dev-ops.io/v1");
        assert_eq!(doc.kind, "PolicyDocument");
        assert!(doc.policies.is_empty());
    }

    #[test]
    fn test_document_with_policies() {
        let doc = PolicyDocument::with_policies(vec![sample_policy()]);
        assert_eq!(doc.policies.len(), 1);
    }

    #[test]
    fn test_yaml_serialization() {
        let doc = PolicyDocument::with_policies(vec![sample_policy()]);
        let yaml = doc.to_yaml().unwrap();
        let parsed = PolicyDocument::from_yaml(&yaml).unwrap();
        assert_eq!(parsed.policies.len(), 1);
        assert_eq!(parsed.policies[0].id, "test-policy");
    }

    #[test]
    fn test_json_serialization() {
        let doc = PolicyDocument::with_policies(vec![sample_policy()]);
        let json = doc.to_json().unwrap();
        let parsed = PolicyDocument::from_json(&json).unwrap();
        assert_eq!(parsed.policies.len(), 1);
    }

    #[test]
    fn test_get_policy() {
        let doc = PolicyDocument::with_policies(vec![sample_policy()]);
        assert!(doc.get_policy("test-policy").is_some());
        assert!(doc.get_policy("nonexistent").is_none());
    }

    #[test]
    fn test_enabled_policies_sorted() {
        let mut policy1 = sample_policy();
        policy1.id = "policy-1".to_string();
        policy1.priority = 10;

        let mut policy2 = sample_policy();
        policy2.id = "policy-2".to_string();
        policy2.priority = 20;

        let mut policy3 = sample_policy();
        policy3.id = "policy-3".to_string();
        policy3.priority = 5;
        policy3.enabled = false;

        let doc = PolicyDocument::with_policies(vec![policy1, policy2, policy3]);
        let enabled = doc.enabled_policies();

        assert_eq!(enabled.len(), 2);
        assert_eq!(enabled[0].id, "policy-2"); // Higher priority first
        assert_eq!(enabled[1].id, "policy-1");
    }
}
