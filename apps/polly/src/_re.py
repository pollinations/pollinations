"""Fast regex: regex (C PCRE2) → stdlib re fallback."""

try:
    import regex as re
except ImportError:
    import re  # type: ignore[no-redef]

# Re-export everything consumers need
compile = re.compile
sub = re.sub
findall = re.findall
finditer = re.finditer
search = re.search
match = re.match
IGNORECASE = re.IGNORECASE
MULTILINE = re.MULTILINE
DOTALL = re.DOTALL

__all__ = [
    "re",
    "compile",
    "sub",
    "findall",
    "finditer",
    "search",
    "match",
    "IGNORECASE",
    "MULTILINE",
    "DOTALL",
]
