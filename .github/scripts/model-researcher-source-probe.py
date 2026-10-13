"""Keyless live RSS validation through the actual researcher fetch adapter."""
import importlib.util, json, os
from pathlib import Path
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fetch_adapter', root / 'operations/model-management/fetch.py')
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
adapter.HTTP_DEADLINE_SECONDS=80; adapter.MAX_HTTP_ATTEMPTS=1
out=Path(os.environ['SOURCE_PROBE_OUT']); out.mkdir(parents=True,exist_ok=True)
os.environ['FETCH_CACHE_DIR']=str(out/'pages')
results=[]
original_fetch=adapter._pinned_fetch
responses=[]
def observed_fetch(*args, **kwargs):
    page=original_fetch(*args, **kwargs)
    headers={str(key).lower():str(value) for key,value in page.headers.items() if str(key).lower() in {'retry-after','x-ratelimit-used','x-ratelimit-remaining','x-ratelimit-reset','ratelimit','content-type'}}
    metrics={}
    if page.status==200 and 'xml' in headers.get('content-type',''):
        tree=adapter.ElementTree.fromstring(page.body)
        entries=tree.findall('{*}entry')
        metrics={'entries':len(entries),'datedEntries':sum(bool(entry.findtext('{*}published') or entry.findtext('{*}updated')) for entry in entries)}
    responses.append({'url':args[0],'status':page.status,'headers':headers,**metrics})
    return page
adapter._pinned_fetch=observed_fetch
def read(url):
    try: result=adapter._read_http(url,18000,include_links=True)
    except adapter.ValidationError as error: result={'url':url,'status':'unavailable','error':str(error)}
    result['requestedUrl']=url
    result['responses']=responses[:]
    responses.clear()
    result['entries']=sum(response.get('entries',0) for response in responses)
    result['datedEntries']=sum(response.get('datedEntries',0) for response in responses)
    results.append(result)
    (out/'rss-probe.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({key:result.get(key) for key in ['url','status','error','entries','datedEntries','responses']}),flush=True)
    return result
for community in ['LocalLLaMA','StableDiffusion','MachineLearning','artificial']:
    read(f'https://www.reddit.com/r/{community}/.rss')
for link in [link for row in results[:1] for link in row.get('links',[]) if '/comments/' in link['url'] and link['url'].endswith('/.rss')][:2]:
    read(link['url'])
required=results[:2]
assert all(row['status']=='fetched' and row['entries']>0 and row['datedEntries']>0 for row in required), 'Required subreddit feeds did not return dated post content'
assert len(results)>4 and any(row['status']=='fetched' and row['entries']>1 and row['datedEntries']>1 for row in results[4:]), 'Comment RSS did not return dated thread content'
print(json.dumps({'paidCalls':0,'requiredFeedsVerified':2,'threadFeedsVerified':sum(row['status']=='fetched' for row in results[4:])}),flush=True)
