use pyo3::prelude::*;
use std::sync::LazyLock;
use tiktoken_rs::CoreBPE;

static ENCODER: LazyLock<CoreBPE> =
    LazyLock::new(|| tiktoken_rs::cl100k_base().expect("failed to load cl100k_base tokenizer"));

/// Count tokens in text using cl100k_base encoding.
#[pyfunction]
pub fn count_tokens(text: &str) -> usize {
    ENCODER.encode_ordinary(text).len()
}

/// Encode text to token IDs using cl100k_base.
#[pyfunction]
pub fn encode_tokens(text: &str) -> Vec<u32> {
    ENCODER
        .encode_ordinary(text)
        .into_iter()
        .map(|t| t as u32)
        .collect()
}

/// Decode token IDs back to text.
#[pyfunction]
pub fn decode_tokens(tokens: Vec<u32>) -> PyResult<String> {
    ENCODER
        .decode(tokens)
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyValueError, _>(e.to_string()))
}

/// Split text into chunks of at most max_tokens tokens.
/// Splits on line boundaries to keep code readable.
#[pyfunction]
pub fn split_by_tokens(text: &str, max_tokens: usize) -> Vec<String> {
    let lines: Vec<&str> = text.lines().collect();
    let mut chunks = Vec::new();
    let mut current_lines: Vec<&str> = Vec::new();
    let mut current_tokens: usize = 0;

    for line in &lines {
        let line_tokens = ENCODER.encode_ordinary(line).len() + 1; // +1 for newline
        if current_tokens + line_tokens > max_tokens && !current_lines.is_empty() {
            chunks.push(current_lines.join("\n"));
            current_lines.clear();
            current_tokens = 0;
        }
        current_lines.push(line);
        current_tokens += line_tokens;
    }

    if !current_lines.is_empty() {
        chunks.push(current_lines.join("\n"));
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_tokens() {
        assert!(count_tokens("hello world") > 0);
        assert_eq!(count_tokens(""), 0);
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let text = "def hello():\n    print('world')";
        let tokens = encode_tokens(text);
        let decoded = decode_tokens(tokens).unwrap();
        assert_eq!(decoded, text);
    }

    #[test]
    fn test_split_by_tokens() {
        let text = "line1\nline2\nline3\nline4\nline5";
        let chunks = split_by_tokens(text, 3);
        assert!(chunks.len() > 1);
        let rejoined: String = chunks.join("\n");
        assert_eq!(rejoined, text);
    }
}
