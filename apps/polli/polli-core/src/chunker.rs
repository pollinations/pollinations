use pyo3::prelude::*;
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::tokenizer;

/// Mapping of file extensions to tree-sitter language names.
static LANG_MAP: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("py", "python");
    m.insert("pyi", "python");
    m.insert("js", "javascript");
    m.insert("jsx", "javascript");
    m.insert("mjs", "javascript");
    m.insert("cjs", "javascript");
    m.insert("ts", "typescript");
    m.insert("tsx", "typescript");
    m.insert("rs", "rust");
    m.insert("go", "go");
    m.insert("java", "java");
    m.insert("c", "c");
    m.insert("h", "c");
    m.insert("cpp", "cpp");
    m.insert("cc", "cpp");
    m.insert("cxx", "cpp");
    m.insert("hpp", "cpp");
    m.insert("hh", "cpp");
    m
});

/// Detect programming language from file extension.
#[pyfunction]
pub fn detect_language(file_path: &str) -> Option<String> {
    let ext = file_path.rsplit('.').next()?;
    LANG_MAP.get(ext).map(|s| s.to_string())
}

/// A code chunk produced by AST-aware or line-based chunking.
#[pyclass]
#[derive(Clone)]
pub struct CodeChunk {
    #[pyo3(get)]
    pub content: String,
    #[pyo3(get)]
    pub file_path: String,
    #[pyo3(get)]
    pub start_line: u32,
    #[pyo3(get)]
    pub end_line: u32,
    #[pyo3(get)]
    pub node_type: String,
}

#[pymethods]
impl CodeChunk {
    fn __repr__(&self) -> String {
        format!(
            "CodeChunk(file='{}', lines={}-{}, type='{}', tokens={})",
            self.file_path,
            self.start_line,
            self.end_line,
            self.node_type,
            tokenizer::count_tokens(&self.content)
        )
    }
}

/// Check if a line looks like the start of a definition.
fn is_definition_start(line: &str) -> bool {
    let trimmed = line.trim();
    // Python
    if trimmed.starts_with("def ")
        || trimmed.starts_with("class ")
        || trimmed.starts_with("async def ")
    {
        return true;
    }
    // JS/TS
    if trimmed.starts_with("function ")
        || trimmed.starts_with("export function")
        || trimmed.starts_with("export default")
        || trimmed.starts_with("export class")
        || trimmed.starts_with("const ")
        || trimmed.starts_with("let ")
    {
        return true;
    }
    // Rust
    if trimmed.starts_with("fn ")
        || trimmed.starts_with("pub fn ")
        || trimmed.starts_with("pub(crate) fn ")
        || trimmed.starts_with("impl ")
        || trimmed.starts_with("pub struct ")
        || trimmed.starts_with("pub enum ")
        || trimmed.starts_with("struct ")
        || trimmed.starts_with("enum ")
        || trimmed.starts_with("trait ")
        || trimmed.starts_with("pub trait ")
    {
        return true;
    }
    // Go
    if trimmed.starts_with("func ") || trimmed.starts_with("type ") {
        return true;
    }
    // Java/C++
    if (trimmed.starts_with("public ")
        || trimmed.starts_with("private ")
        || trimmed.starts_with("protected "))
        && (trimmed.contains('(') || trimmed.contains("class "))
    {
        return true;
    }
    false
}

