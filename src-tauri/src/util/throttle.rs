use std::{
    collections::HashMap,
    hash::Hash,
    time::{Duration, Instant},
};

/// iroh-blobs reports progress per 16 KiB chunk; emitting each one floods the
/// webviews and blocks the UI thread on Windows.
pub const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// Rate limits progress updates per key. Terminal events (done, completed,
/// error) must bypass this; they are what drive the UI to its final state.
pub struct ProgressThrottle<K> {
    interval: Duration,
    last: HashMap<K, Instant>,
}

impl<K: Eq + Hash> ProgressThrottle<K> {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            last: HashMap::new(),
        }
    }

    pub fn ready(&mut self, key: K) -> bool {
        let now = Instant::now();
        match self.last.get_mut(&key) {
            Some(last) if now.duration_since(*last) < self.interval => false,
            Some(last) => {
                *last = now;
                true
            }
            None => {
                self.last.insert(key, now);
                true
            }
        }
    }

    pub fn forget(&mut self, key: &K) {
        self.last.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_updates_inside_interval() {
        let mut throttle = ProgressThrottle::new(Duration::from_secs(60));

        assert!(throttle.ready("a"));
        assert!(!throttle.ready("a"));
        assert!(throttle.ready("b"));

        throttle.forget(&"a");
        assert!(throttle.ready("a"));
    }

    #[test]
    fn zero_interval_passes_everything() {
        let mut throttle = ProgressThrottle::new(Duration::ZERO);

        assert!(throttle.ready(1));
        assert!(throttle.ready(1));
    }
}
