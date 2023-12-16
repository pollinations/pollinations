import os
import time
import torch
from flask import Flask, request, jsonify
from diffusers import (
    AutoPipelineForText2Image, 
    StableDiffusionPipeline,
    EulerAncestralDiscreteScheduler
)
from sfast.compilers.stable_diffusion_pipeline_compiler import compile, CompilationConfig
import threading
from collections import deque

# Flask App Initialization
app = Flask(__name__)
lock = threading.Lock()

# Deque for timestamps
timestamps = deque()
timestamps_lock = threading.Lock()

def add_timestamp(start_time, end_time):
    """Adds start and end timestamps to the deque and removes old timestamps."""
    with timestamps_lock:
        now = time.time()
        duration = end_time - start_time
        timestamps.append((start_time, duration))

        # Clean up timestamps older than 60 seconds
        while timestamps and now - timestamps[0][0] > 60:
            timestamps.popleft()

def get_average_generation_duration():
    """Calculates the average duration of image generation in the last 60 seconds."""
    with timestamps_lock:
        total_duration = sum(duration for _, duration in timestamps)
        count = len(timestamps)
        return total_duration / count if count else 0

def calculate_throughput(start_time, end_time, num_images=1):
    """Calculates throughput as images per second."""
    elapsed_time = end_time - start_time
    return num_images / elapsed_time if elapsed_time > 0 else float('inf')


def get_timestamps():
    """Returns the timestamps deque."""
    with timestamps_lock:
        return list(timestamps)