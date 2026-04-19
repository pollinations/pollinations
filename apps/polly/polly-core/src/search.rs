use pyo3::prelude::*;
use std::collections::HashMap;
use std::path::PathBuf;

/// A search result with score and metadata.
#[pyclass]
#[derive(Clone, Debug)]
pub struct SearchResult {
    #[pyo3(get)]
    pub id: String,
    #[pyo3(get)]
    pub content: String,
    #[pyo3(get)]
    pub score: f32,
    #[pyo3(get)]
    pub metadata: HashMap<String, String>,
}

/// Hybrid search index combining HNSW vector search with BM25 text search.
/// Uses Reciprocal Rank Fusion (RRF) to merge results.
///
/// This is a placeholder implementation using in-memory brute-force search.
/// Phase 3 will replace internals with usearch (HNSW) + tantivy (BM25)
/// while keeping the same Python API.
#[pyclass]
pub struct HybridIndex {
    path: PathBuf,
    dimensions: u32,
    entries: Vec<IndexEntry>,
}

#[derive(Clone, Debug)]
struct IndexEntry {
    id: String,
    embedding: Vec<f32>,
    document: String,
    metadata: HashMap<String, String>,
}

#[pymethods]
impl HybridIndex {
    /// Create or load a hybrid index.
    #[new]
    #[pyo3(signature = (path, dimensions=1536))]
    fn new(path: &str, dimensions: u32) -> PyResult<Self> {
        let path = PathBuf::from(path);
        std::fs::create_dir_all(&path).map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyIOError, _>(format!(
                "failed to create index directory: {e}"
            ))
        })?;

        // Try to load existing index
        let entries = Self::load_from_disk(&path).unwrap_or_default();

        Ok(HybridIndex {
            path,
            dimensions,
            entries,
        })
    }

    /// Add entries to the index.
    fn add(
        &mut self,
        ids: Vec<String>,
        embeddings: Vec<Vec<f32>>,
        documents: Vec<String>,
        metadatas: Vec<HashMap<String, String>>,
    ) -> PyResult<()> {
        if ids.len() != embeddings.len()
            || ids.len() != documents.len()
            || ids.len() != metadatas.len()
        {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "all input lists must have the same length",
            ));
        }

        for i in 0..ids.len() {
            // Remove existing entry with same ID (upsert behavior)
            self.entries.retain(|e| e.id != ids[i]);

            self.entries.push(IndexEntry {
                id: ids[i].clone(),
                embedding: embeddings[i].clone(),
                document: documents[i].clone(),
                metadata: metadatas[i].clone(),
            });
        }

        self.save_to_disk()?;
        Ok(())
    }

    /// Hybrid search combining vector similarity and text matching.
    ///
    /// Args:
    ///     query_text: Text query for BM25 matching
    ///     query_embedding: Vector for HNSW similarity search
    ///     top_k: Number of results to return
    ///     alpha: Weight for vector search (0.0 = pure BM25, 1.0 = pure vector)
    #[pyo3(signature = (query_text, query_embedding, top_k=5, alpha=0.6))]
    fn search(
        &self,
        query_text: &str,
        query_embedding: Vec<f32>,
        top_k: usize,
        alpha: f32,
    ) -> Vec<SearchResult> {
        if self.entries.is_empty() {
            return vec![];
        }

        let candidate_k = (top_k * 4).min(self.entries.len());

        // Vector search (cosine similarity)
        let mut vector_scores: Vec<(usize, f32)> = self
            .entries
            .iter()
            .enumerate()
            .map(|(i, entry)| (i, cosine_similarity(&query_embedding, &entry.embedding)))
            .collect();
        vector_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let vector_top: Vec<(usize, usize)> = vector_scores
            .iter()
            .take(candidate_k)
            .enumerate()
            .map(|(rank, &(idx, _))| (idx, rank))
            .collect();

        // BM25-style text search (simple TF-based scoring)
        let query_terms: Vec<&str> = query_text.split_whitespace().collect();
        let mut text_scores: Vec<(usize, f32)> = self
            .entries
            .iter()
            .enumerate()
            .map(|(i, entry)| {
                let doc_lower = entry.document.to_lowercase();
                let score: f32 = query_terms
                    .iter()
                    .map(|term| {
                        let term_lower = term.to_lowercase();
                        let count = doc_lower.matches(&term_lower).count() as f32;
                        if count > 0.0 {
                            (1.0 + count.ln()) / (1.0 + (doc_lower.len() as f32).ln())
                        } else {
                            0.0
                        }
                    })
                    .sum();
                (i, score)
            })
            .collect();
        text_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let text_top: Vec<(usize, usize)> = text_scores
            .iter()
            .take(candidate_k)
            .enumerate()
            .map(|(rank, &(idx, _))| (idx, rank))
            .collect();

        // Reciprocal Rank Fusion
        let k: f32 = 60.0;
        let mut fused_scores: HashMap<usize, f32> = HashMap::new();

        for &(idx, rank) in &vector_top {
            *fused_scores.entry(idx).or_insert(0.0) += alpha / (k + rank as f32);
        }
        for &(idx, rank) in &text_top {
            *fused_scores.entry(idx).or_insert(0.0) += (1.0 - alpha) / (k + rank as f32);
        }

        // Sort by fused score
        let mut fused: Vec<(usize, f32)> = fused_scores.into_iter().collect();
        fused.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        fused
            .into_iter()
            .take(top_k)
            .map(|(idx, score)| {
                let entry = &self.entries[idx];
                SearchResult {
                    id: entry.id.clone(),
                    content: entry.document.clone(),
                    score,
                    metadata: entry.metadata.clone(),
                }
            })
            .collect()
    }

    /// Delete entries by ID.
    fn delete(&mut self, ids: Vec<String>) -> PyResult<()> {
        let id_set: std::collections::HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();
        self.entries.retain(|e| !id_set.contains(e.id.as_str()));
        self.save_to_disk()?;
        Ok(())
    }

    /// Get entries matching metadata filters.
    fn get(&self, filter: HashMap<String, String>) -> Vec<HashMap<String, String>> {
        self.entries
            .iter()
            .filter(|entry| {
                filter
                    .iter()
                    .all(|(k, v)| entry.metadata.get(k).map_or(false, |mv| mv == v))
            })
            .map(|entry| {
                let mut result = entry.metadata.clone();
                result.insert("id".to_string(), entry.id.clone());
                result
            })
            .collect()
    }

    /// Number of entries in the index.
    fn count(&self) -> usize {
        self.entries.len()
    }

    /// Force save to disk.
    fn save(&self) -> PyResult<()> {
        self.save_to_disk()
    }
}

