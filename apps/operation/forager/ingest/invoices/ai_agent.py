"""Pollinations vision agent for invoice PDF extraction."""

import base64
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request

from ..connectors.common import UA


APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INVOICES_DATASOURCE = os.path.join(
    APP_DIR, "tinybird", "datasources", "invoices.datasource"
)
DEFAULT_ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions"
DEFAULT_MODEL = "openai"
DEFAULT_MAX_PAGES = 4
DEFAULT_DPI = 150
DEFAULT_TIMEOUT = 180

RUNNER_FIELDS = {"sha256", "source", "file_ref", "ingested_at"}


def datasource_schema_text():
    """Return the exact Tinybird datasource definition the agent is filling."""
    with open(INVOICES_DATASOURCE) as f:
        return f.read().strip()


def datasource_columns():
    """Read column names and Tinybird types from invoices.datasource."""
    columns = []
    in_schema = False
    for raw in datasource_schema_text().splitlines():
        line = raw.strip()
        if line == "SCHEMA >":
            in_schema = True
            continue
        if not in_schema or not line:
            continue
        if not line.startswith("`"):
            break

        pieces = line.split("`")
        if len(pieces) < 4:
            raise RuntimeError(f"cannot read datasource column line: {line}")
        name = pieces[1]
        tb_type = pieces[2].strip().split()[0]
        columns.append({"name": name, "type": tb_type})

    if not columns:
        raise RuntimeError("invoices.datasource has no readable SCHEMA columns")
    return columns


def agent_columns():
    """Columns the vision agent owns; operational fields are filled by the runner."""
    return [col for col in datasource_columns() if col["name"] not in RUNNER_FIELDS]


def agent_field_names():
    return [col["name"] for col in agent_columns()]


def invoice_response_schema():
    """Build the strict JSON schema from the Tinybird datasource."""
    properties = {}
    for col in agent_columns():
        field_schema = {
            "type": _json_type(col["type"]),
            "description": f"Fill Tinybird column `{col['name']}` ({col['type']}) from the invoice PDF.",
        }
        enum = _field_enum(col["name"])
        if enum:
            field_schema["enum"] = enum
        properties[col["name"]] = field_schema

    return {
        "name": "forager_invoice_extraction",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": list(properties.keys()),
            "properties": properties,
        },
    }


def extract_pdf(path, file_hash, hints, config, today, creds=None):
    """Extract one invoice PDF through Pollinations."""
    pages = render_pdf_pages(
        path,
        max_pages=int(config.get("invoice_ai_max_pages", DEFAULT_MAX_PAGES)),
        dpi=int(config.get("invoice_ai_dpi", DEFAULT_DPI)),
    )
    return call_pollinations_invoice_agent(
        pages,
        file_hash=file_hash,
        hints=hints,
        config=config,
        today=today,
        creds=creds,
    )


def render_pdf_pages(path, max_pages=DEFAULT_MAX_PAGES, dpi=DEFAULT_DPI):
    """Render the first PDF pages as data:image/jpeg base64 URLs."""
    with tempfile.TemporaryDirectory() as tmp:
        prefix = os.path.join(tmp, "page")
        cmd = [
            "pdftoppm",
            "-jpeg",
            "-r",
            str(dpi),
            "-f",
            "1",
            "-l",
            str(max_pages),
            path,
            prefix,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if proc.returncode != 0:
            raise RuntimeError(f"pdftoppm failed: {proc.stderr.strip()[:200]}")

        rendered = [
            os.path.join(tmp, name)
            for name in sorted(os.listdir(tmp))
            if name.lower().endswith((".jpg", ".jpeg"))
        ]
        if not rendered:
            raise RuntimeError("pdftoppm produced no page images")

        pages = []
        for page_path in rendered:
            with open(page_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            pages.append(f"data:image/jpeg;base64,{b64}")
        return pages


def call_pollinations_invoice_agent(pages, file_hash, hints, config, today, creds=None):
    key = _pollinations_key(creds)
    if not key:
        raise RuntimeError("POLLINATIONS_KEY missing for invoice AI extraction")

    content = [{"type": "text", "text": _user_prompt(file_hash, hints, today)}]
    for page in pages:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": page, "detail": "high"},
            }
        )

    payload = {
        "model": config.get("invoice_ai_model", DEFAULT_MODEL),
        "temperature": 0,
        "reasoning_effort": config.get("invoice_ai_reasoning_effort", "high"),
        "max_tokens": int(config.get("invoice_ai_max_tokens", 1400)),
        "response_format": {
            "type": "json_schema",
            "json_schema": invoice_response_schema(),
        },
        "messages": [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": content},
        ],
    }

    response = _post_chat(
        config.get("invoice_ai_endpoint", DEFAULT_ENDPOINT),
        payload,
        key,
        timeout=int(config.get("invoice_ai_timeout", DEFAULT_TIMEOUT)),
    )
    return _parse_chat_json(response)


