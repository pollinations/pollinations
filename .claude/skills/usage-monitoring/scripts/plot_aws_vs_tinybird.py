#!/usr/bin/env python3
"""
Generate AWS CloudWatch vs Tinybird comparison graphs for usage monitoring.

Usage:
    python3 plot_aws_vs_tinybird.py [--hours 3] [--output /tmp/comparison.png]

Requires:
    - AWS CLI configured with credentials
    - Tinybird CLI (tb) configured in enter.pollinations.ai/observability/
    - matplotlib, numpy
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    import matplotlib.pyplot as plt
    import numpy as np
except ImportError:
    print("Error: matplotlib and numpy required. Install with: pip install matplotlib numpy")
    sys.exit(1)


def fetch_aws_data(hours: int) -> dict:
    """Fetch AWS CloudWatch Bedrock invocations."""
    model = "global.anthropic.claude-opus-4-5-20251101-v1:0"
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=hours)
    
    cmd = [
        "aws", "cloudwatch", "get-metric-statistics",
        "--namespace", "AWS/Bedrock",
        "--metric-name", "Invocations",
        "--dimensions", f"Name=ModelId,Value={model}",
        "--start-time", start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "--end-time", end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "--period", "300",
        "--statistics", "Sum",
        "--region", "us-east-1",
        "--output", "json"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"AWS CLI error: {result.stderr}")
        sys.exit(1)
    
    return json.loads(result.stdout)


def fetch_tinybird_data(hours: int) -> dict:
    """Fetch Tinybird generation_event data."""
    # Find the observability directory
    script_dir = Path(__file__).parent.parent
    obs_dir = script_dir.parent.parent.parent / "enter.pollinations.ai" / "observability"
    
    query = f"""SELECT toStartOfFiveMinutes(start_time) as ts, COUNT(*) as invocations 
FROM generation_event 
WHERE start_time >= now() - INTERVAL {hours} HOUR 
AND model_used LIKE '%opus%' 
GROUP BY ts ORDER BY ts"""
    
    cmd = ["tb", "sql", query, "--format", "json"]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=obs_dir)
    
    if result.returncode != 0:
        print(f"Tinybird CLI error: {result.stderr}")
        sys.exit(1)
    
    # Skip warning lines and parse JSON
    output = result.stdout
    json_start = output.find('{')
    if json_start >= 0:
        return json.loads(output[json_start:])
    return {'data': []}


def plot_comparison(aws_data: dict, tb_data: dict, output_path: str, utc_offset: int = 1):
    """Generate rolling average comparison plot."""
    offset = timedelta(hours=utc_offset)
    
    # Parse AWS data
    aws_points = {}
    for d in aws_data.get('Datapoints', []):
        ts = datetime.strptime(d['Timestamp'][:19], "%Y-%m-%dT%H:%M:%S")
        ts = ts.replace(minute=(ts.minute // 5) * 5, second=0) + offset
        aws_points[ts] = aws_points.get(ts, 0) + d['Sum']
    
    # Parse Tinybird data
    tb_points = {}
    for d in tb_data.get('data', []):
        ts = datetime.strptime(d['ts'], "%Y-%m-%d %H:%M:%S")
        ts = ts.replace(minute=(ts.minute // 5) * 5, second=0) + offset
        tb_points[ts] = tb_points.get(ts, 0) + d['invocations']
    
    # Align timestamps
    all_times = sorted(set(list(aws_points.keys()) + list(tb_points.keys())))
    if not all_times:
        print("No data found!")
        sys.exit(1)
    
    aws_values = np.array([aws_points.get(t, 0) for t in all_times])
    tb_values = np.array([tb_points.get(t, 0) for t in all_times])
    
    # Rolling average (15-min window)
    window = 3
    if len(aws_values) < window:
        print("Not enough data points for rolling average")
        sys.exit(1)
    
    aws_rolling = np.convolve(aws_values, np.ones(window)/window, mode='valid')
    tb_rolling = np.convolve(tb_values, np.ones(window)/window, mode='valid')
    times_rolling = all_times[window-1:]
    
    # Create plot
    fig, ax = plt.subplots(figsize=(16, 7))
    
    ax.plot(range(len(times_rolling)), aws_rolling, 'b-', linewidth=2.5, 
            label='AWS CloudWatch (15-min rolling avg)', marker='o', markersize=4)
    ax.plot(range(len(times_rolling)), tb_rolling, 'g-', linewidth=2.5, 
            label='Tinybird (15-min rolling avg)', marker='s', markersize=4)
    
    # Fill unauthorized usage area
    ax.fill_between(range(len(times_rolling)), tb_rolling, aws_rolling,
                    where=(aws_rolling > tb_rolling),
                    color='#FF5722', alpha=0.3, label='Unauthorized Usage')
    
    # Formatting
    ax.set_xlabel(f'Time (UTC+{utc_offset})', fontsize=12)
    ax.set_ylabel('Invocations (15-min rolling avg)', fontsize=12)
    ax.set_title('Claude Opus 4.5: AWS vs Tinybird Comparison', fontsize=14, fontweight='bold')
    ax.set_xticks(range(0, len(times_rolling), max(1, len(times_rolling)//12)))
    ax.set_xticklabels([times_rolling[i].strftime('%H:%M') 
                        for i in range(0, len(times_rolling), max(1, len(times_rolling)//12))],
                       rotation=45, ha='right')
    ax.legend(loc='upper left')
    ax.grid(axis='both', alpha=0.3)
    
    # Add totals
    aws_total = sum(aws_values)
    tb_total = sum(tb_values)
    coverage = (tb_total / aws_total * 100) if aws_total > 0 else 100
    
    textstr = f'AWS Total: {int(aws_total)} | Tinybird Total: {int(tb_total)} | Coverage: {coverage:.1f}%'
    props = dict(boxstyle='round', facecolor='wheat', alpha=0.8)
    ax.text(0.98, 0.98, textstr, transform=ax.transAxes, fontsize=11,
            verticalalignment='top', horizontalalignment='right', bbox=props)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f'Saved to {output_path}')
    print(f'AWS Total: {int(aws_total)}, Tinybird Total: {int(tb_total)}, Coverage: {coverage:.1f}%')


def main():
    parser = argparse.ArgumentParser(description='Generate AWS vs Tinybird comparison graph')
    parser.add_argument('--hours', type=int, default=3, help='Hours of data to fetch (default: 3)')
    parser.add_argument('--output', type=str, default='/tmp/aws_vs_tinybird.png', 
                        help='Output file path (default: /tmp/aws_vs_tinybird.png)')
    parser.add_argument('--utc-offset', type=int, default=1, 
                        help='UTC offset for local time (default: 1)')
    args = parser.parse_args()
    
    print(f"Fetching {args.hours}h of AWS CloudWatch data...")
    aws_data = fetch_aws_data(args.hours)
    
    print(f"Fetching {args.hours}h of Tinybird data...")
    tb_data = fetch_tinybird_data(args.hours)
    
    print("Generating plot...")
    plot_comparison(aws_data, tb_data, args.output, args.utc_offset)


if __name__ == '__main__':
    main()
