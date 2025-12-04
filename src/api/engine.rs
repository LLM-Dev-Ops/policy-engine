//! Policy engine implementation.

use super::{EvaluationContext, PolicyDecision};
use crate::cache::DecisionCache;
use crate::config::Config;
use crate::core::Evaluator;
use crate::policy::{DecisionType, Policy, PolicyDocument};
use crate::telemetry::Telemetry;
use crate::Result;

use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

/// The main policy engine for evaluating policies.
pub struct PolicyEngine {
    /// Loaded policies indexed by ID
    policies: Arc<RwLock<HashMap<String, Policy>>>,
    /// Policy evaluator
    evaluator: Evaluator,
    /// Decision cache
    cache: Option<DecisionCache>,
    /// Telemetry instance
    telemetry: Option<Telemetry>,
    /// Configuration
    config: Config,
}

impl PolicyEngine {
    /// Create a policy engine builder.
    pub fn builder() -> PolicyEngineBuilder {
        PolicyEngineBuilder::new()
    }

    /// Create a new policy engine with the given configuration.
    pub fn new(config: Config) -> Self {
        let cache = if config.cache.enabled {
            Some(DecisionCache::new(
                config.cache.l1_max_entries,
                config.cache.l1_ttl(),
            ))
        } else {
            None
        };

        Self {
            policies: Arc::new(RwLock::new(HashMap::new())),
            evaluator: Evaluator::new(),
            cache,
            telemetry: None,
            config,
        }
    }

    /// Evaluate policies against the given context.
    ///
    /// This is the main entry point for policy evaluation. It will:
    /// 1. Check the cache for a cached decision
    /// 2. Evaluate all enabled policies in priority order
    /// 3. Return the first deny decision, or allow if no policies deny
    /// 4. Cache the result for future requests
    ///
    /// # Arguments
    /// * `context` - The evaluation context containing LLM, user, and request information
    ///
    /// # Returns
    /// * `Ok(PolicyDecision)` - The result of the evaluation
    /// * `Err(Error)` - If an error occurred during evaluation
    pub async fn evaluate(&self, context: &EvaluationContext) -> Result<PolicyDecision> {
        let start = Instant::now();

        // Check cache
        if let Some(ref cache) = self.cache {
            if let Some(cached) = cache.get(context) {
                let mut decision = cached;
                decision.evaluation_time_ms = start.elapsed().as_secs_f64() * 1000.0;
                if let Some(ref mut trace) = decision.trace {
                    trace.cached = true;
                }
                return Ok(decision);
            }
        }

        // Get policies sorted by priority
        let policies = self.get_enabled_policies();

        // Evaluate policies
        let decision = self.evaluator.evaluate(&policies, context)?;

        // Calculate final evaluation time
        let mut final_decision = decision;
        final_decision.evaluation_time_ms = start.elapsed().as_secs_f64() * 1000.0;

        // Cache result
        if let Some(ref cache) = self.cache {
            cache.put(context, &final_decision);
        }

        // Record metrics
        if let Some(ref telemetry) = self.telemetry {
            telemetry.record_evaluation(
                &final_decision.decision,
                final_decision.evaluation_time_ms,
                self.cache.is_some(),
            );
        }

        Ok(final_decision)
    }

    /// Validate a policy document without loading it.
    ///
    /// # Arguments
    /// * `document` - The policy document to validate
    ///
    /// # Returns
    /// * `Ok(())` - If the document is valid
    /// * `Err(Error)` - If validation fails
    pub fn validate_document(&self, document: &PolicyDocument) -> Result<()> {
        document.validate()
    }

    /// Validate a policy.
    ///
    /// # Arguments
    /// * `policy` - The policy to validate
    ///
    /// # Returns
    /// * `Ok(())` - If the policy is valid
    /// * `Err(Error)` - If validation fails
    pub fn validate_policy(&self, policy: &Policy) -> Result<()> {
        policy.validate()
    }

    /// Load a policy document from a file.
    ///
    /// # Arguments
    /// * `path` - Path to the policy file (YAML or JSON)
    ///
    /// # Returns
    /// * `Ok(Vec<String>)` - IDs of loaded policies
    /// * `Err(Error)` - If loading fails
    pub async fn load_policy_file(&self, path: impl AsRef<Path>) -> Result<Vec<String>> {
        let document = PolicyDocument::from_file(path)?;
        self.load_document(document).await
    }

