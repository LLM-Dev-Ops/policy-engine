//! Evaluation context definitions.
//!
//! This module defines the context structures passed to policy evaluation,
//! matching the LLM Dev Ops platform conventions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Context provided for policy evaluation.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EvaluationContext {
    /// LLM-specific context (provider, model, prompt, etc.)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llm: Option<LlmContext>,
    /// User context (id, roles, permissions)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<UserContext>,
    /// Team context
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team: Option<TeamContext>,
    /// Project context
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectContext>,
    /// Request context (IP, user agent, timestamp)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request: Option<RequestContext>,
    /// Additional metadata
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,
}

impl EvaluationContext {
    /// Create an empty evaluation context.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a context builder.
    pub fn builder() -> EvaluationContextBuilder {
        EvaluationContextBuilder::new()
    }

    /// Get a value from the context by path (e.g., "llm.model", "user.roles").
    pub fn get(&self, path: &str) -> Option<serde_json::Value> {
        let parts: Vec<&str> = path.split('.').collect();
        if parts.is_empty() {
            return None;
        }

        match parts[0] {
            "llm" => {
                let llm = self.llm.as_ref()?;
                get_llm_field(llm, &parts[1..])
            }
            "user" => {
                let user = self.user.as_ref()?;
                get_user_field(user, &parts[1..])
            }
            "team" => {
                let team = self.team.as_ref()?;
                get_team_field(team, &parts[1..])
            }
            "project" => {
                let project = self.project.as_ref()?;
                get_project_field(project, &parts[1..])
            }
            "request" => {
                let request = self.request.as_ref()?;
                get_request_field(request, &parts[1..])
            }
            "metadata" => {
                if parts.len() > 1 {
                    self.metadata.get(parts[1]).cloned()
                } else {
                    Some(serde_json::to_value(&self.metadata).ok()?)
                }
            }
            _ => None,
        }
    }

    /// Convert to a JSON value for expression evaluation.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }
}

fn get_llm_field(llm: &LlmContext, parts: &[&str]) -> Option<serde_json::Value> {
    if parts.is_empty() {
        return Some(serde_json::to_value(llm).ok()?);
    }
    match parts[0] {
        "provider" => llm.provider.as_ref().map(|v| serde_json::json!(v)),
        "model" => llm.model.as_ref().map(|v| serde_json::json!(v)),
        "prompt" => llm.prompt.as_ref().map(|v| serde_json::json!(v)),
        "maxTokens" | "max_tokens" => llm.max_tokens.map(|v| serde_json::json!(v)),
        "temperature" => llm.temperature.map(|v| serde_json::json!(v)),
        _ => None,
    }
}

fn get_user_field(user: &UserContext, parts: &[&str]) -> Option<serde_json::Value> {
    if parts.is_empty() {
        return Some(serde_json::to_value(user).ok()?);
    }
    match parts[0] {
        "id" => Some(serde_json::json!(&user.id)),
        "email" => user.email.as_ref().map(|v| serde_json::json!(v)),
        "roles" => Some(serde_json::json!(&user.roles)),
        "permissions" => Some(serde_json::json!(&user.permissions)),
        _ => None,
    }
}

fn get_team_field(team: &TeamContext, parts: &[&str]) -> Option<serde_json::Value> {
    if parts.is_empty() {
        return Some(serde_json::to_value(team).ok()?);
    }
    match parts[0] {
        "id" => Some(serde_json::json!(&team.id)),
        "name" => team.name.as_ref().map(|v| serde_json::json!(v)),
        "tier" => team.tier.as_ref().map(|v| serde_json::json!(v)),
        _ => None,
    }
}

fn get_project_field(project: &ProjectContext, parts: &[&str]) -> Option<serde_json::Value> {
    if parts.is_empty() {
        return Some(serde_json::to_value(project).ok()?);
    }
    match parts[0] {
        "id" => Some(serde_json::json!(&project.id)),
        "name" => project.name.as_ref().map(|v| serde_json::json!(v)),
        "environment" => project.environment.as_ref().map(|v| serde_json::json!(v)),
        _ => None,
    }
}

fn get_request_field(request: &RequestContext, parts: &[&str]) -> Option<serde_json::Value> {
    if parts.is_empty() {
        return Some(serde_json::to_value(request).ok()?);
    }
    match parts[0] {
        "id" => Some(serde_json::json!(&request.id)),
        "timestamp" => request.timestamp.map(|v| serde_json::json!(v)),
        "ipAddress" | "ip_address" => request.ip_address.as_ref().map(|v| serde_json::json!(v)),
        "userAgent" | "user_agent" => request.user_agent.as_ref().map(|v| serde_json::json!(v)),
        _ => None,
    }
}

/// LLM-specific context.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmContext {
    /// LLM provider (e.g., "openai", "anthropic")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Model identifier (e.g., "gpt-4", "claude-3-opus")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The prompt being sent
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Maximum tokens for the response
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Temperature setting
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Function definitions (for function calling)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub functions: Option<Vec<serde_json::Value>>,
}

/// User context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    /// User identifier
    pub id: String,
    /// User email
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// User roles
    #[serde(default)]
    pub roles: Vec<String>,
    /// User permissions
    #[serde(default)]
    pub permissions: Vec<String>,
}

