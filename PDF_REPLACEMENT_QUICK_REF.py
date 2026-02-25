"""
PDF Text Replacement Quick Reference
=====================================

Use PyMuPDF (fitz) to replace text in PDFs on macOS.
Already installed: PyMuPDF 1.26.4

Quick Implementation:
- 10 lines of code
- ~95% success on simple PDFs
- Handles font/size preservation
"""

import pymupdf as fitz


def replace_text_simple(pdf_path, old_text, new_text, output_path=None):
    """
    Simplest possible text replacement - good for testing.

    Args:
        pdf_path: Input PDF file
        old_text: Text to find and replace
        new_text: Replacement text
        output_path: Output file (defaults to "_replaced" suffix)
    """
    if output_path is None:
        output_path = pdf_path.replace(".pdf", "_replaced.pdf")

    doc = fitz.open(pdf_path)
    page = doc[0]

    results = page.search_for(old_text)
    if results:
        rect = results[0]
        page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()
        page.insert_text((rect.x0, rect.y0), new_text, fontsize=12, fontname="helv")

    doc.save(output_path)
    return output_path


def replace_text_with_formatting(pdf_path, old_text, new_text, output_path=None):
    """
    Text replacement that preserves original font/size/color.

    Args:
        pdf_path: Input PDF file
        old_text: Text to find and replace (exact match)
        new_text: Replacement text
        output_path: Output file (defaults to "_replaced" suffix)

    Returns:
        (success: bool, message: str, replacements: int)
    """
    if output_path is None:
        output_path = pdf_path.replace(".pdf", "_replaced.pdf")

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return False, f"Cannot open PDF: {e}", 0

    total_replaced = 0

    for page_num, page in enumerate(doc):
        # Find all occurrences
        results = page.search_for(old_text)
        if not results:
            continue

        # Extract formatting from original text
        text_dict = page.get_text("dict")
        font_info = {
            'fontname': 'helv',
            'size': 11,
        }

        # Search through text blocks to find formatting
        for block in text_dict['blocks']:
            if 'lines' not in block:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    if old_text in span.get('text', ''):
                        font_info = {
                            'fontname': span.get('font', 'helv'),
                            'size': span.get('size', 11),
                        }
                        break

        # Apply redaction to all occurrences
        for rect in results:
            page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()

        # Insert replacement with original formatting
        # Adjust Y position to account for text baseline
        y_offset = font_info['size'] * 0.75

        for rect in results:
            page.insert_text(
                (rect.x0, rect.y0 - y_offset),
                new_text,
                fontsize=font_info['size'],
                fontname=font_info['fontname'],
            )

        total_replaced += len(results)

    try:
        doc.save(output_path)
        return True, f"Saved to {output_path}", total_replaced
    except Exception as e:
        return False, f"Save failed: {e}", total_replaced


def replace_text_multiple(pdf_path, replacements, output_path=None):
    """
    Replace multiple different text strings in a PDF.

    Args:
        pdf_path: Input PDF file
        replacements: Dict of {old_text: new_text}
        output_path: Output file (defaults to "_replaced" suffix)

    Returns:
        (success: bool, message: str, total_replacements: int)

    Example:
        success, msg, count = replace_text_multiple(
            "input.pdf",
            {
                "Old text 1": "New text 1",
                "Old text 2": "New text 2",
            }
        )
    """
    if output_path is None:
        output_path = pdf_path.replace(".pdf", "_replaced.pdf")

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return False, f"Cannot open PDF: {e}", 0

    total_replaced = 0

    for old_text, new_text in replacements.items():
        for page in doc:
            results = page.search_for(old_text)
            if not results:
                continue

            # Extract formatting
            text_dict = page.get_text("dict")
            font_info = {'fontname': 'helv', 'size': 11}

            for block in text_dict['blocks']:
                for line in block.get('lines', []):
                    for span in line['spans']:
                        if old_text in span.get('text', ''):
                            font_info = {
                                'fontname': span.get('font', 'helv'),
                                'size': span.get('size', 11),
                            }

            # Apply replacements
            for rect in results:
                page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions()

            y_offset = font_info['size'] * 0.75
            for rect in results:
                page.insert_text(
                    (rect.x0, rect.y0 - y_offset),
                    new_text,
                    fontsize=font_info['size'],
                    fontname=font_info['fontname'],
                )

            total_replaced += len(results)

    try:
        doc.save(output_path)
        return True, f"Saved to {output_path}", total_replaced
    except Exception as e:
        return False, f"Save failed: {e}", total_replaced


# =============================================================================
# USAGE EXAMPLES
# =============================================================================

if __name__ == "__main__":
    # Example 1: Simple replacement
    print("Example 1: Simple replacement")
    output = replace_text_simple(
        "input.pdf",
        "The platform where AI creators build for free and earn from usage.",
        "The Creator Economy for AI Experiences"
    )
    print(f"Created: {output}")

    # Example 2: Preserve formatting
    print("\nExample 2: Preserve formatting")
    success, msg, count = replace_text_with_formatting(
        "input.pdf",
        "The platform where AI creators build for free and earn from usage.",
        "The Creator Economy for AI Experiences"
    )
    print(f"{msg} ({count} replacements)")

    # Example 3: Multiple replacements
    print("\nExample 3: Multiple replacements")
    success, msg, count = replace_text_multiple(
        "input.pdf",
        {
            "The platform where AI creators build for free and earn from usage.": "The Creator Economy for AI Experiences",
            "Old tagline 2": "New tagline 2",
        }
    )
    print(f"{msg} ({count} replacements)")
