"""Keyless NomNom-style Reddit JSON and public Redlib content probe."""
import importlib.util, json, os, time
from pathlib import Path
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("fetch_adapter", root / "operations/model-management/fetch.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
adapter.HTTP_DEADLINE_SECONDS = 12
adapter.MAX_HTTP_ATTEMPTS = 1
out = Path(os.environ["SOURCE_PROBE_OUT"])
out.mkdir(parents=True, exist_ok=True)
os.environ['FETCH_CACHE_DIR'] = str(out / 'pages')
results = []
ua = 'linux:nomnom:v4.1 (by /u/nomnom-research-agent)'
for url in [
    'https://www.reddit.com/r/python/top/.json?limit=1',
    'https://old.reddit.com/r/Python/top/.json?t=week&limit=5',
    'https://old.reddit.com/r/LocalLLaMA/top/.json?t=week&limit=20',
]:
    deadline = time.monotonic() + 12
    result = {'requestedUrl': url, 'kind': 'nomnom-json', 'paidCalls': 0}
    try:
        response = adapter._pinned_fetch(adapter._validate_url(url, deadline), deadline, raw=True, headers={'User-Agent': ua, 'Accept': 'application/json'})
        result['httpStatus'] = response.status
        if response.status == 200:
            data = json.loads(response.body)
            listing = data[0] if isinstance(data, list) else data
            posts = [row['data'] for row in listing.get('data', {}).get('children', []) if row.get('kind') == 't3']
            result.update({'postCount': len(posts), 'posts': [{'title': row.get('title'), 'created_utc': row.get('created_utc'), 'permalink': row.get('permalink')} for row in posts]})
    except Exception as error:
        result['error'] = type(error).__name__
    results.append(result)
    print(json.dumps(result), flush=True)
index_url = 'https://raw.githubusercontent.com/redlib-org/redlib-instances/main/instances.json'
index = adapter._read_http(index_url, 18000)
if index['status'] == 'fetched':
    instances = json.loads(index['text'])['instances']
    for instance in [item for item in instances if item.get('url', '').startswith('https://') and not item.get('cloudflare')][:6]:
        url = instance['url'].rstrip('/') + '/r/LocalLLaMA/top/?t=week'
        started = time.monotonic()
        result = adapter._read_http(url, 18000, include_links=True)
        result.update({'requestedUrl': url, 'kind': 'public-redlib', 'elapsedSeconds': round(time.monotonic()-started, 2), 'paidCalls': 0})
        results.append(result)
        print(json.dumps({key: result.get(key) for key in ['requestedUrl','url','status','method','error','elapsedSeconds']}), flush=True)
(out / 'reddit-alternatives.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')