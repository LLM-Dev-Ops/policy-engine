//! Base integration client functionality.

use crate::Result;
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;

/// Result from an integration call.
#[derive(Debug, Clone)]
pub enum IntegrationResult<T> {
    /// Successful result
    Success(T),
    /// Service unavailable (graceful degradation)
    Unavailable,
    /// Error occurred
    Error(String),
}

impl<T> IntegrationResult<T> {
    /// Check if the result is successful.
    pub fn is_success(&self) -> bool {
        matches!(self, IntegrationResult::Success(_))
    }

    /// Get the value if successful.
    pub fn value(&self) -> Option<&T> {
        match self {
            IntegrationResult::Success(v) => Some(v),
            _ => None,
        }
    }

    /// Get the value or a default.
    pub fn unwrap_or(self, default: T) -> T {
        match self {
            IntegrationResult::Success(v) => v,
            _ => default,
        }
    }

    /// Transform a successful value while preserving degradation and error states.
    pub fn map<U, F>(self, transform: F) -> IntegrationResult<U>
    where
        F: FnOnce(T) -> U,
    {
        match self {
            IntegrationResult::Success(value) => IntegrationResult::Success(transform(value)),
            IntegrationResult::Unavailable => IntegrationResult::Unavailable,
            IntegrationResult::Error(error) => IntegrationResult::Error(error),
        }
    }
}

/// Base client for integrations.
pub struct IntegrationClient {
    base_url: String,
    timeout: Duration,
    client: reqwest::Client,
}

impl IntegrationClient {
    /// Create a new integration client.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .user_agent("LLM-Policy-Engine/1.0")
            .build()
            .expect("Failed to create HTTP client");

        Self {
            base_url,
            timeout,
            client,
        }
    }

    /// Get the base URL.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Get the timeout duration.
    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    /// Perform a GET request.
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> IntegrationResult<T> {
        let url = format!("{}{}", self.base_url, path);

        match self.client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<T>().await {
                        Ok(data) => IntegrationResult::Success(data),
                        Err(e) => IntegrationResult::Error(format!("Failed to parse response: {}", e)),
                    }
                } else {
                    IntegrationResult::Error(format!("HTTP error: {}", response.status()))
                }
            }
            Err(e) => {
                if e.is_timeout() || e.is_connect() {
                    IntegrationResult::Unavailable
                } else {
                    IntegrationResult::Error(format!("Request failed: {}", e))
                }
            }
        }
    }

    /// Perform a POST request.
    pub async fn post<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> IntegrationResult<T> {
        let url = format!("{}{}", self.base_url, path);

        match self.client.post(&url).json(body).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<T>().await {
                        Ok(data) => IntegrationResult::Success(data),
                        Err(e) => IntegrationResult::Error(format!("Failed to parse response: {}", e)),
                    }
                } else {
                    IntegrationResult::Error(format!("HTTP error: {}", response.status()))
                }
            }
            Err(e) => {
                if e.is_timeout() || e.is_connect() {
                    IntegrationResult::Unavailable
                } else {
                    IntegrationResult::Error(format!("Request failed: {}", e))
                }
            }
        }
    }

    /// Check if the service is healthy.
    pub async fn health_check(&self) -> bool {
        let url = format!("{}/health", self.base_url);

        match self.client.get(&url).send().await {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::IntegrationResult;

    #[test]
    fn map_transforms_success() {
        let result = IntegrationResult::Success(21).map(|value| value * 2);

        assert!(matches!(result, IntegrationResult::Success(42)));
    }

    #[test]
    fn map_preserves_unavailable() {
        let result = IntegrationResult::<u32>::Unavailable.map(|value| value * 2);

        assert!(matches!(result, IntegrationResult::Unavailable));
    }

    #[test]
    fn map_preserves_error() {
        let result = IntegrationResult::<u32>::Error("request failed".to_string())
            .map(|value| value * 2);

        assert!(matches!(
            result,
            IntegrationResult::Error(message) if message == "request failed"
        ));
    }
}