impl HybridIndex {
    fn save_to_disk(&self) -> PyResult<()> {
        let data: Vec<SerializedEntry> = self
            .entries
            .iter()
            .map(|e| SerializedEntry {
                id: e.id.clone(),
                embedding: e.embedding.clone(),
                document: e.document.clone(),
                metadata: e.metadata.clone(),
            })
            .collect();

        let json = serde_json::to_vec(&data).map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("serialization error: {e}"))
        })?;

        let index_path = self.path.join("index.json");
        std::fs::write(&index_path, json).map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("write error: {e}"))
        })?;

        Ok(())
    }

    fn load_from_disk(path: &PathBuf) -> Option<Vec<IndexEntry>> {
        let index_path = path.join("index.json");
        let data = std::fs::read(&index_path).ok()?;
        let entries: Vec<SerializedEntry> = serde_json::from_slice(&data).ok()?;
        Some(
            entries
                .into_iter()
                .map(|e| IndexEntry {
                    id: e.id,
                    embedding: e.embedding,
                    document: e.document,
                    metadata: e.metadata,
                })
                .collect(),
        )
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SerializedEntry {
    id: String,
    embedding: Vec<f32>,
    document: String,
    metadata: HashMap<String, String>,
}

/// Cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom < 1e-10 {
        0.0
    } else {
        dot / denom
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);

        let c = vec![0.0, 1.0, 0.0];
        assert!(cosine_similarity(&a, &c).abs() < 1e-6);
    }

    #[test]
    fn test_hybrid_index_basic() {
        let dir = std::env::temp_dir().join("polly_core_test_search");
        let _ = std::fs::remove_dir_all(&dir);

        let mut index = HybridIndex::new(dir.to_str().unwrap(), 3).unwrap();

        index
            .add(
                vec!["doc1".into(), "doc2".into(), "doc3".into()],
                vec![
                    vec![1.0, 0.0, 0.0],
                    vec![0.0, 1.0, 0.0],
                    vec![0.7, 0.7, 0.0],
                ],
                vec![
                    "rust programming language".into(),
                    "python programming language".into(),
                    "rust and python together".into(),
                ],
                vec![HashMap::new(), HashMap::new(), HashMap::new()],
            )
            .unwrap();

        assert_eq!(index.count(), 3);

        // Search for "rust" with embedding close to doc1
        let results = index.search("rust", vec![0.9, 0.1, 0.0], 2, 0.6);
        assert_eq!(results.len(), 2);
        // doc1 or doc3 should be first (both match "rust" + have high vector similarity)
        assert!(results[0].id == "doc1" || results[0].id == "doc3");

        // Delete
        index.delete(vec!["doc2".into()]).unwrap();
        assert_eq!(index.count(), 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_hybrid_index_persistence() {
        let dir = std::env::temp_dir().join("polly_core_test_persist");
        let _ = std::fs::remove_dir_all(&dir);

        {
            let mut index = HybridIndex::new(dir.to_str().unwrap(), 3).unwrap();
            index
                .add(
                    vec!["test".into()],
                    vec![vec![1.0, 0.0, 0.0]],
                    vec!["test document".into()],
                    vec![HashMap::new()],
                )
                .unwrap();
        }

        // Reload from disk
        let index = HybridIndex::new(dir.to_str().unwrap(), 3).unwrap();
        assert_eq!(index.count(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
