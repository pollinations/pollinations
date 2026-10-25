"""Local MCP pilot checks. Uses public synthetic fixtures only; stdlib only.

  container    Inside the controller image under the production service
               configuration (verify.sh): local shell, files and stdio MCP
               registration are denied, then the HTTP checks run against a
               loopback server started with the fixture secrets.
  http URL     A running controller is healthy, names the public OAuth
               issuer and resource, and /mcp rejects missing and invalid
               bearers with 401.
"""

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

PUBLIC_URL = "https://local-mcp.pollinations.ai"
SERVER = [sys.executable, "-m", "local_shell_mcp.main", "--remote"]
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
DENIED = "local access is disabled"


def expect(condition, message):
    if not condition:
        sys.exit(f"preflight: {message}")


def request(url, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with OPENER.open(req, timeout=10) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def check_http(base):
    status, _ = request(f"{base}/healthz")
    expect(status == 200, f"{base}/healthz returned {status}")
    status, body = request(f"{base}/.well-known/oauth-authorization-server")
    server = json.loads(body) if status == 200 else {}
    expect(
        server.get("issuer") == PUBLIC_URL
        and server.get("token_endpoint") == f"{PUBLIC_URL}/oauth/token",
        f"authorization server metadata does not name {PUBLIC_URL}",
    )
    status, body = request(f"{base}/.well-known/oauth-protected-resource")
    resource = json.loads(body) if status == 200 else {}
    expect(
        resource.get("resource") == PUBLIC_URL,
        f"protected resource metadata does not name {PUBLIC_URL}",
    )
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "local-mcp-preflight", "version": "1"},
        },
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    for label, extra in (
        ("missing", {}),
        ("invalid", {"Authorization": "Bearer deliberately-invalid-fixture"}),
    ):
        status, _ = request(f"{base}/mcp", initialize, {**headers, **extra})
        expect(status == 401, f"/mcp with a {label} bearer returned {status}")
    print(f"preflight: {base} healthy, OAuth metadata correct, bearer required")


def check_local_access_denied():
    server = subprocess.Popen(
        [*SERVER, "--mode", "stdio"],
        env={**os.environ, "LOCAL_SHELL_MCP_AUTH_MODE": "none"},
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    ids = iter(range(1, 100))

    def send(message):
        server.stdin.write(json.dumps({"jsonrpc": "2.0", **message}) + "\n")
        server.stdin.flush()

    def rpc(method, params):
        ident = next(ids)
        send({"id": ident, "method": method, "params": params})
        for line in server.stdout:
            reply = json.loads(line)
            if reply.get("id") == ident:
                expect("error" not in reply, f"{method} failed: {reply}")
                return reply["result"]
        sys.exit(f"preflight: stdio server exited during {method}")

    try:
        rpc(
            "initialize",
            {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "local-mcp-preflight", "version": "1"},
            },
        )
        send({"method": "notifications/initialized"})
        tools = {tool["name"] for tool in rpc("tools/list", {})["tools"]}
        expect("remote_manage" in tools, "remote_manage is missing")
        expect(
            not tools & {"skill_list", "link_create"},
            "local-only tools are exposed",
        )
        for name, arguments in (
            ("shell_start", {"cwd": "."}),
            ("run_shell", {"command": "printf SHOULD_NOT_EXECUTE"}),
            ("file_read", {"path": "/etc/hostname"}),
            ("file_write", {"path": "should-not-exist", "content": "fixture"}),
            (
                "mcp_manage",
                {
                    "action": "register",
                    "name": "must-be-rejected",
                    "transport": "stdio",
                    "command": "/bin/false",
                    "refresh": False,
                },
            ),
        ):
            result = rpc("tools/call", {"name": name, "arguments": arguments})
            expect(
                DENIED in json.dumps(result).lower(),
                f"{name} was not denied: {result}",
            )
        print("preflight: controller-local shell, files and stdio MCP denied")
    finally:
        server.terminate()
        server.wait(timeout=10)


def check_container():
    signal.alarm(120)
    check_local_access_denied()
    server = subprocess.Popen([*SERVER, "--mode", "mcp"])
    base = f"http://127.0.0.1:{os.environ.get('LOCAL_SHELL_MCP_PORT', '8765')}"
    try:
        for _ in range(100):
            try:
                if request(f"{base}/healthz")[0] == 200:
                    break
            except OSError:
                pass
            time.sleep(0.2)
        check_http(base)
    finally:
        server.terminate()
        server.wait(timeout=10)


if __name__ == "__main__":
    mode, *args = sys.argv[1:] or [""]
    if mode == "container" and not args:
        check_container()
    elif mode == "http" and len(args) == 1:
        check_http(args[0].rstrip("/"))
    else:
        sys.exit(__doc__)
