//! Sentinel integration client.
//!
//! Sentinel provides security monitoring and anomaly detection.

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for Sentinel service.
pub struct SentinelClient {
    client: IntegrationClient,
}

impl SentinelClient {
    /// Create a new Sentinel client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Report a security event.
    pub async fn report_event(
        &self,
        event: &SecurityEvent,
    ) -> IntegrationResult<SecurityEventResponse> {
        self.client.post("/api/v1/events", event).await
    }

    /// Check for anomalies.
    pub async fn check_anomaly(
        &self,
        request: &AnomalyCheckRequest,
    ) -> IntegrationResult<AnomalyCheckResponse> {
        self.client.post("/api/v1/anomaly/check", request).await
    }

    /// Get threat intelligence.
    pub async fn get_threat_intel(&self, indicator: &str) -> IntegrationResult<ThreatIntelResponse> {
        let path = format!("/api/v1/intel/{}", indicator);
        self.client.get(&path).await
    }

    /// Get security score.
    pub async fn get_security_score(
        &self,
        request: &SecurityScoreRequest,
    ) -> IntegrationResult<SecurityScoreResponse> {
        self.client.post("/api/v1/score", request).await
    }

    /// Check if Sentinel service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// A security event to report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    /// Event type
    pub event_type: SecurityEventType,
    /// Event description
    pub description: String,
    /// Source IP
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_ip: Option<String>,
    /// User ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Resource affected
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    /// Severity
    pub severity: SecuritySeverity,
    /// Additional context
    #[serde(default)]
    pub context: serde_json::Value,
    /// Timestamp (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// Types of security events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityEventType {
    /// Authentication failure
    AuthFailure,
    /// Authorization failure
    AuthzFailure,
    /// Policy violation
    PolicyViolation,
    /// Rate limit exceeded
    RateLimitExceeded,
    /// Suspicious activity
    SuspiciousActivity,
    /// Data access
    DataAccess,
    /// Configuration change
    ConfigChange,
    /// Anomaly detected
    AnomalyDetected,
}

/// Security severity levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SecuritySeverity {
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

/// Response from security event reporting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEventResponse {
    /// Whether event was recorded
    pub success: bool,
    /// Event ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    /// Triggered alerts
    #[serde(default)]
    pub triggered_alerts: Vec<String>,
}

/// Request to check for anomalies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyCheckRequest {
    /// User ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Source IP
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_ip: Option<String>,
    /// Action being performed
    pub action: String,
    /// Resource being accessed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    /// Additional context
    #[serde(default)]
    pub context: serde_json::Value,
}

/// Response from anomaly check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyCheckResponse {
    /// Whether an anomaly was detected
    pub anomaly_detected: bool,
    /// Anomaly score (0.0 = normal, 1.0 = definitely anomalous)
    pub anomaly_score: f64,
    /// Detected anomalies
    #[serde(default)]
    pub anomalies: Vec<DetectedAnomaly>,
    /// Recommended action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended_action: Option<RecommendedAction>,
}

impl Default for AnomalyCheckResponse {
    fn default() -> Self {
        Self {
            anomaly_detected: false,
            anomaly_score: 0.0,
            anomalies: Vec::new(),
            recommended_action: None,
        }
    }
}

/// A detected anomaly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedAnomaly {
    /// Anomaly type
    pub anomaly_type: String,
    /// Description
    pub description: String,
    /// Confidence score
    pub confidence: f64,
    /// Indicators
    #[serde(default)]
    pub indicators: Vec<String>,
}

/// Recommended action for an anomaly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecommendedAction {
    /// No action needed
    None,
    /// Monitor the activity
    Monitor,
    /// Require additional authentication
    RequireAuth,
    /// Block the request
    Block,
    /// Alert security team
    Alert,
}

/// Request for threat intelligence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatIntelRequest {
    /// Indicator to look up
    pub indicator: String,
    /// Indicator type
    pub indicator_type: IndicatorType,
}

/// Types of threat indicators.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IndicatorType {
    /// IP address
    IpAddress,
    /// Domain
    Domain,
    /// Hash
    Hash,
    /// Email
    Email,
    /// User agent
    UserAgent,
}

/// Response from threat intelligence lookup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatIntelResponse {
    /// Whether threat is known
    pub known_threat: bool,
    /// Threat score (0.0 = safe, 1.0 = known threat)
    pub threat_score: f64,
    /// Threat categories
    #[serde(default)]
    pub categories: Vec<String>,
    /// First seen
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_seen: Option<String>,
    /// Last seen
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
    /// Reports
    #[serde(default)]
    pub reports: Vec<ThreatReport>,
}

/// A threat report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatReport {
    /// Report source
    pub source: String,
    /// Category
    pub category: String,
    /// Confidence
    pub confidence: f64,
    /// Report date
    pub date: String,
}

/// Request for security score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityScoreRequest {
    /// User ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Team ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    /// Project ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

/// Response with security score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityScoreResponse {
    /// Overall score (0-100)
    pub score: u32,
    /// Score breakdown
    pub breakdown: SecurityScoreBreakdown,
    /// Recommendations
    #[serde(default)]
    pub recommendations: Vec<String>,
}

/// Breakdown of security score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityScoreBreakdown {
    /// Authentication score
    pub authentication: u32,
    /// Authorization score
    pub authorization: u32,
    /// Policy compliance score
    pub policy_compliance: u32,
    /// Activity score
    pub activity: u32,
}
