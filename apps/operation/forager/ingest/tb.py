"""Tinybird I/O. Safety: replace with zero rows is refused — a failed pull never wipes a table."""
import json, urllib.parse, urllib.request

def _http(url, data=None, headers=None, method=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

_BOUNDARY = "TbTreasuryBoundary7f3a9c"

class TB:
    def __init__(self, api, token):
        self.api, self.token = api.rstrip("/"), token

    def _auth(self):
        return {"Authorization": f"Bearer {self.token}"}

    def sql(self, query):
        body = urllib.parse.urlencode({"q": query + " FORMAT JSON"}).encode()
        response = _http(f"{self.api}/v0/sql", data=body, headers=self._auth(), method="POST")
        if "data" not in response:
            raise RuntimeError("Tinybird SQL response missing data")
        return response["data"]

    def append(self, datasource, rows):
        if not rows:
            raise ValueError(f"refusing to append 0 rows to {datasource}")
        nd = "\n".join(json.dumps(r) for r in rows).encode()
        url = f"{self.api}/v0/events?name={urllib.parse.quote(datasource)}"
        return _http(url, data=nd, headers=self._auth(), method="POST")

    def replace(self, datasource, rows, condition=None):
        if not rows:
            raise ValueError(f"refusing to replace {datasource} with 0 rows")
        nd = "\n".join(json.dumps(r) for r in rows).encode()
        q = {"name": datasource, "mode": "replace", "format": "ndjson"}
        if condition:
            q["replace_condition"] = condition
        url = f"{self.api}/v0/datasources?" + urllib.parse.urlencode(q)
        body = (f"--{_BOUNDARY}\r\nContent-Disposition: form-data; name=\"ndjson\"; "
                f"filename=\"rows.ndjson\"\r\nContent-Type: application/octet-stream\r\n\r\n"
                ).encode() + nd + f"\r\n--{_BOUNDARY}--\r\n".encode()
        headers = {**self._auth(), "Content-Type": f"multipart/form-data; boundary={_BOUNDARY}"}
        d = _http(url, data=body, headers=headers, method="POST", timeout=300)
        if d.get("error"):
            raise RuntimeError(f"tb replace {datasource}: {d['error']}")
        return d
