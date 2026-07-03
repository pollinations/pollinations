"""Google Cloud / Vertex meter connector.

Writes GCP_BILLING_SA_JSON to a temp file, activates the service account via
`gcloud auth activate-service-account`, then runs `bq query` against the
billing export table. Cost is in native EUR — multiplied by fx → USD.

Two row types per month:
  gross_eur → funding=cash
  abs(credits_eur) → funding=credit (billing discounts / sustained-use credits)

BQ table name and SQL copied verbatim from PoC build/connectors/accrual.py.

Expected to fail until Elliot re-enables the billing export and re-auths.
The try/except in run.py absorbs connector failures gracefully.
"""
import json
import os
import subprocess
import tempfile
from os.path import expanduser

from . import _mrow

# Constants ported verbatim from accrual.py
_GCP_PROJECT = "stellar-verve-465920-b7"
_GCP_BILLING_ACCOUNT = "0180E5_574541_B8F8FD"
_GCP_TABLE = (
    f"{_GCP_PROJECT}.billing_export"
    f".gcp_billing_export_resource_v1_{_GCP_BILLING_ACCOUNT}"
)
_GCP_CLOUDSDK_CONFIG = os.path.join(tempfile.gettempdir(), "pollinations-finance-gcloud")

# Injectable helpers — monkeypatched in tests
_NamedTemporaryFile = tempfile.NamedTemporaryFile
_os_unlink = os.unlink

_SQL = f"""
SELECT
  FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
  ROUND(SUM(cost), 2) AS gross_eur,
  ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS credits_eur,
  ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS net_eur,
  COUNT(*) AS row_count,
  MAX(DATE(usage_start_time)) AS latest_usage
FROM `{_GCP_TABLE}`
WHERE DATE(usage_start_time) >= '2026-03-01'
GROUP BY month
ORDER BY month
""".strip()


def meter(creds, months, today, fx=1.14, run_cmd=subprocess.run):
    """Fetch GCP metered cost per month from the BigQuery billing export.

    Args:
        creds:   dict with GCP_BILLING_SA_JSON (service-account JSON as a string)
        months:  list of "YYYY-MM" strings to include in output
        today:   retrieved_at date string "YYYY-MM-DD"
        fx:      EUR→USD conversion rate (default 1.14)
        run_cmd: injectable subprocess.run replacement (for testing)

    Returns:
        list of _mrow dicts; cash + credit rows for nonzero months.
        Returns [] on any failure (auth error, bq failure, key missing).
    """
    sa_json = creds.get("GCP_BILLING_SA_JSON")
    if not sa_json:
        return []

    month_set = set(months)
    key_path = None
    try:
        # Write SA key to a temp file
        ntf = _NamedTemporaryFile(
            mode="w", suffix=".json", prefix="gcp_sa_", delete=False
        )
        key_path = ntf.name
        with ntf:
            ntf.write(sa_json)

        env = {
            **os.environ,
            "PATH": f"{expanduser('~/google-cloud-sdk/bin')}:{os.environ.get('PATH', '')}",
            "CLOUDSDK_CONFIG": _GCP_CLOUDSDK_CONFIG,
            "GOOGLE_APPLICATION_CREDENTIALS": key_path,
        }
        os.makedirs(_GCP_CLOUDSDK_CONFIG, exist_ok=True)

        # Activate service account
        auth = run_cmd(
            ["gcloud", "auth", "activate-service-account",
             f"--key-file={key_path}",
             f"--project={_GCP_PROJECT}"],
            capture_output=True, text=True, env=env, timeout=45,
        )
        if auth.returncode != 0:
            return []

        # Run BQ query
        q = run_cmd(
            ["bq", "query",
             "--use_legacy_sql=false",
             "--format=json",
             "--quiet",
             f"--project_id={_GCP_PROJECT}",
             _SQL],
            capture_output=True, text=True, env=env, timeout=90,
        )
        if q.returncode != 0:
            return []

        try:
            bq_rows = json.loads(q.stdout or "[]")
        except (ValueError, TypeError):
            return []

        rows = []
        for r in bq_rows:
            month = r.get("month") or ""
            if month not in month_set:
                continue
            gross_eur = float(r.get("gross_eur") or 0)
            credits_eur = float(r.get("credits_eur") or 0)

            if gross_eur:
                rows.append(_mrow(
                    month=month,
                    provider="google",
                    cost_usd=round(gross_eur * fx, 2),
                    funding="cash",
                    source="bq",
                    method="bq billing export (gross_eur × fx)",
                    today=today,
                ))
            credit_usd = round(abs(credits_eur) * fx, 2)
            if credit_usd:
                rows.append(_mrow(
                    month=month,
                    provider="google",
                    cost_usd=credit_usd,
                    funding="credit",
                    source="bq",
                    method="bq billing export (credits_eur × fx)",
                    today=today,
                ))
        return rows

    except Exception:
        return []

    finally:
        if key_path is not None:
            try:
                _os_unlink(key_path)
            except OSError:
                pass
