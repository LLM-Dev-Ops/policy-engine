//! Decision types for policy evaluation.

use serde::{Deserialize, Serialize};
use std::fmt;

/// The type of decision returned by policy evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DecisionType {
    /// Allow the request to proceed
    Allow,
    /// Deny the request
    Deny,
    /// Allow with a warning
    Warn,
    /// Allow with modifications
    Modify,
}

impl DecisionType {
    /// Check if this decision allows the request.
    pub fn is_allowed(&self) -> bool {
        matches!(self, DecisionType::Allow | DecisionType::Warn | DecisionType::Modify)
    }

    /// Check if this decision denies the request.
    pub fn is_denied(&self) -> bool {
        matches!(self, DecisionType::Deny)
    }

    /// Get the string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            DecisionType::Allow => "allow",
            DecisionType::Deny => "deny",
            DecisionType::Warn => "warn",
            DecisionType::Modify => "modify",
        }
    }
}

impl Default for DecisionType {
    fn default() -> Self {
        DecisionType::Allow
    }
}

impl fmt::Display for DecisionType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for DecisionType {
    type Err = crate::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "allow" => Ok(DecisionType::Allow),
            "deny" => Ok(DecisionType::Deny),
            "warn" => Ok(DecisionType::Warn),
            "modify" => Ok(DecisionType::Modify),
            _ => Err(crate::Error::parse(format!("Unknown decision type: {}", s))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decision_is_allowed() {
        assert!(DecisionType::Allow.is_allowed());
        assert!(DecisionType::Warn.is_allowed());
        assert!(DecisionType::Modify.is_allowed());
        assert!(!DecisionType::Deny.is_allowed());
    }

    #[test]
    fn test_decision_is_denied() {
        assert!(DecisionType::Deny.is_denied());
        assert!(!DecisionType::Allow.is_denied());
    }

    #[test]
    fn test_decision_from_str() {
        assert_eq!("allow".parse::<DecisionType>().unwrap(), DecisionType::Allow);
        assert_eq!("DENY".parse::<DecisionType>().unwrap(), DecisionType::Deny);
        assert!("invalid".parse::<DecisionType>().is_err());
    }

    #[test]
    fn test_decision_serialization() {
        let decision = DecisionType::Allow;
        let json = serde_json::to_string(&decision).unwrap();
        assert_eq!(json, "\"allow\"");

        let parsed: DecisionType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, DecisionType::Allow);
    }
}
