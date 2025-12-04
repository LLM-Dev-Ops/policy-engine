//! LLM CostOps integration client.
//!
//! CostOps provides budget enforcement and cost tracking for LLM usage.

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for LLM CostOps service.
pub struct CostOpsClient {
    client: IntegrationClient,
}

impl CostOpsClient {
    /// Create a new CostOps client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Track LLM usage.
    pub async fn track_usage(&self, request: &UsageTrackRequest) -> IntegrationResult<UsageTrackResponse> {
        self.client.post("/api/v1/track", request).await
    }

    /// Check budget status.
    pub async fn check_budget(&self, request: &BudgetCheckRequest) -> IntegrationResult<BudgetCheckResponse> {
        self.client.post("/api/v1/budget/check", request).await
    }

    /// Get usage summary.
    pub async fn get_summary(&self, request: &SummaryRequest) -> IntegrationResult<UsageSummary> {
        self.client.post("/api/v1/summary", request).await
    }

    /// Check if CostOps service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// Request to track LLM usage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageTrackRequest {
    /// LLM provider
    pub provider: String,
    /// Model used
    pub model: String,
    /// Input tokens
    pub input_tokens: u32,
    /// Output tokens
    pub output_tokens: u32,
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

/// Response from usage tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageTrackResponse {
    /// Whether tracking was successful
    pub success: bool,
    /// Calculated cost in cents
    pub cost_cents: f64,
    /// Current budget status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget_status: Option<BudgetStatus>,
}

/// Request to check budget.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetCheckRequest {
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

/// Response from budget check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetCheckResponse {
    /// Budget status
    pub status: BudgetStatus,
    /// Whether request should be allowed
    pub allowed: bool,
    /// Reason if not allowed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Budget status information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetStatus {
    /// Budget limit in cents
    pub limit_cents: f64,
    /// Amount used in cents
    pub used_cents: f64,
    /// Remaining budget in cents
    pub remaining_cents: f64,
    /// Percentage used
    pub percentage_used: f64,
    /// Budget period (e.g., "monthly", "daily")
    pub period: String,
}

/// Request for usage summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryRequest {
    /// User ID filter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Team ID filter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    /// Project ID filter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Start date (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_date: Option<String>,
    /// End date (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
}

/// Usage summary response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSummary {
    /// Total cost in cents
    pub total_cost_cents: f64,
    /// Total input tokens
    pub total_input_tokens: u64,
    /// Total output tokens
    pub total_output_tokens: u64,
    /// Total requests
    pub total_requests: u64,
    /// Breakdown by provider
    #[serde(default)]
    pub by_provider: Vec<ProviderUsage>,
    /// Breakdown by model
    #[serde(default)]
    pub by_model: Vec<ModelUsage>,
}

/// Usage by provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUsage {
    /// Provider name
    pub provider: String,
    /// Cost in cents
    pub cost_cents: f64,
    /// Request count
    pub requests: u64,
}

/// Usage by model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelUsage {
    /// Model name
    pub model: String,
    /// Cost in cents
    pub cost_cents: f64,
    /// Request count
    pub requests: u64,
}
