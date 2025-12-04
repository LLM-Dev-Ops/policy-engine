//! Policy metadata definitions.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Metadata associated with a policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyMetadata {
    /// Human-readable name of the policy
    pub name: String,
    /// Optional description
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Semantic version of the policy
    #[serde(default = "default_version")]
    pub version: String,
    /// Namespace for organizing policies
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    /// Tags for categorization and filtering
    #[serde(default)]
    pub tags: Vec<String>,
    /// User or system that created the policy
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    /// Timestamp when the policy was created
    #[serde(default = "Utc::now")]
    pub created_at: DateTime<Utc>,
    /// Timestamp when the policy was last updated
    #[serde(default = "Utc::now")]
    pub updated_at: DateTime<Utc>,
    /// Additional custom metadata
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub labels: std::collections::HashMap<String, String>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

impl PolicyMetadata {
    /// Create new metadata with the given name.
    pub fn new(name: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            name: name.into(),
            description: None,
            version: default_version(),
            namespace: None,
            tags: Vec::new(),
            created_by: None,
            created_at: now,
            updated_at: now,
            labels: std::collections::HashMap::new(),
        }
    }

    /// Set the description.
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Set the namespace.
    pub fn with_namespace(mut self, namespace: impl Into<String>) -> Self {
        self.namespace = Some(namespace.into());
        self
    }

    /// Set the version.
    pub fn with_version(mut self, version: impl Into<String>) -> Self {
        self.version = version.into();
        self
    }

    /// Add a tag.
    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Add a label.
    pub fn with_label(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.labels.insert(key.into(), value.into());
        self
    }

    /// Update the updated_at timestamp.
    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }
}

impl Default for PolicyMetadata {
    fn default() -> Self {
        Self::new("Unnamed Policy")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_creation() {
        let metadata = PolicyMetadata::new("Test Policy");
        assert_eq!(metadata.name, "Test Policy");
        assert_eq!(metadata.version, "1.0.0");
        assert!(metadata.tags.is_empty());
    }

    #[test]
    fn test_metadata_builder_pattern() {
        let metadata = PolicyMetadata::new("Test Policy")
            .with_description("A test policy")
            .with_namespace("testing")
            .with_version("2.0.0")
            .with_tag("test")
            .with_label("env", "development");

        assert_eq!(metadata.description, Some("A test policy".to_string()));
        assert_eq!(metadata.namespace, Some("testing".to_string()));
        assert_eq!(metadata.version, "2.0.0");
        assert_eq!(metadata.tags, vec!["test"]);
        assert_eq!(metadata.labels.get("env"), Some(&"development".to_string()));
    }
}
