//! LLM Shield integration client.
//!
//! Shield provides prompt injection and threat detection for LLM requests.

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for LLM Shield service.
pub struct ShieldClient {
    client: IntegrationClient,
}

impl ShieldClient {
    /// Create a new Shield client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Scan a prompt for threats.
    pub async fn scan_prompt(&self, request: &ShieldScanRequest) -> IntegrationResult<ShieldScanResponse> {
        self.client.post("/api/v1/scan", request).await
    }

    /// Check if Shield service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// Request to scan a prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldScanRequest {
    /// The prompt to scan
    pub prompt: String,
    /// Optional user context
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Optional model context
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

impl ShieldScanRequest {
    /// Create a new scan request.
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            user_id: None,
            model: None,
        }
    }

    /// Set the user ID.
    pub fn with_user_id(mut self, user_id: impl Into<String>) -> Self {
        self.user_id = Some(user_id.into());
        self
    }

    /// Set the model.
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }
}

/// Response from a prompt scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldScanResponse {
    /// Whether the prompt is considered safe
    pub safe: bool,
    /// Safety score (0.0 = unsafe, 1.0 = safe)
    pub safety_score: f64,
    /// Detected threat types
    pub threats: Vec<ThreatType>,
    /// Detailed threat information
    #[serde(default)]
    pub details: Vec<ThreatDetail>,
}

impl Default for ShieldScanResponse {
    fn default() -> Self {
        Self {
            safe: true,
            safety_score: 1.0,
            threats: Vec::new(),
            details: Vec::new(),
        }
    }
}

/// Types of threats that can be detected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThreatType {
    /// Prompt injection attempt
    PromptInjection,
    /// Jailbreak attempt
    Jailbreak,
    /// Data exfiltration attempt
    DataExfiltration,
    /// PII leakage risk
    PiiLeakage,
    /// Toxic or harmful content
    ToxicContent,
    /// Unknown threat type
    Unknown,
}

/// Detailed information about a detected threat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatDetail {
    /// Type of threat
    pub threat_type: ThreatType,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f64,
    /// Description of the threat
    pub description: String,
    /// Suggested mitigation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mitigation: Option<String>,
}