    /// Load a policy document from a YAML string.
    ///
    /// # Arguments
    /// * `yaml` - The YAML content
    ///
    /// # Returns
    /// * `Ok(Vec<String>)` - IDs of loaded policies
    /// * `Err(Error)` - If loading fails
    pub async fn load_policy_yaml(&self, yaml: &str) -> Result<Vec<String>> {
        let document = PolicyDocument::from_yaml(yaml)?;
        self.load_document(document).await
    }

    /// Load a policy document from a JSON string.
    ///
    /// # Arguments
    /// * `json` - The JSON content
    ///
    /// # Returns
    /// * `Ok(Vec<String>)` - IDs of loaded policies
    /// * `Err(Error)` - If loading fails
    pub async fn load_policy_json(&self, json: &str) -> Result<Vec<String>> {
        let document = PolicyDocument::from_json(json)?;
        self.load_document(document).await
    }

    /// Load a policy document.
    async fn load_document(&self, document: PolicyDocument) -> Result<Vec<String>> {
        document.validate()?;

        let mut policies = self.policies.write();
        let mut loaded_ids = Vec::new();

        for policy in document.policies {
            loaded_ids.push(policy.id.clone());
            policies.insert(policy.id.clone(), policy);
        }

        // Clear cache when policies change
        if let Some(ref cache) = self.cache {
            cache.clear();
        }

        Ok(loaded_ids)
    }

    /// Load a single policy.
    ///
    /// # Arguments
    /// * `policy` - The policy to load
    ///
    /// # Returns
    /// * `Ok(String)` - The ID of the loaded policy
    /// * `Err(Error)` - If loading fails
    pub async fn load_policy(&self, policy: Policy) -> Result<String> {
        policy.validate()?;

        let id = policy.id.clone();
        let mut policies = self.policies.write();
        policies.insert(id.clone(), policy);

        // Clear cache when policies change
        if let Some(ref cache) = self.cache {
            cache.clear();
        }

        Ok(id)
    }

    /// Unload a policy by ID.
    ///
    /// # Arguments
    /// * `policy_id` - The ID of the policy to unload
    ///
    /// # Returns
    /// * `Ok(())` - If the policy was unloaded
    /// * `Err(Error)` - If the policy was not found
    pub async fn unload_policy(&self, policy_id: &str) -> Result<()> {
        let mut policies = self.policies.write();
        if policies.remove(policy_id).is_none() {
            return Err(crate::Error::validation(format!(
                "Policy not found: {}",
                policy_id
            )));
        }

        // Clear cache when policies change
        if let Some(ref cache) = self.cache {
            cache.clear();
        }

        Ok(())
    }

    /// Get a policy by ID.
    pub fn get_policy(&self, policy_id: &str) -> Option<Policy> {
        self.policies.read().get(policy_id).cloned()
    }

    /// List all loaded policy IDs.
    pub fn list_policies(&self) -> Vec<String> {
        self.policies.read().keys().cloned().collect()
    }

    /// Get the number of loaded policies.
    pub fn policy_count(&self) -> usize {
        self.policies.read().len()
    }

    /// Get enabled policies sorted by priority.
    fn get_enabled_policies(&self) -> Vec<Policy> {
        let policies = self.policies.read();
        let mut enabled: Vec<_> = policies.values().filter(|p| p.enabled).cloned().collect();
        enabled.sort_by(|a, b| b.priority.cmp(&a.priority));
        enabled
    }

    /// Clear the decision cache.
    pub fn clear_cache(&self) {
        if let Some(ref cache) = self.cache {
            cache.clear();
        }
    }

    /// Get cache statistics.
    pub fn cache_stats(&self) -> Option<CacheStats> {
        self.cache.as_ref().map(|c| c.stats())
    }

    /// Get engine metrics.
    pub fn metrics(&self) -> EngineMetrics {
        EngineMetrics {
            policy_count: self.policy_count(),
            cache_enabled: self.cache.is_some(),
            cache_stats: self.cache_stats(),
        }
    }
}

/// Builder for creating a PolicyEngine.
#[derive(Debug, Default)]
pub struct PolicyEngineBuilder {
    config: Option<Config>,
    policies: Vec<Policy>,
    policy_files: Vec<String>,
    telemetry_enabled: bool,
    cache_enabled: Option<bool>,
    cache_size: Option<usize>,
}

