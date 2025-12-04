//! LLM Edge Agent integration client.
//!
//! Edge Agent handles policy distribution to edge locations.

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for LLM Edge Agent service.
pub struct EdgeAgentClient {
    client: IntegrationClient,
}

impl EdgeAgentClient {
    /// Create a new Edge Agent client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Deploy a policy to edge locations.
    pub async fn deploy_policy(
        &self,
        request: &PolicyDeployRequest,
    ) -> IntegrationResult<PolicyDeployResponse> {
        self.client.post("/api/v1/deploy", request).await
    }

    /// Sync policies with edge.
    pub async fn sync_policies(&self, force: bool) -> IntegrationResult<PolicySyncResponse> {
        let request = PolicySyncRequest { force };
        self.client.post("/api/v1/sync", &request).await
    }

    /// Get deployment status.
    pub async fn get_deployment(
        &self,
        deployment_id: &str,
    ) -> IntegrationResult<DeploymentStatus> {
        let path = format!("/api/v1/deployments/{}", deployment_id);
        self.client.get(&path).await
    }

    /// Get edge locations.
    pub async fn get_locations(&self) -> IntegrationResult<EdgeLocationsResponse> {
        self.client.get("/api/v1/locations").await
    }

    /// Get policies deployed to edge.
    pub async fn get_policies(&self) -> IntegrationResult<EdgePoliciesResponse> {
        self.client.get("/api/v1/policies").await
    }

    /// Remove a policy from edge.
    pub async fn remove_policy(&self, policy_id: &str) -> IntegrationResult<PolicyRemoveResponse> {
        let path = format!("/api/v1/policies/{}", policy_id);
        self.client.get(&path).await
    }

    /// Check if Edge Agent service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// Request to deploy a policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDeployRequest {
    /// Policy ID to deploy
    pub policy_id: String,
    /// Target regions
    #[serde(default)]
    pub regions: Vec<String>,
    /// Deployment priority
    #[serde(default)]
    pub priority: i32,
    /// Whether to force deployment
    #[serde(default)]
    pub force: bool,
}

/// Response from policy deployment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDeployResponse {
    /// Whether deployment was initiated
    pub success: bool,
    /// Deployment ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deployment_id: Option<String>,
    /// Estimated completion time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_completion: Option<String>,
}

/// Request to sync policies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySyncRequest {
    /// Force sync even if no changes
    pub force: bool,
}

/// Response from policy sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySyncResponse {
    /// Whether sync was successful
    pub success: bool,
    /// Number of policies synced
    pub policies_synced: u32,
    /// Sync timestamp
    pub synced_at: String,
}

/// Deployment status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentStatus {
    /// Deployment ID
    pub deployment_id: String,
    /// Policy ID
    pub policy_id: String,
    /// Current status
    pub status: DeploymentState,
    /// Progress percentage
    pub progress: u32,
    /// Target regions
    pub regions: Vec<RegionStatus>,
    /// Created at
    pub created_at: String,
    /// Updated at
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Deployment state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentState {
    /// Deployment pending
    Pending,
    /// Deployment in progress
    InProgress,
    /// Deployment completed
    Completed,
    /// Deployment failed
    Failed,
    /// Deployment rolled back
    RolledBack,
}

/// Status of a region deployment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionStatus {
    /// Region name
    pub region: String,
    /// Status
    pub status: DeploymentState,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response with edge locations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeLocationsResponse {
    /// Available locations
    pub locations: Vec<EdgeLocation>,
}

/// An edge location.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeLocation {
    /// Location ID
    pub id: String,
    /// Region name
    pub region: String,
    /// Location name
    pub name: String,
    /// Whether location is active
    pub active: bool,
    /// Number of policies deployed
    pub policy_count: u32,
}

/// Response with edge policies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgePoliciesResponse {
    /// Deployed policies
    pub policies: Vec<EdgePolicy>,
}

/// A policy deployed to edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgePolicy {
    /// Policy ID
    pub policy_id: String,
    /// Policy version
    pub version: String,
    /// Deployed regions
    pub regions: Vec<String>,
    /// Last synced at
    pub synced_at: String,
}

/// Response from policy removal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRemoveResponse {
    /// Whether removal was successful
    pub success: bool,
    /// Removed from regions
    pub regions: Vec<String>,
}
