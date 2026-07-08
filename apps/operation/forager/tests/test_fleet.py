"""gpu_fleet snapshot connector tests — hermetic, no network."""
import json

from ingest.connectors import fleet

NOW = "2026-07-08 10:00:00"

RUNPOD_RESP = {"data": {"myself": {
    "clientBalance": 80.06,
    "currentSpendPerHr": 1.439,
    "pods": [
        {"name": "zimage-4090-secure", "desiredStatus": "RUNNING", "costPerHr": 0.69,
         "gpuCount": 1, "machine": {"gpuDisplayName": "RTX 4090"}},
        {"name": "klein-a5000-v4", "desiredStatus": "RUNNING", "costPerHr": 0.27,
         "gpuCount": 1, "machine": {"gpuDisplayName": "RTX A5000"}},
        {"name": "zimage-3090-a", "desiredStatus": "EXITED", "costPerHr": 0.22,
         "gpuCount": 1, "machine": {"gpuDisplayName": "RTX 3090"}},
    ],
}}}

LAMBDA_RESP = {"data": [
    {"name": "Sana - LTX-2.3 - AceStep", "status": "active",
     "region": {"name": "us-east-3"},
     "instance_type": {"name": "gpu_1x_gh200", "description": "1x GH200 (96 GB)",
                       "price_cents_per_hour": 229}},
]}

VAST_INSTANCES = {"instances": [
    {"id": 43575766, "actual_status": "running", "gpu_name": "RTX 5090",
     "num_gpus": 1, "dph_total": 0.4278},
    {"id": 43575000, "actual_status": "exited", "gpu_name": "RTX 5090",
     "num_gpus": 1, "dph_total": 0.4278},
]}
VAST_USER = {"credit": 225.43}


def test_runpod_rows_running_only_with_storage_delta():
    rows = fleet.snapshot_runpod({"RUNPOD_API_KEY": "k"}, NOW,
                                 http=lambda url, headers=None, data=None: RUNPOD_RESP)
    names = [r["deployment"] for r in rows]
    assert "zimage-3090-a" not in names           # EXITED filtered
    assert "_storage" in names                     # 1.439 - 0.96 delta row
    storage = next(r for r in rows if r["deployment"] == "_storage")
    assert storage["usd_per_hr"] == 0.479
    assert all(r["balance_usd"] == 80.06 for r in rows)
    assert all(r["vendor"] == "runpod" and r["recorded_at"] == NOW for r in rows)


def test_runpod_key_in_url_not_header():
    seen = {}
    def http(url, headers=None, data=None):
        seen["url"], seen["headers"] = url, headers or {}
        return RUNPOD_RESP
    fleet.snapshot_runpod({"RUNPOD_API_KEY": "SEKRET"}, NOW, http=http)
    assert "api_key=SEKRET" in seen["url"]
    assert "Authorization" not in seen["headers"]


def test_lambda_rows_price_from_cents():
    def http(url, headers=None, data=None):
        assert "Basic" in (headers or {}).get("Authorization", "")
        return LAMBDA_RESP
    rows = fleet.snapshot_lambda({"LAMBDA_LABS_API_KEY": "k"}, NOW, http=http)
    assert rows == [{
        "recorded_at": NOW, "vendor": "lambda",
        "deployment": "Sana - LTX-2.3 - AceStep", "gpu": "1x GH200 (96 GB)",
        "gpu_count": 1, "usd_per_hr": 2.29, "balance_usd": None,
    }]


def test_vast_rows_running_only_with_balance():
    def http(url, headers=None, data=None):
        assert (headers or {}).get("Authorization") == "Bearer k"
        return VAST_USER if "users/current" in url else VAST_INSTANCES
    rows = fleet.snapshot_vast({"VAST_API_KEY": "k"}, NOW, http=http)
    assert len(rows) == 1
    assert rows[0]["deployment"] == "43575766"
    assert rows[0]["usd_per_hr"] == 0.4278
    assert rows[0]["balance_usd"] == 225.43


def test_modal_zero_containers_zero_rows():
    class Proc:
        returncode = 0
        stdout = json.dumps([])
        stderr = ""
    rows = fleet.snapshot_modal(
        {"MODAL_TOKEN_ID": "ak", "MODAL_TOKEN_SECRET": "as"}, NOW,
        run_cmd=lambda *a, **k: Proc())
    assert rows == []


def test_modal_env_inherits_path_and_tokens():
    import os
    captured_env = {}
    class Proc:
        returncode = 0
        stdout = json.dumps([])
        stderr = ""
    def capture_run_cmd(cmd, **kwargs):
        captured_env.update(kwargs.get("env", {}))
        return Proc()
    fleet.snapshot_modal(
        {"MODAL_TOKEN_ID": "tid123", "MODAL_TOKEN_SECRET": "sec456"}, NOW,
        run_cmd=capture_run_cmd)
    assert captured_env["MODAL_TOKEN_ID"] == "tid123"
    assert captured_env["MODAL_TOKEN_SECRET"] == "sec456"
    assert "PATH" in captured_env
    assert captured_env["PATH"] == os.environ["PATH"]


def test_snapshot_all_isolates_vendor_failures():
    def boom(*a, **k):
        raise RuntimeError("down")
    rows, statuses = fleet.snapshot_all(
        {"RUNPOD_API_KEY": "k", "LAMBDA_LABS_API_KEY": "k", "VAST_API_KEY": "k",
         "MODAL_TOKEN_ID": "ak", "MODAL_TOKEN_SECRET": "as"},
        NOW, http=boom, run_cmd=boom)
    assert rows == []
    assert len([k for k in statuses if k.startswith("fleet:")]) == 4
    assert all(v.startswith("err:") for k, v in statuses.items() if k.startswith("fleet:"))


def test_missing_key_is_an_error_status_not_a_crash():
    rows, statuses = fleet.snapshot_all({}, NOW,
                                        http=lambda *a, **k: {}, run_cmd=lambda *a, **k: None)
    assert statuses["fleet:runpod"].startswith("err:")
    assert statuses["fleet:lambda"].startswith("err:")
    assert statuses["fleet:vast.ai"].startswith("err:")
    assert statuses["fleet:modal"].startswith("err:")


# refresh_gpu_fleet (append-only datasource write) was deleted in the gpu_fleet
# cutover — fleet.snapshot_all is now only a live probe consumed by
# refresh_gpu_runs's runway alarm (see tests/test_gpu_runs.py).
