import os
import torch
import multiprocessing as mp
from multiprocessing.managers import BaseManager
from diffusers import ZImagePipeline
from functools import partial
from loguru import logger

class ipcModules:
    logger.info("Loading IPC Device...")
