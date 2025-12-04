//! Integration clients for external LLM Dev Ops services.
//!
//! This module provides clients for integrating with other services in the
//! LLM Dev Ops platform:
//!
//! - **Shield**: Prompt injection and threat detection
//! - **CostOps**: Budget enforcement and cost tracking
//! - **Governance**: Compliance checking and audit logging
//! - **Edge Agent**: Policy distribution to edge locations
//! - **Incident Manager**: Policy violation alerting
//! - **Sentinel**: Security monitoring

mod client;
mod costops;
mod edge_agent;
mod governance;
mod incident_manager;
mod sentinel;
mod shield;

pub use client::{IntegrationClient, IntegrationResult};
pub use costops::CostOpsClient;
pub use edge_agent::EdgeAgentClient;
pub use governance::GovernanceClient;
pub use incident_manager::IncidentManagerClient;
pub use sentinel::SentinelClient;
pub use shield::ShieldClient;

use crate::config::IntegrationsConfig;
use std::sync::Arc;

/// Collection of all integration clients.
pub struct Integrations {
    /// Shield client for threat detection
    pub shield: Option<Arc<ShieldClient>>,
    /// CostOps client for budget tracking
    pub costops: Option<Arc<CostOpsClient>>,
    /// Governance client for compliance
    pub governance: Option<Arc<GovernanceClient>>,
    /// Edge Agent client for policy distribution
    pub edge_agent: Option<Arc<EdgeAgentClient>>,
    /// Incident Manager client for alerting
    pub incident_manager: Option<Arc<IncidentManagerClient>>,
    /// Sentinel client for security monitoring
    pub sentinel: Option<Arc<SentinelClient>>,
}

impl Integrations {
    /// Create integrations from configuration.
    pub fn from_config(config: &IntegrationsConfig) -> Self {
        Self {
            shield: config
                .shield_url
                .as_ref()
                .map(|url| Arc::new(ShieldClient::new(url.clone(), config.timeout()))),
            costops: config
                .costops_url
                .as_ref()
                .map(|url| Arc::new(CostOpsClient::new(url.clone(), config.timeout()))),
            governance: config
                .governance_url
                .as_ref()
                .map(|url| Arc::new(GovernanceClient::new(url.clone(), config.timeout()))),
            edge_agent: config
                .edge_agent_url
                .as_ref()
                .map(|url| Arc::new(EdgeAgentClient::new(url.clone(), config.timeout()))),
            incident_manager: config
                .incident_manager_url
                .as_ref()
                .map(|url| Arc::new(IncidentManagerClient::new(url.clone(), config.timeout()))),
            sentinel: config
                .sentinel_url
                .as_ref()
                .map(|url| Arc::new(SentinelClient::new(url.clone(), config.timeout()))),
        }
    }

    /// Check if any integrations are configured.
    pub fn any_configured(&self) -> bool {
        self.shield.is_some()
            || self.costops.is_some()
            || self.governance.is_some()
            || self.edge_agent.is_some()
            || self.incident_manager.is_some()
            || self.sentinel.is_some()
    }
}
