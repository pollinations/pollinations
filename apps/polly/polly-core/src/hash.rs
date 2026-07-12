use pyo3::prelude::*;
use sha2::{Digest, Sha256};
use xxhash_rust::xxh3::xxh3_64;

/// Hash a string using xxh3_64 (backward-compatible with Python xxhash).
#[pyfunction]
pub fn hash_xxh3(data: &str) -> String {
    format!("{:016x}", xxh3_64(data.as_bytes()))
}

/// Hash a string using SHA-256.
#[pyfunction]
pub fn hash_sha256(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xxh3_deterministic() {
        let h1 = hash_xxh3("hello world");
        let h2 = hash_xxh3("hello world");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 16);
    }

    #[test]
    fn test_sha256_deterministic() {
        let h1 = hash_sha256("hello world");
        let h2 = hash_sha256("hello world");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn test_different_inputs_different_hashes() {
        assert_ne!(hash_xxh3("hello"), hash_xxh3("world"));
        assert_ne!(hash_sha256("hello"), hash_sha256("world"));
    }
}