def _system_prompt():
    schema = datasource_schema_text()
    fields = agent_columns()
    field_lines = "\n".join(
        f"- {col['name']} ({col['type']}): {_field_guidance(col['name'])}"
        for col in fields
    )
    runner_fields = ", ".join(
        name for name in datasource_field_order() if name in RUNNER_FIELDS
    )
    allowed_fields = ", ".join(col["name"] for col in fields)
    return (
        "You are the only invoice-reading agent in the Forager ingest pipeline. "
        "Read the attached PDF page images visually and return one JSON object for Tinybird ingestion.\n\n"
        "The datasource file is the contract. The exact current Tinybird datasource is:\n"
        f"{schema}\n\n"
        f"The runner fills these operational columns: {runner_fields}.\n"
        "You fill only the remaining datasource columns:\n"
        f"{field_lines}\n\n"
        f"Return exactly these JSON keys and no others: {allowed_fields}.\n"
        "Do not invent aliases or duplicate facts. If the invoice has a total, payable amount, vendor, date, "
        "receipt number, or billing period, map it to the existing allowed field that means that fact.\n"
        "Use the PDF as truth. Context hints are useful, but the PDF wins when they disagree.\n"
        "Provider slug rules: if provider_hint is not empty and not 'other', and the PDF is for that same vendor, "
        "you MUST return provider_hint exactly, preserving punctuation and spelling. Do not convert ionet to io.net, "
        "google-workspace to google, or any hinted slug to a near-duplicate. Override provider_hint only when the PDF "
        "is clearly for a different unrelated vendor. If provider_hint is 'other', choose an existing known_provider_slug "
        "when it matches the PDF; otherwise create a stable lowercase snake_case slug without legal suffixes such as "
        "inc, llc, ltd, gmbh, ou, or ai.\n"
        "Period rules: if an explicit billing/service period is printed, use that month. Otherwise use the issue, "
        "receipt, paid, or purchase date month. If no date is readable, use archive_month_hint. Never use a day number "
        "as the month. European dates are DD.MM.YYYY or DD/MM/YYYY, so 14.01.2026 means period_month 2026-01.\n"
        "For missing strings use an empty string. For missing numbers use 0. "
        "Dates must be YYYY-MM-DD. Month fields must be YYYY-MM. Currency fields must use ISO codes. "
        "Amount fields should be the payable total unless the field name clearly asks for a credit, tax, or subtotal. "
        "If a status field exists, use parsed for invoice evidence, not_invoice for non-invoice PDFs, "
        "and needs_review only when the document is invoice evidence but required values are unreadable. "
        "For not_invoice rows use period_month='', amount=0, credit_usd=0, currency='USD' if no currency "
        "is visible, invoice_number as a short reason, and issued_at as a visible document date or today."
    )


def _user_prompt(file_hash, hints, today):
    return (
        "Extract the allowed invoice fields from this PDF.\n\n"
        "Context hints from the ingestion envelope. Treat them as hints, not truth, and override them if the PDF disagrees:\n"
        f"{json.dumps({'sha256': file_hash, 'today': today, **(hints or {})}, sort_keys=True)}"
    )


def datasource_field_order():
    return [col["name"] for col in datasource_columns()]


def _json_type(tb_type):
    base = tb_type.split("(", 1)[0]
    if base.startswith(("Float", "Int", "UInt", "Decimal")):
        return "number"
    if base in ("Bool", "Boolean"):
        return "boolean"
    return "string"


def _field_enum(name):
    enums = {
        "category": ["compute", "infra", "saas", "admin", "office", "payroll", "other"],
        "status": ["parsed", "not_invoice", "needs_review"],
    }
    return enums.get(name)


def _field_guidance(name):
    guidance = {
        "provider": "canonical lowercase provider slug for the invoice issuer; use other only when unclear.",
        "category": (
            "business spend bucket. compute is user-serving AI/API/GPU/runtime cost; infra is product "
            "infrastructure such as hosting, data, edge, and databases; saas is internal software and "
            "AI coding subscriptions; admin is finance, tax, accounting, legal, compliance, or banking; "
            "office is travel, food, phone, rent, utilities, hardware, and office supplies; payroll is people; "
            "other is only for unclear documents."
        ),
        "period_month": "billing period or statement month in YYYY-MM; use issue month when no separate period exists.",
        "amount": "final payable or paid total in the invoice currency, after credits and taxes.",
        "currency": "ISO currency code shown by the invoice.",
        "invoice_number": "invoice, receipt, statement, or document number.",
        "issued_at": "invoice, receipt, paid, or issue date in YYYY-MM-DD.",
        "status": (
            "parsed when the row is usable invoice evidence; not_invoice when the PDF is not an invoice, "
            "receipt, statement, or payment document; needs_review only when invoice evidence is unreadable or contradictory."
        ),
        "credit_usd": (
            "credit, discount, or credits consumed amount in the invoice currency; "
            "do not convert currencies; use 0 when no credit is shown."
        ),
    }
    return guidance.get(
        name, "read this value from the invoice using the column name as the meaning."
    )


def _post_chat(endpoint, payload, key, timeout=DEFAULT_TIMEOUT):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "User-Agent": UA,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Pollinations invoice agent HTTP {e.code}: {detail}") from e


def _parse_chat_json(response):
    content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    if isinstance(content, dict):
        return content
    text = str(content).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Pollinations invoice agent did not return JSON: {text[:200]!r}"
        ) from e


def _pollinations_key(creds=None):
    value = os.environ.get("POLLINATIONS_KEY")
    if value:
        return value
    return (creds or {}).get("POLLINATIONS_KEY", "")
