# Citation Metadata for Gemini-Search Model

The `gemini-search` model now includes comprehensive citation metadata in its responses, providing transparency and verifiability for search results.

## Overview

When using the `gemini-search` model, responses now include:
- **Citations**: Structured metadata for each source used
- **Annotations**: Text range mappings linking content to sources
- **Backward Compatibility**: Existing integrations continue to work unchanged

## Response Format

### Citations Field

The response includes a `citations` array in the message object:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Based on recent research...",
        "citations": [
          {
            "title": "AI Research Breakthroughs in 2025",
            "url": "https://example.com/ai-research",
            "snippet": "Recent advances in artificial intelligence...",
            "publisher": "Example News",
            "published_date": "2025-01-15",
            "confidence_score": 0.95
          }
        ],
        "annotations": [
          {
            "type": "url_citation",
            "start_index": 0,
            "end_index": 50,
            "url": "https://example.com/ai-research",
            "title": "AI Research Breakthroughs in 2025"
          }
        ]
      }
    }
  ]
}
```

### Citation Object Structure

Each citation object contains:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Title of the source document |
| `url` | string | Direct link to the source |
| `snippet` | string | Brief excerpt from the source |
| `publisher` | string | Name of the publishing entity |
| `published_date` | string | Publication date (ISO format) |
| `confidence_score` | number | Confidence score (0-1) |

### Annotation Object Structure

Each annotation object contains:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always "url_citation" |
| `start_index` | number | Start position in the response text |
| `end_index` | number | End position in the response text |
| `url` | string | URL of the cited source |
| `title` | string | Title of the cited source |

## Usage Examples

### JavaScript/Node.js

```javascript
const response = await fetch('https://text.pollinations.ai/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    model: 'gemini-search',
    messages: [
      { role: 'user', content: 'What are the latest AI developments?' }
    ]
  })
});

const data = await response.json();
const message = data.choices[0].message;

// Access citations
if (message.citations) {
  message.citations.forEach(citation => {
    console.log(`Source: ${citation.title}`);
    console.log(`URL: ${citation.url}`);
    console.log(`Publisher: ${citation.publisher}`);
  });
}

// Access annotations
if (message.annotations) {
  message.annotations.forEach(annotation => {
    const citedText = message.content.substring(
      annotation.start_index, 
      annotation.end_index
    );
    console.log(`Cited text: "${citedText}"`);
    console.log(`Source: ${annotation.url}`);
  });
}
```

### Python

```python
import requests

response = requests.post(
    'https://text.pollinations.ai/chat/completions',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    },
    json={
        'model': 'gemini-search',
        'messages': [
            {'role': 'user', 'content': 'What are the latest AI developments?'}
        ]
    }
)

data = response.json()
message = data['choices'][0]['message']

# Access citations
if 'citations' in message:
    for citation in message['citations']:
        print(f"Source: {citation['title']}")
        print(f"URL: {citation['url']}")
        print(f"Publisher: {citation['publisher']}")

# Access annotations
if 'annotations' in message:
    for annotation in message['annotations']:
        cited_text = message['content'][
            annotation['start_index']:annotation['end_index']
        ]
        print(f"Cited text: '{cited_text}'")
        print(f"Source: {annotation['url']}")
```

## Backward Compatibility

- **Existing integrations**: Continue to work without modification
- **Non-search models**: Do not include citation fields
- **Optional fields**: Citations and annotations are only present when available

## Model Support

Citation metadata is currently available for:
- `gemini-search` (Gemini 2.5 Flash with Google Search)

Other models will return responses in the standard format without citation fields.

## Benefits

1. **Transparency**: Users can verify the sources of information
2. **Credibility**: Provides publisher and publication date information
3. **Traceability**: Direct links to original sources
4. **Research Support**: Helps researchers and educators cite sources properly
5. **Trust Building**: Increases confidence in AI-generated responses

## Implementation Details

The citation extraction process:
1. Analyzes Vertex AI grounding metadata
2. Extracts web search results and confidence scores
3. Maps text ranges to specific sources
4. Formats data for OpenAI-compatible responses
5. Maintains backward compatibility for existing clients

## Error Handling

- Missing grounding metadata: Returns empty citations array
- Invalid URLs: Gracefully handles malformed source URLs
- Parsing errors: Falls back to standard response format
- Network issues: Citations are optional and don't block responses

## Future Enhancements

Planned improvements include:
- Support for additional citation formats (APA, MLA, Chicago)
- Enhanced publisher detection
- Citation quality scoring
- Integration with academic databases
