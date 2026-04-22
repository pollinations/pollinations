use pyo3::prelude::*;
use std::collections::HashSet;
use walkdir::WalkDir;

/// Default directories to skip during file collection.
const DEFAULT_SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    ".env",
    "env",
    ".tox",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    ".mypy_cache",
];

/// Collect files from a directory tree, filtering by extension and skipping directories.
///
/// Args:
///     root: Root directory path
///     extensions: List of file extensions to include (e.g., [".py", ".js"])
///     skip_dirs: List of directory names to skip (defaults to common ones)
///     max_file_size: Maximum file size in bytes (default 500KB)
///
/// Returns:
///     List of absolute file paths matching the criteria.
#[pyfunction]
#[pyo3(signature = (root, extensions, skip_dirs=None, max_file_size=512000))]
pub fn collect_files(
    root: &str,
    extensions: Vec<String>,
    skip_dirs: Option<Vec<String>>,
    max_file_size: u64,
) -> Vec<String> {
    let ext_set: HashSet<String> = extensions.into_iter().map(|e| e.to_lowercase()).collect();

    let skip_set: HashSet<String> = skip_dirs
        .unwrap_or_else(|| DEFAULT_SKIP_DIRS.iter().map(|s| s.to_string()).collect())
        .into_iter()
        .collect();

    let mut result = Vec::new();

    let walker = WalkDir::new(root).follow_links(false).into_iter();

    for entry in walker.filter_entry(|e| {
        if e.file_type().is_dir() {
            let name = e.file_name().to_string_lossy();
            !skip_set.contains(name.as_ref()) && !name.starts_with('.')
        } else {
            true
        }
    }) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        // Check file size
        if let Ok(metadata) = entry.metadata() {
            if metadata.len() > max_file_size {
                continue;
            }
        }

        // Check extension
        let path = entry.path();
        if let Some(ext) = path.extension() {
            let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
            if ext_set.contains(&ext_str) {
                if let Some(path_str) = path.to_str() {
                    result.push(path_str.to_string());
                }
            }
        }
    }

    result.sort();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_collect_files_basic() {
        let dir = std::env::temp_dir().join("polly_core_test_files");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("test.py"), "print('hello')").unwrap();
        fs::write(dir.join("test.txt"), "hello").unwrap();
        fs::write(dir.join("sub/nested.py"), "pass").unwrap();

        let files = collect_files(
            dir.to_str().unwrap(),
            vec![".py".to_string()],
            Some(vec![]),
            512000,
        );

        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|f| f.ends_with(".py")));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_skip_dirs() {
        let dir = std::env::temp_dir().join("polly_core_test_skip");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        fs::write(dir.join("node_modules/dep.js"), "x").unwrap();
        fs::write(dir.join("main.js"), "y").unwrap();

        let files = collect_files(dir.to_str().unwrap(), vec![".js".to_string()], None, 512000);

        assert_eq!(files.len(), 1);
        assert!(files[0].ends_with("main.js"));

        let _ = fs::remove_dir_all(&dir);
    }
}
