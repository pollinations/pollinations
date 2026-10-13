"""Keyless live RSS validation through the actual researcher fetch adapter."""
import importlib.util, json, os, re
from pathlib import Path
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fetch_adapter', root / 'operations/model-management/fetch.py')
adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
adapter.HTTP_DEADLINE_SECONDS=25; adapter.MAX_HTTP_ATTEMPTS=2
out=Path(os.environ['SOURCE_PROBE_OUT']); out.mkdir(parents=True,exist_ok=True)
os.environ['FETCH_CACHE_DIR']=str(out/'pages')
results=[]
def read(url):
    try: result=adapter._read_http(url,18000,include_links=True)
    except adapter.ValidationError as error: result={'url':url,'status':'unavailable','error':str(error)}
    result['requestedUrl']=url
    result['entries']=len(re.findall(r'^# ',result.get('text',''),re.M))
    result['datedEntries']=len(re.findall(r'^Published: ',result.get('text',''),re.M))
    results.append(result)
    (out/'rss-probe.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({key:result.get(key) for key in ['url','status','error','entries','datedEntries']}),flush=True)
    return result
for community in ['LocalLLaMA','StableDiffusion','MachineLearning','artificial']:
    read(f'https://www.reddit.com/r/{community}/.rss')
for link in [link for row in results[:1] for link in row.get('links',[]) if '/comments/' in link['url'] and link['url'].endswith('/.rss')][:2]:
    read(link['url'])
required=results[:2]
assert all(row['status']=='fetched' and row['entries']>0 and row['datedEntries']>0 for row in required), 'Required subreddit feeds did not return dated post content'
assert len(results)>4 and any(row['status']=='fetched' and row['entries']>1 and row['datedEntries']>1 for row in results[4:]), 'Comment RSS did not return dated thread content'
print(json.dumps({'paidCalls':0,'requiredFeedsVerified':2,'threadFeedsVerified':sum(row['status']=='fetched' for row in results[4:])}),flush=True)