/// Chunk code using definition-aware line splitting.
/// Falls back from tree-sitter AST to heuristic-based definition detection.
///
/// Args:
///     content: Source code content
///     file_path: Path for metadata
///     max_tokens: Maximum tokens per chunk (default 8000)
///     max_lines: Maximum lines per chunk (default 100)
///
/// Returns:
///     List of CodeChunk objects
#[pyfunction]
#[pyo3(signature = (content, file_path, max_tokens=8000, max_lines=100))]
pub fn chunk_code(
    content: &str,
    file_path: &str,
    max_tokens: usize,
    max_lines: usize,
) -> Vec<CodeChunk> {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return vec![];
    }

    let language = detect_language(file_path);
    let node_type = language.as_deref().unwrap_or("unknown");

    let mut chunks = Vec::new();
    let mut chunk_start: usize = 0;
    let mut chunk_lines: Vec<&str> = Vec::new();
    let mut chunk_tokens: usize = 0;

    for (i, line) in lines.iter().enumerate() {
        let line_tokens = tokenizer::count_tokens(line) + 1; // +1 for newline

        let should_split = !chunk_lines.is_empty()
            && (chunk_lines.len() >= max_lines
                || chunk_tokens + line_tokens > max_tokens
                || (is_definition_start(line) && chunk_lines.len() >= 10));

        if should_split {
            let content = chunk_lines.join("\n");
            if !content.trim().is_empty() {
                chunks.push(CodeChunk {
                    content,
                    file_path: file_path.to_string(),
                    start_line: (chunk_start + 1) as u32,
                    end_line: i as u32,
                    node_type: node_type.to_string(),
                });
            }
            chunk_start = i;
            chunk_lines.clear();
            chunk_tokens = 0;
        }

        chunk_lines.push(line);
        chunk_tokens += line_tokens;
    }

    // Emit final chunk
    if !chunk_lines.is_empty() {
        let content = chunk_lines.join("\n");
        if !content.trim().is_empty() {
            chunks.push(CodeChunk {
                content,
                file_path: file_path.to_string(),
                start_line: (chunk_start + 1) as u32,
                end_line: lines.len() as u32,
                node_type: node_type.to_string(),
            });
        }
    }

    // Filter out very small chunks (< 3 non-empty lines) and merge with neighbors
    if chunks.len() > 1 {
        let min_lines = 3;
        let mut merged = Vec::new();
        let mut carry: Option<CodeChunk> = None;

        for chunk in chunks {
            let line_count = chunk
                .content
                .lines()
                .filter(|l| !l.trim().is_empty())
                .count();
            if line_count < min_lines {
                if let Some(ref mut prev) = carry {
                    prev.content = format!("{}\n{}", prev.content, chunk.content);
                    prev.end_line = chunk.end_line;
                } else {
                    carry = Some(chunk);
                }
            } else {
                if let Some(mut c) = carry.take() {
                    c.content = format!("{}\n{}", c.content, chunk.content);
                    c.end_line = chunk.end_line;
                    merged.push(c);
                } else {
                    merged.push(chunk);
                }
            }
        }
        if let Some(c) = carry {
            if let Some(last) = merged.last_mut() {
                last.content = format!("{}\n{}", last.content, c.content);
                last.end_line = c.end_line;
            } else {
                merged.push(c);
            }
        }
        return merged;
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language() {
        assert_eq!(detect_language("src/main.py"), Some("python".to_string()));
        assert_eq!(detect_language("app.tsx"), Some("typescript".to_string()));
        assert_eq!(detect_language("lib.rs"), Some("rust".to_string()));
        assert_eq!(detect_language("README.md"), None);
    }

    #[test]
    fn test_chunk_code_basic() {
        let code = r#"import os

def hello():
    print("hello")

def world():
    print("world")

class MyClass:
    def __init__(self):
        self.x = 1

    def method(self):
        return self.x
"#;
        let chunks = chunk_code(code, "test.py", 8000, 100);
        assert!(!chunks.is_empty());
        // All content should be preserved
        let total: String = chunks
            .iter()
            .map(|c| c.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(total.contains("def hello()"));
        assert!(total.contains("class MyClass"));
    }

    #[test]
    fn test_chunk_code_splits_on_definitions() {
        // Create code with many definitions to force splits
        let mut code = String::new();
        for i in 0..20 {
            code.push_str(&format!(
                "def function_{}():\n    pass\n    pass\n    pass\n    pass\n    pass\n    pass\n\n",
                i
            ));
        }
        let chunks = chunk_code(&code, "test.py", 8000, 30);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn test_chunk_code_empty() {
        let chunks = chunk_code("", "test.py", 8000, 100);
        assert!(chunks.is_empty());
    }
}
