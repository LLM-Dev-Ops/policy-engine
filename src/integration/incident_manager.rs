//! Incident Manager integration client.
//!
//! Incident Manager handles policy violation alerting and incident creation.

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for Incident Manager service.
pub struct IncidentManagerClient {
    client: IntegrationClient,
}

impl IncidentManagerClient {
    /// Create a new Incident Manager client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Create an incident from a policy violation.
    pub async fn create_incident(
        &self,
        request: &CreateIncidentRequest,
    ) -> IntegrationResult<CreateIncidentResponse> {
        self.client.post("/api/v1/incidents", request).await
    }

    /// Get incident status.
    pub async fn get_incident(&self, incident_id: &str) -> IntegrationResult<Incident> {
        let path = format!("/api/v1/incidents/{}", incident_id);
        self.client.get(&path).await
    }

    /// Update incident status.
    pub async fn update_incident(
        &self,
        incident_id: &str,
        update: &UpdateIncidentRequest,
    ) -> IntegrationResult<Incident> {
        let path = format!("/api/v1/incidents/{}", incident_id);
        self.client.post(&path, update).await
    }

    /// Send an alert.
    pub async fn send_alert(&self, alert: &Alert) -> IntegrationResult<AlertResponse> {
        self.client.post("/api/v1/alerts", alert).await
    }

    /// Check if Incident Manager service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// Request to create an incident.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIncidentRequest {
    /// Incident title
    pub title: String,
    /// Incident description
    pub description: String,
    /// Severity level
    pub severity: IncidentSeverity,
    /// Source of the incident
    pub source: String,
    /// Related policy ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy_id: Option<String>,
    /// Related rule ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    /// User ID involved
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Additional context
    #[serde(default)]
    pub context: serde_json::Value,
    /// Tags for categorization
    #[serde(default)]
    pub tags: Vec<String>,
}

impl CreateIncidentRequest {
    /// Create a new incident request from a policy violation.
    pub fn from_policy_violation(
        policy_id: &str,
        rule_id: &str,
        reason: &str,
        severity: IncidentSeverity,
    ) -> Self {
        Self {
            title: format!("Policy Violation: {}", rule_id),
            description: reason.to_string(),
            severity,
            source: "policy-engine".to_string(),
            policy_id: Some(policy_id.to_string()),
            rule_id: Some(rule_id.to_string()),
            user_id: None,
            context: serde_json::Value::Null,
            tags: vec!["policy-violation".to_string()],
        }
    }
}

/// Response from incident creation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIncidentResponse {
    /// Whether creation was successful
    pub success: bool,
    /// Incident ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incident_id: Option<String>,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// An incident.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Incident {
    /// Incident ID
    pub id: String,
    /// Title
    pub title: String,
    /// Description
    pub description: String,
    /// Severity
    pub severity: IncidentSeverity,
    /// Current status
    pub status: IncidentStatus,
    /// Source
    pub source: String,
    /// Related policy ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy_id: Option<String>,
    /// Related rule ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    /// Assigned to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_to: Option<String>,
    /// Created at
    pub created_at: String,
    /// Updated at
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Resolved at
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<String>,
}

/// Incident severity levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IncidentSeverity {
    /// Informational
    Info,
    /// Low severity
    Low,
    /// Medium severity
    Medium,
    /// High severity
    High,
    /// Critical severity
    Critical,
}

/// Incident status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IncidentStatus {
    /// New incident
    New,
    /// Acknowledged
    Acknowledged,
    /// In progress
    InProgress,
    /// Resolved
    Resolved,
    /// Closed
    Closed,
}

/// Request to update an incident.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIncidentRequest {
    /// New status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<IncidentStatus>,
    /// Assignee
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_to: Option<String>,
    /// Resolution note
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution: Option<String>,
}

/// An alert.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    /// Alert type
    pub alert_type: AlertType,
    /// Message
    pub message: String,
    /// Severity
    pub severity: IncidentSeverity,
    /// Source
    pub source: String,
    /// Additional context
    #[serde(default)]
    pub context: serde_json::Value,
    /// Recipients
    #[serde(default)]
    pub recipients: Vec<String>,
}

/// Types of alerts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertType {
    /// Policy violation
    PolicyViolation,
    /// Threat detected
    ThreatDetected,
    /// Budget exceeded
    BudgetExceeded,
    /// Rate limit hit
    RateLimitHit,
    /// System error
    SystemError,
    /// Custom alert
    Custom,
}

/// Response from alert.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertResponse {
    /// Whether alert was sent
    pub success: bool,
    /// Alert ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alert_id: Option<String>,
    /// Channels notified
    #[serde(default)]
    pub channels: Vec<String>,
}