impl PolicyEngineBuilder {
    /// Create a new policy engine builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the configuration.
    pub fn with_config(mut self, config: Config) -> Self {
        self.config = Some(config);
        self
    }

    /// Add a policy to load.
    pub fn with_policy(mut self, policy: Policy) -> Self {
        self.policies.push(policy);
        self
    }

    /// Add a policy file to load.
    pub fn with_policy_file(mut self, path: impl Into<String>) -> Self {
        self.policy_files.push(path.into());
        self
    }

    /// Enable or disable telemetry.
    pub fn with_telemetry_enabled(mut self, enabled: bool) -> Self {
        self.telemetry_enabled = enabled;
        self
    }

    /// Enable or disable caching.
    pub fn with_cache_enabled(mut self, enabled: bool) -> Self {
        self.cache_enabled = Some(enabled);
        self
    }

    /// Set the cache size.
    pub fn with_cache_size(mut self, size: usize) -> Self {
        self.cache_size = Some(size);
        self
    }

    /// Build the policy engine.
    pub async fn build(self) -> Result<PolicyEngine> {
        let mut config = self.config.unwrap_or_default();

        // Apply builder overrides
        if let Some(enabled) = self.cache_enabled {
            config.cache.enabled = enabled;
        }
        if let Some(size) = self.cache_size {
            config.cache.l1_max_entries = size;
        }

        let mut engine = PolicyEngine::new(config);

        // Enable telemetry if requested
        if self.telemetry_enabled {
            engine.telemetry = Some(Telemetry::new(&engine.config.telemetry)?);
        }

        // Load policies
        for policy in self.policies {
            engine.load_policy(policy).await?;
        }

        // Load policy files
        for path in self.policy_files {
            engine.load_policy_file(&path).await?;
        }

        Ok(engine)
    }
}

/// Cache statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    /// Number of cache hits
    pub hits: u64,
    /// Number of cache misses
    pub misses: u64,
    /// Current cache size
    pub size: usize,
    /// Hit rate percentage
    pub hit_rate: f64,
}

use serde::{Deserialize, Serialize};

/// Engine metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineMetrics {
    /// Number of loaded policies
    pub policy_count: usize,
    /// Whether caching is enabled
    pub cache_enabled: bool,
    /// Cache statistics (if caching is enabled)
    pub cache_stats: Option<CacheStats>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::{Action, Condition, PolicyRule};

    fn sample_policy() -> Policy {
        Policy::builder("test-policy")
            .name("Test Policy")
            .rule(PolicyRule::new(
                "rule-1",
                "Deny unauthorized",
                Condition::equals("user.role", "guest"),
                Action::deny("Guests are not allowed"),
            ))
            .build()
    }

    #[tokio::test]
    async fn test_engine_creation() {
        let engine = PolicyEngine::builder()
            .with_cache_enabled(true)
            .build()
            .await
            .unwrap();

        assert_eq!(engine.policy_count(), 0);
        assert!(engine.cache.is_some());
    }

    #[tokio::test]
    async fn test_load_policy() {
        let engine = PolicyEngine::builder().build().await.unwrap();

        let policy = sample_policy();
        let id = engine.load_policy(policy).await.unwrap();

        assert_eq!(id, "test-policy");
        assert_eq!(engine.policy_count(), 1);
        assert!(engine.get_policy("test-policy").is_some());
    }

    #[tokio::test]
    async fn test_unload_policy() {
        let engine = PolicyEngine::builder()
            .with_policy(sample_policy())
            .build()
            .await
            .unwrap();

        assert_eq!(engine.policy_count(), 1);

        engine.unload_policy("test-policy").await.unwrap();

        assert_eq!(engine.policy_count(), 0);
    }

    #[tokio::test]
    async fn test_basic_evaluation() {
        let engine = PolicyEngine::builder()
            .with_policy(sample_policy())
            .build()
            .await
            .unwrap();

        let context = EvaluationContext::builder()
            .with_user("user-123", None, vec!["admin".to_string()])
            .build();

        let decision = engine.evaluate(&context).await.unwrap();

        // Should allow because user is admin, not guest
        assert!(decision.allowed);
    }
}
