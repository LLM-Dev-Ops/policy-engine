//! LLM Governance integration client.
//!
//! Governance provides compliance checking and audit logging for LLM operations.

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for LLM Governance service.
pub struct GovernanceClient {
    client: IntegrationClient,
}

impl GovernanceClient {
    /// Create a new Governance client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Check compliance for a request.
    pub async fn check_compliance(
        &self,
        request: &ComplianceCheckRequest,
    ) -> IntegrationResult<ComplianceCheckResponse> {
        self.client.post("/api/v1/compliance/check", request).await
    }

    /// Log an audit event.
    pub async fn log_audit(&self, event: &AuditEvent) -> IntegrationResult<AuditLogResponse> {
        self.client.post("/api/v1/audit/log", event).await
    }

    /// Get audit trail.
    pub async fn get_audit_trail(
        &self,
        request: &AuditTrailRequest,
    ) -> IntegrationResult<AuditTrailResponse> {
        self.client.post("/api/v1/audit/trail", request).await
    }

    /// Get approved models.
    pub async fn get_approved_models(&self) -> IntegrationResult<ApprovedModelsResponse> {
        self.client.get("/api/v1/models/approved").await
    }

    /// Check if Governance service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// Request to check compliance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceCheckRequest {
    /// User ID
    pub user_id: String,
    /// Action being performed
    pub action: String,
    /// Resource being accessed
    pub resource: String,
    /// Model being used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Additional context
    #[serde(default)]
    pub context: serde_json::Value,
}

/// Response from compliance check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceCheckResponse {
    /// Whether the request is compliant
    pub compliant: bool,
    /// List of violations
    #[serde(default)]
    pub violations: Vec<ComplianceViolation>,
    /// Recommendations
    #[serde(default)]
    pub recommendations: Vec<String>,
}

impl Default for ComplianceCheckResponse {
    fn default() -> Self {
        Self {
            compliant: true,
            violations: Vec::new(),
            recommendations: Vec::new(),
        }
    }
}

/// A compliance violation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceViolation {
    /// Violation code
    pub code: String,
    /// Severity level
    pub severity: ViolationSeverity,
    /// Description
    pub description: String,
    /// Policy that was violated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy: Option<String>,
}

/// Severity of a compliance violation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViolationSeverity {
    /// Low severity
    Low,
    /// Medium severity
    Medium,
    /// High severity
    High,
    /// Critical severity
    Critical,
}

/// An audit event to log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Event type
    pub event_type: String,
    /// User ID
    pub user_id: String,
    /// Action performed
    pub action: String,
    /// Resource affected
    pub resource: String,
    /// Outcome
    pub outcome: AuditOutcome,
    /// Additional details
    #[serde(default)]
    pub details: serde_json::Value,
    /// Timestamp (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// Outcome of an audited action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditOutcome {
    /// Action succeeded
    Success,
    /// Action failed
    Failure,
    /// Action was denied
    Denied,
}

/// Response from audit logging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogResponse {
    /// Whether logging was successful
    pub success: bool,
    /// Audit event ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
}

/// Request for audit trail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditTrailRequest {
    /// User ID filter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Action filter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    /// Start time (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    /// End time (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    /// Maximum results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

/// Response with audit trail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditTrailResponse {
    /// Audit events
    pub events: Vec<AuditEvent>,
    /// Total count
    pub total: u64,
}

/// Response with approved models.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovedModelsResponse {
    /// List of approved models
    pub models: Vec<ApprovedModel>,
}

/// An approved model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovedModel {
    /// Provider
    pub provider: String,
    /// Model ID
    pub model: String,
    /// Approval status
    pub status: ModelApprovalStatus,
    /// Restrictions
    #[serde(default)]
    pub restrictions: Vec<String>,
}

/// Approval status for a model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelApprovalStatus {
    /// Fully approved
    Approved,
    /// Approved with restrictions
    Restricted,
    /// Under review
    Review,
    /// Not approved
    Denied,
}