/// Team context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamContext {
    /// Team identifier
    pub id: String,
    /// Team name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Team tier (e.g., "free", "premium", "enterprise")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
}

/// Project context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    /// Project identifier
    pub id: String,
    /// Project name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Environment (e.g., "production", "staging", "development")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
}

/// Request context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestContext {
    /// Request identifier
    pub id: String,
    /// Request timestamp (Unix timestamp)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    /// Client IP address
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ip_address: Option<String>,
    /// Client user agent
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
}

/// Builder for creating evaluation contexts.
#[derive(Debug, Default)]
pub struct EvaluationContextBuilder {
    llm: Option<LlmContext>,
    user: Option<UserContext>,
    team: Option<TeamContext>,
    project: Option<ProjectContext>,
    request: Option<RequestContext>,
    metadata: HashMap<String, serde_json::Value>,
}

impl EvaluationContextBuilder {
    /// Create a new context builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the LLM provider.
    pub fn with_provider(mut self, provider: impl Into<String>) -> Self {
        self.llm.get_or_insert_with(LlmContext::default).provider = Some(provider.into());
        self
    }

    /// Set the LLM model.
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.llm.get_or_insert_with(LlmContext::default).model = Some(model.into());
        self
    }

    /// Set the prompt.
    pub fn with_prompt(mut self, prompt: impl Into<String>) -> Self {
        self.llm.get_or_insert_with(LlmContext::default).prompt = Some(prompt.into());
        self
    }

    /// Set max tokens.
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.llm.get_or_insert_with(LlmContext::default).max_tokens = Some(max_tokens);
        self
    }

    /// Set temperature.
    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.llm.get_or_insert_with(LlmContext::default).temperature = Some(temperature);
        self
    }

    /// Set the user ID.
    pub fn with_user_id(mut self, id: impl Into<String>) -> Self {
        self.user = Some(UserContext {
            id: id.into(),
            email: None,
            roles: Vec::new(),
            permissions: Vec::new(),
        });
        self
    }

    /// Set user details.
    pub fn with_user(
        mut self,
        id: impl Into<String>,
        email: Option<String>,
        roles: Vec<String>,
    ) -> Self {
        self.user = Some(UserContext {
            id: id.into(),
            email,
            roles,
            permissions: Vec::new(),
        });
        self
    }

    /// Set the team.
    pub fn with_team(mut self, id: impl Into<String>, name: Option<String>, tier: Option<String>) -> Self {
        self.team = Some(TeamContext {
            id: id.into(),
            name,
            tier,
        });
        self
    }

    /// Set the project.
    pub fn with_project(
        mut self,
        id: impl Into<String>,
        name: Option<String>,
        environment: Option<String>,
    ) -> Self {
        self.project = Some(ProjectContext {
            id: id.into(),
            name,
            environment,
        });
        self
    }

    /// Set the request context.
    pub fn with_request(mut self, id: impl Into<String>) -> Self {
        self.request = Some(RequestContext {
            id: id.into(),
            timestamp: Some(chrono::Utc::now().timestamp()),
            ip_address: None,
            user_agent: None,
        });
        self
    }

    /// Set full request context.
    pub fn with_request_details(
        mut self,
        id: impl Into<String>,
        ip_address: Option<String>,
        user_agent: Option<String>,
    ) -> Self {
        self.request = Some(RequestContext {
            id: id.into(),
            timestamp: Some(chrono::Utc::now().timestamp()),
            ip_address,
            user_agent,
        });
        self
    }

    /// Add metadata.
    pub fn with_metadata(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }

    /// Build the evaluation context.
    pub fn build(self) -> EvaluationContext {
        EvaluationContext {
            llm: self.llm,
            user: self.user,
            team: self.team,
            project: self.project,
            request: self.request,
            metadata: self.metadata,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_builder() {
        let ctx = EvaluationContext::builder()
            .with_provider("openai")
            .with_model("gpt-4")
            .with_user_id("user-123")
            .build();

        assert_eq!(ctx.llm.as_ref().unwrap().provider, Some("openai".to_string()));
        assert_eq!(ctx.llm.as_ref().unwrap().model, Some("gpt-4".to_string()));
        assert_eq!(ctx.user.as_ref().unwrap().id, "user-123");
    }

    #[test]
    fn test_context_get() {
        let ctx = EvaluationContext::builder()
            .with_provider("openai")
            .with_model("gpt-4")
            .with_user("user-123", Some("test@example.com".to_string()), vec!["admin".to_string()])
            .build();

        assert_eq!(ctx.get("llm.provider"), Some(serde_json::json!("openai")));
        assert_eq!(ctx.get("llm.model"), Some(serde_json::json!("gpt-4")));
        assert_eq!(ctx.get("user.id"), Some(serde_json::json!("user-123")));
        assert_eq!(ctx.get("user.roles"), Some(serde_json::json!(["admin"])));
    }

    #[test]
    fn test_context_serialization() {
        let ctx = EvaluationContext::builder()
            .with_model("gpt-4")
            .with_user_id("user-123")
            .build();

        let json = serde_json::to_string(&ctx).unwrap();
        let parsed: EvaluationContext = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.llm.as_ref().unwrap().model, ctx.llm.as_ref().unwrap().model);
    }
}
