"""Keyless direct/Tor public-content and exact NomNom rnet transport comparison."""
import asyncio, importlib.util, json, os, subprocess, time
from pathlib import Path
from urllib.parse import urlsplit
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fetch_adapter', root / 'operations/model-management/fetch.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
out = Path(os.environ['SOURCE_PROBE_OUT']); out.mkdir(parents=True, exist_ok=True)
results = []
ua = 'PollinationsModelResearch/1.0 (+https://github.com/pollinations/pollinations/issues/16544)'
def save(row):
    results.append(row)
    (out / 'proxy-probe.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in row.items() if key != 'text'}), flush=True)
def cli_read(url, via_tor):
    deadline = time.monotonic() + 25
    target = adapter._validate_url(url, deadline)
    host = urlsplit(target).hostname
    address = next((ip for ip in adapter._public_addresses(host, deadline) if ':' not in ip), None)
    if not address: raise ValueError('No public IPv4 for fixed-target diagnostic')
    dest = out / ('body-' + str(len(results)) + '.txt')
    args = ['curl', '--silent', '--show-error', '--proto', '=https', '--max-time', '20', '--max-filesize', '2097152', '--resolve', f'{host}:443:{address}', '-A', ua, '-o', str(dest), '-w', '%{http_code}', target]
    args[1:1] = ['--socks5', '127.0.0.1:9150'] if via_tor else ['--proxy', '']
    process = subprocess.run(args, capture_output=True, text=True, timeout=25, env={'PATH': os.environ['PATH']})
    body = dest.read_text(encoding='utf-8', errors='replace') if dest.exists() else ''
    parser = adapter._TextParser(); parser.feed(body); parser.close()
    text = parser.text()
    return {'url': target, 'transport': 'tor' if via_tor else 'direct', 'exitCode': process.returncode, 'httpStatus': process.stdout, 'text': text[:18000], 'challenge': adapter._blocked_content(body, text), 'threadLinks': text.count('/comments/') + body.count('/comments/'), 'characters': len(text)}
check = cli_read('https://check.torproject.org/api/ip', True)
try: check['confirmedTor'] = json.loads(check['text']).get('IsTor') is True
except json.JSONDecodeError: check['confirmedTor'] = False
save(check)
assert check['confirmedTor'], 'Tor positive control failed'
for url in [
    'https://www.reddit.com/r/LocalLLaMA/top/?t=week',
    'https://old.reddit.com/r/LocalLLaMA/top/.json?t=week&limit=20',
    'https://www.reddit.com/r/LocalLLaMA/.rss',
    'https://redlib.r4fo.com/r/LocalLLaMA/top/?t=week',
    'https://redlib.cow.rip/r/LocalLLaMA/top/?t=week',
    'https://r.jina.ai/https://www.reddit.com/r/LocalLLaMA/top/?t=week',
    'https://farside.link/reddit.com/r/LocalLLaMA/top/?t=week',
]:
    for via_tor in [False, True]:
        try: save(cli_read(url, via_tor))
        except Exception as error: save({'url': url, 'transport': 'tor' if via_tor else 'direct', 'error': type(error).__name__})
async def nomnom_rnet():
    from rnet import Client
    url = 'https://www.reddit.com/r/python/top/.json?limit=1'
    adapter._validate_url(url, time.monotonic()+12)
    client = Client(timeout=10, redirect=0, headers={'User-Agent':'linux:nomnom:v4.1 (by /u/nomnom-research-agent)'})
    try:
        response = await client.get(url)
        body = bytes(await response.bytes())
        data = json.loads(body) if response.status == 200 else {}
        save({'url':url, 'transport':'nomnom-rnet-2.4.2', 'httpStatus': response.status, 'posts': len(data.get('data',{}).get('children',[]))})
    except Exception as error: save({'url':url, 'transport':'nomnom-rnet-2.4.2','error':type(error).__name__})
asyncio.run(nomnom_rnet())