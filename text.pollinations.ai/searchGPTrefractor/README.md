# Web Search and Synthesis Module

This repository contains a Python-based web search and synthesis module designed to process user queries, perform web searches, scrape content, and synthesize detailed answers in Markdown format. The module is built with extensibility and error handling in mind, leveraging APIs and libraries for efficient information retrieval.

---

## Features

### 1. **Search and Synthesis**
- Accepts user queries and processes them using a combination of native knowledge, web search, and YouTube transcript analysis.
- Synthesizes a comprehensive Markdown response based on the retrieved information.
- Includes inline citations for transparency.

### 2. **Web Search**
- Uses the DuckDuckGo Search API to fetch search results.
- Filters and processes URLs to extract relevant content.

### 3. **Web Scraping**
- Scrapes text and images from websites while adhering to word count limits.
- Filters irrelevant images and avoids scraping search result pages.

### 4. **YouTube Integration**
- Extracts transcripts and metadata from YouTube videos.
- Handles common errors like unavailable transcripts or live streams.

### 5. **AI-Powered Planning and Synthesis**
- Uses AI models to plan query execution and synthesize final answers.
- Supports both classification and synthesis tasks with different AI models.

---

## File Structure

### 1. `search_module.py`
This file contains the core logic for the module, including:
- **Configuration**: Adjustable parameters for search results, scraping limits, and retry logic.
- **Helper Functions**: URL extraction, YouTube transcript fetching, and web scraping utilities.
- **AI Integration**: Functions to query AI models for planning and synthesis.
- **Main Functionality**: `search_and_synthesize` function that orchestrates the entire process.

### 2. `search_test.py`
This file demonstrates how to use the `search_module.py`:
- Imports the `search_and_synthesize` function.
- Provides a sample query to test the module.
- Prints the synthesized Markdown output.

### 3. `index.html`
This file provides the front-end interface for the web search and synthesis module:
- **User Input Form**: Allows users to input queries and toggle server logs.
- **Dynamic Results Display**: Displays synthesized Markdown responses rendered as HTML using the `marked.js` library.
- **Status Messages**: Provides feedback during the search process (e.g., loading, errors).
- **Styling**: Includes a clean and responsive design with CSS for better user experience.

### 4. `ai_search_agent.py`
This file contains the back-end logic for handling search and synthesis requests:
- **Flask API**: Exposes an endpoint (`/search`) to process user queries via GET or POST requests.
- **Search and Synthesis Logic**: Implements the `search_and_synthesize` function to orchestrate query processing, web scraping, and AI synthesis.
- **Error Handling**: Includes retry mechanisms and logging for robust performance.
- **AI Integration**: Utilizes AI models for query planning and response synthesis.
- **YouTube and Web Support**: Fetches YouTube transcripts and metadata, scrapes websites, and integrates results into a cohesive response.
- **Rate Limiting**: Protects the API with request limits using `Flask-Limiter`.
- **Configuration**: Offers adjustable parameters for search, scraping, and AI behavior.

---

## Usage

### Prerequisites
- Python 3.8 or higher
- Required libraries: `requests`, `json`, `datetime`, `re`, `time`, `sys`, `urllib.parse`, `youtube_transcript_api`, `pytube`, `duckduckgo_search`, `beautifulsoup4`, `math`, `mimetypes`, `tqdm`, `random`, `flask`, `flask_cors`, `flask_limiter`

Install dependencies using:
```bash
pip install -r requirements.txt
```

### Running the Module
1. Modify the query in `search_test.py` to your desired input.
2. Run the script:
    ```bash
    python search_test.py
    ```
3. View the synthesized Markdown output in the console.

---

## Configuration
You can adjust the following parameters in `search_module.py`:
- `MAX_SEARCH_RESULTS_PER_QUERY`: Number of search results to fetch.
- `MAX_SCRAPE_WORD_COUNT`: Maximum word count per scraped page.
- `MAX_IMAGES_TO_INCLUDE`: Number of images to include in the output.
- AI models for classification and synthesis.

---

## Example Query
```python
query_simple = "What's the current weather in Kolkata, India? How's it different from the weather in Delhi, India right now?"
markdown_no_sources = search_and_synthesize(query_simple, show_sources=True, scrape_images=False)
print(markdown_no_sources)
```

---

### Updated Example Using `ai_search_agent.py` and `index.html`

#### Running the Flask API
1. Start the Flask server by running the `ai_search_agent.py` file:
    ```bash
    python ai_search_agent.py
    ```
2. The server will start at `http://127.0.0.1:5000/search`. You can now send queries via the front-end or directly using tools like `curl` or Postman.

#### Using the Front-End (`index.html`)
1. Open the `index.html` file in your browser.
2. Enter a query in the text area (e.g., "Summarize the latest advancements in AI from https://openai.com and this YouTube video https://www.youtube.com/watch?v=dQw4w9WgXcQ").
3. Click the **Search** button to send the query to the Flask API.
4. The synthesized Markdown response will be rendered dynamically in the results area.

#### Example Query via API
You can also test the API directly using `curl`:
```bash
curl -X POST http://127.0.0.1:5000/search \
-H "Content-Type: application/json" \
-d '{"query": "What are the latest trends in AI research? Summarize this YouTube video https://www.youtube.com/watch?v=dQw4w9WgXcQ", "show_logs": true}'
```


## Limitations
- Relies on pollinations APIs as the only endpoint, and depends on their rate limits or restrictions for the ai model endpoints.
- Requires internet connectivity for web search and scraping.

---

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contributing
Contributions are welcome! Feel free to open issues or submit pull requests to improve the module.
