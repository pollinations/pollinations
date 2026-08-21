use pyo3::prelude::*;
use scraper::{Html, Selector};

/// Parsed HTML page data.
#[pyclass]
#[derive(Clone)]
pub struct ParsedPage {
    #[pyo3(get)]
    pub title: String,
    #[pyo3(get)]
    pub text: String,
    #[pyo3(get)]
    pub links: Vec<String>,
    #[pyo3(get)]
    pub headings: Vec<String>,
}

/// Parse HTML into clean text, links, and headings.
/// Strips script, style, nav, footer, aside tags.
///
/// Args:
///     html_content: Raw HTML string
///
/// Returns:
///     ParsedPage with title, clean text, links, and headings
#[pyfunction]
pub fn parse_html(html_content: &str) -> ParsedPage {
    let document = Html::parse_document(html_content);

    // Extract title
    let title = Selector::parse("title")
        .ok()
        .and_then(|sel| document.select(&sel).next())
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default()
        .trim()
        .to_string();

    // Extract links
    let mut links = Vec::new();
    if let Ok(sel) = Selector::parse("a[href]") {
        for el in document.select(&sel) {
            if let Some(href) = el.value().attr("href") {
                if href.starts_with("http") {
                    links.push(href.to_string());
                }
            }
        }
    }

    // Extract headings
    let mut headings = Vec::new();
    if let Ok(sel) = Selector::parse("h1, h2, h3, h4, h5, h6") {
        for el in document.select(&sel) {
            let text: String = el.text().collect();
            let text = text.trim().to_string();
            if !text.is_empty() {
                headings.push(text);
            }
        }
    }

    // Extract clean text (skip script, style, nav, footer, aside)
    let skip_tags = [
        "script", "style", "nav", "footer", "aside", "noscript", "svg",
    ];
    let mut text_parts: Vec<String> = Vec::new();

    // Simple approach: get all text, then clean up
    if let Ok(body_sel) = Selector::parse("body") {
        if let Some(body) = document.select(&body_sel).next() {
            extract_text_recursive(&body, &skip_tags, &mut text_parts);
        }
    } else {
        // No body tag, extract from root
        extract_text_recursive(&document.root_element(), &skip_tags, &mut text_parts);
    }

    let text = text_parts
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    ParsedPage {
        title,
        text,
        links,
        headings,
    }
}

fn extract_text_recursive(node: &scraper::ElementRef, skip_tags: &[&str], parts: &mut Vec<String>) {
    let tag_name = node.value().name();
    if skip_tags.contains(&tag_name) {
        return;
    }

    for child in node.children() {
        if let Some(text) = child.value().as_text() {
            let t = text.trim();
            if !t.is_empty() {
                parts.push(t.to_string());
            }
        } else if let Some(el) = scraper::ElementRef::wrap(child) {
            extract_text_recursive(&el, skip_tags, parts);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_html_basic() {
        let html = r#"
        <html>
        <head><title>Test Page</title></head>
        <body>
            <h1>Hello World</h1>
            <p>This is a test paragraph.</p>
            <a href="https://example.com">Link</a>
            <script>var x = 1;</script>
            <style>.foo { color: red; }</style>
        </body>
        </html>
        "#;

        let page = parse_html(html);
        assert_eq!(page.title, "Test Page");
        assert!(page.text.contains("Hello World"));
        assert!(page.text.contains("test paragraph"));
        assert!(!page.text.contains("var x = 1"));
        assert!(!page.text.contains("color: red"));
        assert_eq!(page.links, vec!["https://example.com"]);
        assert_eq!(page.headings, vec!["Hello World"]);
    }

    #[test]
    fn test_parse_html_empty() {
        let page = parse_html("");
        assert!(page.title.is_empty());
        assert!(page.text.is_empty());
    }
}
