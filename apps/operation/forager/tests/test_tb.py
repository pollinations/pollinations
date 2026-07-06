import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingest import tb

class Capture:
    def __init__(self): self.calls = []
    def __call__(self, url, data=None, headers=None, method=None, timeout=120):
        self.calls.append({"url": url, "data": data, "headers": headers, "method": method})
        return {"data": [{"x": 1}], "successful_rows": 2}

def _client(cap):
    tb._http = cap
    return tb.TB("https://api.example.tinybird.co", "tok123")

def test_sql_posts_query():
    cap = Capture(); t = _client(cap)
    assert t.sql("SELECT 1") == [{"x": 1}]
    c = cap.calls[0]
    assert c["url"].endswith("/v0/sql")
    assert c["headers"]["Authorization"] == "Bearer tok123"
    assert c["method"] == "POST"

def test_append_uses_events_ndjson():
    cap = Capture(); t = _client(cap)
    t.append("ingest_runs", [{"run_at": "2026-07-02 08:30:00", "ok": 1}])
    c = cap.calls[0]
    assert "/v0/events?name=ingest_runs" in c["url"]
    assert json.loads(c["data"].decode().splitlines()[0])["ok"] == 1
    assert c["method"] == "POST"

def test_replace_uses_datasources_multipart():
    cap = Capture(); t = _client(cap)
    t.replace("pollen_monthly", [{"month": "2026-07"}], condition="month='2026-07'")
    c = cap.calls[0]
    assert "/v0/datasources?" in c["url"] and "mode=replace" in c["url"]
    assert "replace_condition=" in c["url"]
    assert b'{"month": "2026-07"}' in c["data"]

def test_replace_empty_rows_is_refused():
    cap = Capture(); t = _client(cap)
    try:
        t.replace("pollen_monthly", [], condition=None)
        assert False, "must refuse full replace with 0 rows"
    except ValueError:
        pass
