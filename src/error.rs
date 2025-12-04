//! Error types for the policy engine.
//!
//! This module defines all error types used throughout the crate, providing
//! structured error handling with detailed context for debugging.

use std::fmt;
use thiserror::Error;

/// Result type alias using the crate's Error type.
pub type Result<T> = std::result::Result<T, Error>;

/// Main error type for the policy engine.
#[derive(Error, Debug)]
pub enum Error {
    /// Error during policy validation
    #[error("Policy validation error: {message}")]
    Validation {
        /// Detailed error message
        message: String,
        /// Field that caused the error, if applicable
        field: Option<String>,
    },

    /// Error during policy parsing
    #[error("Policy parse error: {message}")]
    Parse {
        /// Detailed error message
        message: String,
        /// Line number where error occurred, if applicable
        line: Option<usize>,
    },

    /// Error during policy evaluation
    #[error("Evaluation error: {message}")]
    Evaluation {
        /// Detailed error message
        message: String,
        /// Policy ID that caused the error, if applicable
        policy_id: Option<String>,
        /// Rule ID that caused the error, if applicable
        rule_id: Option<String>,
    },

    /// Error in expression evaluation (CEL)
    #[error("Expression error: {message}")]
    Expression {
        /// Detailed error message
        message: String,
        /// The expression that failed
        expression: Option<String>,
    },

    /// Configuration error
    #[error("Configuration error: {message}")]
    Config {
        /// Detailed error message
        message: String,
        /// Configuration key that caused the error
        key: Option<String>,
    },

    /// Cache operation error
    #[error("Cache error: {message}")]
    Cache {
        /// Detailed error message
        message: String,
        /// Cache key that caused the error
        key: Option<String>,
    },

    /// Integration error with external services
    #[error("Integration error with {service}: {message}")]
    Integration {
        /// Name of the external service
        service: String,
        /// Detailed error message
        message: String,
    },

    /// Telemetry/observability error
    #[error("Telemetry error: {message}")]
    Telemetry {
        /// Detailed error message
        message: String,
    },

    /// Timeout error
    #[error("Operation timed out after {duration_ms}ms: {message}")]
    Timeout {
        /// Detailed error message
        message: String,
        /// Duration in milliseconds before timeout
        duration_ms: u64,
    },

    /// I/O error
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization/deserialization error
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// YAML parsing error
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    /// Internal error (unexpected condition)
    #[error("Internal error: {message}")]
    Internal {
        /// Detailed error message
        message: String,
    },
}

impl Error {
    /// Create a validation error.
    pub fn validation(message: impl Into<String>) -> Self {
        Error::Validation {
            message: message.into(),
            field: None,
        }
    }

    /// Create a validation error with field context.
    pub fn validation_field(message: impl Into<String>, field: impl Into<String>) -> Self {
        Error::Validation {
            message: message.into(),
            field: Some(field.into()),
        }
    }

    /// Create a parse error.
    pub fn parse(message: impl Into<String>) -> Self {
        Error::Parse {
            message: message.into(),
            line: None,
        }
    }

    /// Create an evaluation error.
    pub fn evaluation(message: impl Into<String>) -> Self {
        Error::Evaluation {
            message: message.into(),
            policy_id: None,
            rule_id: None,
        }
    }

    /// Create an evaluation error with policy context.
    pub fn evaluation_with_context(
        message: impl Into<String>,
        policy_id: impl Into<String>,
        rule_id: Option<String>,
    ) -> Self {
        Error::Evaluation {
            message: message.into(),
            policy_id: Some(policy_id.into()),
            rule_id,
        }
    }

    /// Create an expression error.
    pub fn expression(message: impl Into<String>) -> Self {
        Error::Expression {
            message: message.into(),
            expression: None,
        }
    }

    /// Create an expression error with expression context.
    pub fn expression_with_expr(message: impl Into<String>, expression: impl Into<String>) -> Self {
        Error::Expression {
            message: message.into(),
            expression: Some(expression.into()),
        }
    }

    /// Create a configuration error.
    pub fn config(message: impl Into<String>) -> Self {
        Error::Config {
            message: message.into(),
            key: None,
        }
    }

    /// Create a cache error.
    pub fn cache(message: impl Into<String>) -> Self {
        Error::Cache {
            message: message.into(),
            key: None,
        }
    }

    /// Create an integration error.
    pub fn integration(service: impl Into<String>, message: impl Into<String>) -> Self {
        Error::Integration {
            service: service.into(),
            message: message.into(),
        }
    }

    /// Create a telemetry error.
    pub fn telemetry(message: impl Into<String>) -> Self {
        Error::Telemetry {
            message: message.into(),
        }
    }

    /// Create a timeout error.
    pub fn timeout(message: impl Into<String>, duration_ms: u64) -> Self {
        Error::Timeout {
            message: message.into(),
            duration_ms,
        }
    }

    /// Create an internal error.
    pub fn internal(message: impl Into<String>) -> Self {
        Error::Internal {
            message: message.into(),
        }
    }

    /// Check if this error is recoverable.
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            Error::Cache { .. } | Error::Integration { .. } | Error::Timeout { .. }
        )
    }

    /// Get the error category for metrics.
    pub fn category(&self) -> &'static str {
        match self {
            Error::Validation { .. } => "validation",
            Error::Parse { .. } => "parse",
            Error::Evaluation { .. } => "evaluation",
            Error::Expression { .. } => "expression",
            Error::Config { .. } => "config",
            Error::Cache { .. } => "cache",
            Error::Integration { .. } => "integration",
            Error::Telemetry { .. } => "telemetry",
            Error::Timeout { .. } => "timeout",
            Error::Io(_) => "io",
            Error::Serialization(_) => "serialization",
            Error::Yaml(_) => "yaml",
            Error::Internal { .. } => "internal",
        }
    }
}

/// Extension trait for adding context to errors.
pub trait ErrorContext<T> {
    /// Add field context to validation errors.
    fn with_field(self, field: impl Into<String>) -> Result<T>;

    /// Add policy context to evaluation errors.
    fn with_policy(self, policy_id: impl Into<String>) -> Result<T>;
}

impl<T> ErrorContext<T> for Result<T> {
    fn with_field(self, field: impl Into<String>) -> Result<T> {
        self.map_err(|e| match e {
            Error::Validation { message, .. } => Error::Validation {
                message,
                field: Some(field.into()),
            },
            other => other,
        })
    }

    fn with_policy(self, policy_id: impl Into<String>) -> Result<T> {
        self.map_err(|e| match e {
            Error::Evaluation {
                message, rule_id, ..
            } => Error::Evaluation {
                message,
                policy_id: Some(policy_id.into()),
                rule_id,
            },
            other => other,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let err = Error::validation("test error");
        assert!(matches!(err, Error::Validation { .. }));
        assert_eq!(err.category(), "validation");
    }

    #[test]
    fn test_error_is_recoverable() {
        assert!(Error::cache("test").is_recoverable());
        assert!(Error::integration("shield", "unavailable").is_recoverable());
        assert!(Error::timeout("test", 5000).is_recoverable());
        assert!(!Error::validation("test").is_recoverable());
    }

    #[test]
    fn test_error_display() {
        let err = Error::validation_field("invalid value", "policy.name");
        assert!(err.to_string().contains("invalid value"));
    }
}
