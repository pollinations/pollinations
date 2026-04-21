use pyo3::prelude::*;

mod chunker;
mod files;
mod hash;
mod html;
mod search;
mod tokenizer;

/// polly_core - High-performance Rust core for Polly Discord bot
#[pymodule]
fn polly_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    // Tokenizer
    m.add_function(wrap_pyfunction!(tokenizer::count_tokens, m)?)?;
    m.add_function(wrap_pyfunction!(tokenizer::encode_tokens, m)?)?;
    m.add_function(wrap_pyfunction!(tokenizer::decode_tokens, m)?)?;
    m.add_function(wrap_pyfunction!(tokenizer::split_by_tokens, m)?)?;

    // Hashing
    m.add_function(wrap_pyfunction!(hash::hash_xxh3, m)?)?;
    m.add_function(wrap_pyfunction!(hash::hash_sha256, m)?)?;

    // File collection
    m.add_function(wrap_pyfunction!(files::collect_files, m)?)?;

    // AST chunking
    m.add_function(wrap_pyfunction!(chunker::chunk_code, m)?)?;
    m.add_function(wrap_pyfunction!(chunker::detect_language, m)?)?;

    // HTML parsing
    m.add_function(wrap_pyfunction!(html::parse_html, m)?)?;

    // Hybrid search
    m.add_class::<search::HybridIndex>()?;

    Ok(())
}
