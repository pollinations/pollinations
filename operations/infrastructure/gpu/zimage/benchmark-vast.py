#!/usr/bin/env python3
"""Bounded Z-Image throughput benchmark for a directly addressed Vast worker."""

import argparse
import asyncio
import json
import os
import statistics
import time

import aiohttp


CASES = ((512, 512), (1024, 1024), (768, 1152))


async def run(args: argparse.Namespace) -> int:
    timeout = aiohttp.ClientTimeout(total=args.timeout)
    headers = {
        "Content-Type": "application/json",
        "x-backend-token": args.token,
    }
    latencies: list[float] = []
    errors: list[str] = []
    counter = 0
    counter_lock = asyncio.Lock()
    started = time.perf_counter()

    async def worker(session: aiohttp.ClientSession, worker_id: int) -> None:
        nonlocal counter
        while time.perf_counter() - started < args.duration:
            async with counter_lock:
                request_id = counter
                counter += 1
            width, height = CASES[request_id % len(CASES)]
            payload = {
                "prompts": [f"zimage vast benchmark {worker_id}-{request_id}"],
                "width": width,
                "height": height,
                "seed": 100_000 + request_id,
            }
            request_started = time.perf_counter()
            try:
                async with session.post(
                    f"{args.url.rstrip('/')}/generate",
                    headers=headers,
                    json=payload,
                ) as response:
                    await response.read()
                    if response.status != 200:
                        errors.append(f"HTTP {response.status}")
                    else:
                        latencies.append(time.perf_counter() - request_started)
            except Exception as error:  # noqa: BLE001 - report all benchmark failures
                errors.append(type(error).__name__)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        await asyncio.gather(*(worker(session, i) for i in range(args.concurrency)))

    elapsed = time.perf_counter() - started
    ordered = sorted(latencies)

    def percentile(p: float) -> float | None:
        if not ordered:
            return None
        index = min(round((len(ordered) - 1) * p), len(ordered) - 1)
        return ordered[index]

    result = {
        "completed": len(latencies),
        "errors": len(errors),
        "elapsed_seconds": round(elapsed, 3),
        "images_per_second": round(len(latencies) / elapsed, 4),
        "latency_p50_seconds": round(statistics.median(ordered), 3)
        if ordered
        else None,
        "latency_p95_seconds": round(percentile(0.95), 3) if ordered else None,
        "latency_p99_seconds": round(percentile(0.99), 3) if ordered else None,
        "error_types": dict((name, errors.count(name)) for name in sorted(set(errors))),
    }
    print(json.dumps(result, indent=2))
    return 0 if not errors and latencies else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:10002")
    parser.add_argument("--token", default=os.getenv("PLN_GPU_TOKEN"))
    parser.add_argument("--duration", type=int, default=300)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    if not args.token:
        parser.error("set PLN_GPU_TOKEN or pass --token")
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
