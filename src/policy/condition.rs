//! Policy condition definitions.

use serde::{Deserialize, Serialize};

/// A condition that can be evaluated against a context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    /// The operator to use for comparison
    pub operator: ConditionOperator,
    /// The field path to evaluate (e.g., "llm.model", "user.roles")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    /// The value to compare against
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<ConditionValue>,
    /// Nested conditions for logical operators (AND, OR, NOT)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
}

impl Condition {
    /// Create a simple equality condition.
    pub fn equals(field: impl Into<String>, value: impl Into<ConditionValue>) -> Self {
        Self {
            operator: ConditionOperator::Equals,
            field: Some(field.into()),
            value: Some(value.into()),
            conditions: Vec::new(),
        }
    }

    /// Create a "not equals" condition.
    pub fn not_equals(field: impl Into<String>, value: impl Into<ConditionValue>) -> Self {
        Self {
            operator: ConditionOperator::NotEquals,
            field: Some(field.into()),
            value: Some(value.into()),
            conditions: Vec::new(),
        }
    }

    /// Create a "greater than" condition.
    pub fn greater_than(field: impl Into<String>, value: impl Into<ConditionValue>) -> Self {
        Self {
            operator: ConditionOperator::GreaterThan,
            field: Some(field.into()),
            value: Some(value.into()),
            conditions: Vec::new(),
        }
    }

    /// Create a "less than" condition.
    pub fn less_than(field: impl Into<String>, value: impl Into<ConditionValue>) -> Self {
        Self {
            operator: ConditionOperator::LessThan,
            field: Some(field.into()),
            value: Some(value.into()),
            conditions: Vec::new(),
        }
    }

    /// Create an "in" condition (value in list).
    pub fn is_in(field: impl Into<String>, values: Vec<ConditionValue>) -> Self {
        Self {
            operator: ConditionOperator::In,
            field: Some(field.into()),
            value: Some(ConditionValue::Array(values)),
            conditions: Vec::new(),
        }
    }

    /// Create a "contains" condition.
    pub fn contains(field: impl Into<String>, value: impl Into<ConditionValue>) -> Self {
        Self {
            operator: ConditionOperator::Contains,
            field: Some(field.into()),
            value: Some(value.into()),
            conditions: Vec::new(),
        }
    }

    /// Create an "exists" condition.
    pub fn exists(field: impl Into<String>) -> Self {
        Self {
            operator: ConditionOperator::Exists,
            field: Some(field.into()),
            value: None,
            conditions: Vec::new(),
        }
    }

    /// Create a regex match condition.
    pub fn matches(field: impl Into<String>, pattern: impl Into<String>) -> Self {
        Self {
            operator: ConditionOperator::Matches,
            field: Some(field.into()),
            value: Some(ConditionValue::String(pattern.into())),
            conditions: Vec::new(),
        }
    }

    /// Create an AND condition combining multiple conditions.
    pub fn and(conditions: Vec<Condition>) -> Self {
        Self {
            operator: ConditionOperator::And,
            field: None,
            value: None,
            conditions,
        }
    }

    /// Create an OR condition combining multiple conditions.
    pub fn or(conditions: Vec<Condition>) -> Self {
        Self {
            operator: ConditionOperator::Or,
            field: None,
            value: None,
            conditions,
        }
    }

    /// Create a NOT condition negating another condition.
    pub fn not(condition: Condition) -> Self {
        Self {
            operator: ConditionOperator::Not,
            field: None,
            value: None,
            conditions: vec![condition],
        }
    }

    /// Validate the condition structure.
    pub fn validate(&self) -> crate::Result<()> {
        match self.operator {
            ConditionOperator::And | ConditionOperator::Or => {
                if self.conditions.is_empty() {
                    return Err(crate::Error::validation(format!(
                        "{:?} operator requires at least one nested condition",
                        self.operator
                    )));
                }
                for condition in &self.conditions {
                    condition.validate()?;
                }
            }
            ConditionOperator::Not => {
                if self.conditions.len() != 1 {
                    return Err(crate::Error::validation(
                        "NOT operator requires exactly one nested condition",
                    ));
                }
                self.conditions[0].validate()?;
            }
            ConditionOperator::Exists => {
                if self.field.is_none() {
                    return Err(crate::Error::validation(
                        "EXISTS operator requires a field",
                    ));
                }
            }
            _ => {
                if self.field.is_none() {
                    return Err(crate::Error::validation(format!(
                        "{:?} operator requires a field",
                        self.operator
                    )));
                }
                if self.value.is_none() {
                    return Err(crate::Error::validation(format!(
                        "{:?} operator requires a value",
                        self.operator
                    )));
                }
            }
        }
        Ok(())
    }
}

/// Operators for condition evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOperator {
    /// Equality check
    Equals,
    /// Inequality check
    NotEquals,
    /// Greater than comparison
    GreaterThan,
    /// Greater than or equal comparison
    GreaterThanOrEquals,
    /// Less than comparison
    LessThan,
    /// Less than or equal comparison
    LessThanOrEquals,
    /// Value is in a list
    In,
    /// Value is not in a list
    NotIn,
    /// String/array contains value
    Contains,
    /// String starts with value
    StartsWith,
    /// String ends with value
    EndsWith,
    /// Regex pattern match
    Matches,
    /// Field exists
    Exists,
    /// Field does not exist
    NotExists,
    /// Logical AND
    And,
    /// Logical OR
    Or,
    /// Logical NOT
    Not,
}

/// A value that can be used in conditions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ConditionValue {
    /// String value
    String(String),
    /// Integer value
    Integer(i64),
    /// Float value
    Float(f64),
    /// Boolean value
    Boolean(bool),
    /// Array of values
    Array(Vec<ConditionValue>),
    /// Null value
    Null,
}

impl From<&str> for ConditionValue {
    fn from(s: &str) -> Self {
        ConditionValue::String(s.to_string())
    }
}

impl From<String> for ConditionValue {
    fn from(s: String) -> Self {
        ConditionValue::String(s)
    }
}

impl From<i64> for ConditionValue {
    fn from(n: i64) -> Self {
        ConditionValue::Integer(n)
    }
}

impl From<i32> for ConditionValue {
    fn from(n: i32) -> Self {
        ConditionValue::Integer(n as i64)
    }
}

impl From<f64> for ConditionValue {
    fn from(n: f64) -> Self {
        ConditionValue::Float(n)
    }
}

impl From<bool> for ConditionValue {
    fn from(b: bool) -> Self {
        ConditionValue::Boolean(b)
    }
}

impl<T: Into<ConditionValue>> From<Vec<T>> for ConditionValue {
    fn from(v: Vec<T>) -> Self {
        ConditionValue::Array(v.into_iter().map(|x| x.into()).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_condition() {
        let cond = Condition::equals("user.role", "admin");
        assert_eq!(cond.field, Some("user.role".to_string()));
        assert!(cond.validate().is_ok());
    }

    #[test]
    fn test_logical_conditions() {
        let cond = Condition::and(vec![
            Condition::equals("user.role", "admin"),
            Condition::greater_than("user.level", 5i64),
        ]);
        assert!(cond.validate().is_ok());
    }

    #[test]
    fn test_condition_validation() {
        let invalid = Condition {
            operator: ConditionOperator::Equals,
            field: None,
            value: None,
            conditions: Vec::new(),
        };
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn test_condition_serialization() {
        let cond = Condition::equals("model", "gpt-4");
        let json = serde_json::to_string(&cond).unwrap();
        let parsed: Condition = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.field, cond.field);
    }
}
