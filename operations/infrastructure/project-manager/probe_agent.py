"""Pair two private-agent calls without publishing the test agent's name or answer."""

import hashlib
import json
import os
import urllib.error
import urllib.request


def main():
    headers = {"Authorization": "Bearer " + os.environ["POLLINATIONS_TOKEN"],
               "Content-Type": "application/json"}
    url = "https://gen.pollinations.ai/v1"
    catalog = urllib.request.Request(url + "/models?reliability=all", headers=headers)
    with urllib.request.urlopen(catalog, timeout=60) as response:
        entries = json.load(response)["data"]
    digest = os.environ["PROBE_MODEL_DIGEST"]
    models = [m["id"] for m in entries if hashlib.sha256(m["id"].encode()).hexdigest() == digest]
    if len(models) != 1:
        raise SystemExit("The workflow key could not discover the selected private agent")

    payload = {
        "model": models[0], "stream": False, "max_tokens": 2000, "reasoning_effort": "low",
        "messages": [
            {"role": "system", "content": "Return one JSON object."},
            {"role": "user", "content": 'Return the JSON object {"area":"Models"}.'},
        ],
    }
    for structured in (True, False):
        body = dict(payload)
        if structured:
            body["response_format"] = {"type": "json_object"}
        request = urllib.request.Request(url + "/chat/completions", headers=headers, data=json.dumps(body).encode())
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                answer = json.load(response)["choices"][0]["message"]["content"]
                try:
                    is_object = isinstance(json.loads(answer), dict)
                except (ValueError, TypeError):
                    is_object = False
                print(f"response_format={'json_object' if structured else 'omitted'}: HTTP {response.status}, JSON object={is_object}")
        except urllib.error.HTTPError as error:
            print(f"response_format={'json_object' if structured else 'omitted'}: HTTP {error.code}")
            if not structured or error.code != 400:
                raise SystemExit("Private-agent access or request failed") from None


if __name__ == "__main__":
    main()
