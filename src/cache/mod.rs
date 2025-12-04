//! Caching layer for policy decisions.
//!
//! This module provides multi-layer caching for policy decisions to improve
//! evaluation performance.

use crate::api::{EvaluationContext, PolicyDecision};
use crate::api::engine::CacheStats;

use lru::LruCache;
use parking_lot::Mutex;
use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// A cache for policy decisions.
pub struct DecisionCache {
    /// L1 in-memory cache
    l1: Mutex<LruCache<String, CachedDecision>>,
    /// TTL for cached entries
    ttl: Duration,
    /// Cache hit counter
    hits: AtomicU64,
    /// Cache miss counter
    misses: AtomicU64,
}

/// A cached decision with expiration time.
struct CachedDecision {
    decision: PolicyDecision,
    expires_at: Instant,
}

impl DecisionCache {
    /// Create a new decision cache.
    pub fn new(max_entries: usize, ttl: Duration) -> Self {
        let capacity = NonZeroUsize::new(max_entries).unwrap_or(NonZeroUsize::new(1).unwrap());
        Self {
            l1: Mutex::new(LruCache::new(capacity)),
            ttl,
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        }
    }

    /// Get a cached decision for the given context.
    pub fn get(&self, context: &EvaluationContext) -> Option<PolicyDecision> {
        let key = self.compute_key(context);
        let mut cache = self.l1.lock();

        if let Some(cached) = cache.get(&key) {
            if cached.expires_at > Instant::now() {
                self.hits.fetch_add(1, Ordering::Relaxed);
                return Some(cached.decision.clone());
            } else {
                // Entry expired, remove it
                cache.pop(&key);
            }
        }

        self.misses.fetch_add(1, Ordering::Relaxed);
        None
    }

    /// Cache a decision for the given context.
    pub fn put(&self, context: &EvaluationContext, decision: &PolicyDecision) {
        let key = self.compute_key(context);
        let cached = CachedDecision {
            decision: decision.clone(),
            expires_at: Instant::now() + self.ttl,
        };

        let mut cache = self.l1.lock();
        cache.put(key, cached);
    }

    /// Clear all cached entries.
    pub fn clear(&self) {
        let mut cache = self.l1.lock();
        cache.clear();
    }

    /// Get cache statistics.
    pub fn stats(&self) -> CacheStats {
        let hits = self.hits.load(Ordering::Relaxed);
        let misses = self.misses.load(Ordering::Relaxed);
        let total = hits + misses;
        let hit_rate = if total > 0 {
            (hits as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        CacheStats {
            hits,
            misses,
            size: self.l1.lock().len(),
            hit_rate,
        }
    }

    /// Compute a cache key for the given context.
    fn compute_key(&self, context: &EvaluationContext) -> String {
        // Use blake3 for fast, consistent hashing
        let json = serde_json::to_string(context).unwrap_or_default();
        let hash = blake3::hash(json.as_bytes());
        hash.to_hex().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::DecisionType;
    use std::thread;

    #[test]
    fn test_cache_put_get() {
        let cache = DecisionCache::new(100, Duration::from_secs(60));

        let context = EvaluationContext::builder()
            .with_user_id("user-123")
            .with_model("gpt-4")
            .build();

        let decision = PolicyDecision::allow();
        cache.put(&context, &decision);

        let cached = cache.get(&context);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().decision, DecisionType::Allow);
    }

    #[test]
    fn test_cache_miss() {
        let cache = DecisionCache::new(100, Duration::from_secs(60));

        let context = EvaluationContext::builder()
            .with_user_id("user-123")
            .build();

        let cached = cache.get(&context);
        assert!(cached.is_none());

        let stats = cache.stats();
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.hits, 0);
    }

    #[test]
    fn test_cache_expiration() {
        let cache = DecisionCache::new(100, Duration::from_millis(50));

        let context = EvaluationContext::builder()
            .with_user_id("user-123")
            .build();

        let decision = PolicyDecision::allow();
        cache.put(&context, &decision);

        // Should find it immediately
        assert!(cache.get(&context).is_some());

        // Wait for expiration
        thread::sleep(Duration::from_millis(100));

        // Should be expired now
        assert!(cache.get(&context).is_none());
    }

    #[test]
    fn test_cache_clear() {
        let cache = DecisionCache::new(100, Duration::from_secs(60));

        let context = EvaluationContext::builder()
            .with_user_id("user-123")
            .build();

        let decision = PolicyDecision::allow();
        cache.put(&context, &decision);

        cache.clear();

        assert!(cache.get(&context).is_none());
    }

    #[test]
    fn test_cache_stats() {
        let cache = DecisionCache::new(100, Duration::from_secs(60));

        let context1 = EvaluationContext::builder()
            .with_user_id("user-1")
            .build();
        let context2 = EvaluationContext::builder()
            .with_user_id("user-2")
            .build();

        let decision = PolicyDecision::allow();
        cache.put(&context1, &decision);

        // Hit
        cache.get(&context1);
        // Miss
        cache.get(&context2);

        let stats = cache.stats();
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.size, 1);
        assert_eq!(stats.hit_rate, 50.0);
    }
}
