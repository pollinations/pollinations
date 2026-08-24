#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from tinybird.tb.client import TinyB


HOST = "https://api.europe-west2.gcp.tinybird.co"
WORKSPACES = {
    "staging": "pollinations_enter_staging",
    "production": "pollinations_enter",
}


def arguments():
    parser = argparse.ArgumentParser(
        description=(
            "Collect a read-only aggregate of generation_event_v2 after "
            "an immutable op_pollen backup cutoff."
        )
    )
    parser.add_argument("environment", choices=WORKSPACES)
    parser.add_argument("output", type=Path)
    parser.add_argument("--endpoint-output", type=Path)
    parser.add_argument("--history-output", type=Path)
    parser.add_argument("--cutoff", required=True, help="UTC timestamp, YYYY-MM-DD HH:MM:SS")
    parser.add_argument("--end", required=True, help="Exclusive UTC timestamp")
    return parser.parse_args()


def client(workspace_name):
    repo = Path(__file__).resolve().parents[4]
    config = json.loads((repo / "enter.pollinations.ai/observability/.tinyb").read_text())
    user = TinyB(token=config["user_token"], host=HOST)
    workspaces = user.user_workspaces_and_branches(version="v1")["workspaces"]
    workspace = next(item for item in workspaces if item["name"] == workspace_name)
    return TinyB(token=workspace["token"], host=HOST)


def validate_timestamp(value):
    datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    return value


def main():
    args = arguments()
    cutoff = validate_timestamp(args.cutoff)
    end = validate_timestamp(args.end)
    workspace_name = WORKSPACES[args.environment]
    if cutoff >= end:
        raise RuntimeError("Cutoff must be before the exclusive end")

    query = f"""
        SELECT
            formatDateTime(toStartOfMonth(start_time), '%Y-%m') AS month,
            model_provider_used AS vendor,
            resolved_model_requested AS model,
            sum(if(selected_meter_slug = 'v1:meter:pack' AND total_price > 0 AND model_provider_used != 'community', total_cost, 0)) AS cost_paid,
            sum(if(selected_meter_slug = 'v1:meter:tier' AND total_price > 0 AND model_provider_used != 'community', total_cost, 0)) AS cost_quests,
            sum(if(selected_meter_slug = 'v1:meter:pack' AND total_price > 0, total_price, 0)) AS price_paid,
            sum(if(selected_meter_slug = 'v1:meter:tier' AND total_price > 0, total_price, 0)) AS price_quests,
            sum(toUInt64(selected_meter_slug = 'v1:meter:pack' AND total_price > 0)) AS requests_paid,
            sum(toUInt64(selected_meter_slug = 'v1:meter:tier' AND total_price > 0)) AS requests_quests,
            sum(if(api_key_created_for_user_id != 'undefined' AND total_price > dev_price AND selected_meter_slug = 'v1:meter:pack', total_price - dev_price, 0)) AS byop_paid,
            sum(if(api_key_created_for_user_id != 'undefined' AND total_price > dev_price AND selected_meter_slug = 'v1:meter:tier', total_price - dev_price, 0)) AS byop_quests,
            sum(if(community_model_reward_user_id != 'undefined' AND community_model_reward_amount > 0 AND selected_meter_slug = 'v1:meter:pack', community_model_reward_amount, 0)) AS model_paid,
            sum(if(community_model_reward_user_id != 'undefined' AND community_model_reward_amount > 0 AND selected_meter_slug = 'v1:meter:tier', community_model_reward_amount, 0)) AS model_quests
        FROM generation_event_v2
        WHERE start_time > toDateTime('{cutoff}')
          AND start_time < toDateTime('{end}')
          AND (total_price > 0 OR community_model_reward_amount > 0)
        GROUP BY month, vendor, model
        ORDER BY month, vendor, model
        FORMAT JSON
    """
    workspace = client(workspace_name)
    rows = workspace.query(query)["data"]
    boundary_query = f"""
        SELECT count() AS events
        FROM generation_event_v2
        WHERE start_time = toDateTime('{cutoff}')
        FORMAT JSON
    """
    boundary_events = int(workspace.query(boundary_query)["data"][0]["events"])
    payload = {
        "workspace": workspace_name,
        "source": "generation_event_v2",
        "cutoff_exclusive_utc": cutoff,
        "end_exclusive_utc": end,
        "cutoff_boundary_events": boundary_events,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "rows": len(rows),
        "data": rows,
    }
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2) + "\n")
    endpoint_rows = None
    endpoint_output = None
    if args.endpoint_output:
        endpoint_rows = workspace.pipe_data("op_pollen_api").get("data", [])
        endpoint_output = args.endpoint_output.resolve()
        endpoint_output.parent.mkdir(parents=True, exist_ok=True)
        endpoint_output.write_text(
            json.dumps(
                {
                    "workspace": workspace_name,
                    "source": "op_pollen_api",
                    "generated_at": payload["generated_at"],
                    "rows": len(endpoint_rows),
                    "data": endpoint_rows,
                },
                indent=2,
            )
            + "\n"
        )
    history_rows = None
    history_output = None
    if args.history_output:
        history_query = """
            SELECT
                entry_id,
                argMax(month, recorded_at) AS month,
                argMax(provider, recorded_at) AS provider,
                argMax(model, recorded_at) AS model,
                argMax(cost_paid, recorded_at) AS cost_paid,
                argMax(cost_quests, recorded_at) AS cost_quests,
                argMax(price_paid, recorded_at) AS price_paid,
                argMax(price_quests, recorded_at) AS price_quests,
                argMax(requests_paid, recorded_at) AS requests_paid,
                argMax(requests_quests, recorded_at) AS requests_quests,
                argMax(byop_paid, recorded_at) AS byop_paid,
                argMax(byop_quests, recorded_at) AS byop_quests,
                argMax(model_paid, recorded_at) AS model_paid,
                argMax(model_quests, recorded_at) AS model_quests,
                argMax(evidence, recorded_at) AS evidence,
                argMax(reason, recorded_at) AS reason
            FROM op_pollen_history
            GROUP BY entry_id
            HAVING reason = 'workspace_snapshot'
            ORDER BY month, provider, model, entry_id
            FORMAT JSON
        """
        history_rows = workspace.query(history_query)["data"]
        history_output = args.history_output.resolve()
        history_output.parent.mkdir(parents=True, exist_ok=True)
        history_output.write_text(
            json.dumps(
                {
                    "workspace": workspace_name,
                    "source": "op_pollen_history",
                    "reason": "workspace_snapshot",
                    "generated_at": payload["generated_at"],
                    "rows": len(history_rows),
                    "data": history_rows,
                },
                indent=2,
            )
            + "\n"
        )
    print(
        json.dumps(
            {
                "output": str(output),
                "rows": len(rows),
                "cutoff_boundary_events": boundary_events,
                "endpoint_output": str(endpoint_output) if endpoint_output else None,
                "endpoint_rows": len(endpoint_rows) if endpoint_rows is not None else None,
                "history_output": str(history_output) if history_output else None,
                "history_rows": len(history_rows) if history_rows is not None else None,
                "workspace": workspace_name,
            }
        )
    )


if __name__ == "__main__":
    main()
