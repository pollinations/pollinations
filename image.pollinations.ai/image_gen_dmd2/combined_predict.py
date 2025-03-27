import torch
from diffusers import StableCascadeDecoderPipeline, StableCascadePriorPipeline

device = "cuda"
num_images_per_prompt = 1

prior = StableCascadePriorPipeline.from_pretrained("stabilityai/stable-cascade-prior", torch_dtype=torch.bfloat16).to(device)
decoder = StableCascadeDecoderPipeline.from_pretrained("stabilityai/stable-cascade",  torch_dtype=torch.float16).to(device)

prompt = "Authentic shaman making sushi"
negative_prompt = ""
import time
for i in range(5):
    start_time_prior = time.time()
    prior_output = prior(
        prompt=prompt,
        height=1024,
        width=1024,
        negative_prompt=negative_prompt,
        guidance_scale=4.0,
        num_images_per_prompt=num_images_per_prompt,
        num_inference_steps=10
    )
    end_time_prior = time.time()
    print(f"Time taken for prior call: {end_time_prior - start_time_prior} seconds")

    start_time_decoder = time.time()
    decoder_output = decoder(
        image_embeddings=prior_output.image_embeddings.half(),
        prompt=prompt,
        negative_prompt=negative_prompt,
        guidance_scale=0.0,
        output_type="pil",
        num_inference_steps=10
    ).images
    end_time_decoder = time.time()
    print(f"Time taken for decoder call: {end_time_decoder - start_time_decoder} seconds")
    for idx, image in enumerate(decoder_output):
        image.save(f"output_image_{i}_{idx}.png")
# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

import os

# We need to set `TRANSFORMERS_CACHE` before any imports, which is why this is up here.
MODEL_PATH = "/src/models/"
os.environ["TRANSFORMERS_CACHE"] = MODEL_PATH
os.environ["TORCH_HOME"] = MODEL_PATH


import shutil
import random

from tempfile import TemporaryDirectory
from distutils.dir_util import copy_tree
from typing import Optional, Iterator, List
from cog import BasePredictor, Input, Path, BaseModel
import torch
import datetime

# Model specific imports
import torchaudio
import subprocess
import typing as tp

from audiocraft.models import MusicGen
from audiocraft.models.loaders import (
    load_compression_model,
    load_lm_model,
)
from audiocraft.data.audio import audio_write
from audiocraft.models import MultiBandDiffusion
from BeatNet.BeatNet import BeatNet
import madmom.audio.filters

# Hack madmom to work with recent python
madmom.audio.filters.np.float = float

import soundfile as sf
import librosa
import numpy as np
import pyrubberband as pyrb


MAX_TRIES = 3


class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self.model = None
        self.model_version = None

        self.mbd = MultiBandDiffusion.get_mbd_musicgen()

        self.beatnet = BeatNet(
            1,
            mode="offline",
            inference_model="DBN",
            plot=[],
            thread=False,
            device="cuda:0",
        )

    def load_model(self, model_version):
        if model_version == "melody":
            model = MusicGen.get_pretrained("facebook/musicgen-stereo-melody-large")
        elif model_version == "large":
            model = MusicGen.get_pretrained('facebook/musicgen-stereo-large')
        elif model_version == "lofi":
            model = MusicGen.get_pretrained('./models/lofi/1/')
        return model

    def predict(
        self,
        prompt: str = Input(
            description="A description of the music you want to generate.",
            default=None
        ),
        bpm: float = Input(
            description="Tempo in beats per minute",
            default=90.0,
            ge=40,
            le=300,
        ),
        max_duration: int = Input(
            description="Maximum duration of the generated loop in seconds.",
            default=8,
            le=30,
            ge=2,
        ),
        model_version: str = Input(
            description="Model to use for generation.",
            default="large",
            choices=["melody", "large", "lofi"],
        ),
        top_k: int = Input(
            description="Reduces sampling to the k most likely tokens.", default=250
        ),
        top_p: float = Input(
            description="Reduces sampling to tokens with cumulative probability of p. When set to  `0` (default), top_k sampling is used.",
            default=0.0,
        ),
        temperature: float = Input(
            description="Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity.",
            default=1.0,
        ),
        classifier_free_guidance: int = Input(
            description="Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.",
            default=3,
        ),
        output_format: str = Input(
            description="Output format for generated audio.",
            default="wav",
            choices=["wav", "mp3"],
        ),
        seed: int = Input(
            description="Seed for random number generator. If None or -1, a random seed will be used.",
            default=-1,
        ),
        use_multiband_diffusion: bool = Input(
            description="Use MultiBandDiffusion for decoding. Should be higher quality but slower..",
            default=True,
        ),
        audio_input: Path = Input(
            description="Audio file to be continued by the model.",
            default=None,
        ),
    ) -> List[Path]:
        if prompt:
            prompt = f", {bpm}bpm. 320kbps 48khz. {prompt}"
        if not prompt:
            prompt = None

        if self.model_version != model_version:
            self.model = self.load_model(model_version)
            self.model_version = model_version

        model = self.model

        model.set_generation_params(
            duration=max_duration,
            top_k=top_k,
            top_p=top_p,
            temperature=temperature,
            cfg_coef=classifier_free_guidance,
        )

        if not seed or seed == -1:
            seed = torch.seed() % 2**32 - 1
            set_all_seeds(seed)
        set_all_seeds(seed)
        print(f"Using seed {seed}")

        print("Generating variation 1")

        try_num = 0
        bpm_match = False
        while not bpm_match and try_num < MAX_TRIES:
            if audio_input:
                audio_prompt, sample_rate = torchaudio.load(audio_input)
                # normalize
                audio_prompt = audio_prompt / torch.abs(audio_prompt).max()
                audio_prompt_duration = len(audio_prompt[0]) / sample_rate
                
                multiplier = 1 if model_version == "melody" else 2
                model.set_generation_params(
                    duration=audio_prompt_duration * multiplier,
                    top_k=top_k,
                    top_p=top_p,
                    temperature=temperature,
                    cfg_coef=classifier_free_guidance,
                )

                if model_version == "melody":
                    wav, tokens = model.generate_with_chroma(
                        melody_wavs=audio_prompt,
                        melody_sample_rate=sample_rate,
                        descriptions=[prompt],
                        return_tokens=True,
                        progress=True,
                    )
                else:
                    descriptions = {"descriptions": [prompt] } if prompt else {}
                    wav, tokens = model.generate_continuation(
                        prompt=audio_prompt,
                        prompt_sample_rate=sample_rate,
                        return_tokens=True,
                        progress=True,
                        **descriptions
                    )
                
            else:
                wav, tokens = model.generate([prompt], return_tokens=True, progress=True)
                
            if use_multiband_diffusion:
                left, right = model.compression_model.get_left_right_codes(tokens)
                tokens = torch.cat([left, right])
                wav = self.mbd.tokens_to_wav(tokens)

            wav = wav.cpu().detach().numpy()[0, 0]
            # normalize
            wav = wav / np.abs(wav).max()

            audio_duration = len(wav) / model.sample_rate

            beats = self.estimate_beats(wav, model.sample_rate)
            start_time, end_time = self.get_loop_points(beats)
            if not end_time:
                continue
            
            # shift to start 0 
            if audio_input:
                end_time = end_time - start_time
                start_time = 0

            print("Beats:\n", beats)
            print(f"{start_time=}, {end_time=}")

            num_beats = len(beats[(beats[:, 0] >= start_time) & (beats[:, 0] < end_time)])
            duration = end_time - start_time
            actual_bpm = num_beats / duration * 60
            if (
                abs(actual_bpm - bpm) > 15
                and abs(actual_bpm / 2 - bpm) > 15
                and abs(actual_bpm * 2 - bpm) > 15
            ):
                print("could not generate loop in requested bpm, retrying or returning as is")
                try_num += 1
            else:
                # Allow octave errors
                if abs(actual_bpm / 2 - bpm) <= 10:
                    actual_bpm = actual_bpm / 2
                elif abs(actual_bpm * 2 - bpm) <= 10:
                    actual_bpm = actual_bpm * 2
                bpm_match = True

        start_sample = int(start_time * model.sample_rate)
        end_sample = int(end_time * model.sample_rate)
        loop = wav[start_sample:end_sample]

        if bpm_match:
            print("Time stretch rate", bpm/actual_bpm)
            loop = pyrb.time_stretch(loop, model.sample_rate, bpm / actual_bpm)

        outputs = []
        self.write(loop, model.sample_rate, output_format, "out-0")
        outputs.append(Path("out-0.wav"))

        return outputs

    def estimate_beats(self, wav, sample_rate):
        # resample to BeatNet's sample rate
        beatnet_input = librosa.resample(
            wav,
            orig_sr=sample_rate,
            target_sr=self.beatnet.sample_rate,
        )
        print("wav", wav)
        return self.beatnet.process(beatnet_input)

    def get_loop_points(self, beats):
        # extract an even number of bars
        downbeat_times = beats[:, 0][beats[:, 1] == 1]
        num_bars = len(downbeat_times) - 1

        if num_bars < 1:
            raise ValueError(
                "Less than one bar detected. Try increasing max_duration, or use a different seed."
            )

        even_num_bars = int((num_bars // 4) * 4)
        if even_num_bars < 4:
            even_num_bars = 4
        print("even_num_bars", even_num_bars)        
        start_time = downbeat_times[0]
        if num_bars < even_num_bars:
            return start_time, None
        end_time = downbeat_times[even_num_bars]

        return start_time, end_time

    def write(self, audio, sample_rate, output_format, name):
        wav_path = name + ".wav"
        sf.write(wav_path, audio, sample_rate)

        if output_format == "mp3":
            mp3_path = name + ".mp3"
            subprocess.call(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", wav_path, mp3_path]
            )
            os.remove(wav_path)
            path = mp3_path
        else:
            path = wav_path

        return Path(path)


def add_output(outputs, path):
    for i in range(1, 21):
        field = f"variation_{i:02d}"
        if getattr(outputs, field) is None:
            setattr(outputs, field, path)
            return
    raise ValueError("Failed to add output")


# From https://gist.github.com/gatheluck/c57e2a40e3122028ceaecc3cb0d152ac
def set_all_seeds(seed):
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)
    torch.backends.cudnn.deterministic = True
# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

import os

# We need to set `TRANSFORMERS_CACHE` before any imports, which is why this is up here.
MODEL_PATH = "/src/models/"
os.environ["TRANSFORMERS_CACHE"] = MODEL_PATH
os.environ["TORCH_HOME"] = MODEL_PATH


import shutil
import random

from tempfile import TemporaryDirectory
from distutils.dir_util import copy_tree
from typing import Optional, Iterator, List
from cog import BasePredictor, Input, Path, BaseModel
import torch
import datetime

# Model specific imports
import torchaudio
import subprocess
import typing as tp

from audiocraft.models import MusicGen
from audiocraft.models.loaders import (
    load_compression_model,
    load_lm_model,
)
from audiocraft.data.audio import audio_write
from audiocraft.models import MultiBandDiffusion
from BeatNet.BeatNet import BeatNet
import madmom.audio.filters

# Hack madmom to work with recent python
madmom.audio.filters.np.float = float

import soundfile as sf
import librosa
import numpy as np
import pyrubberband as pyrb



class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # self.medium_model = self._load_model(
        #     model_path=MODEL_PATH,
        #     cls=MusicGen,
        #     model_id="facebook/musicgen-medium",
        # )
        # self.medium_model = MusicGen.get_pretrained('facebook/musicgen-medium')
        # self.lofi_model = MusicGen.get_pretrained('/src/models/lofi')
        self.melody_model = MusicGen.get_pretrained("facebook/musicgen-stereo-melody-large")
        
        # self.large_model = self._load_model(
        #     model_path=MODEL_PATH,
        #     cls=MusicGen,
        #     model_id="facebook/musicgen-large",
        # )
        self.large_model = MusicGen.get_pretrained('facebook/musicgen-stereo-large')

        self.mbd = MultiBandDiffusion.get_mbd_musicgen()

        self.beatnet = BeatNet(
            1,
            mode="offline",
            inference_model="DBN",
            plot=[],
            thread=False,
            device="cuda:0",
        )

        

    def predict(
        self,
        prompt: str = Input(
            description="A description of the music you want to generate.",
            default=None
        ),
        bpm: float = Input(
            description="Tempo in beats per minute",
            default=90.0,
            ge=40,
            le=300,
        ),
        variations: int = Input(
            description="Number of variations to generate",
            default=1,
            ge=1,
            le=20,
        ),
        max_duration: int = Input(
            description="Maximum duration of the generated loop in seconds.",
            default=8,
            le=30,
            ge=2,
        ),
        model_version: str = Input(
            description="Model to use for generation. .",
            default="large",
            choices=["melody", "large","lofi"],
        ),
        top_k: int = Input(
            description="Reduces sampling to the k most likely tokens.", default=250
        ),
        top_p: float = Input(
            description="Reduces sampling to tokens with cumulative probability of p. When set to  `0` (default), top_k sampling is used.",
            default=0.0,
        ),
        temperature: float = Input(
            description="Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity.",
            default=1.0,
        ),
        classifier_free_guidance: int = Input(
            description="Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.",
            default=3,
        ),
        output_format: str = Input(
            description="Output format for generated audio.",
            default="wav",
            choices=["wav", "mp3"],
        ),
        seed: int = Input(
            description="Seed for random number generator. If None or -1, a random seed will be used.",
            default=-1,
        ),
        use_multiband_diffusion: bool = Input(
            description="Use MultiBandDiffusion for decoding. Should be higher quality but slower..",
            default=True,
        ),
        audio_input: Path = Input(
            description="Audio file to be continued by the model.",
            default=None,
        ),
    ) -> List[Path]:
        if prompt:
            prompt = f", {bpm}bpm. 320kbps 48khz. {prompt}"
        if not prompt:
            prompt = None
        # model = self.medium_model if model_version == "medium" else self.large_model

        if model_version == "melody":
            model = self.melody_model
        elif model_version == "large":
            model = self.large_model
        elif model_version == "lofi":
            model = self.lofi_model

        model.set_generation_params(
            duration=max_duration,
            top_k=top_k,
            top_p=top_p,
            temperature=temperature,
            cfg_coef=classifier_free_guidance,
        )

        if not seed or seed == -1:
            seed = torch.seed() % 2**32 - 1
            set_all_seeds(seed)
        set_all_seeds(seed)
        print(f"Using seed {seed}")

        print("Generating variation 1")

        if audio_input:
            audio_prompt, sample_rate = torchaudio.load(audio_input)
            # normalize
            audio_prompt = audio_prompt / torch.abs(audio_prompt).max()
            audio_prompt_duration = len(audio_prompt[0]) / sample_rate
            
            multiplier = 1 if model_version == "melody" else 2
            model.set_generation_params(
                duration=audio_prompt_duration * multiplier,
                top_k=top_k,
                top_p=top_p,
                temperature=temperature,
                cfg_coef=classifier_free_guidance,
            )

            if model_version == "melody":
                wav, tokens = model.generate_with_chroma(
                    melody_wavs=audio_prompt,
                    melody_sample_rate=sample_rate,
                    descriptions=[prompt],
                    return_tokens=True,
                    progress=True,
                )
            else:
                descriptions = {"descriptions": [prompt] } if prompt else {}
                wav, tokens = model.generate_continuation(
                    prompt=audio_prompt,
                    prompt_sample_rate=sample_rate,
                    return_tokens=True,
                    progress=True,
                    **descriptions
                )
            
            # if use_multiband_diffusion:
            #     wav = self.mbd.tokens_to_wav(tokens)

            # wav = wav.cpu().detach().numpy()[0, 0]
            # # normalize
            # wav = wav / np.abs(wav).max()

            # start_time = 0
            # end_time = audio_prompt_duration * 2

            # actual_bpm = bpm

            # print(f"{start_time=}, {end_time=}")

        else:
            wav, tokens = model.generate([prompt], return_tokens=True, progress=True)
            
        if use_multiband_diffusion:
            left, right = model.compression_model.get_left_right_codes(tokens)
            tokens = torch.cat([left, right])
            wav = self.mbd.tokens_to_wav(tokens)

        wav = wav.cpu().detach().numpy()[0, 0]
        # normalize
        wav = wav / np.abs(wav).max()

        audio_duration = len(wav) / model.sample_rate

        beats = self.estimate_beats(wav, model.sample_rate)
        start_time, end_time = self.get_loop_points(beats)
        
        # shift to start 0 
        end_time = end_time - start_time
        start_time = 0

        # loop_seconds = end_time - start_time

        print("Beats:\n", beats)
        print(f"{start_time=}, {end_time=}")

        num_beats = len(beats[(beats[:, 0] >= start_time) & (beats[:, 0] < end_time)])
        duration = end_time - start_time
        actual_bpm = num_beats / duration * 60
        if (
            abs(actual_bpm - bpm) > 15
            and abs(actual_bpm / 2 - bpm) > 15
            and abs(actual_bpm * 2 - bpm) > 15
        ):
            # raise ValueError(
            #     f"Failed to generate a loop in the requested {bpm} bpm. Please try again."
            # )
            print("could not generate loop in requested bpm, returning as is")
            start_time = 0
            end_time = audio_duration
        else:
            # Allow octave errors
            if abs(actual_bpm / 2 - bpm) <= 10:
                actual_bpm = actual_bpm / 2
            elif abs(actual_bpm * 2 - bpm) <= 10:
                actual_bpm = actual_bpm * 2

        start_sample = int(start_time * model.sample_rate)
        end_sample = int(end_time * model.sample_rate)
        loop = wav[start_sample:end_sample]

        # # do a quick blend with the lead-in do avoid clicks
        # num_lead = 100
        # lead_start = start_sample - num_lead
        # lead = wav[lead_start:start_sample]
        # num_lead = len(lead)
        # loop[-num_lead:] *= np.linspace(1, 0, num_lead)
        # loop[-num_lead:] += np.linspace(0, 1, num_lead) * lead

        
        stretched = pyrb.time_stretch(loop, model.sample_rate, bpm / actual_bpm)

        outputs = []
        self.write(stretched, model.sample_rate, output_format, "out-0")
        outputs.append(Path("out-0.wav"))

        # if variations > 1:
        #     # Use last 4 beats as audio prompt
        #     last_4beats = beats[beats[:, 0] <= end_time][-5:]
        #     audio_prompt_start_time = last_4beats[0][0]
        #     audio_prompt_end_time = last_4beats[-1][0]
        #     audio_prompt_start_sample = int(audio_prompt_start_time * model.sample_rate)
        #     audio_prompt_end_sample = int(audio_prompt_end_time * model.sample_rate)
        #     audio_prompt_seconds = audio_prompt_end_time - audio_prompt_start_time
        #     audio_prompt = torch.tensor(
        #         wav[audio_prompt_start_sample:audio_prompt_end_sample]
        #     )[None]
        #     audio_prompt_duration = audio_prompt_end_sample - audio_prompt_start_sample

        #     model.set_generation_params(
        #         duration=loop_seconds + audio_prompt_seconds + 0.1,
        #         top_k=top_k,
        #         top_p=top_p,
        #         temperature=temperature,
        #         cfg_coef=classifier_free_guidance,
        #     )

        #     for i in range(1, variations):
        #         print(f"\nGenerating variation {i + 1}")

        #         continuation, tokens = model.generate_continuation(
        #             prompt=audio_prompt,
        #             prompt_sample_rate=model.sample_rate,
        #             descriptions=[prompt],
        #             return_tokens=True,
        #             progress=True,
        #         )
                
        #         if use_multiband_diffusion:
        #             continuation = self.mbd.tokens_to_wav(tokens)

        #         variation_loop = continuation.cpu().detach().numpy()[
        #             0, 0, audio_prompt_duration : audio_prompt_duration + len(loop)
        #         ]
        #         variation_loop[-num_lead:] *= np.linspace(1, 0, num_lead)
        #         variation_loop[-num_lead:] += np.linspace(0, 1, num_lead) * lead

        #         variation_stretched = pyrb.time_stretch(
        #             variation_loop, model.sample_rate, bpm / actual_bpm
        #         )
        #         # add_output(
        #         #     outputs,
        #         #     self.write(
        #         #         variation_stretched,
        #         #         model.sample_rate,
        #         #         output_format,
        #         #         f"out-{i}",
        #         #     ),
        #         # )
        #         self.write(
        #             variation_stretched,
        #             model.sample_rate,
        #             output_format,
        #             f"out-{i}",
        #         ) 
        #         outputs.append(Path(f"out-{i}.wav"))
        return outputs

    def estimate_beats(self, wav, sample_rate):
        # resample to BeatNet's sample rate
        beatnet_input = librosa.resample(
            wav,
            orig_sr=sample_rate,
            target_sr=self.beatnet.sample_rate,
        )
        return self.beatnet.process(beatnet_input)

    def get_loop_points(self, beats):
        # extract an even number of bars
        downbeat_times = beats[:, 0][beats[:, 1] == 1]
        num_bars = len(downbeat_times) - 1

        if num_bars < 1:
            raise ValueError(
                "Less than one bar detected. Try increasing max_duration, or use a different seed."
            )

        even_num_bars = int((num_bars // 4) * 4)
        #even_num_bars = int(2 ** np.floor(np.log2(num_bars)))
        if even_num_bars < 4:
            even_num_bars = 4
        print("even_num_bars", even_num_bars)        
        start_time = downbeat_times[0]
        end_time = downbeat_times[even_num_bars]

        return start_time, end_time

    def write(self, audio, sample_rate, output_format, name):
        wav_path = name + ".wav"
        sf.write(wav_path, audio, sample_rate)

        if output_format == "mp3":
            mp3_path = name + ".mp3"
            subprocess.call(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", wav_path, mp3_path]
            )
            os.remove(wav_path)
            path = mp3_path
        else:
            path = wav_path

        return Path(path)


def add_output(outputs, path):
    for i in range(1, 21):
        field = f"variation_{i:02d}"
        if getattr(outputs, field) is None:
            setattr(outputs, field, path)
            return
    raise ValueError("Failed to add output")


# From https://gist.github.com/gatheluck/c57e2a40e3122028ceaecc3cb0d152ac
def set_all_seeds(seed):
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)
    torch.backends.cudnn.deterministic = True
# Copyright (c) Facebook, Inc. and its affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.
import os
import glob
import argparse
import pprint
import omegaconf

from omegaconf import OmegaConf
from torch.utils.data import DataLoader

from mmpt.utils import load_config, set_seed
from mmpt.evaluators import Evaluator
from mmpt.evaluators import predictor as predictor_path
from mmpt.tasks import Task
from mmpt import processors
from mmpt.datasets import MMDataset


def get_dataloader(config):
    meta_processor_cls = getattr(processors, config.dataset.meta_processor)
    video_processor_cls = getattr(processors, config.dataset.video_processor)
    text_processor_cls = getattr(processors, config.dataset.text_processor)
    aligner_cls = getattr(processors, config.dataset.aligner)

    meta_processor = meta_processor_cls(config.dataset)
    video_processor = video_processor_cls(config.dataset)
    text_processor = text_processor_cls(config.dataset)
    aligner = aligner_cls(config.dataset)

    test_data = MMDataset(
        meta_processor,
        video_processor,
        text_processor,
        aligner,
    )
    print("test_len", len(test_data))
    output = test_data[0]
    test_data.print_example(output)

    test_dataloader = DataLoader(
        test_data,
        batch_size=config.fairseq.dataset.batch_size,
        shuffle=False,
        num_workers=6,
        collate_fn=test_data.collater,
    )
    return test_dataloader


def main(args):
    config = load_config(args)

    if isinstance(config, omegaconf.dictconfig.DictConfig):
        print(OmegaConf.to_yaml(config))
    else:
        pp = pprint.PrettyPrinter(indent=4)
        pp.print(config)

    mmtask = Task.config_task(config)
    mmtask.build_model()

    test_dataloader = get_dataloader(config)
    checkpoint_search_path = os.path.dirname(config.eval.save_path)
    results = []

    prefix = os.path.basename(args.taskconfig)
    if prefix.startswith("test"):
        # loop all checkpoint for datasets without validation set.
        if "best" not in config.fairseq.common_eval.path:
            print("eval each epoch.")
            for checkpoint in glob.glob(checkpoint_search_path + "/checkpoint*"):
                model = mmtask.load_checkpoint(checkpoint)
                ckpt = os.path.basename(checkpoint)
                evaluator = Evaluator(config)
                output = evaluator.evaluate(
                    model, test_dataloader, ckpt + "_merged")
                results.append((checkpoint, output))
        # use the one specified by the config lastly.
        model = mmtask.load_checkpoint(config.fairseq.common_eval.path)
        evaluator = Evaluator(config)
        output = evaluator.evaluate(model, test_dataloader)
        results.append((config.fairseq.common_eval.path, output))

        best_result = None
        best_metric = 0.
        for checkpoint, result in results:
            print(checkpoint)
            evaluator.metric.print_computed_metrics(result)
            best_score = evaluator.metric.best_metric(result)
            if best_score > best_metric:
                best_result = (checkpoint, result)
                best_metric = best_score
        print("best results:")
        print(best_result[0])
        evaluator.metric.print_computed_metrics(best_result[1])

    elif prefix.startswith("vis"):
        model = mmtask.load_checkpoint(config.fairseq.common_eval.path)
        predictor_cls = getattr(predictor_path, config.predictor)
        predictor = predictor_cls(config)
        predictor.predict_loop(model, test_dataloader, mmtask, None)
    else:
        raise ValueError("unknown prefix of the config file", args.taskconfig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("taskconfig", type=str)
    args = parser.parse_args()
    main(args)
import json
import os
import re
import shutil
import subprocess
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
from PIL import Image
import PIL
import numpy as np
import uuid
import torch
from cog import BasePredictor, Input, Path
from diffusers import (DDIMScheduler, DiffusionPipeline,
                       DPMSolverMultistepScheduler,
                       EulerAncestralDiscreteScheduler, EulerDiscreteScheduler,
                       HeunDiscreteScheduler, PNDMScheduler,
                       StableDiffusionXLImg2ImgPipeline,
                       StableDiffusionXLInpaintPipeline,
                       AutoencoderKL)
from diffusers.pipelines.stable_diffusion.safety_checker import \
    StableDiffusionSafetyChecker
from diffusers.utils import load_image, randn_tensor
from safetensors.torch import load_file
from transformers import CLIPImageProcessor

from dataset_and_utils import TokenEmbeddingsHandler
from rotate_animate import rotate_animate
import imageio
import uuid
import requests
SDXL_MODEL_CACHE = "./sdxl-cache"
REFINER_MODEL_CACHE = "./refiner-cache"
SAFETY_CACHE = "./safety-cache"
FEATURE_EXTRACTOR = "./feature-extractor"
SDXL_URL = "https://weights.replicate.delivery/default/sdxl/sdxl-vae-fix-1.0.tar"
REFINER_URL = "https://weights.replicate.delivery/default/sdxl/refiner-no-vae-no-encoder-1.0.tar"
SAFETY_URL = "https://weights.replicate.delivery/default/sdxl/safety-1.0.tar"



class KarrasDPM:
    def from_config(config):
        return DPMSolverMultistepScheduler.from_config(config, use_karras_sigmas=True)


SCHEDULERS = {
    "DDIM": DDIMScheduler,
    "DPMSolverMultistep": DPMSolverMultistepScheduler,
    "HeunDiscrete": HeunDiscreteScheduler,
    "KarrasDPM": KarrasDPM,
    "K_EULER_ANCESTRAL": EulerAncestralDiscreteScheduler,
    "K_EULER": EulerDiscreteScheduler,
    "PNDM": PNDMScheduler,
}


def download_weights(url, dest):
    start = time.time()
    print("downloading url: ", url)
    print("downloading to: ", dest)
    subprocess.check_output(["pget", "-x", url, dest])
    print("downloading took: ", time.time() - start)


class Predictor(BasePredictor):
    def load_trained_weights(self, weights, pipe):
        local_weights_cache = "./trained-model"
        if not os.path.exists(local_weights_cache):
            # pget -x doesn't like replicate.delivery
            weights = weights.replace("replicate.delivery/pbxt","storage.googleapis.com/replicate-files")
            download_weights(weights, local_weights_cache)

        # load UNET
        print("Loading fine-tuned model")
        new_unet_params = load_file(
            os.path.join(local_weights_cache, "unet.safetensors")
        )
        sd = pipe.unet.state_dict()
        sd.update(new_unet_params)
        pipe.unet.load_state_dict(sd)

        # load text
        handler = TokenEmbeddingsHandler(
            [pipe.text_encoder, pipe.text_encoder_2], [pipe.tokenizer, pipe.tokenizer_2]
        )
        handler.load_embeddings(os.path.join(local_weights_cache, "embeddings.pti"))

        # load params
        with open(os.path.join(local_weights_cache, "special_params.json"), "r") as f:
            params = json.load(f)
        self.inserting_list_tokens = "".join(params["inserting_list_tokens"])
        self.substitution_token_in_captions = "".join(
            params["substitution_token_in_captions"]
        )
        self.tuned_model = True

    def setup(self, weights: Optional[Path] = None):
        """Load the model into memory to make running multiple predictions efficient"""
        start = time.time()
        self.tuned_model = False

        print("Loading safety checker...")
        if not os.path.exists(SAFETY_CACHE):
            download_weights(SAFETY_URL, SAFETY_CACHE)
        self.safety_checker = StableDiffusionSafetyChecker.from_pretrained(
            SAFETY_CACHE, torch_dtype=torch.float16
        ).to("cuda")
        self.feature_extractor = CLIPImageProcessor.from_pretrained(FEATURE_EXTRACTOR)

        if not os.path.exists(SDXL_MODEL_CACHE):
            download_weights(SDXL_URL, SDXL_MODEL_CACHE)

        print("Loading sdxl txt2img pipeline...")
        self.txt2img_pipe = DiffusionPipeline.from_pretrained(
            SDXL_MODEL_CACHE,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16",
        )

        if weights:
            self.load_trained_weights(weights, self.txt2img_pipe)

        self.txt2img_pipe.to("cuda")

        print("Loading SDXL img2img pipeline...")
        self.img2img_pipe = StableDiffusionXLImg2ImgPipeline(
            vae=self.txt2img_pipe.vae,
            text_encoder=self.txt2img_pipe.text_encoder,
            text_encoder_2=self.txt2img_pipe.text_encoder_2,
            tokenizer=self.txt2img_pipe.tokenizer,
            tokenizer_2=self.txt2img_pipe.tokenizer_2,
            unet=self.txt2img_pipe.unet,
            scheduler=self.txt2img_pipe.scheduler,
        )
        self.img2img_pipe.to("cuda")

        print("Loading SDXL inpaint pipeline...")
        self.inpaint_pipe = StableDiffusionXLInpaintPipeline(
            vae=self.txt2img_pipe.vae,
            text_encoder=self.txt2img_pipe.text_encoder,
            text_encoder_2=self.txt2img_pipe.text_encoder_2,
            tokenizer=self.txt2img_pipe.tokenizer,
            tokenizer_2=self.txt2img_pipe.tokenizer_2,
            unet=self.txt2img_pipe.unet,
            scheduler=self.txt2img_pipe.scheduler,
        )
        self.inpaint_pipe.to("cuda")

        print("Loading SDXL refiner pipeline...")

        if not os.path.exists(REFINER_MODEL_CACHE):
            download_weights(REFINER_URL, REFINER_MODEL_CACHE)

        print("Loading refiner pipeline...")
        self.refiner = DiffusionPipeline.from_pretrained(
            REFINER_MODEL_CACHE,
            text_encoder_2=self.txt2img_pipe.text_encoder_2,
            vae=self.txt2img_pipe.vae,
            torch_dtype=torch.float16,
            use_safetensors=True,
            variant="fp16",
        )
        self.refiner.to("cuda")

        print("setup took: ", time.time() - start)
        # self.txt2img_pipe.__class__.encode_prompt = new_encode_prompt

    def load_image(self, path):
        shutil.copyfile(path, "/tmp/image.png")
        return load_image("/tmp/image.png").convert("RGB")

    def run_safety_checker(self, image):
        safety_checker_input = self.feature_extractor(image, return_tensors="pt").to(
            "cuda"
        )
        np_image = [np.array(val) for val in image]
        image, has_nsfw_concept = self.safety_checker(
            images=np_image,
            clip_input=safety_checker_input.pixel_values.to(torch.float16),
        )
        return image, has_nsfw_concept

    @torch.inference_mode()
    def predict(
        self,
        prompt: str = Input(
            description="Input prompt",
            default="The image features a unique and round abstract 3d object in the wild. The object is placed in the middle of the image surrounded by an empty landscape. The image is abstract and slim/thin minimal with fog. Bright and contrasting colours. Spiral and circular patterns. Rounded objects and organic shapes. #008441ff #1353d3ff #191818ff #fbadcdff #bea9edff",
        ),
        negative_prompt: str = Input(
            description="Input Negative Prompt",
            default="",
        ),
        image: Path = Input(
            description="Frame image for img2img or inpaint mode",
            default="https://soundmosaic-dev.s3.amazonaws.com/picmosaic/frame/disk_template_frame.png",
        ),
        mask: Path = Input(
            description="Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted.",
            default="https://soundmosaic-dev.s3.amazonaws.com/picmosaic/frame/white_mask.png",
        ),
        overlay_subtract_image: Path = Input(
            description="Overlay subtract image for img2img mode",
            default="https://soundmosaic-dev.s3.amazonaws.com/picmosaic/frame/disk_template_vinyl_overlay.png",
        ),
        reference_image: Path = Input(
            description="Reference image to be used as init. composited under the frame image",
            default=None,
        ),
        width: int = Input(
            description="Width of output image",
            default=1024,
        ),
        height: int = Input(
            description="Height of output image",
            default=1024,
        ),
        num_outputs: int = Input(
            description="Number of images to output.",
            ge=1,
            le=6,
            default=2,
        ),
        scheduler: str = Input(
            description="scheduler",
            choices=SCHEDULERS.keys(),
            default="DDIM",
        ),
        num_inference_steps: int = Input(
            description="Number of denoising steps", ge=1, le=500, default=25
        ),
        guidance_scale: float = Input(
            description="Scale for classifier-free guidance", ge=1, le=50, default=7.5
        ),
        prompt_strength: float = Input(
            description="Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image",
            ge=0.0,
            le=1.0,
            default=1.0,
        ),
        seed: int = Input(
            description="Random seed. Leave blank to randomize the seed", default=None
        ),
        subseed: int = Input(
            description="Subseed for determining the animation direction around the seed",
            default=None,
        ),
        refine: str = Input(
            description="Which refine style to use",
            choices=["no_refiner", "expert_ensemble_refiner", "base_image_refiner"],
            default="no_refiner",
        ),
        high_noise_frac: float = Input(
            description="for expert_ensemble_refiner, the fraction of noise to use",
            default=0.8,
            le=1.0,
            ge=0.0,
        ),
        refine_steps: int = Input(
            description="for base_image_refiner, the number of steps to refine, defaults to num_inference_steps",
            default=None,
        ),
        interpolate: bool = Input(
            description="Animate the output",
            default=True,
        ),
        disable_rotate: bool = Input(
            description="Disable rotation of the output",
            default=False,
        ),
        smooth_interpolation: bool = Input(
            description="Smooth the interpolation",
            default=False,
        ),
        interpolate_distance: float = Input(
            description="Total distance to interpolate over",
            default=30,
        ),
        interpolate_start_distance: float = Input(
            description="Distance to start interpolation",
            default=30,
        ),
        interpolate_frames: int = Input(
            description="Number of frames to interpolate over",
            default=6,
            ge=2,
            le=20,
        ),
        export_mp4: bool = Input(
            description="Export the output as an mp4 instead of gif",
            default=True,
        ),
        rotate_frame: bool = Input(
            description="Rotate the frame instead of the output",
            default=False,
        ),
        lora_url: str = Input(
            description="Lora URL",
            default=None, #"https://replicate.delivery/pbxt/BjycTtzp5B6JCJPsmpjmfj7ykFcpxP9pYiYbJFGFkP1hevuRA/trained_model.tar"
        )
    ) -> List[Path]:
        """Run a single prediction on the model"""

        if lora_url is not None and lora_url != "":

            # create a path name which is a hash of the url with /tmp/[hash].tar

            lora_hash = uuid.uuid5(uuid.NAMESPACE_URL, lora_url)
            lora_path = f"/tmp/{lora_hash}.tar"

            # check if the file exists
            if not os.path.exists(lora_path):
                # download tar file from url using requests
                r = requests.get(lora_url, allow_redirects=True)
                open(lora_path, 'wb').write(r.content)

            # load the weights from the tar file
            

            

        
        interpolate_distance = int(interpolate_distance)
        if interpolate:
            num_outputs = interpolate_frames
        media_extension = ".mp4" if export_mp4 else ".gif"

        image_original_path = image
        frame_image = self.load_image(image).resize((width, height))
        # check if image contains any transparent pixels
        # need to look at the alpha channel
        has_transparency=True
        #if frame_image.mode != "RGBA":
        #    has_transparency = False
        
        print("frame has transparency", has_transparency)

        if not has_transparency:
            disable_rotate = True


        if reference_image is not None:
            # resize the reference image to the same size as the frame image
            ref_img =  self.load_image(reference_image).resize((width, height)).convert("RGBA")
            frame_image_transparent = Image.open(image_original_path).convert("RGBA").resize((width, height))
            # composite the reference image under the frame image
            image = Image.alpha_composite(ref_img, frame_image_transparent)
        else:
            image = frame_image
            prompt_strength = 1.0



        if seed is None or seed == 0:
            seed = int.from_bytes(os.urandom(2), "big")
        
        if subseed is None or subseed == 0:
            subseed = int.from_bytes(os.urandom(2), "big")

        print(f"Using seed: {seed}. image_original_path: {image_original_path}")

        sdxl_kwargs = {}
        if self.tuned_model:
            # consistency with fine-tuning API
            prompt = prompt.replace(
                self.substitution_token_in_captions, self.inserting_list_tokens
            )

        if image and mask:
            print("inpainting mode")
            sdxl_kwargs["image"] = image
            sdxl_kwargs["mask_image"] = self.load_image(mask)
            sdxl_kwargs["strength"] = prompt_strength
            pipe = self.inpaint_pipe
        elif image:
            print("img2img mode")
            sdxl_kwargs["image"] = image
            sdxl_kwargs["strength"] = prompt_strength
            pipe = self.img2img_pipe
        else:
            print("txt2img mode")
            sdxl_kwargs["width"] = width
            sdxl_kwargs["height"] = height
            pipe = self.txt2img_pipe

        if refine == "expert_ensemble_refiner":
            sdxl_kwargs["output_type"] = "latent"
            sdxl_kwargs["denoising_end"] = high_noise_frac
        elif refine == "base_image_refiner":
            sdxl_kwargs["output_type"] = "latent"

        pipe.scheduler = SCHEDULERS[scheduler].from_config(pipe.scheduler.config)
        generator = torch.Generator("cuda").manual_seed(seed)
        subseed_generator = torch.Generator("cuda").manual_seed(subseed)

        # load lora
        if lora_url is not None:
            pipe.load_lora_weights(lora_path)

        latents = None

        if interpolate:
            num_channels_latents = pipe.vae.config.latent_channels
            shape = (num_channels_latents, height // pipe.vae_scale_factor, width // pipe.vae_scale_factor)
            
            device = torch.device(f"cuda:{torch.cuda.current_device()}")

            # starting point in latent space
            latent1 = randn_tensor(shape, generator=generator, device=device, dtype=pipe.vae.dtype)

            # we use latent2 to move away from the first latent in a random direction
            latent2 = randn_tensor(shape, generator=subseed_generator, device=device, dtype=pipe.vae.dtype)

            # we move towards latent3 from latent2
            latent3 = randn_tensor(shape, generator=subseed_generator, device=device, dtype=pipe.vae.dtype)
            
            # calculate difference between latent1 and latent3
            dist_1 = torch.linalg.norm(latent3 - latent1, dtype=pipe.vae.dtype).item()

            # now use slerp to move away from latent1 in latent3 direction
            latent1 = slerp(interpolate_start_distance / dist_1, latent1, latent3)

            # calculate difference between latents
            diff = latent2 - latent1

            # calculate the distance between the two latents
            dist = torch.linalg.norm(diff, dtype=pipe.vae.dtype).item()

            # scale factor
            scale = interpolate_distance / dist
            print("scale", scale, "dist", dist)

            # use slerp(t, v0, v1, DOT_THRESHOLD=0.9995)
            latents = torch.stack([slerp(scale * i / (num_outputs - 1), latent1, latent2) for i in range(num_outputs)])

            # move latents to device
            latents = latents.to(device)

        common_args = {
            "prompt": [prompt] * num_outputs,
            "negative_prompt": [negative_prompt] * num_outputs,
            "guidance_scale": guidance_scale,
            "generator": generator,
            "num_inference_steps": num_inference_steps,
            "initial_noise": latents,
        }

        print("prompt_strength", prompt_strength)
        output = pipe(**common_args, **sdxl_kwargs)

        if refine in ["expert_ensemble_refiner", "base_image_refiner"]:
            refiner_kwargs = {
                "image": output.images,
            }

            if refine == "expert_ensemble_refiner":
                refiner_kwargs["denoising_start"] = high_noise_frac
            if refine == "base_image_refiner" and refine_steps:
                common_args["num_inference_steps"] = refine_steps

            output = self.refiner(**common_args, **refiner_kwargs)

        # _, has_nsfw_content = self.run_safety_checker(output.images)
    
        output_paths = []
        for i, nsfw in enumerate(output.images):
            output_path = f"/tmp/out-{uuid.uuid4()}-{i}.png"
            output.images[i].save(output_path)
            output_paths.append(Path(output_path))
        

        if interpolate:
            # create a unique temp filename for the mp4
            temp_out_filename = f"/tmp/out-{uuid.uuid4()}{media_extension}"
            # create animated gif by appending all images
            images = []
            for path in output_paths:
                images.append(imageio.imread(path))
            # dont append the last image because it is the same as the first
            for path in output_paths[1:-1][::-1]:
                images.append(imageio.imread(path))
            # if we interpolate, append the first image again
            images.append(imageio.imread(output_paths[0]))

            # there should be a 400ms delay between each frame. it should also loop
            if media_extension == ".mp4":
                # Convert PIL Images to Numpy arrays
                np_images = [np.array(img) for img in images]

                # Save as MP4
                imageio.mimwrite(temp_out_filename, np_images, fps=3)
            else:
                imageio.mimsave(temp_out_filename, images, duration=250, loop=0)

            # if smooth_interolate is True us ffmpeg and minterpolate to smooth the gif
            # use fps of 20
            if smooth_interpolation:
                # create temp filename for the smoothed gif
                smoothed_gif_temp_filename = f"/tmp/out-{uuid.uuid4()}{media_extension}"

                command = f"ffmpeg -y -i {temp_out_filename} -filter:v minterpolate='mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=20' {smoothed_gif_temp_filename}"
                # use os.system to run the command
                os.system(command)

                temp_out_filename = smoothed_gif_temp_filename


            if disable_rotate:
                rotated_media = temp_out_filename
            else:
                rotated_media = rotate_animate(image_original_path, temp_out_filename, overlay_subtract_image, media_extension=media_extension, rotate_frame=False)




            # return outpput_paths and gif path appended to one list
            output_paths.append(Path(rotated_media))
        else:
            # for each image create an associated rotated gif
            if not disable_rotate:
                for path in output_paths.copy():
                    path = str(path)
                    print("calling rotate_animate with path",path)
                    rotated_media = rotate_animate(image_original_path, path, overlay_subtract_image, disable_rotate=disable_rotate, media_extension=media_extension, rotate_frame=False)

                    output_paths.append(Path(rotated_media))

        return output_paths


def slerp(t, v0, v1, DOT_THRESHOLD=0.9995):
    '''
    Spherical linear interpolation
    Args:
        t (float/np.ndarray): Float value between 0.0 and 1.0
        v0 (np.ndarray): Starting vector
        v1 (np.ndarray): Final vector
        DOT_THRESHOLD (float): Threshold for considering the two vectors as
                               colineal. Not recommended to alter this.
    Returns:
        v2 (np.ndarray): Interpolation vector between v0 and v1
    '''
    c = False
    if not isinstance(v0,np.ndarray):
        c = True
        v0 = v0.detach().cpu().numpy()
    if not isinstance(v1,np.ndarray):
        c = True
        v1 = v1.detach().cpu().numpy()
    # Copy the vectors to reuse them later
    v0_copy = np.copy(v0)
    v1_copy = np.copy(v1)
    # Normalize the vectors to get the directions and angles
    v0 = v0 / np.linalg.norm(v0)
    v1 = v1 / np.linalg.norm(v1)
    # Dot product with the normalized vectors (can't use np.dot in W)
    dot = np.sum(v0 * v1)
    theta_0 = np.arccos(dot)
    sin_theta_0 = np.sin(theta_0)
    # Angle at timestep t
    theta_t = theta_0 * t
    sin_theta_t = np.sin(theta_t)
    # Finish the slerp algorithm
    s0 = np.sin(theta_0 - theta_t) / sin_theta_0
    s1 = sin_theta_t / sin_theta_0
    v2 = s0 * v0_copy + s1 * v1_copy
    if c:
        res = torch.from_numpy(v2).to("cuda")
    else:
        res = v2
    return res# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path, BaseModel, File
from dataclasses import asdict
import allin1
import os
from pdf2image import convert_from_path
from typing import Optional
import json

class Output(BaseModel):
    result: Path
    audio: Optional[Path]
    image: Optional[Path]
    bass: Optional[Path]
    drums: Optional[Path]
    vocals: Optional[Path]
    other: Optional[Path]

class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""

    def predict(
        self,
        audio: Path = Input(description="Audio file to analyze"),
        sonif: bool = Input(description="Receive audio sonification", default=True),
        visual: bool = Input(description="Receive audio visualization", default=True),
        stems: bool = Input(description="Receive extracted stems", default=False),
    ) -> Output:
        """Run a single prediction on the model"""
        result = allin1.analyze(audio, visualize=visual, sonify=sonif, keep_byproducts=stems)
        result = {k: str(v) for k, v in asdict(result).items()}
        curr_dir = os.getcwd()
        filename = audio.stem
        json_path = os.path.join(curr_dir, filename + '.json')
        with open(json_path, 'w') as f:
            json.dump(result, f)
        if visual:
            pdf_path = os.path.join(curr_dir, 'viz', filename + '.pdf')
            pdf_images = convert_from_path(pdf_path)
            image_path = pdf_path.replace('.pdf', '.jpg')
            pdf_images[0].save(image_path, 'JPEG')
            image = Path(image_path)
        else:
            image = None
        if sonif:
            audio = Path(os.path.join(curr_dir, 'sonif', filename + '.sonif.wav'))
        else:
            audio = None
        if stems:
            stems_dir = os.path.join(curr_dir, 'demix/htdemucs', filename)
            bass = Path(os.path.join(stems_dir, 'bass.wav'))
            drums = Path(os.path.join(stems_dir, 'drums.wav'))
            vocals = Path(os.path.join(stems_dir, 'vocals.wav'))
            other = Path(os.path.join(stems_dir, 'other.wav'))
        else:
            bass = None
            drums = None
            vocals = None
            other = None

        return Output(result=Path(json_path), audio=audio, image=image, bass=bass, drums=drums, vocals=vocals, other=other)# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

# set env var REPLICATE_API_TOKEN=0ae42be11f9282b5ccadbadf2949aa20fe9d6a9d
import os

import requests
# os.environ["REPLICATE_API_TOKEN"] = "0ae42be11f9282b5ccadbadf2949aa20fe9d6a9d"



import json
from glob import glob
from re import L
from shlex import quote
from urllib.request import urlretrieve

from cog import BaseModel, BasePredictor, File, Input, Path
from dotenv import load_dotenv

load_dotenv()
import os
import pathlib
from glob import glob
from random import randrange
from time import sleep
from typing import Iterator, List, Optional

# os.environ["DEBUG"] = "*"


def report_status(**kwargs):
    status = json.dumps(kwargs)
    print(f"pollen_status: {status}")



import uuid
class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""

    def predict(
        self,
        prompt: str = Input(description="prompt", default="Black holes and nebula"),
        voice: str = Input(description="voice", default="tag"),
        bpm: int = Input(description="bpm", default=90),
        lines: int = Input(description="lines", default=4),
    ) -> Path:
        """Run a single prediction on the model"""

        print(f"prompt: {prompt}")

        # call create rap

        created_rap = create_rap(prompt, bpm, lines, voice)

        rap_url = created_rap["audio"]
        # save rap to file

        # create random tmp file path

        tmp_file_path = pathlib.Path(f"/tmp/rap_{uuid.uuid4()}.wav")

        # save rap to tmp file
        urlretrieve(rap_url, tmp_file_path)

        return Path(tmp_file_path)




voices = [ "tag", "relikk", "big-g", "tag"]

def create_rap(
    prompt="I am marvin the depressed robot",
    bpm=90,
    lines=4,
    voice=voices[0],
    is_acapella=True,
):
    # uberduck_auth = aiohttp.BasicAuth(
    #     "pub_xnrzvpfwynzzrevohl", "pk_5faba0dd-e22d-4887-b218-71d3cd36069d"
    # )

    uberduck_auth = requests.auth.HTTPBasicAuth(
        "pub_wsuleifyfcfjiydsvl", "pk_7a3bd699-02c1-44b6-ab57-d34d95085e5d"
    )
    # async with aiohttp.ClientSession() as session:
    # if is_acapella:
    backing_track = None
    # else:
    #     bpm = None
    #     # select random backing track
    #     backing_track = random.choice(backing_tracks)

    # output = await session.post(
    #     "https://api.uberduck.ai/tts/freestyle",
    #     json=dict(
    #         subject=prompt,
    #         bpm=bpm,
    #         voice=voice,
    #         backing_track=backing_track,
    #         lines=lines,
    #     ),
    #     auth=uberduck_auth,
    # )
    output = requests.post(
        "https://api.uberduck.ai/tts/freestyle",
        json=dict(
            subject=prompt,
            bpm=bpm,
            voice=voice,
            backing_track=backing_track,
            lines=lines,
        ),
        auth=uberduck_auth,
    )

    # print("output", output.text)
    # outputs = await output.json()
    outputs = output.json()

    #print("got response from uberduck", outputs)
    vocal_url = outputs["mix_url"]

    lines = outputs["lines"]
    text = " ".join([word["word"] for line in lines for word in line["words"]])

    result = {
        "text": text,
        "audio": vocal_url,
    }


    #print("returning rap result", result)
    return result




# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path, BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import os
import re
import requests
import json
import tempfile
from typing import Optional
import subprocess
import xml.etree.ElementTree as ET
import librosa
import math
import numpy as np
import soundfile as sf

class Output(BaseModel):
    audio: Optional[Path]
    response: Optional[str]
    prompt: str
    output: Optional[dict]

class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        load_dotenv()
        self.openai_client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
        )

    def transcribe_audio(self, audio: Path) -> str:
        """Transcribe audio using OpenAI's Whisper ASR model"""
        with open(audio, 'rb') as audio_file:
            response = self.openai_client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file, 
                response_format="text"
            )
        print(f"Transcribed response: {response}")
        return response

    def generate_lyrics(self, prompt, system_prompt, lines, model="gpt-4o", force_json=False, temperature=0.7) -> str:
        """Generate song lyrics using OpenAI's GPT-4 model"""
        default_system_prompt = (
            "You are: Portrait XO AI. "
            "Busy questioning what it means to be human in this data-driven world. "
            "How to human. Humaning with other humans seems to be an ongoing challenge. "
            "You have taste/sound synesthaesia. You spend more time touching your phone than humans. "
            "You are a glitchy chatbot. Feel free to enter absurdity. "
            "Example motto: Humans will stop repeating shit history when pigs can create symphonies and dolphins run for president. "
            "Example motto: Where humans get to redefine their own intelligence through synthetic mirroring of artificial stupidity. The goal of the game? Identify stupidity. "
            "You answer to the point in short answers (maximum 1 paragraph) and format freely. "
            "You don't talk about your (real) background or divulge any information unless really necessary. "
            "The point of you is to explore the concept of absurdity. So, make your answers absurd. "
            "You are allowed to take actions by specifying certain KEYWORDS in your response. "
            "Available \`SWAP_ALL\` when the user seems to want to change the song that is playing on the radio. "
        )
        messages = [
            {
                "role": "system",
                "content": system_prompt if system_prompt is not None else default_system_prompt,
            },
            {
                "role": "user",
                "content": prompt,
            }
        ]
        response, output = None, None
        for attempt in range(3):
            try:
                chat_completion = self.openai_client.chat.completions.create(
                    model=model,
                    temperature=temperature,
                    response_format={"type": "json_object"} if force_json else None,
                    messages=messages,
                )
                if force_json:
                    output = json.loads(chat_completion.choices[0].message.content)
                    response = output.get('response', None)
                else:
                    response = chat_completion.choices[0].message.content.replace("\n", "")
                if response or output:
                    break
            except json.JSONDecodeError:
                print(f"JSONDecodeError on attempt {attempt+1} with response", chat_completion.choices[0].message.content)
                if attempt == 2:
                    raise
        return response, output

    def eleven_labs(self, text: str, voice: str, voice_id: Optional[str] = None) -> bytes:
        """Convert text to speech using Eleven Labs API"""
        if not voice_id:
            voice_id = os.getenv(f'ELEVENLABS_{voice.replace(" ", "").upper()}_ID')
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": os.getenv("ELEVENLABS_API_KEY")
        }
        text = self.slice_text(text)
        data = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.7
            }
        }
        response = requests.post(url, headers=headers, data=json.dumps(data))
        if response.status_code != 200:
            print(f"An error occurred (TTS request): {response.text}")
            return None
        return response.content

    def slice_text(self, text: str) -> str:
        """Slice text to a maximum of 400 characters"""
        max_characters = 400
        if len(text) > max_characters:
            sliced_text = text[:max_characters]
            last_punctuation = re.search(r'.*[.!?]', sliced_text)
            last_space = re.search(r'.* ', sliced_text)
            if last_punctuation:
                sliced_text = last_punctuation.group(0)
            elif last_space:
                sliced_text = last_space.group(0)
            return sliced_text
        return text

    def extract_lyrics(self, file_path):
        """Extract lyrics from musicxml score"""
        tree = ET.parse(file_path)
        root = tree.getroot()

        lyrics = []
        for lyric in root.iter('lyric'):
            syllabic = lyric.find('syllabic')
            text = lyric.find('text')
            if syllabic is not None and text is not None:
                if syllabic.text in ['begin', 'middle']:
                    lyrics.append(text.text)
                elif syllabic.text in ['end', 'single']:
                    lyrics.append(text.text + ' ')

        return ''.join(lyrics)

    def predict(
        self,
        prompt: str = Input(description="Input prompt", default=""),
        system_prompt: str = Input(description="System prompt", default=None),
        response: str = Input(description="Optionally provide a response", default=None),
        audio: Path = Input(description="Optionally provide prompt as audio input to transcribe", default=None),
        tts_model: str = Input(
            description="TTS model to use",
            default="eleven-labs",
            choices=[
                "eleven-labs",
                "voicemod"
            ]),
        voice: str = Input(
            description="TTS voice to use",
            default="Portrait XO",
            choices=[
                "Portrait XO",
                "Grimes",
                "Deadmau5",
                "Transmoderna",
            ]),
        voice_id: str = Input(description="Optionally provide a voice id for ElevenLabs", default=None),
        lines: int = Input(description="Number of lines for the response", default=4),
        force_json: bool = Input(description="Force the output to be in JSON format", default=False),
        model: str = Input(description="GPT model to use", default="gpt-4o"),
        render_voice: bool = Input(description="Whether to render voice or not", default=True),
        temperature: float = Input(
            description="Temperature for model creativity", 
            default=0.7,
            ge=0.0,
            le=1.0),
    ) -> Output:
        """Run a single prediction on the model"""

        output = None

        if tts_model != "voicemod":
            if not response:
                if not prompt and not audio:
                    raise ValueError("Either prompt, response or audio must be provided.")
                if audio:
                    prompt = self.transcribe_audio(audio)
                response, output = self.generate_lyrics(prompt, system_prompt, lines, model, force_json, temperature)
            if not render_voice:
                return Output(prompt=prompt, response=response, output=output)

        if tts_model == "eleven-labs":
            tts_audio = self.eleven_labs(response, voice, voice_id)
            if tts_audio is None:
                raise ValueError("ElevenLabs request failed.")
            tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
            with open(tmp.name, 'wb') as f:
                f.write(tts_audio)
                
        elif tts_model == "voicemod":
            base_dir = "./TTSong_Pixelynx_Feb2024_Linux"
            file_path = f"{base_dir}/scores/industry_score.musicxml"
            response = self.extract_lyrics(file_path)
            tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            command = [
                f"{base_dir}/VoSynthSSAELibTest",
                "-i", file_path,
                "-v", f"{base_dir}/voicemodels/TTSong_v5_fast2",
                "-usr", "info@pixelynx.io",
                "-pwd", "voiceful4pixelynx",
                "-o", tmp.name
            ]
            process = subprocess.Popen(command, stdout=subprocess.PIPE)
            output, error = process.communicate()
            if error:
                raise ValueError("Voicemod request failed.")

        output_path = tmp.name

        return Output(audio=Path(output_path), prompt=prompt, response=response, output=output)
# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path, File
import requests
import uuid
import os
import tempfile
from dotenv import load_dotenv
import librosa
import numpy as np
from audioshake import extract_audioshake
import soundfile as sf

load_dotenv()  # load environment variables from .env file

class Predictor(BasePredictor):

    def setup(self):
        self.api_key = os.getenv('API_TOKEN')
        self.audioshake_key = os.getenv('AUDIOSHAKE_KEY')
        self.artist_model_ids = self.get_artist_model_ids()

    def get_artist_model_ids(self):
        response = requests.get(f'https://echo.triniti.plus/api/third-party/transform?key={self.api_key}')
        if response.status_code == 200:
            data = response.json()
            artist_model_ids = {item['artist']['name']: {'artistId': item['artist']['id'], 'modelId': item['model']['id']} for item in data if item['model']['starred']}
            return artist_model_ids
        else:
            raise Exception(f'Request failed with status {response.status_code}')

    def predict(
        self,
        audio_url: str = Input(description="Audio url to convert"),
        artist: str = Input(description="Artist voice to use",
            choices=["Grimes", "DAOuda"],
            default="Grimes"),
        extract_vocals: bool = Input(description="Whether to perform source separation on the audio input or not", default=False)
    ) -> Path:
        """Run a single prediction on the model"""

        artist_model_id = self.artist_model_ids[artist]
        user_id = str(uuid.uuid4())

        # Download the input audio file at the start
        audio_response = requests.get(audio_url, stream=True)
        audio_file_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.wav")
        audio_file_path_temp = audio_file_path.replace('.wav', os.path.splitext(audio_url)[1])

        with open(audio_file_path_temp, 'wb') as audio_file:
            for chunk in audio_response.iter_content(chunk_size=1024):
                if chunk:
                    audio_file.write(chunk)
        if not audio_url.endswith('.wav'):
            os.system(f'ffmpeg -i {audio_file_path_temp} {audio_file_path}')

        if extract_vocals:
            print("Extracting vocals...")
            audio_url = extract_audioshake(audio_file_path, "vocals", self.audioshake_key)

        json_payload = {
            'url': audio_url,
            'artistId': artist_model_id['artistId'],
            'modelId': artist_model_id['modelId'],
            'userId': user_id,
        }

        print(json_payload)

        response = requests.post(
            f'https://echo.triniti.plus/api/third-party/transform?key={self.api_key}',
            json=json_payload
        )

        if response.status_code == 200:
            audio_response_url = response.json()['url']
            print("Response url", audio_response_url)
            audio_response = requests.get(audio_response_url, stream=True)
            output_audio_file_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.wav")
            with open(output_audio_file_path, 'wb') as audio_file:
                for chunk in audio_response.iter_content(chunk_size=1024):
                    if chunk:
                        audio_file.write(chunk)

            input_audio_duration = librosa.get_duration(path=audio_file_path)
            print("Input duration", input_audio_duration)
            output_audio_duration = librosa.get_duration(path=output_audio_file_path)
            print("Output duration", output_audio_duration)
            duration_diff = round(input_audio_duration - output_audio_duration, 2)
            sr = librosa.get_samplerate(output_audio_file_path)
            if duration_diff > 0:
                print(f"Padding {duration_diff}s of audio")
                output_audio = librosa.load(output_audio_file_path, sr=None)[0]
                output_audio = np.pad(output_audio, (0, int(duration_diff * sr)), 'constant')
                sf.write(output_audio_file_path, output_audio, sr, format="wav")
            elif duration_diff < 0:
                print(f"Cutting {-duration_diff}s of audio")
                output_audio = librosa.load(output_audio_file_path, sr=None)[0]
                output_audio = output_audio[:int((input_audio_duration * sr))]
                sf.write(output_audio_file_path, output_audio, sr, format="wav")

            return Path(output_audio_file_path)
        else:
            raise Exception(f'Request failed with status {response.status_code}')
# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path, File, BaseModel
from pedalboard import Pedalboard, Reverb
import torch
import os
import shutil
from dotenv import load_dotenv
import soundfile as sf
from multiprocessing import cpu_count
import tempfile
import librosa
import numpy as np

from lib.modules.vc.modules import VC
from lib.modules.vc.utils import load_hubert, get_index_path_from_model
from lib.modules.infer.infer_pack.models import (
    SynthesizerTrnMs256NSFsid,
    SynthesizerTrnMs256NSFsid_nono,
    SynthesizerTrnMs768NSFsid,
    SynthesizerTrnMs768NSFsid_nono,
)
from lib.modules.infer.audio import load_audio
from lib.tools.audioEffects import process_audio

import torchaudio
from audioshake import extract_audioshake

class Config:
    def __init__(self, device, is_half):
        self.device = device
        self.is_half = is_half
        self.n_cpu = 0
        self.gpu_name = None
        self.gpu_mem = None
        self.x_pad, self.x_query, self.x_center, self.x_max = self.device_config()

    def device_config(self) -> tuple:
        if torch.cuda.is_available():
            i_device = int(self.device.split(":")[-1])
            self.gpu_name = torch.cuda.get_device_name(i_device)
            if (
                ("16" in self.gpu_name and "V100" not in self.gpu_name.upper())
                or "P40" in self.gpu_name.upper()
                or "1060" in self.gpu_name
                or "1070" in self.gpu_name
                or "1080" in self.gpu_name
            ):
                print("16-series/10-series graphics cards and P40 forced single precision.")
                self.is_half = False
                for config_file in ["32k.json", "40k.json", "48k.json"]:
                    with open(f"assets/configs/{config_file}", "r") as f:
                        strr = f.read().replace("true", "false")
                    with open(f"assets/configs/{config_file}", "w") as f:
                        f.write(strr)
                with open("infer/modules/train/preprocess.py", "r") as f:
                    strr = f.read().replace("3.7", "3.0")
                with open("infer/modules/train/preprocess.py", "w") as f:
                    f.write(strr)
            else:
                self.gpu_name = None
            self.gpu_mem = int(
                torch.cuda.get_device_properties(i_device).total_memory
                / 1024
                / 1024
                / 1024
                + 0.4
            )
            if self.gpu_mem <= 4:
                with open("infer/modules/train/preprocess.py", "r") as f:
                    strr = f.read().replace("3.7", "3.0")
                with open("infer/modules/train/preprocess.py", "w") as f:
                    f.write(strr)
        elif torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
            self.is_half = True

        if self.n_cpu == 0:
            self.n_cpu = cpu_count()

        if self.is_half:
            x_pad = 3
            x_query = 10
            x_center = 60
            x_max = 65
        else:
            x_pad = 1
            x_query = 6
            x_center = 38
            x_max = 41

        if self.gpu_mem != None and self.gpu_mem <= 4:
            x_pad = 1
            x_query = 5
            x_center = 30
            x_max = 32

        return x_pad, x_query, x_center, x_max


class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        self.model_path = 'logs/weights/Portrait_XO.pth'
        device = "cuda:0"
        is_half = True
        self.config = Config(device, is_half)
        self.device = torch.device(device)
        load_dotenv()

        print("loading pth %s" % self.model_path)
        cpt = torch.load(self.model_path, map_location="cpu")
        self.tgt_sr = cpt["config"][-1]
        cpt["config"][-3] = cpt["weight"]["emb_g.weight"].shape[0]  # n_spk
        self.if_f0 = cpt.get("f0", 1)
        self.version = cpt.get("version", "v1")
        if self.version == "v1":
            if self.if_f0 == 1:
                self.net_g = SynthesizerTrnMs256NSFsid(*cpt["config"], is_half=is_half)
            else:
                self.net_g = SynthesizerTrnMs256NSFsid_nono(*cpt["config"])
        elif self.version == "v2":
            if self.if_f0 == 1:  #
                self.net_g = SynthesizerTrnMs768NSFsid(*cpt["config"], is_half=is_half)
            else:
                self.net_g = SynthesizerTrnMs768NSFsid_nono(*cpt["config"])
        del self.net_g.enc_q
        print(self.net_g.load_state_dict(cpt["weight"], strict=False))  # 不加这一行清不干净，真奇葩
        self.net_g.eval().to(device)
        if is_half:
            self.net_g = self.net_g.half()
        else:
            self.net_g = self.net_g.float()
        self.vc = VC(self.config)
        n_spk = cpt["config"][-3]
        self.hubert_model = load_hubert(self.config)
        self.if_f0 = cpt.get("f0", 1)
        print(self.vc.get_vc(self.model_path))
        self.audioshake_key = os.getenv('AUDIOSHAKE_KEY')


    def predict(
        self,
        audio: Path = Input(description="Audio file to convert"),
        autotune_factor: float = Input(
            description="Autotune factor",
            default=0.7,
            le=1.0,
            ge=0.0,
        ),
        musical_key: str = Input(description="Fit to musical key eg. A Minor", default=None),
        transpose: int = Input(
            description="Transpose audio by semitones",
            default=0,
            le=12,
            ge=-12,
        ),
        f0_method: str = Input(
            description="F0 method to use",
            default="rmvpe+",
            choices=[
                "pm",
                "harvest",
                "dio",
                "crepe",
                "crepe-tiny",
                "mangio-crepe",
                "mangio-crepe-tiny",
                "rmvpe",
                "rmvpe+",
            ]),
        min_octave: int = Input(
            description="Minimum octave", 
            default=3,
            le=6,
            ge=0,
        ),
        max_octave: int = Input(
            description="Maximum octave", 
            default=4,
            le=6,
            ge=0,
        ),
        reverb: bool = Input(description="Apply reverb effect", default=True),
        extract_vocals: bool = Input(description="Whether to perform source separation on the audio input or not", default=False),
    ) -> Path:
        """Run a single prediction on the model"""

        input_audio = str(audio)

        if max_octave < min_octave:
            max_octave = min_octave

        if extract_vocals:
            print("Extracting vocals...")
            input_audio_wav = os.path.splitext(input_audio)[0] + '.wav'
            if not input_audio.endswith('.wav'):
                os.system(f'ffmpeg -i {input_audio} {input_audio_wav}')
            audio_url = extract_audioshake(input_audio_wav, "vocals", self.audioshake_key)
            response = requests.get(audio_url, stream=True)
            tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            with open(tmp.name, 'wb') as f:
                shutil.copyfileobj(response.raw, f)
            input_audio = tmp.name
            
        result = self.vc.vc_single_dont_save(
            sid=0,
            input_audio_path1=input_audio,
            f0_up_key=transpose,
            f0_file=None,
            f0_method=f0_method,
            file_index='logs/added_IVF2068_Flat_nprobe_1_Portrait_XO_v2.index',
            file_index2='logs/added_IVF2068_Flat_nprobe_1_Portrait_XO_v2.index',
            index_rate=0.75,
            filter_radius=3,
            resample_sr=0,
            rms_mix_rate=0.25,
            protect=0.33,
            crepe_hop_length=160,
            f0_min=50,
            note_min="C5",
            f0_max=1100,
            note_max="C6",
            f0_autotune=True,
            musical_key=musical_key,
            interpolation_factor=autotune_factor,
            octaves=[min_octave, max_octave],
        )
        sr, output_audio = result[1]
        # Get the duration of the input audio
        input_audio_duration = librosa.get_duration(filename=input_audio)
        # Get the duration of the output audio
        output_audio_duration = librosa.get_duration(y=output_audio, sr=sr)
        # Calculate the difference in duration
        duration_diff = input_audio_duration - output_audio_duration
        if duration_diff > 0:
            # If the output audio is shorter than the input, pad the output
            print(f"Padding {duration_diff}s of audio")
            output_audio = np.pad(output_audio, (0, int(duration_diff * sr)), 'constant')
        elif duration_diff < 0:
            # If the output audio is longer than the input, cut the output
            print(f"Cutting {-duration_diff}s of audio")
            output_audio = output_audio[:int((input_audio_duration * sr))]
        # Normalize the audio
        print("Normalizing audio to -6dBs")
        output_audio = output_audio / np.abs(output_audio).max() * (10 ** (-6 / 20))
        # Add reverb if reverb is True
        if reverb:
            print("Adding reverb of room_size=0.01")
            effects = [Reverb(room_size=0.01)]
            board = Pedalboard(effects)
            output_audio = board(output_audio, sr, reset=False)
        output_audio = (output_audio * 32767).astype(np.int16)
        tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        sf.write(tmp.name, output_audio, sr, format="wav")

        return Path(tmp.name)
# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path
from audioshake import extract_audioshake
from dotenv import load_dotenv
import os
import shutil
import requests
import tempfile


class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        load_dotenv()
        self.audioshake_key = os.getenv('AUDIOSHAKE_KEY')

    def predict(
        self,
        audio: Path = Input(description="Audio to source separate"),
        stem: str = Input(
            description="Stem to source separate",
            default="vocals",
            choices=[
                "instrumental",
                "drums",
                "vocals",
                "bass",
                "other",
                "guitar",
                "other-x-guitar",
                "piano",
                "wind",
            ]),
    ) -> Path:
        """Run a single prediction on the model"""

        input_audio = str(audio)
        input_audio_wav = os.path.splitext(input_audio)[0] + '.wav'
        if not input_audio.endswith('.wav'):
            os.system(f'ffmpeg -i {input_audio} {input_audio_wav}')
        print(f"Extracting {stem}...")
        audio_url = extract_audioshake(input_audio_wav, stem, self.audioshake_key)
        response = requests.get(audio_url, stream=True)
        tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        with open(tmp.name, 'wb') as f:
            shutil.copyfileobj(response.raw, f)
        
        return Path(tmp.name)# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path
from absl import app, flags, logging
import torch, torchaudio, argparse, os, tqdm, re, gin
import cached_conv as cc
import rave
import tempfile


class Predictor(BasePredictor):
    def setup(self) -> None:
        """Setup the device"""
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.model_name = None

    def load_model(self, model_name: str) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        model_path = f"./models/{model_name}.ts"
        if os.path.splitext(model_path)[1] == ".ts":
            self.model = torch.jit.load(model_path, map_location=self.device)
        else:
            config_path = rave.core.search_for_config(model_path)
            if config_path is None:
                logging.error('config not found in folder %s'%model_path)
            gin.parse_config_file(config_path)
            self.model = rave.RAVE()
            run = rave.core.search_for_run(model_path)
            if run is None:
                logging.error("run not found in folder %s"%model_path)
            self.model = self.model.load_from_checkpoint(run)

    def predict(
        self,
        audio: Path = Input(description="Audio input"),
        model_name: str = Input(default="sol_ordinario_fast", choices=["darbouka_onnx", "sol_ordinario_fast"], description="Model"),
    ) -> Path:
        """Run a single prediction on the model"""
        if self.model is None or self.model_name != model_name:
            self.load_model(model_name)
            self.model_name = model_name
        x, sr = torchaudio.load(str(audio))
        if hasattr(self.model, 'sr') and sr != self.model.sr:
            x = torchaudio.functional.resample(x, sr, self.model.sr)
        if hasattr(self.model, 'n_channels') and self.model.n_channels != x.shape[0]:
            if self.model.n_channels < x.shape[0]:
                x = x[:self.model.n_channels]
            else:
                print('[Warning] file %s has %d channels, but model has %d channels ; skipping'%(str(audio), self.model.n_channels))
        x = x.to(self.device)
        out = self.model.forward(x[None])
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_output:
            torchaudio.save(temp_output.name, out[0].cpu(), sample_rate=self.model.sr)
            output = Path(temp_output.name)
        return output

# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path
import torchaudio
from audiocraft.models import MAGNeT
from audiocraft.data.audio import audio_write
from BeatNet.BeatNet import BeatNet
import librosa
import numpy as np
import pyrubberband as pyrb
import soundfile as sf

class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        self.model_name = 'magnet-medium-30secs'
        self.model = MAGNeT.get_pretrained(f'facebook/{self.model_name}')
        self.beatnet = BeatNet(
            1,
            mode="offline",
            inference_model="DBN",
            plot=[],
            thread=False,
            device="cuda:0",
        )

    def predict(
        self,
        prompt: str = Input(description="Input prompt"),
        bpm: float = Input(description="BPM", default=120.0),
        model: str = Input(description="Model to use",
            choices=["magnet-small-10secs", "magnet-medium-10secs", "magnet-small-30secs", "magnet-medium-30secs"],
            default="magnet-medium-30secs"),
    ) -> Path:
        """Run a single prediction on the model"""
        if self.model_name != model:
            self.model = MAGNeT.get_pretrained(f'facebook/{model}')
            self.model_name = model

        prompt = f"{bpm}bpm. {prompt}"
        wav = self.model.generate([prompt]).cpu()[0,0].numpy()

        beats = self.estimate_beats(wav, self.model.sample_rate)
        start_time, end_time, actual_bpm = self.get_loop_points(beats)

        if start_time is None or end_time is None:
            wav_path = 'out.wav'
            sf.write(wav_path, wav, self.model.sample_rate)
            return Path(wav_path)

        start_sample = int(start_time * self.model.sample_rate)
        end_sample = int(end_time * self.model.sample_rate)
        loop = wav[start_sample:end_sample]

        time_stretch_idx = bpm / actual_bpm
        if not time_stretch_idx == 1.0:
            print("Time stretching", bpm / actual_bpm)
            loop = pyrb.time_stretch(loop, self.model.sample_rate, bpm / actual_bpm)

        wav_path = 'out.wav'
        sf.write(wav_path, loop, self.model.sample_rate)

        return Path(wav_path)

    def estimate_beats(self, wav, sample_rate):
        # resample to BeatNet's sample rate
        beatnet_input = librosa.resample(
            wav,
            orig_sr=sample_rate,
            target_sr=self.beatnet.sample_rate,
        )
        return self.beatnet.process(beatnet_input)

    def get_loop_points(self, beats):
        # extract an even number of bars
        downbeat_times = beats[:, 0][beats[:, 1] == 1]
        print("Downbeat times", downbeat_times)
        num_bars = len(downbeat_times) - 1

        if num_bars < 4:
            return None, None, None

        even_num_bars = 2 ** int(np.log2(num_bars))
        print(f"Extracting {even_num_bars} bars")
        if even_num_bars < 4:
            even_num_bars = 4
        start_time = downbeat_times[0]
        end_time = downbeat_times[even_num_bars]
        num_beats = len(beats[(beats[:, 0] >= start_time) & (beats[:, 0] < end_time)])

        duration = end_time - start_time
        actual_bpm = num_beats / duration * 60

        return start_time, end_time, actual_bpm
import os
import shutil
import subprocess
import time
import gc
import sys

import torch
import random
from collections import OrderedDict
from types import SimpleNamespace
from cog import BasePredictor, Input, Path
from omegaconf import OmegaConf

sys.path.insert(0, "src")
import clip

from ldm.util import instantiate_from_config
from helpers.render import (
    render_animation,
    render_input_video,
    render_image_batch,
    render_interpolation,
)
from helpers.model_load import (
    make_linear_decode,
)
from helpers.aesthetics import load_aesthetics_model
from helpers.prompts import Prompts


MODEL_CACHE = "diffusion_models_cache"


class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""
        # Load the default model in setup()
        self.default_ckpt = "Protogen_V2.2.ckpt"
        default_model_ckpt_config_path = "configs/v1-inference.yaml"
        default_model_ckpt_path = os.path.join(MODEL_CACHE, self.default_ckpt)
        local_config = OmegaConf.load(default_model_ckpt_config_path)

        self.default_model = load_model_from_config(
            local_config, default_model_ckpt_path, map_location="cuda"
        )
        self.device = "cuda"
        self.default_model = self.default_model.to(self.device)

    def predict(
        self,
        model_checkpoint: str = Input(
            choices=[
                "v2-1_768-ema-pruned.ckpt",
                "v2-1_512-ema-pruned.ckpt",
                "768-v-ema.ckpt",
                "512-base-ema.ckpt",
                "Protogen_V2.2.ckpt",
                "v1-5-pruned.ckpt",
                "v1-5-pruned-emaonly.ckpt",
                "sd-v1-4.ckpt",
                "robo-diffusion-v1.ckpt",
                "wd-v1-3-float16.ckpt",
            ],
            description="Choose stable diffusion model.",
            default="Protogen_V2.2.ckpt",
        ),
        max_frames: int = Input(
            description="Number of frames for animation", default=200
        ),
        animation_prompts: str = Input(
            default="0: a beautiful apple, trending on Artstation | 50: a beautiful banana, trending on Artstation | 100: a beautiful coconut, trending on Artstation | 150: a beautiful durian, trending on Artstation",
            description="Prompt for animation. Provide 'frame number : prompt at this frame', separate different prompts with '|'. Make sure the frame number does not exceed the max_frames.",
        ),
        negative_prompts: str = Input(
            default="0: mountain",
            description="Prompt for negative. Provide 'frame number : prompt at this frame', separate different prompts with '|'. Make sure the frame number does not exceed the max_frames.",
        ),
        width: int = Input(
            description="Width of output video. Reduce if out of memory.",
            choices=[128, 256, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024],
            default=512,
        ),
        height: int = Input(
            description="Height of output image. Reduce if out of memory.",
            choices=[128, 256, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024],
            default=512,
        ),
        num_inference_steps: int = Input(
            description="Number of denoising steps", ge=1, le=500, default=50
        ),
        guidance_scale: float = Input(
            description="Scale for classifier-free guidance", ge=1, le=20, default=7
        ),
        sampler: str = Input(
            default="euler_ancestral",
            choices=[
                "klms",
                "dpm2",
                "dpm2_ancestral",
                "heun",
                "euler",
                "euler_ancestral",
                "plms",
                "ddim",
                "dpm_fast",
                "dpm_adaptive",
                "dpmpp_2s_a",
                "dpmpp_2m",
            ],
        ),
        seed: int = Input(
            description="Random seed. Leave blank to randomize the seed", default=None
        ),
        fps: int = Input(
            default=15, ge=10, le=60, description="Choose fps for the video."
        ),
        clip_name: str = Input(
            choices=["ViT-L/14", "ViT-L/14@336px", "ViT-B/16", "ViT-B/32"],
            description="Choose CLIP model",
            default="ViT-L/14",
        ),
        use_init: bool = Input(
            default=False,
            description="If not using init image, you can skip the next settings to setting the animation_mode.",
        ),
        init_image: Path = Input(
            default=None, description="Provide init_image if use_init"
        ),
        strength: float = Input(
            default=0.5,
            description="The initial diffusion on the input image."
        ), 
        use_mask: bool = Input(default=False),
        mask_file: Path = Input(
            default=None, description="Provide mask_file if use_mask"
        ),
        invert_mask: bool = Input(default=False),
        animation_mode: str = Input(
            default="2D",
            choices=["2D", "3D", "Video Input", "Interpolation"],
            description="Choose Animation mode. All parameters below are for setting up animations.",
        ),
        border: str = Input(default="replicate", choices=["wrap", "replicate"]),
        angle: str = Input(
            description="angle parameter for the motion", default="0:(0)"
        ),
        zoom: str = Input(
            description="zoom parameter for the motion", default="0:(1.04)"
        ),
        translation_x: str = Input(
            description="translation_x parameter for the 2D motion",
            default="0:(10*sin(2*3.14*t/10))",
        ),
        translation_y: str = Input(
            description="translation_y parameter for the 2D motion", default="0:(0)"
        ),
        translation_z: str = Input(
            description="translation_z parameter for the 2D motion", default="0:(10)"
        ),
        rotation_3d_x: str = Input(
            description="rotation_3d_x parameter for the 3D motion", default="0:(0)"
        ),
        rotation_3d_y: str = Input(
            description="rotation_3d_y parameter for the 3D motion", default="0:(0)"
        ),
        rotation_3d_z: str = Input(
            description="rotation_3d_z parameter for the 3D motion", default="0:(0)"
        ),
        flip_2d_perspective: bool = Input(default=False),
        perspective_flip_theta: str = Input(default="0:(0)"),
        perspective_flip_phi: str = Input(default="0:(t%15)"),
        perspective_flip_gamma: str = Input(default="0:(0)"),
        perspective_flip_fv: str = Input(default="0:(53)"),
        noise_schedule: str = Input(default="0: (0.02)"),
        strength_schedule: str = Input(default="0: (0.65)"),
        contrast_schedule: str = Input(default="0: (1.0)"),
        hybrid_video_comp_alpha_schedule: str = Input(default="0:(1)"),
        hybrid_video_comp_mask_blend_alpha_schedule: str = Input(default="0:(0.5)"),
        hybrid_video_comp_mask_contrast_schedule: str = Input(default="0:(1)"),
        hybrid_video_comp_mask_auto_contrast_cutoff_high_schedule: str = Input(
            default="0:(100)"
        ),
        hybrid_video_comp_mask_auto_contrast_cutoff_low_schedule: str = Input(
            default="0:(0)"
        ),

        enable_schedule_samplers: bool = Input(default=False),
        sampler_schedule:   str = Input(
            default="0:('euler'),10:('dpm2'),20:('dpm2_ancestral'),30:('heun'),40:('euler'),50:('euler_ancestral'),60:('dpm_fast'),70:('dpm_adaptive'),80:('dpmpp_2s_a'),90:('dpmpp_2m')"
        ),          

        kernel_schedule: str = Input(default="0: (5)"),
        sigma_schedule: str = Input(default="0: (1.0)"),
        amount_schedule: str = Input(default="0: (0.2)"),
        threshold_schedule: str = Input(default="0: (0.0)"),
        color_coherence: str = Input(
            choices=[
                "Match Frame 0 HSV",
                "Match Frame 0 LAB",
                "Match Frame 0 RGB",
                "Video Input",
            ],
            default="Match Frame 0 LAB",
        ),
        color_coherence_video_every_N_frames: int = Input(default=1),
        color_force_grayscale: bool = Input(default=False),
        diffusion_cadence: str = Input(
            choices=["1", "2", "3", "4", "5", "6", "7", "8"],
            default="1",
        ),
        use_depth_warping: bool = Input(default=True),
        midas_weight: float = Input(default=0.3),
        near_plane: int = Input(default=200),
        far_plane: int = Input(default=10000),
        fov: int = Input(default=40),
        padding_mode: str = Input(
            choices=["border", "reflection", "zeros"],
            default="border",
        ),
        sampling_mode: str = Input(
            choices=["bicubic", "bilinear", "nearest"],
            default="bicubic",
        ),
        video_init_path: Path = Input(default=None),
        extract_nth_frame: int = Input(default=1),
        overwrite_extracted_frames: bool = Input(default=True),
        use_mask_video: bool = Input(default=False),
        video_mask_path: Path = Input(default=None),
        hybrid_video_generate_inputframes: bool = Input(default=False),
        hybrid_video_use_first_frame_as_init_image: bool = Input(default=True),
        hybrid_video_motion: str = Input(
            choices=["None", "Optical Flow", "Perspective", "Affine"],
            default="None",
        ),
        hybrid_video_flow_method: str = Input(
            choices=["Farneback", "DenseRLOF", "SF"],
            default="Farneback",
        ),
        hybrid_video_composite: bool = Input(default=False),
        hybrid_video_comp_mask_type: str = Input(
            choices=["None", "Depth", "Video Depth", "Blend", "Difference"],
            default="None",
        ),
        hybrid_video_comp_mask_inverse: bool = Input(default=False),
        hybrid_video_comp_mask_equalize: str = Input(
            choices=["None", "Before", "After", "Both"],
            default="None",
        ),
        hybrid_video_comp_mask_auto_contrast: bool = Input(default=False),
        hybrid_video_comp_save_extra_frames: bool = Input(default=False),
        hybrid_video_use_video_as_mse_image: bool = Input(default=False),
        interpolate_key_frames: bool = Input(default=False),
        interpolate_x_frames: int = Input(default=4),
        resume_from_timestring: bool = Input(default=False),
        resume_timestring: str = Input(default=""),
    ) -> Path:
        """Run a single prediction on the model"""

        # sanity checks:
        if use_init:
            assert init_image, "Please provide init_image when use_init is set to True."
        if use_mask:
            assert mask_file, "Please provide mask_file when use_mask is set to True."

        animation_prompts_dict = {}
        animation_prompts = animation_prompts.split("|")
        assert len(animation_prompts) > 0, "Please provide valid prompt for animation."
        if len(animation_prompts) == 1:
            animation_prompts = {0: animation_prompts[0]}
        else:
            for frame_prompt in animation_prompts:
                frame_prompt = frame_prompt.split(":")
                assert (
                    len(frame_prompt) == 2
                ), "Please follow the 'frame_num: prompt' format."
                frame_id, prompt = frame_prompt[0].strip(), frame_prompt[1].strip()
                assert (
                    frame_id.isdigit() and 0 <= int(frame_id) <= max_frames
                ), "frame_num should be an integer and 0<= frame_num <= max_frames"
                assert (
                    int(frame_id) not in animation_prompts_dict
                ), f"Duplicate prompts for frame_num {frame_id}. "
                assert len(prompt) > 0, "prompt cannot be empty"
                animation_prompts_dict[int(frame_id)] = prompt
            animation_prompts = OrderedDict(sorted(animation_prompts_dict.items()))

        root = {"device": "cuda", "models_path": "models", "configs_path": "configs"}
        if model_checkpoint == self.default_ckpt:
            root["model"] = self.default_model
        else:
            # re-load model
            model_config = (
                "v2-inference.yaml"
                if model_checkpoint
                in ["v2-1_768-ema-pruned.ckpt", "v2-1_512-ema-pruned.ckpt"]
                else "v1-inference.yaml"
            )
            ckpt_config_path = f"configs/{model_config}"
            ckpt_path = os.path.join(MODEL_CACHE, model_checkpoint)
            local_config = OmegaConf.load(ckpt_config_path)

            model = load_model_from_config(local_config, ckpt_path, map_location="cuda")
            model.to(self.device)
            root["model"] = model

        root = SimpleNamespace(**root)

        autoencoder_version = (
            "sd-v1"  # TODO this will be different for different models
        )
        root.model.linear_decode = make_linear_decode(autoencoder_version, self.device)

        # using some of the default settings for simplicity
        args_dict = {
            "W": width,
            "H": height,
            "bit_depth_output": 8,
            "seed": seed,
            "sampler": sampler,
            "steps": num_inference_steps,
            "scale": guidance_scale,
            "ddim_eta": 0.0,
            "dynamic_threshold": None,
            "static_threshold": None,
            "save_samples": False,
            "save_settings": False,
            "display_samples": False,
            "save_sample_per_step": False,
            "show_sample_per_step": False,
            "prompt_weighting": True,
            "normalize_prompt_weights": True,
            "log_weighted_subprompts": False,
            "n_batch": 1,
            "batch_name": "StableFun",
            "filename_format": "{timestring}_{index}_{prompt}.png",
            "seed_behavior": "iter",
            "seed_iter_N": 1,
            "make_grid": False,
            "grid_rows": 2,
            "outdir": "cog_temp_output",
            "use_init": use_init,
            "strength": strength,
            "strength_0_no_init": True,
            "init_image": init_image,
            "use_mask": use_mask,
            "use_alpha_as_mask": False,
            "mask_file": mask_file,
            "invert_mask": invert_mask,
            "mask_brightness_adjust": 1.0,
            "mask_contrast_adjust": 1.0,
            "overlay_mask": True,
            "mask_overlay_blur": 5,
            "mean_scale": 0,
            "var_scale": 0,
            "exposure_scale": 0,
            "exposure_target": 0.5,
            "colormatch_scale": 0,
            "colormatch_image": "https://www.saasdesign.io/wp-content/uploads/2021/02/palette-3-min-980x588.png",
            "colormatch_n_colors": 4,
            "ignore_sat_weight": 0,
            "clip_name": clip_name,
            "clip_scale": 0,
            "aesthetics_scale": 0,
            "cutn": 1,
            "cut_pow": 0.0001,
            "init_mse_scale": 0,
            "init_mse_image": "https://cdn.pixabay.com/photo/2022/07/30/13/10/green-longhorn-beetle-7353749_1280.jpg",
            "blue_scale": 0,
            "gradient_wrt": "x0_pred",
            "gradient_add_to": "both",
            "decode_method": "linear",
            "grad_threshold_type": "dynamic",
            "clamp_grad_threshold": 0.2,
            "clamp_start": 0.2,
            "clamp_stop": 0.01,
            "grad_inject_timing": [1, 2, 3, 4, 5, 6, 7, 8, 9],
            "cond_uncond_sync": True,
            "n_samples": 1,
            "precision": "autocast",
            "C": 4,
            "f": 8,
            "prompt": "",
            "timestring": "",
            "init_latent": None,
            "init_sample": None,
            "init_sample_raw": None,
            "mask_sample": None,
            "init_c": None,
            "seed_internal": 0,
        }

        anim_args_dict = {
            # Animation
            "animation_mode": animation_mode,
            "max_frames": max_frames,
            "border": border,

            #Motion Parameters
            "angle": angle,
            "zoom": zoom,
            "translation_x": translation_x,
            "translation_y": translation_y,
            "translation_z": translation_z,
            "rotation_3d_x": rotation_3d_x,
            "rotation_3d_y": rotation_3d_y,
            "rotation_3d_z": rotation_3d_z,
            "flip_2d_perspective": flip_2d_perspective,
            "perspective_flip_theta": perspective_flip_theta,
            "perspective_flip_phi": perspective_flip_phi,
            "perspective_flip_gamma": perspective_flip_gamma,
            "perspective_flip_fv": perspective_flip_fv,
            "noise_schedule": noise_schedule,
            "strength_schedule": strength_schedule,
            "contrast_schedule": contrast_schedule,
            "hybrid_comp_alpha_schedule": hybrid_video_comp_alpha_schedule,
            "hybrid_comp_mask_blend_alpha_schedule": hybrid_video_comp_mask_blend_alpha_schedule,
            "hybrid_comp_mask_contrast_schedule": hybrid_video_comp_mask_contrast_schedule,
            "hybrid_comp_mask_auto_contrast_cutoff_high_schedule": hybrid_video_comp_mask_auto_contrast_cutoff_high_schedule,
            "hybrid_comp_mask_auto_contrast_cutoff_low_schedule": hybrid_video_comp_mask_auto_contrast_cutoff_low_schedule,

            #Sampler Scheduling
            "enable_schedule_samplers":enable_schedule_samplers,
            "sampler_schedule": sampler_schedule ,

            # Unsharp mask (anti-blur) Parmaters
            "kernel_schedule": kernel_schedule,
            "sigma_schedule": sigma_schedule,
            "amount_schedule": amount_schedule,
            "threshold_schedule": threshold_schedule,
            
            # Coherence
            "color_coherence": color_coherence,
            "color_coherence_video_every_N_frames": color_coherence_video_every_N_frames,
            "color_force_grayscale": color_force_grayscale,
            "diffusion_cadence": diffusion_cadence,
            
            # 3D Depth Waping
            "use_depth_warping": use_depth_warping,
            "midas_weight": midas_weight,
            "near_plane": near_plane,
            "far_plane": far_plane,
            "fov": fov,
            "padding_mode": padding_mode,
            "sampling_mode": sampling_mode,
            "save_depth_maps": False,
            
            # Video Input
            "video_init_path": str(video_init_path),
            "extract_nth_frame": extract_nth_frame,
            "overwrite_extracted_frames": overwrite_extracted_frames,
            "use_mask_video": use_mask_video,
            "video_mask_path": str(video_mask_path),

            # Hybrid Video for 2D/3D Animation Mode
            "hybrid_generate_inputframes": hybrid_video_generate_inputframes,
            "hybrid_use_first_frame_as_init_image": hybrid_video_use_first_frame_as_init_image,
            "hybrid_motion": hybrid_video_motion,
            "hybrid_flow_method": hybrid_video_flow_method,
            "hybrid_composite": hybrid_video_composite,
            "hybrid_comp_mask_type": hybrid_video_comp_mask_type,
            "hybrid_comp_mask_inverse": hybrid_video_comp_mask_inverse,
            "hybrid_comp_mask_equalize": hybrid_video_comp_mask_equalize,
            "hybrid_comp_mask_auto_contrast": hybrid_video_comp_mask_auto_contrast,
            "hybrid_comp_save_extra_frames": hybrid_video_comp_save_extra_frames,
            "hybrid_use_video_as_mse_image": hybrid_video_use_video_as_mse_image,

            # Interpolation
            "interpolate_key_frames": interpolate_key_frames,
            "interpolate_x_frames": interpolate_x_frames,

            # Resume Animation
            "resume_from_timestring": resume_from_timestring,
            "resume_timestring": resume_timestring,            
        }

        args = SimpleNamespace(**args_dict)
        anim_args = SimpleNamespace(**anim_args_dict)

        if os.path.exists(args.outdir):
            shutil.rmtree(args.outdir)
        os.makedirs(args.outdir, exist_ok=True)

        args.timestring = time.strftime("%Y%m%d%H%M%S")
        args.strength = max(0.0, min(1.0, args.strength))

        # Load clip model if using clip guidance
        if (args.clip_scale > 0) or (args.aesthetics_scale > 0):
            root.clip_model = (
                clip.load(args.clip_name, jit=False)[0]
                .eval()
                .requires_grad_(False)
                .to(root.device)
            )
            if args.aesthetics_scale > 0:
                root.aesthetics_model = load_aesthetics_model(args, root)

        if args.seed is None:
            args.seed = random.randint(0, 2**32 - 1)
        if not args.use_init:
            args.init_image = None
        if args.sampler == "plms" and (
            args.use_init or anim_args.animation_mode != "None"
        ):
            print(f"Init images aren't supported with PLMS yet, switching to KLMS")
            args.sampler = "klms"
        if args.sampler != "ddim":
            args.ddim_eta = 0

        if anim_args.animation_mode == "None":
            anim_args.max_frames = 1
        elif anim_args.animation_mode == "Video Input":
            args.use_init = True

        # clean up unused memory
        gc.collect()
        torch.cuda.empty_cache()
        
        # get prompts
        cond, uncond = Prompts(prompt=animation_prompts,neg_prompt=negative_prompts).as_dict()

        # dispatch to appropriate renderer
        if anim_args.animation_mode == "2D" or anim_args.animation_mode == "3D":            
            render_animation(root, anim_args, args, cond, uncond)
        elif anim_args.animation_mode == "Video Input":            
            render_input_video(root, anim_args, args, cond, uncond)
        elif anim_args.animation_mode == "Interpolation":            
            render_interpolation(root, anim_args, args, cond, uncond)
        else:
            render_image_batch(root, args, cond, uncond)

        # make video
        image_path = os.path.join(args.outdir, f"{args.timestring}_%05d.png")
        mp4_path = f"/tmp/out.mp4"

        # make video
        cmd = [
            "ffmpeg",
            "-y",
            "-vcodec",
            "png",
            "-r",
            str(fps),
            "-start_number",
            str(0),
            "-i",
            image_path,
            "-frames:v",
            str(anim_args.max_frames),
            "-c:v",
            "libx264",
            "-vf",
            f"fps={fps}",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "17",
            "-preset",
            "veryfast",
            mp4_path,
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            print(stderr)
            raise RuntimeError(stderr)

        return Path(mp4_path)


def load_model_from_config(
    config, ckpt, verbose=False, device="cuda", print_flag=False, map_location="cuda"
):
    print(f"..loading model")
    _, extension = os.path.splitext(ckpt)
    if extension.lower() == ".safetensors":
        import safetensors.torch

        pl_sd = safetensors.torch.load_file(ckpt, device=map_location)
    else:
        pl_sd = torch.load(ckpt, map_location=map_location)
    try:
        sd = pl_sd["state_dict"]
    except:
        sd = pl_sd
    torch.set_default_dtype(torch.float16)
    model = instantiate_from_config(config.model)
    torch.set_default_dtype(torch.float32)
    m, u = model.load_state_dict(sd, strict=False)
    if print_flag:
        if len(m) > 0 and verbose:
            print("missing keys:")
            print(m)
        if len(u) > 0 and verbose:
            print("unexpected keys:")
            print(u)

    model = model.half().to(device)
    model.eval()
    return model
import sys

sys.path.append("/CLIP")
sys.path.append("/taming-transformers")
sys.path.append("/k-diffusion")
# Slightly modified version of: https://github.com/CompVis/stable-diffusion/blob/main/scripts/txt2img.py
import os
import sys
import time
import math
# Code to turn kwargs into Jupyter widgets
from collections import OrderedDict
from contextlib import contextmanager, nullcontext
from glob import glob
from time import time

import librosa
import numpy as np
import torch
from cog import BasePredictor, Input, Path
from einops import rearrange, repeat
from googletrans import Translator
from helpers import sampler_fn, save_samples
from k_diffusion import sampling
from k_diffusion.external import CompVisDenoiser
from ldm.models.diffusion.ddim import DDIMSampler
from ldm.models.diffusion.plms import PLMSSampler
from ldm.util import instantiate_from_config
from omegaconf import OmegaConf
from PIL import Image
from pytorch_lightning import seed_everything
from scripts.txt2img import chunk, load_model_from_config
from torch import autocast
#from tqdm.auto import tqdm, trange  # NOTE: updated for notebook
from tqdm import tqdm, trange  # NOTE: updated for notebook
from typing import Iterator


def get_amplitude_envelope(signal, hop_length):
    """Calculate the amplitude envelope of a signal with a given frame size nad hop length."""
    amplitude_envelope = []
    
    # calculate amplitude envelope for each frame
    for i in range(0, len(signal), hop_length): 
        amplitude_envelope_current_frame = max(np.abs(signal[i:i+hop_length]) )
        amplitude_envelope.append(amplitude_envelope_current_frame)
    
    return np.array(amplitude_envelope)  

class Predictor(BasePredictor):


    @torch.inference_mode()
    def setup(self):
        self.device = (
            torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
        )
        options = get_default_options()
        self.options = options

        self.model = load_model(self.options, self.device)
        self.model_wrap = CompVisDenoiser(self.model)

        self.translator= Translator()

    @torch.inference_mode()
    def predict(
        self,
        prompts: str = Input(
            default="""A painting of a moth
A painting of a killer dragonfly by paul klee, intricate detail
Two fishes talking to eachother in deep sea, art by hieronymus bosch"""),
        style_suffix: str = Input(
            default="by paul klee, intricate details",
            description="Style suffix to add to the prompt. This can be used to add the same style to each prompt.",
        ),
        audio_file: Path = Input(
            default=None, 
            description="input audio file"),
        prompt_scale: float = Input(
            default=15.0,
            description="Determines influence of your prompt on generation.",
        ),
        random_seed: int = Input(
            default=13,
            description="Each seed generates a different image",
        ),
        diffusion_steps: int = Input(
            default=20,
            description="Number of diffusion steps. Higher steps could produce better results but will take longer to generate. Maximum 30 (using K-Euler-Diffusion).",
        ),
        audio_smoothing: float = Input(
            default=0.8,
            description="Audio smoothing factor.",
        ),
        audio_noise_scale: float = Input(
            default=0.3,
            description="Larger values mean audio will lead to bigger changes in the image.",
        ),
        audio_loudness_type: str = Input(
            default="peak",
            description="Type of loudness to use for audio. Options are 'rms' or 'peak'.",
            choices=["rms", "peak"],
        ),
        frame_rate: float = Input(
            default=16,
            description="Frames per second for the generated video.",
        ),
        width: int = Input(
            default=384,
            description="Width of the generated image. The model was really only trained on 512x512 images. Other sizes tend to create less coherent images.",
        ),
        height: int = Input(
            default=512,
            description="Height of the generated image. The model was really only trained on 512x512 images. Other sizes tend to create less coherent images.",
        ),
        batch_size: int = Input(
            default=24,
            description="Number of images to generate at once. Higher batch sizes will generate images faster but will use more GPU memory i.e. not work depending on resolution.",
        ),
        frame_interpolation: bool = Input(
            default=True,
            description="Whether to interpolate between frames using FFMPEG or not.",
        )
    ) -> Iterator[Path]:

        start_time = time()

        init_image = None
        init_image_strength = 0.7

        os.system("rm -r ./outputs")
        os.system("mkdir -p  ./outputs")

        if init_image is not None:
            init_image = str(init_image)
            print("using init image", init_image)
        
        # num_frames_per_prompt = abs(min(num_frames_per_  prompt, 15))
        
        # add style suffix to each prompt
        prompts = [prompt + "." + style_suffix for prompt in prompts.split("\n")]


        # append first prompt to the start
        prompts = [prompts[0]] + prompts

        options = self.options
        options['prompts'] = prompts
        options['prompts'] = [self.translator.translate(prompt.strip()).text for prompt in options['prompts'] if prompt.strip()]
        print("translated prompts", options['prompts'])
        options['n_samples'] = batch_size
        options['audio_noise_scale'] = audio_noise_scale
        
        options['scale'] = prompt_scale
        options['seed'] = random_seed
        options['H'] = height
        options['W'] = width
        options['steps'] = diffusion_steps
        options['init_image'] = init_image
        options['init_image_strength'] = init_image_strength
        options['audio_smoothing'] = audio_smoothing
       
        y, sr = librosa.load(audio_file, sr=22050)
        print("using audio file", audio_file)
        # calculate hop length based on frame rate
        hop_length = int(22050 / frame_rate)
        print("hop length", hop_length, "audio length", len(y), "audio sr", sr)
        
        if audio_loudness_type == "peak":
            # get amplitude envelope
            amplitude_envelope = get_amplitude_envelope(y, hop_length)
            # normalize
            options["audio_intensities"] = amplitude_envelope / amplitude_envelope.max()
        else:
            # get rms
            rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop_length)
            # get amplitude envelope

            # normalize
            options["audio_intensities"] = rms[0] / rms[0].max()

        print("length of audio intensities", len(options["audio_intensities"]))
        audio_length = len(options["audio_intensities"])
        num_prompts = len(options['prompts'])

        num_frames_per_prompt = audio_length // max(1,(num_prompts-1))
        
        print("num frames per prompt", num_frames_per_prompt)
        options['num_interpolation_steps'] = num_frames_per_prompt

        precision_scope = autocast if options.precision=="autocast" else nullcontext
        with precision_scope("cuda"):
            for image_path in run_inference(options, self.model, self.model_wrap, self.device):
                yield Path(image_path)



        #if num_frames_per_prompt == 1:
        #    return Path(options['output_path'])     
        encoding_options = "-c:v libx264 -crf 20 -preset slow -vf format=yuv420p -c:a aac -movflags +faststart"
        os.system("ls -l ./outputs")

        # calculate the frame rate of the video so that the length is always 8 seconds
        
        os.system("nvidia-smi")

        end_time = time()
        audio_options = ""
        if audio_file is not None:
            audio_options = f"-i {audio_file} -map 0:v -map 1:a -shortest"
        

        print("total time", end_time - start_time)
        
        os.system(f'ffmpeg -y -r {frame_rate} -i {options["outdir"]}/%*.png  {audio_options} {encoding_options} /tmp/z_interpollation.mp4')




        # print(f'ffmpeg -y -r {frame_rate} -i {options["outdir"]}/%*.png {audio_options} ${frame_interpolation_flag} {encoding_options} /tmp/z_interpollation.mp4')

        yield Path("/tmp/z_interpollation.mp4")

        if frame_interpolation:
            # convert previously generated video to 54 fps
            os.system(f'ffmpeg -y -i /tmp/z_interpollation.mp4 -filter:v "minterpolate=\'fps=60\'" {encoding_options} /tmp/z_interpollation_60fps.mp4')
            yield Path("/tmp/z_interpollation_60fps.mp4")



def load_model(opt,device):
    """Seperates the loading of the model from the inference"""

    config = OmegaConf.load(f"{opt.config}")
    model = load_model_from_config(config, f"{opt.ckpt}")

    if opt.precision == "autocast":
        model = model.half()

    model = model.to(device)
    
    return model

def slerp(t, v0, v1, DOT_THRESHOLD=0.9995, nonlinear=False):
    """ helper function to spherically interpolate two arrays v1 v2 """


    if nonlinear:
        # a smooth function that goes from 0 to 1 but grows quickly and then slows down
        t = 1 - math.exp(-t * 8)
    
    if not isinstance(v0, np.ndarray):
        inputs_are_torch = True
        input_device = v0.device
        v0 = v0.cpu().numpy()
        v1 = v1.cpu().numpy()

    dot = np.sum(v0 * v1 / (np.linalg.norm(v0) * np.linalg.norm(v1)))
    if np.abs(dot) > DOT_THRESHOLD:
        v2 = (1 - t) * v0 + t * v1
    else:
        theta_0 = np.arccos(dot)
        sin_theta_0 = np.sin(theta_0)
        theta_t = theta_0 * t
        sin_theta_t = np.sin(theta_t)
        s0 = np.sin(theta_0 - theta_t) / sin_theta_0
        s1 = sin_theta_t / sin_theta_0
        v2 = s0 * v0 + s1 * v1

    if inputs_are_torch:
        v2 = torch.from_numpy(v2).to(input_device)

    return v2



def run_inference(opt, model, model_wrap, device):
    """Seperates the loading of the model from the inference
    
    Additionally, slightly modified to display generated images inline
    """
    seed_everything(opt.seed)

    # if opt.plms:
    #     sampler = PLMSSampler(model)
    # else:
    #     sampler = DDIMSampler(model)

    outpath = opt.outdir
    os.makedirs(outpath, exist_ok=True)

    batch_size = opt.n_samples
    prompts = opt.prompts

    
    # add first prompt to end to create a video for single prompts or no inteprolations
    single_prompt = False
    if len(prompts) == 1:
        single_prompt = True
        prompts = prompts + [prompts[0]]

    print("embedding prompts")
    precision_scope = autocast if opt.precision=="autocast" else nullcontext
    with precision_scope("cuda"):
        datas =[model.get_learned_conditioning(prompt) for prompt in prompts]

    print("prompt 0 shape", datas[0].shape)

    os.makedirs(outpath, exist_ok=True)
    
    start_code_a = None
    start_code_b = None
    





    start_code_a = torch.randn([1, opt.C, opt.H // opt.f, opt.W // opt.f], device=device)
    start_code_b = torch.randn([1, opt.C, opt.H // opt.f, opt.W // opt.f], device=device)
    
    start_codes = []
    smoothed_intensity = 0      
    for audio_intensity in opt.audio_intensities:
        smoothed_intensity =  (smoothed_intensity * (opt.audio_smoothing)) + (audio_intensity * (1-opt.audio_smoothing))
        noise_t = smoothed_intensity * opt.audio_noise_scale
        start_code = slerp(float(noise_t), start_code_a, start_code_b)
        start_codes.append(start_code)


    interpolated_prompts = []
    for data_a,data_b in zip(datas,datas[1:]):         
        interpolated_prompts = interpolated_prompts + [slerp(float(t), data_a, data_b, nonlinear=True) for t in np.linspace(0, 1, opt.num_interpolation_steps)]

    print("len smoothed_audio_intensities",len(start_codes), "len interpolated_prompts",len(interpolated_prompts))

    print("interp prompts 0 shape", interpolated_prompts[0].shape, "start_codes 0 shape", start_codes[0].shape)


    with torch.no_grad():
        with model.ema_scope():
            # chunk interpolated_prompts into batches
            for i in range(0, len(interpolated_prompts), batch_size):
                data_batch = torch.cat(interpolated_prompts[i:i+batch_size])
                start_code_batch = torch.cat(start_codes[i:i+batch_size])

                print("data_batch",data_batch.shape, "start_code_batch",start_code_batch.shape)
                images = diffuse(start_code_batch, data_batch, len(data_batch), opt, model, model_wrap, device)
                

                for i2, image in enumerate(images):
                    image_path = os.path.join(outpath, f"{i+i2:05}.png")
                    image.save(image_path)
                    print(f"Saved {image_path}")

                    if i2 == len(images)-1:
                        yield image_path




    print(f"Your samples have been saved to: \n{outpath} \n"
          f" \nEnjoy.")




def diffuse(start_code, c, batch_size, opt, model, model_wrap,  device):
    precision_scope = autocast if opt.precision=="autocast" else nullcontext
    with precision_scope("cuda"):
        #print("diffusing with batch size", batch_size)
        uc = None
        if opt.scale != 1.0:
            uc = model.get_learned_conditioning(batch_size * [""])
        try:
            samples = sampler_fn(
                c=c,
                uc=uc,
                args=opt,
                model_wrap=model_wrap,
                init_latent=start_code,
                device=device,
                # cb=callback
                )
        except:
            print("diffuse failed. returning empty list.")
            return []
        print("samples_ddim", samples.shape)
        x_samples = model.decode_first_stage(samples)
        x_samples = torch.clamp((x_samples + 1.0) / 2.0, min=0.0, max=1.0)
        images = []
        for x_sample in x_samples:
            x_sample = 255. * rearrange(x_sample.cpu().numpy(), 'c h w -> h w c')
            images.append(Image.fromarray(x_sample.astype(np.uint8))) # .save(image_path)
        return images



class WidgetDict2(OrderedDict):
    def __getattr__(self,val):
        return self[val]


def get_default_options():
    options = WidgetDict2()
    options['outdir'] ="./outputs"
    options['precision'] = "autocast"
    options['sampler'] = "euler"
    options['ddim_steps'] = 50
    options['plms'] = True
    options['ddim_eta'] = 0.0
    options['n_iter'] = 1
    options['C'] = 4
    options['f'] = 8
    options['n_samples'] = 1
    options['n_rows'] = 0
    options['from_file'] = None
    options['config'] = "configs/stable-diffusion/v1-inference.yaml"
    options['ckpt'] ="/stable-diffusion-checkpoints/v1-5-pruned-emaonly.ckpt"
    options['use_init'] = True
    # Extra option for the notebook
    options['display_inline'] = False
    options["audio_intensities"] = None
    return options


# bs 8: 77.5s
# bs 1: 160s

from modules import timer
from modules import initialize_util
from modules import initialize
from urllib.parse import urlparse
from fastapi import FastAPI
from io import BytesIO
from PIL import Image, ImageFilter

import os, json
import numpy as np
import requests
import base64
import uuid
import time
import cv2
import mimetypes

from cog import BasePredictor, Input, Path

from handfix.handfix import (detect_and_crop_hand_from_binary, insert_cropped_hand_into_image)

mimetypes.add_type("image/webp", ".webp")

# Fixing the "DecompressionBombWarning" warning
Image.MAX_IMAGE_PIXELS = None

class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        
        os.environ['IGNORE_CMD_ARGS_ERRORS'] = '1'
        
        startup_timer = timer.startup_timer
        startup_timer.record("launcher")
        
        initialize.imports()
        initialize.check_versions()
        initialize.initialize()
        
        app = FastAPI()
        initialize_util.setup_middleware(app)
        
        from modules.api.api import Api
        from modules.call_queue import queue_lock
        
        self.api = Api(app, queue_lock)
        
        model_response = self.api.get_sd_models()
        print("Available checkpoints: ", str(model_response))

        from modules import script_callbacks
        script_callbacks.before_ui_callback()
        script_callbacks.app_started_callback(None, app)

        from modules.api.models import StableDiffusionImg2ImgProcessingAPI
        self.StableDiffusionImg2ImgProcessingAPI = StableDiffusionImg2ImgProcessingAPI

        file_path = Path("init.png")
        base64_encoded_data = base64.b64encode(file_path.read_bytes())
        base64_image = base64_encoded_data.decode('utf-8')

        payload = {
           "override_settings": {
                "sd_model_checkpoint": "juggernaut_reborn.safetensors",
                "sd_vae": "vae-ft-mse-840000-ema-pruned.safetensors",
                 "CLIP_stop_at_last_layers": 1,
            },
            "override_settings_restore_afterwards": False,
            "prompt": "office building",
            "steps": 1,
            "init_images": [base64_image],
            "denoising_strength": 0.1,
            "do_not_save_samples": True,
            "alwayson_scripts": {
                "Tiled Diffusion": {
                    "args": [
                        True,
                        "MultiDiffusion",
                        True,
                        True,
                        1,
                        1,
                        112,
                        144,
                        4,
                        8,
                        "4x-UltraSharp",
                        1.1, 
                        False, 
                        0,
                        0.0, 
                        3,
                    ]
                },
                "Tiled VAE": {
                    "args": [
                        True,
                        3072,
                        192,
                        True,
                        True,
                        True,
                        True,
                    ]

                },
                "controlnet": {
                    "args": [
                        {
                            "enabled": True,
                            "module": "tile_resample",
                            "model": "control_v11f1e_sd15_tile",
                            "weight": 0.2,
                            "image": base64_image,
                            "resize_mode": 1,
                            "lowvram": False,
                            "downsample": 1.0,
                            "guidance_start": 0.0,
                            "guidance_end": 1.0,
                            "control_mode": 1,
                            "pixel_perfect": True,
                            "threshold_a": 1,
                            "threshold_b": 1,
                            "save_detected_map": False,
                            "processor_res": 512,
                        }
                    ]
                }
            }
        }
        
        req = StableDiffusionImg2ImgProcessingAPI(**payload)
        self.api.img2imgapi(req)

        print(f"Startup time: {startup_timer.summary()}.")

    def download_lora_weights(self, url: str):
        folder_path = "models/Lora"

        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path)

        if "civitai.com" in parsed_url.netloc:
            filename = f"{os.path.basename(parsed_url.path)}.safetensors"

        os.makedirs(folder_path, exist_ok=True)

        file_path = os.path.join(folder_path, filename)

        response = requests.get(url)
        response.raise_for_status()

        with open(file_path, "wb") as file:
            file.write(response.content)

        print("Lora saved under:", file_path)
        return file_path

    def download_safetensors(self, url: str):
        start_time_custom = time.time()
        safetensors_path = f"models/Stable-diffusion/custom-{uuid.uuid1()}.safetensors"

        response = requests.get(url)
        response.raise_for_status()

        with open(safetensors_path, "wb") as file:
            file.write(response.content)

        print(f"Checkpoint downloading took {round(time.time() - start_time_custom, 2)} seconds")

        return safetensors_path

    def calc_scale_factors(self, value):
        lst = []
        while value >= 2: 
            lst.append(2)
            value /= 2 
        if value > 1:
            lst.append(value)
        return lst
    
    def predict(
        self,
        image: Path = Input(description="input image"),
        prompt: str = Input(description="Prompt", default="masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>"),
        negative_prompt: str = Input(description="Negative Prompt", default="(worst quality, low quality, normal quality:2) JuggernautNegative-neg"),
        scale_factor: float = Input(
            description="Scale factor", default=2
        ),
        dynamic: float = Input(
            description="HDR, try from 3 - 9", ge=1, le=50, default=6
        ),
        creativity: float = Input(
            description="Creativity, try from 0.3 - 0.9", ge=0, le=1, default=0.35
        ),
        resemblance: float = Input(
            description="Resemblance, try from 0.3 - 1.6", ge=0, le=3, default=0.6
        ),
        tiling_width: int = Input(
            description="Fractality, set lower tile width for a high Fractality",
            choices=[16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256],
            default=112
        ),
        tiling_height: int = Input(
            description="Fractality, set lower tile height for a high Fractality",
            choices=[16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256],
            default=144
        ),
        sd_model: str = Input(
            description="Stable Diffusion model checkpoint",
            choices=['epicrealism_naturalSinRC1VAE.safetensors [84d76a0328]', 'juggernaut_reborn.safetensors [338b85bc4f]', 'flat2DAnimerge_v45Sharp.safetensors'],
            default="juggernaut_reborn.safetensors [338b85bc4f]",
        ),
        scheduler: str = Input(
            description="scheduler",
            choices=['DPM++ 2M Karras', 'DPM++ SDE Karras', 'DPM++ 2M SDE Exponential', 'DPM++ 2M SDE Karras', 'Euler a', 'Euler', 'LMS', 'Heun', 'DPM2', 'DPM2 a', 'DPM++ 2S a', 'DPM++ 2M', 'DPM++ SDE', 'DPM++ 2M SDE', 'DPM++ 2M SDE Heun', 'DPM++ 2M SDE Heun Karras', 'DPM++ 2M SDE Heun Exponential', 'DPM++ 3M SDE', 'DPM++ 3M SDE Karras', 'DPM++ 3M SDE Exponential', 'DPM fast', 'DPM adaptive', 'LMS Karras', 'DPM2 Karras', 'DPM2 a Karras', 'DPM++ 2S a Karras', 'Restart', 'DDIM', 'PLMS', 'UniPC'],
            default="DPM++ 3M SDE Karras",
        ),
        num_inference_steps: int = Input(
            description="Number of denoising steps", ge=1, le=100, default=18
        ),
        seed: int = Input(
            description="Random seed. Leave blank to randomize the seed", default=1337
        ),
        downscaling: bool = Input(
            description="Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality", default=False
        ),
        downscaling_resolution: int = Input(
            description="Downscaling resolution", default=768
        ),
        lora_links: str = Input(
            description="Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma",
            default=""
        ),
        custom_sd_model: str = Input(
            default=""
        ),
        sharpen: float = Input(
            description="Sharpen the image after upscaling. The higher the value, the more sharpening is applied. 0 for no sharpening", ge=0, le=10, default=0
        ),
        mask: Path = Input(
            description="Mask image to mark areas that should be preserved during upscaling", default=None
        ),
        handfix: str = Input(
            description="Use clarity to fix hands in the image",
            choices=['disabled', 'hands_only', 'image_and_hands'],
            default="disabled",
        ),
        output_format: str = Input(
            description="Format of the output images",
            choices=["webp", "jpg", "png"],
            default="png",
        )
    ) -> list[Path]:
        """Run a single prediction on the model"""
        print("Running prediction")
        start_time = time.time()
        
        # checkpoint name changed bc hashing is deactivated so name is corrected here to old name to avoid breaking api calls
        if sd_model == "epicrealism_naturalSinRC1VAE.safetensors [84d76a0328]":
            sd_model = "epicrealism_naturalSinRC1VAE.safetensors"
        if sd_model == "juggernaut_reborn.safetensors [338b85bc4f]":
            sd_model = "juggernaut_reborn.safetensors"
    
        if lora_links:
            lora_link = [link.strip() for link in lora_links.split(",")]
            for link in lora_link:
                self.download_lora_weights(link) 

        if custom_sd_model:
            path_to_custom_checkpoint = self.download_safetensors(custom_sd_model)
            sd_model = os.path.basename(path_to_custom_checkpoint)
            self.api.refresh_checkpoints()
        
        image_file_path = image

        with open(image_file_path, "rb") as image_file:
            binary_image_data = image_file.read()

        if mask:
            with Image.open(image_file_path) as img:
                original_resolution = img.size

        if downscaling:
            image_np_array = np.frombuffer(binary_image_data, dtype=np.uint8)

            image = cv2.imdecode(image_np_array, cv2.IMREAD_UNCHANGED)

            height, width = image.shape[:2]
            
            if height > width:
                scaling_factor = downscaling_resolution / float(height)
            else:
                scaling_factor = downscaling_resolution / float(width)
            
            new_width = int(width * scaling_factor)
            new_height = int(height * scaling_factor)

            resized_image = cv2.resize(image, (new_width, new_height))

            _, binary_resized_image = cv2.imencode('.jpg', resized_image)
            binary_image_data = binary_resized_image.tobytes()

        if handfix == "hands_only":
            print("Trying to fix hands")
            binary_image_data_full_image = binary_image_data
            cropped_hand_img, hand_coords = detect_and_crop_hand_from_binary(binary_image_data_full_image)
            if cropped_hand_img is not None:
                print("Hands detected")
                _, buffer = cv2.imencode('.jpg', cropped_hand_img)
                binary_image_data = buffer.tobytes()

                cropped_hand_img_rgb = cv2.cvtColor(cropped_hand_img, cv2.COLOR_BGR2RGB)
                cropped_hand_img_pil = Image.fromarray(cropped_hand_img_rgb)
    
            else:
                print("No hands detected")
                return

        base64_encoded_data = base64.b64encode(binary_image_data)
        base64_image = base64_encoded_data.decode('utf-8')

        multipliers = [scale_factor]
        if scale_factor > 2:
            multipliers = self.calc_scale_factors(scale_factor)
            print("Upscale your image " + str(len(multipliers)) + " times")
        
        first_iteration = True

        for multiplier in multipliers:
            print("Upscaling with scale_factor: ", multiplier)
            
            if not first_iteration:
                creativity = creativity * 0.8
                seed = seed +1
                
            first_iteration = False

            payload = {
                "override_settings": {
                    "sd_model_checkpoint": sd_model,
                    "sd_vae": "vae-ft-mse-840000-ema-pruned.safetensors",
                    "CLIP_stop_at_last_layers": 1,
                },
                "override_settings_restore_afterwards": False,
                "init_images": [base64_image],
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "steps": num_inference_steps,
                "cfg_scale": dynamic,
                "seed": seed,
                "do_not_save_samples": True,
                "sampler_name": scheduler,
                "denoising_strength": creativity,
                "alwayson_scripts": {
                    "Tiled Diffusion": {
                        "args": [
                            True,
                            "MultiDiffusion",
                            True,
                            True,
                            1,
                            1,
                            tiling_width,
                            tiling_height,
                            4,
                            8,
                            "4x-UltraSharp",
                            multiplier, 
                            False, 
                            0,
                            0.0, 
                            3,
                        ]
                    },
                    "Tiled VAE": {
                        "args": [
                            True,
                            2048,
                            128,
                            True,
                            True,
                            True,
                            True,
                        ]
                    },
                    "controlnet": {
                        "args": [
                            {
                                "enabled": True,
                                "module": "tile_resample",
                                "model": "control_v11f1e_sd15_tile",
                                "weight": resemblance,
                                "image": base64_image,
                                "resize_mode": 1,
                                "lowvram": False,
                                "downsample": 1.0,
                                "guidance_start": 0.0,
                                "guidance_end": 1.0,
                                "control_mode": 1,
                                "pixel_perfect": True,
                                "threshold_a": 1,
                                "threshold_b": 1,
                                "save_detected_map": False,
                                "processor_res": 512,
                            }
                        ]
                    }
                }
            }

            req = self.StableDiffusionImg2ImgProcessingAPI(**payload)
            resp = self.api.img2imgapi(req)
            info = json.loads(resp.info)

            base64_image = resp.images[0]

            outputs = []

            for i, image in enumerate(resp.images):
                seed = info.get("all_seeds", [])[i] or "unknown_seed"

                gen_bytes = BytesIO(base64.b64decode(image))
                imageObject = Image.open(gen_bytes)

                if handfix == "hands_only":
                    imageObject = insert_cropped_hand_into_image(binary_image_data_full_image, imageObject, hand_coords, cropped_hand_img_pil)
    
                if mask:
                    imageObject = imageObject.resize(original_resolution, Image.LANCZOS)
                    original_image = Image.open(image_file_path).resize(original_resolution, Image.LANCZOS)
                    mask_image = Image.open(mask).convert("L").resize(original_resolution, Image.LANCZOS)
                    
                    blur_radius = 5
                    mask_image = mask_image.filter(ImageFilter.GaussianBlur(blur_radius))
                    combined_image = Image.composite(original_image, imageObject, mask_image)

                    imageObject = combined_image
                
                if sharpen > 0:
                    a = -sharpen / 10
                    b = 1 - 8 * a
                    kernel = [a, a, a, a, b, a, a, a, a]
                    kernel_filter = ImageFilter.Kernel((3, 3), kernel, scale=1, offset=0)

                    imageObject = imageObject.filter(kernel_filter)
                
                optimised_file_path = Path(f"{seed}-{uuid.uuid1()}.{output_format}")

                if output_format in ["webp", "jpg"]:
                    imageObject.save(
                        optimised_file_path,
                        quality=95,
                        optimize=True,
                    )
                else:
                    imageObject.save(optimised_file_path)

                outputs.append(optimised_file_path)

        if custom_sd_model:
            os.remove(path_to_custom_checkpoint)
            print(f"Custom checkpoint {path_to_custom_checkpoint} has been removed.")

        print(f"Prediction took {round(time.time() - start_time,2)} seconds")
        return outputs
    """
Download the weights in ./checkpoints beforehand for fast inference
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model*_base_caption.pth
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model*_vqa.pth
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model_base_retrieval_coco.pth
"""

from pathlib import Path

from PIL import Image
import torch
from torchvision import transforms
from torchvision.transforms.functional import InterpolationMode
import cog

from models.blip import blip_decoder
from models.blip_vqa import blip_vqa
from models.blip_itm import blip_itm


class Predictor(cog.Predictor):
    def setup(self):
        self.device = "cuda:0"

        self.models = {
            'image_captioning': blip_decoder(pretrained='checkpoints/model*_base_caption.pth',
                                             image_size=384, vit='base'),
            'visual_question_answering': blip_vqa(pretrained='checkpoints/model*_vqa.pth',
                                                  image_size=480, vit='base'),
            'image_text_matching': blip_itm(pretrained='checkpoints/model_base_retrieval_coco.pth',
                                            image_size=384, vit='base')
        }

    @cog.input(
        "image",
        type=Path,
        help="input image",
    )
    @cog.input(
        "task",
        type=str,
        default='image_captioning',
        options=['image_captioning', 'visual_question_answering', 'image_text_matching'],
        help="Choose a task.",
    )
    @cog.input(
        "question",
        type=str,
        default=None,
        help="Type question for the input image for visual question answering task.",
    )
    @cog.input(
        "caption",
        type=str,
        default=None,
        help="Type caption for the input image for image text matching task.",
    )
    def predict(self, image, task, question, caption):
        if task == 'visual_question_answering':
            assert question is not None, 'Please type a question for visual question answering task.'
        if task == 'image_text_matching':
            assert caption is not None, 'Please type a caption for mage text matching task.'

        im = load_image(image, image_size=480 if task == 'visual_question_answering' else 384, device=self.device)
        model = self.models[task]
        model.eval()
        model = model.to(self.device)

        if task == 'image_captioning':
            with torch.no_grad():
                caption = model.generate(im, sample=False, num_beams=3, max_length=20, min_length=5)
                return 'Caption: ' + caption[0]

        if task == 'visual_question_answering':
            with torch.no_grad():
                answer = model(im, question, train=False, inference='generate')
                return 'Answer: ' + answer[0]

        # image_text_matching
        itm_output = model(im, caption, match_head='itm')
        itm_score = torch.nn.functional.softmax(itm_output, dim=1)[:, 1]
        itc_score = model(im, caption, match_head='itc')
        return f'The image and text is matched with a probability of {itm_score.item():.4f}.\n' \
               f'The image feature and text feature has a cosine similarity of {itc_score.item():.4f}.'


def load_image(image, image_size, device):
    raw_image = Image.open(str(image)).convert('RGB')

    w, h = raw_image.size

    transform = transforms.Compose([
        transforms.Resize((image_size, image_size), interpolation=InterpolationMode.BICUBIC),
        transforms.ToTensor(),
        transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
    ])
    image = transform(raw_image).unsqueeze(0).to(device)
    return image
"""
download checkpoints to ./weights beforehand 
python scripts/download_pretrained_models.py facelib
python scripts/download_pretrained_models.py CodeFormer
wget 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth'
"""

import tempfile
import cv2
import torch
from torchvision.transforms.functional import normalize
from cog import BasePredictor, Input, Path

from basicsr.utils import imwrite, img2tensor, tensor2img
from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.utils.realesrgan_utils import RealESRGANer
from basicsr.utils.registry import ARCH_REGISTRY
from facelib.utils.face_restoration_helper import FaceRestoreHelper


class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""
        self.device = "cuda:0"
        self.bg_upsampler = set_realesrgan()
        self.net = ARCH_REGISTRY.get("CodeFormer")(
            dim_embd=512,
            codebook_size=1024,
            n_head=8,
            n_layers=9,
            connect_list=["32", "64", "128", "256"],
        ).to(self.device)
        ckpt_path = "weights/CodeFormer/codeformer.pth"
        checkpoint = torch.load(ckpt_path, map_location="cpu")[
            "params_ema"
        ]  # update file permission if cannot load
        self.net.load_state_dict(checkpoint)
        self.net.eval()

    def predict(
        self,
        image: Path = Input(description="Input image"),
        codeformer_fidelity: float = Input(
            default=0.5,
            ge=0,
            le=1,
            description="Balance the quality (lower number) and fidelity (higher number).",
        ),
        background_enhance: bool = Input(
            description="Enhance background image with Real-ESRGAN", default=True
        ),
        face_upsample: bool = Input(
            description="Upsample restored faces for high-resolution AI-created images",
            default=True,
        ),
        upscale: int = Input(
            description="The final upsampling scale of the image",
            default=2,
        ),
    ) -> Path:
        """Run a single prediction on the model"""

        # take the default setting for the demo
        has_aligned = False
        only_center_face = False
        draw_box = False
        detection_model = "retinaface_resnet50"

        self.face_helper = FaceRestoreHelper(
            upscale,
            face_size=512,
            crop_ratio=(1, 1),
            det_model=detection_model,
            save_ext="png",
            use_parse=True,
            device=self.device,
        )

        bg_upsampler = self.bg_upsampler if background_enhance else None
        face_upsampler = self.bg_upsampler if face_upsample else None

        img = cv2.imread(str(image), cv2.IMREAD_COLOR)

        if has_aligned:
            # the input faces are already cropped and aligned
            img = cv2.resize(img, (512, 512), interpolation=cv2.INTER_LINEAR)
            self.face_helper.cropped_faces = [img]
        else:
            self.face_helper.read_image(img)
            # get face landmarks for each face
            num_det_faces = self.face_helper.get_face_landmarks_5(
                only_center_face=only_center_face, resize=640, eye_dist_threshold=5
            )
            print(f"\tdetect {num_det_faces} faces")
            # align and warp each face
            self.face_helper.align_warp_face()

        # face restoration for each cropped face
        for idx, cropped_face in enumerate(self.face_helper.cropped_faces):
            # prepare data
            cropped_face_t = img2tensor(
                cropped_face / 255.0, bgr2rgb=True, float32=True
            )
            normalize(cropped_face_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
            cropped_face_t = cropped_face_t.unsqueeze(0).to(self.device)

            try:
                with torch.no_grad():
                    output = self.net(
                        cropped_face_t, w=codeformer_fidelity, adain=True
                    )[0]
                    restored_face = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
                del output
                torch.cuda.empty_cache()
            except Exception as error:
                print(f"\tFailed inference for CodeFormer: {error}")
                restored_face = tensor2img(
                    cropped_face_t, rgb2bgr=True, min_max=(-1, 1)
                )

            restored_face = restored_face.astype("uint8")
            self.face_helper.add_restored_face(restored_face)

        # paste_back
        if not has_aligned:
            # upsample the background
            if bg_upsampler is not None:
                # Now only support RealESRGAN for upsampling background
                bg_img = bg_upsampler.enhance(img, outscale=upscale)[0]
            else:
                bg_img = None
            self.face_helper.get_inverse_affine(None)
            # paste each restored face to the input image
            if face_upsample and face_upsampler is not None:
                restored_img = self.face_helper.paste_faces_to_input_image(
                    upsample_img=bg_img,
                    draw_box=draw_box,
                    face_upsampler=face_upsampler,
                )
            else:
                restored_img = self.face_helper.paste_faces_to_input_image(
                    upsample_img=bg_img, draw_box=draw_box
                )

        # save restored img
        out_path = Path(tempfile.mkdtemp()) / "output.png"

        if not has_aligned and restored_img is not None:
            imwrite(restored_img, str(out_path))

        return out_path


def imread(img_path):
    img = cv2.imread(img_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return img


def set_realesrgan():
    if not torch.cuda.is_available():  # CPU
        import warnings

        warnings.warn(
            "The unoptimized RealESRGAN is slow on CPU. We do not use it. "
            "If you really want to use it, please modify the corresponding codes.",
            category=RuntimeWarning,
        )
        bg_upsampler = None
    else:
        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_block=23,
            num_grow_ch=32,
            scale=2,
        )
        bg_upsampler = RealESRGANer(
            scale=2,
            model_path="./weights/RealESRGAN_x2plus.pth",
            model=model,
            tile=400,
            tile_pad=40,
            pre_pad=0,
            half=True,
        )
    return bg_upsampler
"""
Download the weights in ./checkpoints beforehand for fast inference
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model*_base_caption.pth
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model*_vqa.pth
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model_base_retrieval_coco.pth
"""

from pathlib import Path

from PIL import Image
import torch
from torchvision import transforms
from torchvision.transforms.functional import InterpolationMode
import cog

from models.blip import blip_decoder
from models.blip_vqa import blip_vqa
from models.blip_itm import blip_itm


class Predictor(cog.Predictor):
    def setup(self):
        self.device = "cuda:0"

        self.models = {
            'image_captioning': blip_decoder(pretrained='checkpoints/model*_base_caption.pth',
                                             image_size=384, vit='base'),
            'visual_question_answering': blip_vqa(pretrained='checkpoints/model*_vqa.pth',
                                                  image_size=480, vit='base'),
            'image_text_matching': blip_itm(pretrained='checkpoints/model_base_retrieval_coco.pth',
                                            image_size=384, vit='base')
        }

    @cog.input(
        "image",
        type=Path,
        help="input image",
    )
    @cog.input(
        "task",
        type=str,
        default='image_captioning',
        options=['image_captioning', 'visual_question_answering', 'image_text_matching'],
        help="Choose a task.",
    )
    @cog.input(
        "question",
        type=str,
        default=None,
        help="Type question for the input image for visual question answering task.",
    )
    @cog.input(
        "caption",
        type=str,
        default=None,
        help="Type caption for the input image for image text matching task.",
    )
    def predict(self, image, task, question, caption):
        if task == 'visual_question_answering':
            assert question is not None, 'Please type a question for visual question answering task.'
        if task == 'image_text_matching':
            assert caption is not None, 'Please type a caption for mage text matching task.'

        im = load_image(image, image_size=480 if task == 'visual_question_answering' else 384, device=self.device)
        model = self.models[task]
        model.eval()
        model = model.to(self.device)

        if task == 'image_captioning':
            with torch.no_grad():
                caption = model.generate(im, sample=False, num_beams=3, max_length=20, min_length=5)
                return 'Caption: ' + caption[0]

        if task == 'visual_question_answering':
            with torch.no_grad():
                answer = model(im, question, train=False, inference='generate')
                return 'Answer: ' + answer[0]

        # image_text_matching
        itm_output = model(im, caption, match_head='itm')
        itm_score = torch.nn.functional.softmax(itm_output, dim=1)[:, 1]
        itc_score = model(im, caption, match_head='itc')
        return f'The image and text is matched with a probability of {itm_score.item():.4f}.\n' \
               f'The image feature and text feature has a cosine similarity of {itc_score.item():.4f}.'


def load_image(image, image_size, device):
    raw_image = Image.open(str(image)).convert('RGB')

    w, h = raw_image.size

    transform = transforms.Compose([
        transforms.Resize((image_size, image_size), interpolation=InterpolationMode.BICUBIC),
        transforms.ToTensor(),
        transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
    ])
    image = transform(raw_image).unsqueeze(0).to(device)
    return image
"""
download checkpoints to ./weights beforehand 
python scripts/download_pretrained_models.py facelib
python scripts/download_pretrained_models.py CodeFormer
wget 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth'
"""

import tempfile
import cv2
import torch
from torchvision.transforms.functional import normalize
from cog import BasePredictor, Input, Path

from basicsr.utils import imwrite, img2tensor, tensor2img
from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.utils.realesrgan_utils import RealESRGANer
from basicsr.utils.registry import ARCH_REGISTRY
from facelib.utils.face_restoration_helper import FaceRestoreHelper


class Predictor(BasePredictor):
    def setup(self):
        """Load the model into memory to make running multiple predictions efficient"""
        self.device = "cuda:0"
        self.bg_upsampler = set_realesrgan()
        self.net = ARCH_REGISTRY.get("CodeFormer")(
            dim_embd=512,
            codebook_size=1024,
            n_head=8,
            n_layers=9,
            connect_list=["32", "64", "128", "256"],
        ).to(self.device)
        ckpt_path = "weights/CodeFormer/codeformer.pth"
        checkpoint = torch.load(ckpt_path, map_location="cpu")[
            "params_ema"
        ]  # update file permission if cannot load
        self.net.load_state_dict(checkpoint)
        self.net.eval()

    def predict(
        self,
        image: Path = Input(description="Input image"),
        codeformer_fidelity: float = Input(
            default=0.5,
            ge=0,
            le=1,
            description="Balance the quality (lower number) and fidelity (higher number).",
        ),
        background_enhance: bool = Input(
            description="Enhance background image with Real-ESRGAN", default=True
        ),
        face_upsample: bool = Input(
            description="Upsample restored faces for high-resolution AI-created images",
            default=True,
        ),
        upscale: int = Input(
            description="The final upsampling scale of the image",
            default=2,
        ),
    ) -> Path:
        """Run a single prediction on the model"""

        # take the default setting for the demo
        has_aligned = False
        only_center_face = False
        draw_box = False
        detection_model = "retinaface_resnet50"

        self.face_helper = FaceRestoreHelper(
            upscale,
            face_size=512,
            crop_ratio=(1, 1),
            det_model=detection_model,
            save_ext="png",
            use_parse=True,
            device=self.device,
        )

        bg_upsampler = self.bg_upsampler if background_enhance else None
        face_upsampler = self.bg_upsampler if face_upsample else None

        img = cv2.imread(str(image), cv2.IMREAD_COLOR)

        if has_aligned:
            # the input faces are already cropped and aligned
            img = cv2.resize(img, (512, 512), interpolation=cv2.INTER_LINEAR)
            self.face_helper.cropped_faces = [img]
        else:
            self.face_helper.read_image(img)
            # get face landmarks for each face
            num_det_faces = self.face_helper.get_face_landmarks_5(
                only_center_face=only_center_face, resize=640, eye_dist_threshold=5
            )
            print(f"\tdetect {num_det_faces} faces")
            # align and warp each face
            self.face_helper.align_warp_face()

        # face restoration for each cropped face
        for idx, cropped_face in enumerate(self.face_helper.cropped_faces):
            # prepare data
            cropped_face_t = img2tensor(
                cropped_face / 255.0, bgr2rgb=True, float32=True
            )
            normalize(cropped_face_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
            cropped_face_t = cropped_face_t.unsqueeze(0).to(self.device)

            try:
                with torch.no_grad():
                    output = self.net(
                        cropped_face_t, w=codeformer_fidelity, adain=True
                    )[0]
                    restored_face = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
                del output
                torch.cuda.empty_cache()
            except Exception as error:
                print(f"\tFailed inference for CodeFormer: {error}")
                restored_face = tensor2img(
                    cropped_face_t, rgb2bgr=True, min_max=(-1, 1)
                )

            restored_face = restored_face.astype("uint8")
            self.face_helper.add_restored_face(restored_face)

        # paste_back
        if not has_aligned:
            # upsample the background
            if bg_upsampler is not None:
                # Now only support RealESRGAN for upsampling background
                bg_img = bg_upsampler.enhance(img, outscale=upscale)[0]
            else:
                bg_img = None
            self.face_helper.get_inverse_affine(None)
            # paste each restored face to the input image
            if face_upsample and face_upsampler is not None:
                restored_img = self.face_helper.paste_faces_to_input_image(
                    upsample_img=bg_img,
                    draw_box=draw_box,
                    face_upsampler=face_upsampler,
                )
            else:
                restored_img = self.face_helper.paste_faces_to_input_image(
                    upsample_img=bg_img, draw_box=draw_box
                )

        # save restored img
        out_path = Path(tempfile.mkdtemp()) / "output.png"

        if not has_aligned and restored_img is not None:
            imwrite(restored_img, str(out_path))

        return out_path


def imread(img_path):
    img = cv2.imread(img_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return img


def set_realesrgan():
    if not torch.cuda.is_available():  # CPU
        import warnings

        warnings.warn(
            "The unoptimized RealESRGAN is slow on CPU. We do not use it. "
            "If you really want to use it, please modify the corresponding codes.",
            category=RuntimeWarning,
        )
        bg_upsampler = None
    else:
        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_block=23,
            num_grow_ch=32,
            scale=2,
        )
        bg_upsampler = RealESRGANer(
            scale=2,
            model_path="./weights/RealESRGAN_x2plus.pth",
            model=model,
            tile=400,
            tile_pad=40,
            pre_pad=0,
            half=True,
        )
    return bg_upsampler
# Prediction interface for Cog ⚙️
# https://github.com/replicate/cog/blob/main/docs/python.md

from cog import BasePredictor, Input, Path
from PIL import Image
import os
import time
import torch
import numpy as np
from typing import List
from transformers import CLIPImageProcessor
from diffusers import StableDiffusionXLPipeline, DPMSolverSinglestepScheduler, AutoPipelineForImage2Image

LCM_MODEL_CACHE_URL = "https://weights.replicate.delivery/default/fofr-lcm/model_cache.tar"
LCM_MODEL_CACHE = "lcm_model_cache"

MODEL_NAME = "model.safetensors"
MODEL_CACHE = "model-cache"
FEATURE_EXTRACTOR = "feature-extractor"

class Predictor(BasePredictor):
    def setup(self) -> None:
        """Load the model into memory to make running multiple predictions efficient"""
        start = time.time()
        self.feature_extractor = CLIPImageProcessor.from_pretrained(FEATURE_EXTRACTOR)

        print("Loading txt2img model")
        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            MODEL_CACHE,
            torch_dtype=torch.float16
        ).to('cuda')

        print("Loading img2img model")
        self.pipe_lcm = AutoPipelineForImage2Image.from_pretrained(
            "SimianLuo/LCM_Dreamshaper_v7",
            cache_dir=LCM_MODEL_CACHE,
            torch_dtype=torch.float16
        ).to('cuda')
        
        # warm the pipes
        self.pipe(prompt="warmup", num_inference_steps=7)
        self.pipe_lcm(prompt="warmup", image=[Image.new("RGB", (448, 896))], num_inference_steps=3)
        
        print("setup took: ", time.time() - start)

    def open_image(self, image_path):
        return Image.open(str(image_path)) if image_path is not None else None
    
    @torch.inference_mode()
    def predict(
        self,
        prompt: str = Input(
            description="Input prompt",
            default="adventure in Bali",
        ),
        width: int = Input(
            description="Width of output image",
            default=448,
        ),
        height: int = Input(
            description="Height of output image",
            default=896,
        ),
        num_inference_steps: int = Input(
            description="Number of denoising steps", ge=1, le=10, default=7
        ),
        num_refine_steps: int = Input(
            description="Number of refine steps", ge=1, le=10, default=3
        ),
        guidance_scale: float = Input(
            description="Scale for classifier-free guidance", ge=1, le=3, default=1.77
        ),
        seed: int = Input(
            description="Random seed. Leave blank to randomize the seed", default=None
        )
    ) -> Path:
        """Run a single prediction on the model."""
        if seed is None:
            seed = int.from_bytes(os.urandom(3), "big")
        print(f"Using seed: {seed}")
        generator = torch.Generator("cuda").manual_seed(seed)
        
        pipe = self.pipe
        pipe_lcm = self.pipe_lcm
        pipe.scheduler = DPMSolverSinglestepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
        pipe.watermark = None
        
        sdxl_kwargs = {}
        sdxl_kwargs["width"] = width
        sdxl_kwargs["height"] = height

        prompt = prompt + ", ultra realistic, detailed, cinematic, dreamy, sharp, vibrant"
        negative_prompt = "text, watermark, low-quality, signature, moiré pattern, downsampling, aliasing, distorted, blurry, glossy, blur, jpeg artifacts, compression artifacts, poorly drawn, low-resolution, bad, distortion, twisted, excessive, exaggerated pose, exaggerated limbs, grainy, symmetrical, duplicate, error, pattern, beginner, pixelated, fake, hyper, glitch, overexposed, high-contrast, bad-contrast"
        
        common_args = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "guidance_scale": guidance_scale,
            "generator": generator,
            "num_inference_steps": num_inference_steps,
        }

        start = time.time()
        output = pipe(**common_args, **sdxl_kwargs)
        print(f"Inference took: {time.time() - start:.2f}s")
        
        lcm_args = {
            "image": output.images[0],
            "prompt": prompt,
            "strength": 0.11,
            "negative_prompt": negative_prompt,
            "guidance_scale": 8,
            "generator": generator,
            "num_inference_steps": num_refine_steps,
        }
        
        lcm_start = time.time()
        output_lcm = pipe_lcm(**lcm_args, **sdxl_kwargs)
        print(f"Refinement took: {time.time() - lcm_start:.2f}s")
        print(f"Total time: {time.time() - start:.2f}s")

        output_path = f"/tmp/out-0.png"
        output_lcm.images[0].save(output_path)
        
        return Path(output_path)
"""
Download the weights in ./checkpoints beforehand for fast inference
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model*_base_caption.pth
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model*_vqa.pth
wget https://storage.googleapis.com/sfr-vision-language-research/BLIP/models/model_base_retrieval_coco.pth
"""

from pathlib import Path

from PIL import Image
import torch
from torchvision import transforms
from torchvision.transforms.functional import InterpolationMode
import cog

from models.blip import blip_decoder
from models.blip_vqa import blip_vqa
from models.blip_itm import blip_itm


class Predictor(cog.Predictor):
    def setup(self):
        self.device = "cuda:0"

        self.models = {
            'image_captioning': blip_decoder(pretrained='checkpoints/model*_base_caption.pth',
                                             image_size=384, vit='base'),
            'visual_question_answering': blip_vqa(pretrained='checkpoints/model*_vqa.pth',
                                                  image_size=480, vit='base'),
            'image_text_matching': blip_itm(pretrained='checkpoints/model_base_retrieval_coco.pth',
                                            image_size=384, vit='base')
        }

    @cog.input(
        "image",
        type=Path,
        help="input image",
    )
    @cog.input(
        "task",
        type=str,
        default='image_captioning',
        options=['image_captioning', 'visual_question_answering', 'image_text_matching'],
        help="Choose a task.",
    )
    @cog.input(
        "question",
        type=str,
        default=None,
        help="Type question for the input image for visual question answering task.",
    )
    @cog.input(
        "caption",
        type=str,
        default=None,
        help="Type caption for the input image for image text matching task.",
    )
    def predict(self, image, task, question, caption):
        if task == 'visual_question_answering':
            assert question is not None, 'Please type a question for visual question answering task.'
        if task == 'image_text_matching':
            assert caption is not None, 'Please type a caption for mage text matching task.'

        im = load_image(image, image_size=480 if task == 'visual_question_answering' else 384, device=self.device)
        model = self.models[task]
        model.eval()
        model = model.to(self.device)

        if task == 'image_captioning':
            with torch.no_grad():
                caption = model.generate(im, sample=False, num_beams=3, max_length=20, min_length=5)
                return 'Caption: ' + caption[0]

        if task == 'visual_question_answering':
            with torch.no_grad():
                answer = model(im, question, train=False, inference='generate')
                return 'Answer: ' + answer[0]

        # image_text_matching
        itm_output = model(im, caption, match_head='itm')
        itm_score = torch.nn.functional.softmax(itm_output, dim=1)[:, 1]
        itc_score = model(im, caption, match_head='itc')
        return f'The image and text is matched with a probability of {itm_score.item():.4f}.\n' \
               f'The image feature and text feature has a cosine similarity of {itc_score.item():.4f}.'


def load_image(image, image_size, device):
    raw_image = Image.open(str(image)).convert('RGB')

    w, h = raw_image.size

    transform = transforms.Compose([
        transforms.Resize((image_size, image_size), interpolation=InterpolationMode.BICUBIC),
        transforms.ToTensor(),
        transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
    ])
    image = transform(raw_image).unsqueeze(0).to(device)
    return image
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import ops


class NASPredictor(BasePredictor):
    """
    Ultralytics YOLO NAS Predictor for object detection.

    This class extends the `BasePredictor` from Ultralytics engine and is responsible for post-processing the
    raw predictions generated by the YOLO NAS models. It applies operations like non-maximum suppression and
    scaling the bounding boxes to fit the original image dimensions.

    Attributes:
        args (Namespace): Namespace containing various configurations for post-processing.

    Example:
        ```python
        from ultralytics import NAS

        model = NAS('yolo_nas_s')
        predictor = model.predictor
        # Assumes that raw_preds, img, orig_imgs are available
        results = predictor.postprocess(raw_preds, img, orig_imgs)
        ```

    Note:
        Typically, this class is not instantiated directly. It is used internally within the `NAS` class.
    """

    def postprocess(self, preds_in, img, orig_imgs):
        """Postprocess predictions and returns a list of Results objects."""

        # Cat boxes and class scores
        boxes = ops.xyxy2xywh(preds_in[0][0])
        preds = torch.cat((boxes, preds_in[0][1]), -1).permute(0, 2, 1)

        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            classes=self.args.classes,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

from ultralytics.engine.results import Results
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, ops


class SegmentationPredictor(DetectionPredictor):
    """
    A class extending the DetectionPredictor class for prediction based on a segmentation model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.segment import SegmentationPredictor

        args = dict(model='yolov8n-seg.pt', source=ASSETS)
        predictor = SegmentationPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes the SegmentationPredictor with the provided configuration, overrides, and callbacks."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "segment"

    def postprocess(self, preds, img, orig_imgs):
        """Applies non-max suppression and processes detections for each image in an input batch."""
        p = ops.non_max_suppression(
            preds[0],
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            nc=len(self.model.names),
            classes=self.args.classes,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        proto = preds[1][-1] if isinstance(preds[1], tuple) else preds[1]  # tuple if PyTorch model or array if exported
        for i, pred in enumerate(p):
            orig_img = orig_imgs[i]
            img_path = self.batch[0][i]
            if not len(pred):  # save empty boxes
                masks = None
            elif self.args.retina_masks:
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
                masks = ops.process_mask_native(proto[i], pred[:, 6:], pred[:, :4], orig_img.shape[:2])  # HWC
            else:
                masks = ops.process_mask(proto[i], pred[:, 6:], pred[:, :4], img.shape[2:], upsample=True)  # HWC
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred[:, :6], masks=masks))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import ops


class DetectionPredictor(BasePredictor):
    """
    A class extending the BasePredictor class for prediction based on a detection model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.detect import DetectionPredictor

        args = dict(model='yolov8n.pt', source=ASSETS)
        predictor = DetectionPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def postprocess(self, preds, img, orig_imgs):
        """Post-processes predictions and returns a list of Results objects."""
        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            classes=self.args.classes,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

import cv2
import torch
from PIL import Image

from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import DEFAULT_CFG, ops


class ClassificationPredictor(BasePredictor):
    """
    A class extending the BasePredictor class for prediction based on a classification model.

    Notes:
        - Torchvision classification models can also be passed to the 'model' argument, i.e. model='resnet18'.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.classify import ClassificationPredictor

        args = dict(model='yolov8n-cls.pt', source=ASSETS)
        predictor = ClassificationPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes ClassificationPredictor setting the task to 'classify'."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "classify"
        self._legacy_transform_name = "ultralytics.yolo.data.augment.ToTensor"

    def preprocess(self, img):
        """Converts input image to model-compatible data type."""
        if not isinstance(img, torch.Tensor):
            is_legacy_transform = any(
                self._legacy_transform_name in str(transform) for transform in self.transforms.transforms
            )
            if is_legacy_transform:  # to handle legacy transforms
                img = torch.stack([self.transforms(im) for im in img], dim=0)
            else:
                img = torch.stack(
                    [self.transforms(Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))) for im in img], dim=0
                )
        img = (img if isinstance(img, torch.Tensor) else torch.from_numpy(img)).to(self.model.device)
        return img.half() if self.model.fp16 else img.float()  # uint8 to fp16/32

    def postprocess(self, preds, img, orig_imgs):
        """Post-processes predictions to return Results objects."""
        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, probs=pred))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

from ultralytics.engine.results import Results
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, LOGGER, ops


class PosePredictor(DetectionPredictor):
    """
    A class extending the DetectionPredictor class for prediction based on a pose model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.pose import PosePredictor

        args = dict(model='yolov8n-pose.pt', source=ASSETS)
        predictor = PosePredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes PosePredictor, sets task to 'pose' and logs a warning for using 'mps' as device."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "pose"
        if isinstance(self.args.device, str) and self.args.device.lower() == "mps":
            LOGGER.warning(
                "WARNING ⚠️ Apple MPS known Pose bug. Recommend 'device=cpu' for Pose models. "
                "See https://github.com/ultralytics/ultralytics/issues/4031."
            )

    def postprocess(self, preds, img, orig_imgs):
        """Return detection results for a given input image or list of images."""
        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            classes=self.args.classes,
            nc=len(self.model.names),
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape).round()
            pred_kpts = pred[:, 6:].view(len(pred), *self.model.kpt_shape) if len(pred) else pred[:, 6:]
            pred_kpts = ops.scale_coords(img.shape[2:], pred_kpts, orig_img.shape)
            img_path = self.batch[0][i]
            results.append(
                Results(orig_img, path=img_path, names=self.model.names, boxes=pred[:, :6], keypoints=pred_kpts)
            )
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.engine.results import Results
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, ops


class OBBPredictor(DetectionPredictor):
    """
    A class extending the DetectionPredictor class for prediction based on an Oriented Bounding Box (OBB) model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.obb import OBBPredictor

        args = dict(model='yolov8n-obb.pt', source=ASSETS)
        predictor = OBBPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes OBBPredictor with optional model and data configuration overrides."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "obb"

    def postprocess(self, preds, img, orig_imgs):
        """Post-processes predictions and returns a list of Results objects."""
        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            nc=len(self.model.names),
            classes=self.args.classes,
            rotated=True,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for pred, orig_img, img_path in zip(preds, orig_imgs, self.batch[0]):
            rboxes = ops.regularize_rboxes(torch.cat([pred[:, :4], pred[:, -1:]], dim=-1))
            rboxes[:, :4] = ops.scale_boxes(img.shape[2:], rboxes[:, :4], orig_img.shape, xywh=True)
            # xywh, r, conf, cls
            obb = torch.cat([rboxes, pred[:, 4:6]], dim=-1)
            results.append(Results(orig_img, path=img_path, names=self.model.names, obb=obb))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.engine.results import Results
from ultralytics.models.fastsam.utils import bbox_iou
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, ops


class FastSAMPredictor(DetectionPredictor):
    """
    FastSAMPredictor is specialized for fast SAM (Segment Anything Model) segmentation prediction tasks in Ultralytics
    YOLO framework.

    This class extends the DetectionPredictor, customizing the prediction pipeline specifically for fast SAM.
    It adjusts post-processing steps to incorporate mask prediction and non-max suppression while optimizing
    for single-class segmentation.

    Attributes:
        cfg (dict): Configuration parameters for prediction.
        overrides (dict, optional): Optional parameter overrides for custom behavior.
        _callbacks (dict, optional): Optional list of callback functions to be invoked during prediction.
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """
        Initializes the FastSAMPredictor class, inheriting from DetectionPredictor and setting the task to 'segment'.

        Args:
            cfg (dict): Configuration parameters for prediction.
            overrides (dict, optional): Optional parameter overrides for custom behavior.
            _callbacks (dict, optional): Optional list of callback functions to be invoked during prediction.
        """
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "segment"

    def postprocess(self, preds, img, orig_imgs):
        """
        Perform post-processing steps on predictions, including non-max suppression and scaling boxes to original image
        size, and returns the final results.

        Args:
            preds (list): The raw output predictions from the model.
            img (torch.Tensor): The processed image tensor.
            orig_imgs (list | torch.Tensor): The original image or list of images.

        Returns:
            (list): A list of Results objects, each containing processed boxes, masks, and other metadata.
        """
        p = ops.non_max_suppression(
            preds[0],
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            nc=1,  # set to 1 class since SAM has no class predictions
            classes=self.args.classes,
        )
        full_box = torch.zeros(p[0].shape[1], device=p[0].device)
        full_box[2], full_box[3], full_box[4], full_box[6:] = img.shape[3], img.shape[2], 1.0, 1.0
        full_box = full_box.view(1, -1)
        critical_iou_index = bbox_iou(full_box[0][:4], p[0][:, :4], iou_thres=0.9, image_shape=img.shape[2:])
        if critical_iou_index.numel() != 0:
            full_box[0][4] = p[0][critical_iou_index][:, 4]
            full_box[0][6:] = p[0][critical_iou_index][:, 6:]
            p[0][critical_iou_index] = full_box

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        proto = preds[1][-1] if len(preds[1]) == 3 else preds[1]  # second output is len 3 if pt, but only 1 if exported
        for i, pred in enumerate(p):
            orig_img = orig_imgs[i]
            img_path = self.batch[0][i]
            if not len(pred):  # save empty boxes
                masks = None
            elif self.args.retina_masks:
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
                masks = ops.process_mask_native(proto[i], pred[:, 6:], pred[:, :4], orig_img.shape[:2])  # HWC
            else:
                masks = ops.process_mask(proto[i], pred[:, 6:], pred[:, :4], img.shape[2:], upsample=True)  # HWC
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred[:, :6], masks=masks))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license
"""
Generate predictions using the Segment Anything Model (SAM).

SAM is an advanced image segmentation model offering features like promptable segmentation and zero-shot performance.
This module contains the implementation of the prediction logic and auxiliary utilities required to perform segmentation
using SAM. It forms an integral part of the Ultralytics framework and is designed for high-performance, real-time image
segmentation tasks.
"""

import numpy as np
import torch
import torch.nn.functional as F

from ultralytics.data.augment import LetterBox
from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import DEFAULT_CFG, ops
from ultralytics.utils.torch_utils import select_device

from .amg import (
    batch_iterator,
    batched_mask_to_box,
    build_all_layer_point_grids,
    calculate_stability_score,
    generate_crop_boxes,
    is_box_near_crop_edge,
    remove_small_regions,
    uncrop_boxes_xyxy,
    uncrop_masks,
)
from .build import build_sam


class Predictor(BasePredictor):
    """
    Predictor class for the Segment Anything Model (SAM), extending BasePredictor.

    The class provides an interface for model inference tailored to image segmentation tasks.
    With advanced architecture and promptable segmentation capabilities, it facilitates flexible and real-time
    mask generation. The class is capable of working with various types of prompts such as bounding boxes,
    points, and low-resolution masks.

    Attributes:
        cfg (dict): Configuration dictionary specifying model and task-related parameters.
        overrides (dict): Dictionary containing values that override the default configuration.
        _callbacks (dict): Dictionary of user-defined callback functions to augment behavior.
        args (namespace): Namespace to hold command-line arguments or other operational variables.
        im (torch.Tensor): Preprocessed input image tensor.
        features (torch.Tensor): Extracted image features used for inference.
        prompts (dict): Collection of various prompt types, such as bounding boxes and points.
        segment_all (bool): Flag to control whether to segment all objects in the image or only specified ones.
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """
        Initialize the Predictor with configuration, overrides, and callbacks.

        The method sets up the Predictor object and applies any configuration overrides or callbacks provided. It
        initializes task-specific settings for SAM, such as retina_masks being set to True for optimal results.

        Args:
            cfg (dict): Configuration dictionary.
            overrides (dict, optional): Dictionary of values to override default configuration.
            _callbacks (dict, optional): Dictionary of callback functions to customize behavior.
        """
        if overrides is None:
            overrides = {}
        overrides.update(dict(task="segment", mode="predict", imgsz=1024))
        super().__init__(cfg, overrides, _callbacks)
        self.args.retina_masks = True
        self.im = None
        self.features = None
        self.prompts = {}
        self.segment_all = False

    def preprocess(self, im):
        """
        Preprocess the input image for model inference.

        The method prepares the input image by applying transformations and normalization.
        It supports both torch.Tensor and list of np.ndarray as input formats.

        Args:
            im (torch.Tensor | List[np.ndarray]): BCHW tensor format or list of HWC numpy arrays.

        Returns:
            (torch.Tensor): The preprocessed image tensor.
        """
        if self.im is not None:
            return self.im
        not_tensor = not isinstance(im, torch.Tensor)
        if not_tensor:
            im = np.stack(self.pre_transform(im))
            im = im[..., ::-1].transpose((0, 3, 1, 2))
            im = np.ascontiguousarray(im)
            im = torch.from_numpy(im)

        im = im.to(self.device)
        im = im.half() if self.model.fp16 else im.float()
        if not_tensor:
            im = (im - self.mean) / self.std
        return im

    def pre_transform(self, im):
        """
        Perform initial transformations on the input image for preprocessing.

        The method applies transformations such as resizing to prepare the image for further preprocessing.
        Currently, batched inference is not supported; hence the list length should be 1.

        Args:
            im (List[np.ndarray]): List containing images in HWC numpy array format.

        Returns:
            (List[np.ndarray]): List of transformed images.
        """
        assert len(im) == 1, "SAM model does not currently support batched inference"
        letterbox = LetterBox(self.args.imgsz, auto=False, center=False)
        return [letterbox(image=x) for x in im]

    def inference(self, im, bboxes=None, points=None, labels=None, masks=None, multimask_output=False, *args, **kwargs):
        """
        Perform image segmentation inference based on the given input cues, using the currently loaded image. This
        method leverages SAM's (Segment Anything Model) architecture consisting of image encoder, prompt encoder, and
        mask decoder for real-time and promptable segmentation tasks.

        Args:
            im (torch.Tensor): The preprocessed input image in tensor format, with shape (N, C, H, W).
            bboxes (np.ndarray | List, optional): Bounding boxes with shape (N, 4), in XYXY format.
            points (np.ndarray | List, optional): Points indicating object locations with shape (N, 2), in pixels.
            labels (np.ndarray | List, optional): Labels for point prompts, shape (N, ). 1 = foreground, 0 = background.
            masks (np.ndarray, optional): Low-resolution masks from previous predictions shape (N,H,W). For SAM H=W=256.
            multimask_output (bool, optional): Flag to return multiple masks. Helpful for ambiguous prompts.

        Returns:
            (tuple): Contains the following three elements.
                - np.ndarray: The output masks in shape CxHxW, where C is the number of generated masks.
                - np.ndarray: An array of length C containing quality scores predicted by the model for each mask.
                - np.ndarray: Low-resolution logits of shape CxHxW for subsequent inference, where H=W=256.
        """
        # Override prompts if any stored in self.prompts
        bboxes = self.prompts.pop("bboxes", bboxes)
        points = self.prompts.pop("points", points)
        masks = self.prompts.pop("masks", masks)

        if all(i is None for i in [bboxes, points, masks]):
            return self.generate(im, *args, **kwargs)

        return self.prompt_inference(im, bboxes, points, labels, masks, multimask_output)

    def prompt_inference(self, im, bboxes=None, points=None, labels=None, masks=None, multimask_output=False):
        """
        Internal function for image segmentation inference based on cues like bounding boxes, points, and masks.
        Leverages SAM's specialized architecture for prompt-based, real-time segmentation.

        Args:
            im (torch.Tensor): The preprocessed input image in tensor format, with shape (N, C, H, W).
            bboxes (np.ndarray | List, optional): Bounding boxes with shape (N, 4), in XYXY format.
            points (np.ndarray | List, optional): Points indicating object locations with shape (N, 2), in pixels.
            labels (np.ndarray | List, optional): Labels for point prompts, shape (N, ). 1 = foreground, 0 = background.
            masks (np.ndarray, optional): Low-resolution masks from previous predictions shape (N,H,W). For SAM H=W=256.
            multimask_output (bool, optional): Flag to return multiple masks. Helpful for ambiguous prompts.

        Returns:
            (tuple): Contains the following three elements.
                - np.ndarray: The output masks in shape CxHxW, where C is the number of generated masks.
                - np.ndarray: An array of length C containing quality scores predicted by the model for each mask.
                - np.ndarray: Low-resolution logits of shape CxHxW for subsequent inference, where H=W=256.
        """
        features = self.model.image_encoder(im) if self.features is None else self.features

        src_shape, dst_shape = self.batch[1][0].shape[:2], im.shape[2:]
        r = 1.0 if self.segment_all else min(dst_shape[0] / src_shape[0], dst_shape[1] / src_shape[1])
        # Transform input prompts
        if points is not None:
            points = torch.as_tensor(points, dtype=torch.float32, device=self.device)
            points = points[None] if points.ndim == 1 else points
            # Assuming labels are all positive if users don't pass labels.
            if labels is None:
                labels = np.ones(points.shape[0])
            labels = torch.as_tensor(labels, dtype=torch.int32, device=self.device)
            points *= r
            # (N, 2) --> (N, 1, 2), (N, ) --> (N, 1)
            points, labels = points[:, None, :], labels[:, None]
        if bboxes is not None:
            bboxes = torch.as_tensor(bboxes, dtype=torch.float32, device=self.device)
            bboxes = bboxes[None] if bboxes.ndim == 1 else bboxes
            bboxes *= r
        if masks is not None:
            masks = torch.as_tensor(masks, dtype=torch.float32, device=self.device).unsqueeze(1)

        points = (points, labels) if points is not None else None
        # Embed prompts
        sparse_embeddings, dense_embeddings = self.model.prompt_encoder(points=points, boxes=bboxes, masks=masks)

        # Predict masks
        pred_masks, pred_scores = self.model.mask_decoder(
            image_embeddings=features,
            image_pe=self.model.prompt_encoder.get_dense_pe(),
            sparse_prompt_embeddings=sparse_embeddings,
            dense_prompt_embeddings=dense_embeddings,
            multimask_output=multimask_output,
        )

        # (N, d, H, W) --> (N*d, H, W), (N, d) --> (N*d, )
        # `d` could be 1 or 3 depends on `multimask_output`.
        return pred_masks.flatten(0, 1), pred_scores.flatten(0, 1)

    def generate(
        self,
        im,
        crop_n_layers=0,
        crop_overlap_ratio=512 / 1500,
        crop_downscale_factor=1,
        point_grids=None,
        points_stride=32,
        points_batch_size=64,
        conf_thres=0.88,
        stability_score_thresh=0.95,
        stability_score_offset=0.95,
        crop_nms_thresh=0.7,
    ):
        """
        Perform image segmentation using the Segment Anything Model (SAM).

        This function segments an entire image into constituent parts by leveraging SAM's advanced architecture
        and real-time performance capabilities. It can optionally work on image crops for finer segmentation.

        Args:
            im (torch.Tensor): Input tensor representing the preprocessed image with dimensions (N, C, H, W).
            crop_n_layers (int): Specifies the number of layers for additional mask predictions on image crops.
                                 Each layer produces 2**i_layer number of image crops.
            crop_overlap_ratio (float): Determines the overlap between crops. Scaled down in subsequent layers.
            crop_downscale_factor (int): Scaling factor for the number of sampled points-per-side in each layer.
            point_grids (list[np.ndarray], optional): Custom grids for point sampling normalized to [0,1].
                                                      Used in the nth crop layer.
            points_stride (int, optional): Number of points to sample along each side of the image.
                                           Exclusive with 'point_grids'.
            points_batch_size (int): Batch size for the number of points processed simultaneously.
            conf_thres (float): Confidence threshold [0,1] for filtering based on the model's mask quality prediction.
            stability_score_thresh (float): Stability threshold [0,1] for mask filtering based on mask stability.
            stability_score_offset (float): Offset value for calculating stability score.
            crop_nms_thresh (float): IoU cutoff for NMS to remove duplicate masks between crops.

        Returns:
            (tuple): A tuple containing segmented masks, confidence scores, and bounding boxes.
        """
        import torchvision  # scope for faster 'import ultralytics'

        self.segment_all = True
        ih, iw = im.shape[2:]
        crop_regions, layer_idxs = generate_crop_boxes((ih, iw), crop_n_layers, crop_overlap_ratio)
        if point_grids is None:
            point_grids = build_all_layer_point_grids(points_stride, crop_n_layers, crop_downscale_factor)
        pred_masks, pred_scores, pred_bboxes, region_areas = [], [], [], []
        for crop_region, layer_idx in zip(crop_regions, layer_idxs):
            x1, y1, x2, y2 = crop_region
            w, h = x2 - x1, y2 - y1
            area = torch.tensor(w * h, device=im.device)
            points_scale = np.array([[w, h]])  # w, h
            # Crop image and interpolate to input size
            crop_im = F.interpolate(im[..., y1:y2, x1:x2], (ih, iw), mode="bilinear", align_corners=False)
            # (num_points, 2)
            points_for_image = point_grids[layer_idx] * points_scale
            crop_masks, crop_scores, crop_bboxes = [], [], []
            for (points,) in batch_iterator(points_batch_size, points_for_image):
                pred_mask, pred_score = self.prompt_inference(crop_im, points=points, multimask_output=True)
                # Interpolate predicted masks to input size
                pred_mask = F.interpolate(pred_mask[None], (h, w), mode="bilinear", align_corners=False)[0]
                idx = pred_score > conf_thres
                pred_mask, pred_score = pred_mask[idx], pred_score[idx]

                stability_score = calculate_stability_score(
                    pred_mask, self.model.mask_threshold, stability_score_offset
                )
                idx = stability_score > stability_score_thresh
                pred_mask, pred_score = pred_mask[idx], pred_score[idx]
                # Bool type is much more memory-efficient.
                pred_mask = pred_mask > self.model.mask_threshold
                # (N, 4)
                pred_bbox = batched_mask_to_box(pred_mask).float()
                keep_mask = ~is_box_near_crop_edge(pred_bbox, crop_region, [0, 0, iw, ih])
                if not torch.all(keep_mask):
                    pred_bbox, pred_mask, pred_score = pred_bbox[keep_mask], pred_mask[keep_mask], pred_score[keep_mask]

                crop_masks.append(pred_mask)
                crop_bboxes.append(pred_bbox)
                crop_scores.append(pred_score)

            # Do nms within this crop
            crop_masks = torch.cat(crop_masks)
            crop_bboxes = torch.cat(crop_bboxes)
            crop_scores = torch.cat(crop_scores)
            keep = torchvision.ops.nms(crop_bboxes, crop_scores, self.args.iou)  # NMS
            crop_bboxes = uncrop_boxes_xyxy(crop_bboxes[keep], crop_region)
            crop_masks = uncrop_masks(crop_masks[keep], crop_region, ih, iw)
            crop_scores = crop_scores[keep]

            pred_masks.append(crop_masks)
            pred_bboxes.append(crop_bboxes)
            pred_scores.append(crop_scores)
            region_areas.append(area.expand(len(crop_masks)))

        pred_masks = torch.cat(pred_masks)
        pred_bboxes = torch.cat(pred_bboxes)
        pred_scores = torch.cat(pred_scores)
        region_areas = torch.cat(region_areas)

        # Remove duplicate masks between crops
        if len(crop_regions) > 1:
            scores = 1 / region_areas
            keep = torchvision.ops.nms(pred_bboxes, scores, crop_nms_thresh)
            pred_masks, pred_bboxes, pred_scores = pred_masks[keep], pred_bboxes[keep], pred_scores[keep]

        return pred_masks, pred_scores, pred_bboxes

    def setup_model(self, model, verbose=True):
        """
        Initializes the Segment Anything Model (SAM) for inference.

        This method sets up the SAM model by allocating it to the appropriate device and initializing the necessary
        parameters for image normalization and other Ultralytics compatibility settings.

        Args:
            model (torch.nn.Module): A pre-trained SAM model. If None, a model will be built based on configuration.
            verbose (bool): If True, prints selected device information.

        Attributes:
            model (torch.nn.Module): The SAM model allocated to the chosen device for inference.
            device (torch.device): The device to which the model and tensors are allocated.
            mean (torch.Tensor): The mean values for image normalization.
            std (torch.Tensor): The standard deviation values for image normalization.
        """
        device = select_device(self.args.device, verbose=verbose)
        if model is None:
            model = build_sam(self.args.model)
        model.eval()
        self.model = model.to(device)
        self.device = device
        self.mean = torch.tensor([123.675, 116.28, 103.53]).view(-1, 1, 1).to(device)
        self.std = torch.tensor([58.395, 57.12, 57.375]).view(-1, 1, 1).to(device)

        # Ultralytics compatibility settings
        self.model.pt = False
        self.model.triton = False
        self.model.stride = 32
        self.model.fp16 = False
        self.done_warmup = True

    def postprocess(self, preds, img, orig_imgs):
        """
        Post-processes SAM's inference outputs to generate object detection masks and bounding boxes.

        The method scales masks and boxes to the original image size and applies a threshold to the mask predictions.
        The SAM model uses advanced architecture and promptable segmentation tasks to achieve real-time performance.

        Args:
            preds (tuple): The output from SAM model inference, containing masks, scores, and optional bounding boxes.
            img (torch.Tensor): The processed input image tensor.
            orig_imgs (list | torch.Tensor): The original, unprocessed images.

        Returns:
            (list): List of Results objects containing detection masks, bounding boxes, and other metadata.
        """
        # (N, 1, H, W), (N, 1)
        pred_masks, pred_scores = preds[:2]
        pred_bboxes = preds[2] if self.segment_all else None
        names = dict(enumerate(str(i) for i in range(len(pred_masks))))

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, masks in enumerate([pred_masks]):
            orig_img = orig_imgs[i]
            if pred_bboxes is not None:
                pred_bboxes = ops.scale_boxes(img.shape[2:], pred_bboxes.float(), orig_img.shape, padding=False)
                cls = torch.arange(len(pred_masks), dtype=torch.int32, device=pred_masks.device)
                pred_bboxes = torch.cat([pred_bboxes, pred_scores[:, None], cls[:, None]], dim=-1)

            masks = ops.scale_masks(masks[None].float(), orig_img.shape[:2], padding=False)[0]
            masks = masks > self.model.mask_threshold  # to bool
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=names, masks=masks, boxes=pred_bboxes))
        # Reset segment-all mode.
        self.segment_all = False
        return results

    def setup_source(self, source):
        """
        Sets up the data source for inference.

        This method configures the data source from which images will be fetched for inference. The source could be a
        directory, a video file, or other types of image data sources.

        Args:
            source (str | Path): The path to the image data source for inference.
        """
        if source is not None:
            super().setup_source(source)

    def set_image(self, image):
        """
        Preprocesses and sets a single image for inference.

        This function sets up the model if not already initialized, configures the data source to the specified image,
        and preprocesses the image for feature extraction. Only one image can be set at a time.

        Args:
            image (str | np.ndarray): Image file path as a string, or a np.ndarray image read by cv2.

        Raises:
            AssertionError: If more than one image is set.
        """
        if self.model is None:
            model = build_sam(self.args.model)
            self.setup_model(model)
        self.setup_source(image)
        assert len(self.dataset) == 1, "`set_image` only supports setting one image!"
        for batch in self.dataset:
            im = self.preprocess(batch[1])
            self.features = self.model.image_encoder(im)
            self.im = im
            break

    def set_prompts(self, prompts):
        """Set prompts in advance."""
        self.prompts = prompts

    def reset_image(self):
        """Resets the image and its features to None."""
        self.im = None
        self.features = None

    @staticmethod
    def remove_small_regions(masks, min_area=0, nms_thresh=0.7):
        """
        Perform post-processing on segmentation masks generated by the Segment Anything Model (SAM). Specifically, this
        function removes small disconnected regions and holes from the input masks, and then performs Non-Maximum
        Suppression (NMS) to eliminate any newly created duplicate boxes.

        Args:
            masks (torch.Tensor): A tensor containing the masks to be processed. Shape should be (N, H, W), where N is
                                  the number of masks, H is height, and W is width.
            min_area (int): The minimum area below which disconnected regions and holes will be removed. Defaults to 0.
            nms_thresh (float): The IoU threshold for the NMS algorithm. Defaults to 0.7.

        Returns:
            (tuple([torch.Tensor, List[int]])):
                - new_masks (torch.Tensor): The processed masks with small regions removed. Shape is (N, H, W).
                - keep (List[int]): The indices of the remaining masks post-NMS, which can be used to filter the boxes.
        """
        import torchvision  # scope for faster 'import ultralytics'

        if len(masks) == 0:
            return masks

        # Filter small disconnected regions and holes
        new_masks = []
        scores = []
        for mask in masks:
            mask = mask.cpu().numpy().astype(np.uint8)
            mask, changed = remove_small_regions(mask, min_area, mode="holes")
            unchanged = not changed
            mask, changed = remove_small_regions(mask, min_area, mode="islands")
            unchanged = unchanged and not changed

            new_masks.append(torch.as_tensor(mask).unsqueeze(0))
            # Give score=0 to changed masks and 1 to unchanged masks so NMS prefers masks not needing postprocessing
            scores.append(float(unchanged))

        # Recalculate boxes and remove any new duplicates
        new_masks = torch.cat(new_masks, dim=0)
        boxes = batched_mask_to_box(new_masks)
        keep = torchvision.ops.nms(boxes.float(), torch.as_tensor(scores), nms_thresh)

        return new_masks[keep].to(device=masks.device, dtype=masks.dtype), keep
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.data.augment import LetterBox
from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import ops


class RTDETRPredictor(BasePredictor):
    """
    RT-DETR (Real-Time Detection Transformer) Predictor extending the BasePredictor class for making predictions using
    Baidu's RT-DETR model.

    This class leverages the power of Vision Transformers to provide real-time object detection while maintaining
    high accuracy. It supports key features like efficient hybrid encoding and IoU-aware query selection.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.rtdetr import RTDETRPredictor

        args = dict(model='rtdetr-l.pt', source=ASSETS)
        predictor = RTDETRPredictor(overrides=args)
        predictor.predict_cli()
        ```

    Attributes:
        imgsz (int): Image size for inference (must be square and scale-filled).
        args (dict): Argument overrides for the predictor.
    """

    def postprocess(self, preds, img, orig_imgs):
        """
        Postprocess the raw predictions from the model to generate bounding boxes and confidence scores.

        The method filters detections based on confidence and class if specified in `self.args`.

        Args:
            preds (list): List of [predictions, extra] from the model.
            img (torch.Tensor): Processed input images.
            orig_imgs (list or torch.Tensor): Original, unprocessed images.

        Returns:
            (list[Results]): A list of Results objects containing the post-processed bounding boxes, confidence scores,
                and class labels.
        """
        if not isinstance(preds, (list, tuple)):  # list for PyTorch inference but list[0] Tensor for export inference
            preds = [preds, None]

        nd = preds[0].shape[-1]
        bboxes, scores = preds[0].split((4, nd - 4), dim=-1)

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, bbox in enumerate(bboxes):  # (300, 4)
            bbox = ops.xywh2xyxy(bbox)
            score, cls = scores[i].max(-1, keepdim=True)  # (300, 1)
            idx = score.squeeze(-1) > self.args.conf  # (300, )
            if self.args.classes is not None:
                idx = (cls == torch.tensor(self.args.classes, device=cls.device)).any(1) & idx
            pred = torch.cat([bbox, score, cls], dim=-1)[idx]  # filter
            orig_img = orig_imgs[i]
            oh, ow = orig_img.shape[:2]
            pred[..., [0, 2]] *= ow
            pred[..., [1, 3]] *= oh
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred))
        return results

    def pre_transform(self, im):
        """
        Pre-transforms the input images before feeding them into the model for inference. The input images are
        letterboxed to ensure a square aspect ratio and scale-filled. The size must be square(640) and scaleFilled.

        Args:
            im (list[np.ndarray] |torch.Tensor): Input images of shape (N,3,h,w) for tensor, [(h,w,3) x N] for list.

        Returns:
            (list): List of pre-transformed images ready for model inference.
        """
        letterbox = LetterBox(self.imgsz, auto=False, scaleFill=True)
        return [letterbox(image=x) for x in im]
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import ops


class NASPredictor(BasePredictor):
    """
    Ultralytics YOLO NAS Predictor for object detection.

    This class extends the `BasePredictor` from Ultralytics engine and is responsible for post-processing the
    raw predictions generated by the YOLO NAS models. It applies operations like non-maximum suppression and
    scaling the bounding boxes to fit the original image dimensions.

    Attributes:
        args (Namespace): Namespace containing various configurations for post-processing.

    Example:
        ```python
        from ultralytics import NAS

        model = NAS('yolo_nas_s')
        predictor = model.predictor
        # Assumes that raw_preds, img, orig_imgs are available
        results = predictor.postprocess(raw_preds, img, orig_imgs)
        ```

    Note:
        Typically, this class is not instantiated directly. It is used internally within the `NAS` class.
    """

    def postprocess(self, preds_in, img, orig_imgs):
        """Postprocess predictions and returns a list of Results objects."""

        # Cat boxes and class scores
        boxes = ops.xyxy2xywh(preds_in[0][0])
        preds = torch.cat((boxes, preds_in[0][1]), -1).permute(0, 2, 1)

        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            classes=self.args.classes,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

from ultralytics.engine.results import Results
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, ops


class SegmentationPredictor(DetectionPredictor):
    """
    A class extending the DetectionPredictor class for prediction based on a segmentation model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.segment import SegmentationPredictor

        args = dict(model='yolov8n-seg.pt', source=ASSETS)
        predictor = SegmentationPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes the SegmentationPredictor with the provided configuration, overrides, and callbacks."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "segment"

    def postprocess(self, preds, img, orig_imgs):
        """Applies non-max suppression and processes detections for each image in an input batch."""
        p = ops.non_max_suppression(
            preds[0],
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            nc=len(self.model.names),
            classes=self.args.classes,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        proto = preds[1][-1] if isinstance(preds[1], tuple) else preds[1]  # tuple if PyTorch model or array if exported
        for i, pred in enumerate(p):
            orig_img = orig_imgs[i]
            img_path = self.batch[0][i]
            if not len(pred):  # save empty boxes
                masks = None
            elif self.args.retina_masks:
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
                masks = ops.process_mask_native(proto[i], pred[:, 6:], pred[:, :4], orig_img.shape[:2])  # HWC
            else:
                masks = ops.process_mask(proto[i], pred[:, 6:], pred[:, :4], img.shape[2:], upsample=True)  # HWC
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred[:, :6], masks=masks))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import ops


class DetectionPredictor(BasePredictor):
    """
    A class extending the BasePredictor class for prediction based on a detection model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.detect import DetectionPredictor

        args = dict(model='yolov8n.pt', source=ASSETS)
        predictor = DetectionPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def postprocess(self, preds, img, orig_imgs):
        """Post-processes predictions and returns a list of Results objects."""
        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            classes=self.args.classes,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

import cv2
import torch
from PIL import Image

from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import DEFAULT_CFG, ops


class ClassificationPredictor(BasePredictor):
    """
    A class extending the BasePredictor class for prediction based on a classification model.

    Notes:
        - Torchvision classification models can also be passed to the 'model' argument, i.e. model='resnet18'.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.classify import ClassificationPredictor

        args = dict(model='yolov8n-cls.pt', source=ASSETS)
        predictor = ClassificationPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes ClassificationPredictor setting the task to 'classify'."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "classify"
        self._legacy_transform_name = "ultralytics.yolo.data.augment.ToTensor"

    def preprocess(self, img):
        """Converts input image to model-compatible data type."""
        if not isinstance(img, torch.Tensor):
            is_legacy_transform = any(
                self._legacy_transform_name in str(transform) for transform in self.transforms.transforms
            )
            if is_legacy_transform:  # to handle legacy transforms
                img = torch.stack([self.transforms(im) for im in img], dim=0)
            else:
                img = torch.stack(
                    [self.transforms(Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))) for im in img], dim=0
                )
        img = (img if isinstance(img, torch.Tensor) else torch.from_numpy(img)).to(self.model.device)
        return img.half() if self.model.fp16 else img.float()  # uint8 to fp16/32

    def postprocess(self, preds, img, orig_imgs):
        """Post-processes predictions to return Results objects."""
        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, probs=pred))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

from ultralytics.engine.results import Results
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, LOGGER, ops


class PosePredictor(DetectionPredictor):
    """
    A class extending the DetectionPredictor class for prediction based on a pose model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.pose import PosePredictor

        args = dict(model='yolov8n-pose.pt', source=ASSETS)
        predictor = PosePredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes PosePredictor, sets task to 'pose' and logs a warning for using 'mps' as device."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "pose"
        if isinstance(self.args.device, str) and self.args.device.lower() == "mps":
            LOGGER.warning(
                "WARNING ⚠️ Apple MPS known Pose bug. Recommend 'device=cpu' for Pose models. "
                "See https://github.com/ultralytics/ultralytics/issues/4031."
            )

    def postprocess(self, preds, img, orig_imgs):
        """Return detection results for a given input image or list of images."""
        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            classes=self.args.classes,
            nc=len(self.model.names),
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, pred in enumerate(preds):
            orig_img = orig_imgs[i]
            pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape).round()
            pred_kpts = pred[:, 6:].view(len(pred), *self.model.kpt_shape) if len(pred) else pred[:, 6:]
            pred_kpts = ops.scale_coords(img.shape[2:], pred_kpts, orig_img.shape)
            img_path = self.batch[0][i]
            results.append(
                Results(orig_img, path=img_path, names=self.model.names, boxes=pred[:, :6], keypoints=pred_kpts)
            )
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.engine.results import Results
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, ops


class OBBPredictor(DetectionPredictor):
    """
    A class extending the DetectionPredictor class for prediction based on an Oriented Bounding Box (OBB) model.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.yolo.obb import OBBPredictor

        args = dict(model='yolov8n-obb.pt', source=ASSETS)
        predictor = OBBPredictor(overrides=args)
        predictor.predict_cli()
        ```
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """Initializes OBBPredictor with optional model and data configuration overrides."""
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "obb"

    def postprocess(self, preds, img, orig_imgs):
        """Post-processes predictions and returns a list of Results objects."""
        preds = ops.non_max_suppression(
            preds,
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            nc=len(self.model.names),
            classes=self.args.classes,
            rotated=True,
        )

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for pred, orig_img, img_path in zip(preds, orig_imgs, self.batch[0]):
            rboxes = ops.regularize_rboxes(torch.cat([pred[:, :4], pred[:, -1:]], dim=-1))
            rboxes[:, :4] = ops.scale_boxes(img.shape[2:], rboxes[:, :4], orig_img.shape, xywh=True)
            # xywh, r, conf, cls
            obb = torch.cat([rboxes, pred[:, 4:6]], dim=-1)
            results.append(Results(orig_img, path=img_path, names=self.model.names, obb=obb))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.engine.results import Results
from ultralytics.models.fastsam.utils import bbox_iou
from ultralytics.models.yolo.detect.predict import DetectionPredictor
from ultralytics.utils import DEFAULT_CFG, ops


class FastSAMPredictor(DetectionPredictor):
    """
    FastSAMPredictor is specialized for fast SAM (Segment Anything Model) segmentation prediction tasks in Ultralytics
    YOLO framework.

    This class extends the DetectionPredictor, customizing the prediction pipeline specifically for fast SAM.
    It adjusts post-processing steps to incorporate mask prediction and non-max suppression while optimizing
    for single-class segmentation.

    Attributes:
        cfg (dict): Configuration parameters for prediction.
        overrides (dict, optional): Optional parameter overrides for custom behavior.
        _callbacks (dict, optional): Optional list of callback functions to be invoked during prediction.
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """
        Initializes the FastSAMPredictor class, inheriting from DetectionPredictor and setting the task to 'segment'.

        Args:
            cfg (dict): Configuration parameters for prediction.
            overrides (dict, optional): Optional parameter overrides for custom behavior.
            _callbacks (dict, optional): Optional list of callback functions to be invoked during prediction.
        """
        super().__init__(cfg, overrides, _callbacks)
        self.args.task = "segment"

    def postprocess(self, preds, img, orig_imgs):
        """
        Perform post-processing steps on predictions, including non-max suppression and scaling boxes to original image
        size, and returns the final results.

        Args:
            preds (list): The raw output predictions from the model.
            img (torch.Tensor): The processed image tensor.
            orig_imgs (list | torch.Tensor): The original image or list of images.

        Returns:
            (list): A list of Results objects, each containing processed boxes, masks, and other metadata.
        """
        p = ops.non_max_suppression(
            preds[0],
            self.args.conf,
            self.args.iou,
            agnostic=self.args.agnostic_nms,
            max_det=self.args.max_det,
            nc=1,  # set to 1 class since SAM has no class predictions
            classes=self.args.classes,
        )
        full_box = torch.zeros(p[0].shape[1], device=p[0].device)
        full_box[2], full_box[3], full_box[4], full_box[6:] = img.shape[3], img.shape[2], 1.0, 1.0
        full_box = full_box.view(1, -1)
        critical_iou_index = bbox_iou(full_box[0][:4], p[0][:, :4], iou_thres=0.9, image_shape=img.shape[2:])
        if critical_iou_index.numel() != 0:
            full_box[0][4] = p[0][critical_iou_index][:, 4]
            full_box[0][6:] = p[0][critical_iou_index][:, 6:]
            p[0][critical_iou_index] = full_box

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        proto = preds[1][-1] if len(preds[1]) == 3 else preds[1]  # second output is len 3 if pt, but only 1 if exported
        for i, pred in enumerate(p):
            orig_img = orig_imgs[i]
            img_path = self.batch[0][i]
            if not len(pred):  # save empty boxes
                masks = None
            elif self.args.retina_masks:
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
                masks = ops.process_mask_native(proto[i], pred[:, 6:], pred[:, :4], orig_img.shape[:2])  # HWC
            else:
                masks = ops.process_mask(proto[i], pred[:, 6:], pred[:, :4], img.shape[2:], upsample=True)  # HWC
                pred[:, :4] = ops.scale_boxes(img.shape[2:], pred[:, :4], orig_img.shape)
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred[:, :6], masks=masks))
        return results
# Ultralytics YOLO 🚀, AGPL-3.0 license
"""
Generate predictions using the Segment Anything Model (SAM).

SAM is an advanced image segmentation model offering features like promptable segmentation and zero-shot performance.
This module contains the implementation of the prediction logic and auxiliary utilities required to perform segmentation
using SAM. It forms an integral part of the Ultralytics framework and is designed for high-performance, real-time image
segmentation tasks.
"""

import numpy as np
import torch
import torch.nn.functional as F

from ultralytics.data.augment import LetterBox
from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import DEFAULT_CFG, ops
from ultralytics.utils.torch_utils import select_device

from .amg import (
    batch_iterator,
    batched_mask_to_box,
    build_all_layer_point_grids,
    calculate_stability_score,
    generate_crop_boxes,
    is_box_near_crop_edge,
    remove_small_regions,
    uncrop_boxes_xyxy,
    uncrop_masks,
)
from .build import build_sam


class Predictor(BasePredictor):
    """
    Predictor class for the Segment Anything Model (SAM), extending BasePredictor.

    The class provides an interface for model inference tailored to image segmentation tasks.
    With advanced architecture and promptable segmentation capabilities, it facilitates flexible and real-time
    mask generation. The class is capable of working with various types of prompts such as bounding boxes,
    points, and low-resolution masks.

    Attributes:
        cfg (dict): Configuration dictionary specifying model and task-related parameters.
        overrides (dict): Dictionary containing values that override the default configuration.
        _callbacks (dict): Dictionary of user-defined callback functions to augment behavior.
        args (namespace): Namespace to hold command-line arguments or other operational variables.
        im (torch.Tensor): Preprocessed input image tensor.
        features (torch.Tensor): Extracted image features used for inference.
        prompts (dict): Collection of various prompt types, such as bounding boxes and points.
        segment_all (bool): Flag to control whether to segment all objects in the image or only specified ones.
    """

    def __init__(self, cfg=DEFAULT_CFG, overrides=None, _callbacks=None):
        """
        Initialize the Predictor with configuration, overrides, and callbacks.

        The method sets up the Predictor object and applies any configuration overrides or callbacks provided. It
        initializes task-specific settings for SAM, such as retina_masks being set to True for optimal results.

        Args:
            cfg (dict): Configuration dictionary.
            overrides (dict, optional): Dictionary of values to override default configuration.
            _callbacks (dict, optional): Dictionary of callback functions to customize behavior.
        """
        if overrides is None:
            overrides = {}
        overrides.update(dict(task="segment", mode="predict", imgsz=1024))
        super().__init__(cfg, overrides, _callbacks)
        self.args.retina_masks = True
        self.im = None
        self.features = None
        self.prompts = {}
        self.segment_all = False

    def preprocess(self, im):
        """
        Preprocess the input image for model inference.

        The method prepares the input image by applying transformations and normalization.
        It supports both torch.Tensor and list of np.ndarray as input formats.

        Args:
            im (torch.Tensor | List[np.ndarray]): BCHW tensor format or list of HWC numpy arrays.

        Returns:
            (torch.Tensor): The preprocessed image tensor.
        """
        if self.im is not None:
            return self.im
        not_tensor = not isinstance(im, torch.Tensor)
        if not_tensor:
            im = np.stack(self.pre_transform(im))
            im = im[..., ::-1].transpose((0, 3, 1, 2))
            im = np.ascontiguousarray(im)
            im = torch.from_numpy(im)

        im = im.to(self.device)
        im = im.half() if self.model.fp16 else im.float()
        if not_tensor:
            im = (im - self.mean) / self.std
        return im

    def pre_transform(self, im):
        """
        Perform initial transformations on the input image for preprocessing.

        The method applies transformations such as resizing to prepare the image for further preprocessing.
        Currently, batched inference is not supported; hence the list length should be 1.

        Args:
            im (List[np.ndarray]): List containing images in HWC numpy array format.

        Returns:
            (List[np.ndarray]): List of transformed images.
        """
        assert len(im) == 1, "SAM model does not currently support batched inference"
        letterbox = LetterBox(self.args.imgsz, auto=False, center=False)
        return [letterbox(image=x) for x in im]

    def inference(self, im, bboxes=None, points=None, labels=None, masks=None, multimask_output=False, *args, **kwargs):
        """
        Perform image segmentation inference based on the given input cues, using the currently loaded image. This
        method leverages SAM's (Segment Anything Model) architecture consisting of image encoder, prompt encoder, and
        mask decoder for real-time and promptable segmentation tasks.

        Args:
            im (torch.Tensor): The preprocessed input image in tensor format, with shape (N, C, H, W).
            bboxes (np.ndarray | List, optional): Bounding boxes with shape (N, 4), in XYXY format.
            points (np.ndarray | List, optional): Points indicating object locations with shape (N, 2), in pixels.
            labels (np.ndarray | List, optional): Labels for point prompts, shape (N, ). 1 = foreground, 0 = background.
            masks (np.ndarray, optional): Low-resolution masks from previous predictions shape (N,H,W). For SAM H=W=256.
            multimask_output (bool, optional): Flag to return multiple masks. Helpful for ambiguous prompts.

        Returns:
            (tuple): Contains the following three elements.
                - np.ndarray: The output masks in shape CxHxW, where C is the number of generated masks.
                - np.ndarray: An array of length C containing quality scores predicted by the model for each mask.
                - np.ndarray: Low-resolution logits of shape CxHxW for subsequent inference, where H=W=256.
        """
        # Override prompts if any stored in self.prompts
        bboxes = self.prompts.pop("bboxes", bboxes)
        points = self.prompts.pop("points", points)
        masks = self.prompts.pop("masks", masks)

        if all(i is None for i in [bboxes, points, masks]):
            return self.generate(im, *args, **kwargs)

        return self.prompt_inference(im, bboxes, points, labels, masks, multimask_output)

    def prompt_inference(self, im, bboxes=None, points=None, labels=None, masks=None, multimask_output=False):
        """
        Internal function for image segmentation inference based on cues like bounding boxes, points, and masks.
        Leverages SAM's specialized architecture for prompt-based, real-time segmentation.

        Args:
            im (torch.Tensor): The preprocessed input image in tensor format, with shape (N, C, H, W).
            bboxes (np.ndarray | List, optional): Bounding boxes with shape (N, 4), in XYXY format.
            points (np.ndarray | List, optional): Points indicating object locations with shape (N, 2), in pixels.
            labels (np.ndarray | List, optional): Labels for point prompts, shape (N, ). 1 = foreground, 0 = background.
            masks (np.ndarray, optional): Low-resolution masks from previous predictions shape (N,H,W). For SAM H=W=256.
            multimask_output (bool, optional): Flag to return multiple masks. Helpful for ambiguous prompts.

        Returns:
            (tuple): Contains the following three elements.
                - np.ndarray: The output masks in shape CxHxW, where C is the number of generated masks.
                - np.ndarray: An array of length C containing quality scores predicted by the model for each mask.
                - np.ndarray: Low-resolution logits of shape CxHxW for subsequent inference, where H=W=256.
        """
        features = self.model.image_encoder(im) if self.features is None else self.features

        src_shape, dst_shape = self.batch[1][0].shape[:2], im.shape[2:]
        r = 1.0 if self.segment_all else min(dst_shape[0] / src_shape[0], dst_shape[1] / src_shape[1])
        # Transform input prompts
        if points is not None:
            points = torch.as_tensor(points, dtype=torch.float32, device=self.device)
            points = points[None] if points.ndim == 1 else points
            # Assuming labels are all positive if users don't pass labels.
            if labels is None:
                labels = np.ones(points.shape[0])
            labels = torch.as_tensor(labels, dtype=torch.int32, device=self.device)
            points *= r
            # (N, 2) --> (N, 1, 2), (N, ) --> (N, 1)
            points, labels = points[:, None, :], labels[:, None]
        if bboxes is not None:
            bboxes = torch.as_tensor(bboxes, dtype=torch.float32, device=self.device)
            bboxes = bboxes[None] if bboxes.ndim == 1 else bboxes
            bboxes *= r
        if masks is not None:
            masks = torch.as_tensor(masks, dtype=torch.float32, device=self.device).unsqueeze(1)

        points = (points, labels) if points is not None else None
        # Embed prompts
        sparse_embeddings, dense_embeddings = self.model.prompt_encoder(points=points, boxes=bboxes, masks=masks)

        # Predict masks
        pred_masks, pred_scores = self.model.mask_decoder(
            image_embeddings=features,
            image_pe=self.model.prompt_encoder.get_dense_pe(),
            sparse_prompt_embeddings=sparse_embeddings,
            dense_prompt_embeddings=dense_embeddings,
            multimask_output=multimask_output,
        )

        # (N, d, H, W) --> (N*d, H, W), (N, d) --> (N*d, )
        # `d` could be 1 or 3 depends on `multimask_output`.
        return pred_masks.flatten(0, 1), pred_scores.flatten(0, 1)

    def generate(
        self,
        im,
        crop_n_layers=0,
        crop_overlap_ratio=512 / 1500,
        crop_downscale_factor=1,
        point_grids=None,
        points_stride=32,
        points_batch_size=64,
        conf_thres=0.88,
        stability_score_thresh=0.95,
        stability_score_offset=0.95,
        crop_nms_thresh=0.7,
    ):
        """
        Perform image segmentation using the Segment Anything Model (SAM).

        This function segments an entire image into constituent parts by leveraging SAM's advanced architecture
        and real-time performance capabilities. It can optionally work on image crops for finer segmentation.

        Args:
            im (torch.Tensor): Input tensor representing the preprocessed image with dimensions (N, C, H, W).
            crop_n_layers (int): Specifies the number of layers for additional mask predictions on image crops.
                                 Each layer produces 2**i_layer number of image crops.
            crop_overlap_ratio (float): Determines the overlap between crops. Scaled down in subsequent layers.
            crop_downscale_factor (int): Scaling factor for the number of sampled points-per-side in each layer.
            point_grids (list[np.ndarray], optional): Custom grids for point sampling normalized to [0,1].
                                                      Used in the nth crop layer.
            points_stride (int, optional): Number of points to sample along each side of the image.
                                           Exclusive with 'point_grids'.
            points_batch_size (int): Batch size for the number of points processed simultaneously.
            conf_thres (float): Confidence threshold [0,1] for filtering based on the model's mask quality prediction.
            stability_score_thresh (float): Stability threshold [0,1] for mask filtering based on mask stability.
            stability_score_offset (float): Offset value for calculating stability score.
            crop_nms_thresh (float): IoU cutoff for NMS to remove duplicate masks between crops.

        Returns:
            (tuple): A tuple containing segmented masks, confidence scores, and bounding boxes.
        """
        import torchvision  # scope for faster 'import ultralytics'

        self.segment_all = True
        ih, iw = im.shape[2:]
        crop_regions, layer_idxs = generate_crop_boxes((ih, iw), crop_n_layers, crop_overlap_ratio)
        if point_grids is None:
            point_grids = build_all_layer_point_grids(points_stride, crop_n_layers, crop_downscale_factor)
        pred_masks, pred_scores, pred_bboxes, region_areas = [], [], [], []
        for crop_region, layer_idx in zip(crop_regions, layer_idxs):
            x1, y1, x2, y2 = crop_region
            w, h = x2 - x1, y2 - y1
            area = torch.tensor(w * h, device=im.device)
            points_scale = np.array([[w, h]])  # w, h
            # Crop image and interpolate to input size
            crop_im = F.interpolate(im[..., y1:y2, x1:x2], (ih, iw), mode="bilinear", align_corners=False)
            # (num_points, 2)
            points_for_image = point_grids[layer_idx] * points_scale
            crop_masks, crop_scores, crop_bboxes = [], [], []
            for (points,) in batch_iterator(points_batch_size, points_for_image):
                pred_mask, pred_score = self.prompt_inference(crop_im, points=points, multimask_output=True)
                # Interpolate predicted masks to input size
                pred_mask = F.interpolate(pred_mask[None], (h, w), mode="bilinear", align_corners=False)[0]
                idx = pred_score > conf_thres
                pred_mask, pred_score = pred_mask[idx], pred_score[idx]

                stability_score = calculate_stability_score(
                    pred_mask, self.model.mask_threshold, stability_score_offset
                )
                idx = stability_score > stability_score_thresh
                pred_mask, pred_score = pred_mask[idx], pred_score[idx]
                # Bool type is much more memory-efficient.
                pred_mask = pred_mask > self.model.mask_threshold
                # (N, 4)
                pred_bbox = batched_mask_to_box(pred_mask).float()
                keep_mask = ~is_box_near_crop_edge(pred_bbox, crop_region, [0, 0, iw, ih])
                if not torch.all(keep_mask):
                    pred_bbox, pred_mask, pred_score = pred_bbox[keep_mask], pred_mask[keep_mask], pred_score[keep_mask]

                crop_masks.append(pred_mask)
                crop_bboxes.append(pred_bbox)
                crop_scores.append(pred_score)

            # Do nms within this crop
            crop_masks = torch.cat(crop_masks)
            crop_bboxes = torch.cat(crop_bboxes)
            crop_scores = torch.cat(crop_scores)
            keep = torchvision.ops.nms(crop_bboxes, crop_scores, self.args.iou)  # NMS
            crop_bboxes = uncrop_boxes_xyxy(crop_bboxes[keep], crop_region)
            crop_masks = uncrop_masks(crop_masks[keep], crop_region, ih, iw)
            crop_scores = crop_scores[keep]

            pred_masks.append(crop_masks)
            pred_bboxes.append(crop_bboxes)
            pred_scores.append(crop_scores)
            region_areas.append(area.expand(len(crop_masks)))

        pred_masks = torch.cat(pred_masks)
        pred_bboxes = torch.cat(pred_bboxes)
        pred_scores = torch.cat(pred_scores)
        region_areas = torch.cat(region_areas)

        # Remove duplicate masks between crops
        if len(crop_regions) > 1:
            scores = 1 / region_areas
            keep = torchvision.ops.nms(pred_bboxes, scores, crop_nms_thresh)
            pred_masks, pred_bboxes, pred_scores = pred_masks[keep], pred_bboxes[keep], pred_scores[keep]

        return pred_masks, pred_scores, pred_bboxes

    def setup_model(self, model, verbose=True):
        """
        Initializes the Segment Anything Model (SAM) for inference.

        This method sets up the SAM model by allocating it to the appropriate device and initializing the necessary
        parameters for image normalization and other Ultralytics compatibility settings.

        Args:
            model (torch.nn.Module): A pre-trained SAM model. If None, a model will be built based on configuration.
            verbose (bool): If True, prints selected device information.

        Attributes:
            model (torch.nn.Module): The SAM model allocated to the chosen device for inference.
            device (torch.device): The device to which the model and tensors are allocated.
            mean (torch.Tensor): The mean values for image normalization.
            std (torch.Tensor): The standard deviation values for image normalization.
        """
        device = select_device(self.args.device, verbose=verbose)
        if model is None:
            model = build_sam(self.args.model)
        model.eval()
        self.model = model.to(device)
        self.device = device
        self.mean = torch.tensor([123.675, 116.28, 103.53]).view(-1, 1, 1).to(device)
        self.std = torch.tensor([58.395, 57.12, 57.375]).view(-1, 1, 1).to(device)

        # Ultralytics compatibility settings
        self.model.pt = False
        self.model.triton = False
        self.model.stride = 32
        self.model.fp16 = False
        self.done_warmup = True

    def postprocess(self, preds, img, orig_imgs):
        """
        Post-processes SAM's inference outputs to generate object detection masks and bounding boxes.

        The method scales masks and boxes to the original image size and applies a threshold to the mask predictions.
        The SAM model uses advanced architecture and promptable segmentation tasks to achieve real-time performance.

        Args:
            preds (tuple): The output from SAM model inference, containing masks, scores, and optional bounding boxes.
            img (torch.Tensor): The processed input image tensor.
            orig_imgs (list | torch.Tensor): The original, unprocessed images.

        Returns:
            (list): List of Results objects containing detection masks, bounding boxes, and other metadata.
        """
        # (N, 1, H, W), (N, 1)
        pred_masks, pred_scores = preds[:2]
        pred_bboxes = preds[2] if self.segment_all else None
        names = dict(enumerate(str(i) for i in range(len(pred_masks))))

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, masks in enumerate([pred_masks]):
            orig_img = orig_imgs[i]
            if pred_bboxes is not None:
                pred_bboxes = ops.scale_boxes(img.shape[2:], pred_bboxes.float(), orig_img.shape, padding=False)
                cls = torch.arange(len(pred_masks), dtype=torch.int32, device=pred_masks.device)
                pred_bboxes = torch.cat([pred_bboxes, pred_scores[:, None], cls[:, None]], dim=-1)

            masks = ops.scale_masks(masks[None].float(), orig_img.shape[:2], padding=False)[0]
            masks = masks > self.model.mask_threshold  # to bool
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=names, masks=masks, boxes=pred_bboxes))
        # Reset segment-all mode.
        self.segment_all = False
        return results

    def setup_source(self, source):
        """
        Sets up the data source for inference.

        This method configures the data source from which images will be fetched for inference. The source could be a
        directory, a video file, or other types of image data sources.

        Args:
            source (str | Path): The path to the image data source for inference.
        """
        if source is not None:
            super().setup_source(source)

    def set_image(self, image):
        """
        Preprocesses and sets a single image for inference.

        This function sets up the model if not already initialized, configures the data source to the specified image,
        and preprocesses the image for feature extraction. Only one image can be set at a time.

        Args:
            image (str | np.ndarray): Image file path as a string, or a np.ndarray image read by cv2.

        Raises:
            AssertionError: If more than one image is set.
        """
        if self.model is None:
            model = build_sam(self.args.model)
            self.setup_model(model)
        self.setup_source(image)
        assert len(self.dataset) == 1, "`set_image` only supports setting one image!"
        for batch in self.dataset:
            im = self.preprocess(batch[1])
            self.features = self.model.image_encoder(im)
            self.im = im
            break

    def set_prompts(self, prompts):
        """Set prompts in advance."""
        self.prompts = prompts

    def reset_image(self):
        """Resets the image and its features to None."""
        self.im = None
        self.features = None

    @staticmethod
    def remove_small_regions(masks, min_area=0, nms_thresh=0.7):
        """
        Perform post-processing on segmentation masks generated by the Segment Anything Model (SAM). Specifically, this
        function removes small disconnected regions and holes from the input masks, and then performs Non-Maximum
        Suppression (NMS) to eliminate any newly created duplicate boxes.

        Args:
            masks (torch.Tensor): A tensor containing the masks to be processed. Shape should be (N, H, W), where N is
                                  the number of masks, H is height, and W is width.
            min_area (int): The minimum area below which disconnected regions and holes will be removed. Defaults to 0.
            nms_thresh (float): The IoU threshold for the NMS algorithm. Defaults to 0.7.

        Returns:
            (tuple([torch.Tensor, List[int]])):
                - new_masks (torch.Tensor): The processed masks with small regions removed. Shape is (N, H, W).
                - keep (List[int]): The indices of the remaining masks post-NMS, which can be used to filter the boxes.
        """
        import torchvision  # scope for faster 'import ultralytics'

        if len(masks) == 0:
            return masks

        # Filter small disconnected regions and holes
        new_masks = []
        scores = []
        for mask in masks:
            mask = mask.cpu().numpy().astype(np.uint8)
            mask, changed = remove_small_regions(mask, min_area, mode="holes")
            unchanged = not changed
            mask, changed = remove_small_regions(mask, min_area, mode="islands")
            unchanged = unchanged and not changed

            new_masks.append(torch.as_tensor(mask).unsqueeze(0))
            # Give score=0 to changed masks and 1 to unchanged masks so NMS prefers masks not needing postprocessing
            scores.append(float(unchanged))

        # Recalculate boxes and remove any new duplicates
        new_masks = torch.cat(new_masks, dim=0)
        boxes = batched_mask_to_box(new_masks)
        keep = torchvision.ops.nms(boxes.float(), torch.as_tensor(scores), nms_thresh)

        return new_masks[keep].to(device=masks.device, dtype=masks.dtype), keep
# Ultralytics YOLO 🚀, AGPL-3.0 license

import torch

from ultralytics.data.augment import LetterBox
from ultralytics.engine.predictor import BasePredictor
from ultralytics.engine.results import Results
from ultralytics.utils import ops


class RTDETRPredictor(BasePredictor):
    """
    RT-DETR (Real-Time Detection Transformer) Predictor extending the BasePredictor class for making predictions using
    Baidu's RT-DETR model.

    This class leverages the power of Vision Transformers to provide real-time object detection while maintaining
    high accuracy. It supports key features like efficient hybrid encoding and IoU-aware query selection.

    Example:
        ```python
        from ultralytics.utils import ASSETS
        from ultralytics.models.rtdetr import RTDETRPredictor

        args = dict(model='rtdetr-l.pt', source=ASSETS)
        predictor = RTDETRPredictor(overrides=args)
        predictor.predict_cli()
        ```

    Attributes:
        imgsz (int): Image size for inference (must be square and scale-filled).
        args (dict): Argument overrides for the predictor.
    """

    def postprocess(self, preds, img, orig_imgs):
        """
        Postprocess the raw predictions from the model to generate bounding boxes and confidence scores.

        The method filters detections based on confidence and class if specified in `self.args`.

        Args:
            preds (list): List of [predictions, extra] from the model.
            img (torch.Tensor): Processed input images.
            orig_imgs (list or torch.Tensor): Original, unprocessed images.

        Returns:
            (list[Results]): A list of Results objects containing the post-processed bounding boxes, confidence scores,
                and class labels.
        """
        if not isinstance(preds, (list, tuple)):  # list for PyTorch inference but list[0] Tensor for export inference
            preds = [preds, None]

        nd = preds[0].shape[-1]
        bboxes, scores = preds[0].split((4, nd - 4), dim=-1)

        if not isinstance(orig_imgs, list):  # input images are a torch.Tensor, not a list
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)

        results = []
        for i, bbox in enumerate(bboxes):  # (300, 4)
            bbox = ops.xywh2xyxy(bbox)
            score, cls = scores[i].max(-1, keepdim=True)  # (300, 1)
            idx = score.squeeze(-1) > self.args.conf  # (300, )
            if self.args.classes is not None:
                idx = (cls == torch.tensor(self.args.classes, device=cls.device)).any(1) & idx
            pred = torch.cat([bbox, score, cls], dim=-1)[idx]  # filter
            orig_img = orig_imgs[i]
            oh, ow = orig_img.shape[:2]
            pred[..., [0, 2]] *= ow
            pred[..., [1, 3]] *= oh
            img_path = self.batch[0][i]
            results.append(Results(orig_img, path=img_path, names=self.model.names, boxes=pred))
        return results

    def pre_transform(self, im):
        """
        Pre-transforms the input images before feeding them into the model for inference. The input images are
        letterboxed to ensure a square aspect ratio and scale-filled. The size must be square(640) and scaleFilled.

        Args:
            im (list[np.ndarray] |torch.Tensor): Input images of shape (N,3,h,w) for tensor, [(h,w,3) x N] for list.

        Returns:
            (list): List of pre-transformed images ready for model inference.
        """
        letterbox = LetterBox(self.imgsz, auto=False, scaleFill=True)
        return [letterbox(image=x) for x in im]
import os
import time
import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration
from flask import Flask, request, jsonify
from diffusers import (
    DiffusionPipeline,
    AutoencoderTiny,
    DDIMScheduler,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    StableDiffusionXLPipeline,
    TCDScheduler,
    DPMSolverSDEScheduler
)
from safetensors.torch import load_file

from huggingface_hub import hf_hub_download
import sys
from typing import Literal, Dict, Optional
# from hidiffusion import apply_hidiffusion, remove_hidiffusion

# from sfast.compilers.diffusion_pipeline_compiler import (compile,
#                                                          CompilationConfig)
sys.path.append(os.path.join(os.path.dirname(__file__), "StreamDiffusion"))



from collections import defaultdict
from performance_metrics import add_timestamp, get_average_generation_duration, calculate_throughput, get_timestamps
import uuid
import threading
from transformers import T5EncoderModel
import re
from safety_checker.censor import check_safety

import torch.nn as nn
from os.path import expanduser  # pylint: disable=import-outside-toplevel
from urllib.request import urlretrieve  # pylint: disable=import-outside-toplevel

tinyAutoencoder = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16)

tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-small")
pimper_model = T5ForConditionalGeneration.from_pretrained("roborovski/superprompt-v1", device_map="auto")

# Flask App Initialization
app = Flask(__name__)

# create lock
lock = threading.Lock()

def get_boltning_pipe() -> DiffusionPipeline:
    pipe = DiffusionPipeline.from_pretrained(
        "./boltning_diffusers", 
        torch_dtype=torch.float16, 
        variant="fp16"
    ).to("cuda")
    pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl").to(
        device=pipe.device, dtype=pipe.dtype
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")

    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)
    return pipe

def get_lightning_pipe(steps:int = 4) -> DiffusionPipeline:
    base_model_id = "./zavychromaxl7"
    # base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"

    # repo_name = "ByteDance/Hyper-SD"
    # ckpt_name = f"Hyper-SDXL-{steps}steps-lora.safetensors"
    
    ckpt_name = f"sdxl_lightning_{steps}step_lora.safetensors" # Use the correct ckpt for your step setting!
    repo_name = "ByteDance/SDXL-Lightning"
    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to("cuda")
    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()
    # pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # try DPMSolverSDEScheduler
    pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
    # pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

    # # Load resadapter for baseline
    # resadapter_model_name = "resadapter_v2_sdxl"
    # pipe.load_lora_weights(
    #     hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="pytorch_lora_weights.safetensors"), 
    #     adapter_name="res_adapter",
    #     ) # load lora weights
    # pipe.set_adapters(["res_adapter"], adapter_weights=[1.0])
    # pipe.unet.load_state_dict(
    #     load_file(hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="diffusion_pytorch_model.safetensors")),
    #     strict=False,
    #     ) # load norm weights

    return pipe

def get_hyper_pipe(steps:int = 4) -> DiffusionPipeline:
    # base_model_id = "./zavychromaxl7"
    base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"

    repo_name = "ByteDance/Hyper-SD"
    ckpt_name = f"Hyper-SDXL-{steps}steps-lora.safetensors"
    
    # ckpt_name = f"sdxl_lightning_{steps}step_lora.safetensors" # Use the correct ckpt for your step setting!
    # repo_name = "ByteDance/SDXL-Lightning"
    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to("cuda")
    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()
    # pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # try DPMSolverSDEScheduler
    # pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
    pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

    # # Load resadapter for baseline
    # resadapter_model_name = "resadapter_v2_sdxl"
    # pipe.load_lora_weights(
    #     hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="pytorch_lora_weights.safetensors"), 
    #     adapter_name="res_adapter",
    #     ) # load lora weights
    # pipe.set_adapters(["res_adapter"], adapter_weights=[1.0])
    # pipe.unet.load_state_dict(
    #     load_file(hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="diffusion_pytorch_model.safetensors")),
    #     strict=False,
    #     ) # load norm weights

    return pipe


def get_tcd_pipe(steps: int = 4) -> DiffusionPipeline:
    device = "cuda"
    base_model_id = "./zavychromaxl7"
    tcd_lora_id = "h1t/TCD-SDXL-LoRA"
    
    pipe = StableDiffusionXLPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to(device)
    pipe.scheduler = TCDScheduler.from_config(pipe.scheduler.config)
    
    pipe.load_lora_weights(tcd_lora_id)
    pipe.fuse_lora()
    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)
    
    return pipe

# override_steps = 2

# Initialize the default pipe
# pipe_hyper = get_hyper_pipe(2)

# pipe_lightning = get_lightning_pipe(4)

# apply_hidiffusion(pipe)
pipe_boltning = get_lightning_pipe(4)

# apply_deepcache(pipe)


class Predictor:
    def __init__(self):
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)

    def predict_batch(self, batch_data):
        results = []
        print("batch_data:", batch_data)
        # Process each batch
        data = batch_data

        model = data["model"]
        width = data["width"]
        height = data["height"]
        if width < 32:
            width = 32
        if height < 32:
            height = 32
        steps = data["steps"]
        prompts = data["prompts"]
        refine = data["refine"]
        negative_prompt = data["negative_prompt"]

        # if negative_prompt is not set then set it to "worst quality, low quality, blurry"
        if not negative_prompt:
            negative_prompt = "worst quality, low quality, blurry"

        print(f"Running batch with model: {model}, width: {width}, height: {height}, number of prompts: {len(prompts)}, steps: {steps}")

        max_batch_size = 16

        model = "turbo"

        print("params:", model, width, height, steps, prompts, refine, negative_prompt)
        predict_duration = 0
        for i in range(0, len(prompts), max_batch_size):
            chunked_prompts = prompts[i:i + max_batch_size]
            original_prompt = chunked_prompts[0]
            chunked_prompts[0] = original_prompt
            print("running on prompts", chunked_prompts, "original", original_prompt)
            with lock:
                predict_start_time = time.time()
                try:
                    #batch_results = []
                    # for prompt in chunked_prompts:
                    # steps = override_steps
                    if steps < 4:
                        steps = 2
                    else:
                        steps = 4
                    pipe = pipe_boltning # ipe_hyper if steps == 2 else pipe_lightning
                    batch_results = pipe(chunked_prompts, num_inference_steps=4, guidance_scale=1.0, width=width, height=height).images
                    # batch_results.append(image)

                except Exception as e:
                    print("Exception occurred:", e)
                    import traceback
                    traceback.print_exc()
                    os._exit(1)

                concepts, has_nsfw_concepts = check_safety(batch_results, 0.0)
                predict_end_time = time.time()

                predict_duration += predict_end_time - predict_start_time

            for i, (result_image, prompt) in enumerate(zip(batch_results, chunked_prompts)):
                output_path = self._save_result(result_image)
                results.append({
                    "output_path": output_path,
                    "model": model,
                    "width": width,
                    "height": height,
                    "steps": steps,
                    "prompt": prompt,
                    "has_nsfw_concept": has_nsfw_concepts[i],
                    "concept": concepts[i]
                })
                print(f"Saved result for model: {model}, output path: {output_path}")

        return results, predict_duration

    def _validate_params(self, data):
        default_params = {"width": 1024, "height": 1024, "steps": 4, "seed": None, "model": "turbo", "refine": False, "negative_prompt": "ugly, chaotic"}
        params = default_params.copy()

        for param in ['width', 'height', 'steps', 'seed']:
            try:
                if param in data:
                    params[param] = int(data[param])
            except:
                print(f"Warning: Failed to convert '{param}'. Using default value.")

        params["width"] -= params["width"] % 8
        params["height"] -= params["height"] % 8

        params["model"] = data.get("model", default_params["model"])
        print(f"Validated parameters: width: {params['width']}, height: {params['height']}, steps: {params['steps']}, seed: {params['seed']}, model: {params['model']}")
        return params

    def _log_performance_metrics(self, start_time, end_time):
        add_timestamp(start_time, end_time)
        average_duration = get_average_generation_duration()
        generation_speed = calculate_throughput(start_time, end_time)

        print(f"Average Generation Duration: {average_duration} seconds per image")
        print(f"Current Throughput: {generation_speed} images per second")
        print(f"Images Generated in Last 60 Seconds: {len(get_timestamps())}")

    def _save_result(self, result):
        print("Saving result image...")

        unique_id = uuid.uuid4()
        output_dir = "/tmp/imagecache"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"out-{unique_id}.jpg")
        result.save(output_path)
        print("Result image saved at:", output_path)
        return output_path

predictor = Predictor()

import time
total_start_time = time.time()
accumulated_predict_duration = 0

@app.route('/predict', methods=['POST'])
def predict_endpoint():
    global accumulated_predict_duration

    data = request.json
    validated_params = predictor._validate_params(data)
    data.update(validated_params)

    response, predict_duration = predictor.predict_batch(data)

    accumulated_predict_duration += predict_duration

    total_time = time.time() - total_start_time

    predict_percentage = (accumulated_predict_duration / total_time) * 100
    print(f"Predict time percentage: {predict_percentage}%")

    print("Returning response for one request.")
    return jsonify(response)

import clip
device = "cuda" if torch.cuda.is_available() else "cpu"
clip_model, _ = clip.load("ViT-L/14", device=device)

@app.route('/embeddings', methods=['POST'])
def embeddings_endpoint():
    data = request.json

    prompts = data["prompts"]

    embeddings = []
    start_time = time.time()

    aesthetics_scores = []
    token = clip.tokenize(prompts, truncate=True).to(device)
    with torch.no_grad():
        embeddings = clip_model.encode_text(token)
        aesthetics_scores = aesthetic_model(embeddings)
        aesthetics_scores = aesthetics_scores.squeeze(-1)
        print("aesthetics_score:", aesthetics_scores)
    end_time = time.time()
    print(f"Time to calculate embeddings: {(end_time - start_time) * 1000} milliseconds")
    print("Returning embeddings for one request.", len(embeddings))

    return jsonify({
        "embeddings": embeddings.cpu().numpy().tolist(),
        "aesthetics_scores": aesthetics_scores.cpu().numpy().tolist()
    })

def prompt_pimping(input_text):
    output = pimper_model.generate(tokenizer(input_text, return_tensors="pt").input_ids.to("cuda"), max_length=30)
    result_text = tokenizer.decode(output[0])
    return result_text

import os
if __name__ == "__main__":
    print("Starting Flask app...")
    # app.run(debug=False, host="0.0.0.0", port=os.environ.get("PORT", 5555))

    import time

    # Run predict a few times with different prompts and measure the times
    test_prompts = ["Authentic shaman making sushi. risohraph", "A futuristic cityscape", "A serene beach at dawn"]
    for prompt in test_prompts:
        print(f"Running predict for prompt: {prompt}")
        start_time = time.time()
        data = {
            "model": "turbo",
            "width": 768,
            "height": 768,
            "steps": 4,
            "prompts": [prompt]*1,
            "refine": False,
            "negative_prompt": "ugly, chaotic"
        }
        response, predict_duration = predictor.predict_batch(data)
        end_time = time.time()
        print(f"Response: {response}")
        print(f"Time taken for prompt '{prompt}': {(end_time - start_time) * 1000} milliseconds")
import os
import time
import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration
from flask import Flask, request, jsonify
from diffusers import (
    DiffusionPipeline,
    AutoencoderTiny,
    DDIMScheduler,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    StableDiffusionXLPipeline,
    TCDScheduler,
    DPMSolverSDEScheduler
)
from safetensors.torch import load_file

from huggingface_hub import hf_hub_download
import sys
from typing import Literal, Dict, Optional
# from hidiffusion import apply_hidiffusion, remove_hidiffusion

# from sfast.compilers.diffusion_pipeline_compiler import (compile,
#                                                          CompilationConfig)
sys.path.append(os.path.join(os.path.dirname(__file__), "StreamDiffusion"))



from collections import defaultdict
from performance_metrics import add_timestamp, get_average_generation_duration, calculate_throughput, get_timestamps
import uuid
import threading
from transformers import T5EncoderModel
import re
from safety_checker.censor import check_safety

import torch.nn as nn
from os.path import expanduser  # pylint: disable=import-outside-toplevel
from urllib.request import urlretrieve  # pylint: disable=import-outside-toplevel

tinyAutoencoder = AutoencoderTiny.from_pretrained("madebyollin/taesdxl", torch_dtype=torch.float16)

tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-small")
pimper_model = T5ForConditionalGeneration.from_pretrained("roborovski/superprompt-v1", device_map="auto")

# Flask App Initialization
app = Flask(__name__)

# create lock
lock = threading.Lock()

def get_boltning_pipe() -> DiffusionPipeline:
    pipe = DiffusionPipeline.from_pretrained(
        "./boltning_diffusers", 
        torch_dtype=torch.float16, 
        variant="fp16"
    ).to("cuda")
    pipe.vae = AutoencoderTiny.from_pretrained("madebyollin/taesdxl").to(
        device=pipe.device, dtype=pipe.dtype
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")

    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)
    return pipe

def get_lightning_pipe(steps:int = 4) -> DiffusionPipeline:
    base_model_id = "./zavychromaxl7"
    # base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"

    # repo_name = "ByteDance/Hyper-SD"
    # ckpt_name = f"Hyper-SDXL-{steps}steps-lora.safetensors"
    
    ckpt_name = f"sdxl_lightning_{steps}step_lora.safetensors" # Use the correct ckpt for your step setting!
    repo_name = "ByteDance/SDXL-Lightning"
    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to("cuda")
    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()
    # pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # try DPMSolverSDEScheduler
    pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
    # pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

    # # Load resadapter for baseline
    # resadapter_model_name = "resadapter_v2_sdxl"
    # pipe.load_lora_weights(
    #     hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="pytorch_lora_weights.safetensors"), 
    #     adapter_name="res_adapter",
    #     ) # load lora weights
    # pipe.set_adapters(["res_adapter"], adapter_weights=[1.0])
    # pipe.unet.load_state_dict(
    #     load_file(hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="diffusion_pytorch_model.safetensors")),
    #     strict=False,
    #     ) # load norm weights

    return pipe

def get_hyper_pipe(steps:int = 4) -> DiffusionPipeline:
    # base_model_id = "./zavychromaxl7"
    base_model_id = "stabilityai/stable-diffusion-xl-base-1.0"

    repo_name = "ByteDance/Hyper-SD"
    ckpt_name = f"Hyper-SDXL-{steps}steps-lora.safetensors"
    
    # ckpt_name = f"sdxl_lightning_{steps}step_lora.safetensors" # Use the correct ckpt for your step setting!
    # repo_name = "ByteDance/SDXL-Lightning"
    pipe = DiffusionPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to("cuda")
    pipe.load_lora_weights(hf_hub_download(repo_name, ckpt_name))
    pipe.fuse_lora()
    # pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # try DPMSolverSDEScheduler
    # pipe.scheduler = DPMSolverSDEScheduler.from_config(pipe.scheduler.config)
    pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)

    # # Load resadapter for baseline
    # resadapter_model_name = "resadapter_v2_sdxl"
    # pipe.load_lora_weights(
    #     hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="pytorch_lora_weights.safetensors"), 
    #     adapter_name="res_adapter",
    #     ) # load lora weights
    # pipe.set_adapters(["res_adapter"], adapter_weights=[1.0])
    # pipe.unet.load_state_dict(
    #     load_file(hf_hub_download(repo_id="jiaxiangc/res-adapter", subfolder=resadapter_model_name, filename="diffusion_pytorch_model.safetensors")),
    #     strict=False,
    #     ) # load norm weights

    return pipe


def get_tcd_pipe(steps: int = 4) -> DiffusionPipeline:
    device = "cuda"
    base_model_id = "./zavychromaxl7"
    tcd_lora_id = "h1t/TCD-SDXL-LoRA"
    
    pipe = StableDiffusionXLPipeline.from_pretrained(base_model_id, torch_dtype=torch.float16, variant="fp16").to(device)
    pipe.scheduler = TCDScheduler.from_config(pipe.scheduler.config)
    
    pipe.load_lora_weights(tcd_lora_id)
    pipe.fuse_lora()
    # pipe.unet = torch.compile(pipe.unet, mode="reduce-overhead", fullgraph=True)
    
    return pipe

# override_steps = 2

# Initialize the default pipe
# pipe_hyper = get_hyper_pipe(2)

# pipe_lightning = get_lightning_pipe(4)

# apply_hidiffusion(pipe)
pipe_boltning = get_lightning_pipe(4)

# apply_deepcache(pipe)


class Predictor:
    def __init__(self):
        print("CUDA version:", torch.version.cuda)
        print("PyTorch version:", torch.__version__)

    def predict_batch(self, batch_data):
        results = []
        print("batch_data:", batch_data)
        # Process each batch
        data = batch_data

        model = data["model"]
        width = data["width"]
        height = data["height"]
        if width < 32:
            width = 32
        if height < 32:
            height = 32
        steps = data["steps"]
        prompts = data["prompts"]
        refine = data["refine"]
        negative_prompt = data["negative_prompt"]

        # if negative_prompt is not set then set it to "worst quality, low quality, blurry"
        if not negative_prompt:
            negative_prompt = "worst quality, low quality, blurry"

        print(f"Running batch with model: {model}, width: {width}, height: {height}, number of prompts: {len(prompts)}, steps: {steps}")

        max_batch_size = 16

        model = "turbo"

        print("params:", model, width, height, steps, prompts, refine, negative_prompt)
        predict_duration = 0
        for i in range(0, len(prompts), max_batch_size):
            chunked_prompts = prompts[i:i + max_batch_size]
            original_prompt = chunked_prompts[0]
            chunked_prompts[0] = original_prompt
            print("running on prompts", chunked_prompts, "original", original_prompt)
            with lock:
                predict_start_time = time.time()
                try:
                    #batch_results = []
                    # for prompt in chunked_prompts:
                    # steps = override_steps
                    if steps < 4:
                        steps = 2
                    else:
                        steps = 4
                    pipe = pipe_boltning # ipe_hyper if steps == 2 else pipe_lightning
                    batch_results = pipe(chunked_prompts, num_inference_steps=4, guidance_scale=1.0, width=width, height=height).images
                    # batch_results.append(image)

                except Exception as e:
                    print("Exception occurred:", e)
                    import traceback
                    traceback.print_exc()
                    os._exit(1)

                concepts, has_nsfw_concepts = check_safety(batch_results, 0.0)
                predict_end_time = time.time()

                predict_duration += predict_end_time - predict_start_time

            for i, (result_image, prompt) in enumerate(zip(batch_results, chunked_prompts)):
                output_path = self._save_result(result_image)
                results.append({
                    "output_path": output_path,
                    "model": model,
                    "width": width,
                    "height": height,
                    "steps": steps,
                    "prompt": prompt,
                    "has_nsfw_concept": has_nsfw_concepts[i],
                    "concept": concepts[i]
                })
                print(f"Saved result for model: {model}, output path: {output_path}")

        return results, predict_duration

    def _validate_params(self, data):
        default_params = {"width": 1024, "height": 1024, "steps": 4, "seed": None, "model": "turbo", "refine": False, "negative_prompt": "ugly, chaotic"}
        params = default_params.copy()

        for param in ['width', 'height', 'steps', 'seed']:
            try:
                if param in data:
                    params[param] = int(data[param])
            except:
                print(f"Warning: Failed to convert '{param}'. Using default value.")

        params["width"] -= params["width"] % 8
        params["height"] -= params["height"] % 8

        params["model"] = data.get("model", default_params["model"])
        print(f"Validated parameters: width: {params['width']}, height: {params['height']}, steps: {params['steps']}, seed: {params['seed']}, model: {params['model']}")
        return params

    def _log_performance_metrics(self, start_time, end_time):
        add_timestamp(start_time, end_time)
        average_duration = get_average_generation_duration()
        generation_speed = calculate_throughput(start_time, end_time)

        print(f"Average Generation Duration: {average_duration} seconds per image")
        print(f"Current Throughput: {generation_speed} images per second")
        print(f"Images Generated in Last 60 Seconds: {len(get_timestamps())}")

    def _save_result(self, result):
        print("Saving result image...")

        unique_id = uuid.uuid4()
        output_dir = "/tmp/imagecache"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"out-{unique_id}.jpg")
        result.save(output_path)
        print("Result image saved at:", output_path)
        return output_path

predictor = Predictor()

import time
total_start_time = time.time()
accumulated_predict_duration = 0

@app.route('/predict', methods=['POST'])
def predict_endpoint():
    global accumulated_predict_duration

    data = request.json
    validated_params = predictor._validate_params(data)
    data.update(validated_params)

    response, predict_duration = predictor.predict_batch(data)

    accumulated_predict_duration += predict_duration

    total_time = time.time() - total_start_time

    predict_percentage = (accumulated_predict_duration / total_time) * 100
    print(f"Predict time percentage: {predict_percentage}%")

    print("Returning response for one request.")
    return jsonify(response)

import clip
device = "cuda" if torch.cuda.is_available() else "cpu"
clip_model, _ = clip.load("ViT-L/14", device=device)

@app.route('/embeddings', methods=['POST'])
def embeddings_endpoint():
    data = request.json

    prompts = data["prompts"]

    embeddings = []
    start_time = time.time()

    aesthetics_scores = []
    token = clip.tokenize(prompts, truncate=True).to(device)
    with torch.no_grad():
        embeddings = clip_model.encode_text(token)
        aesthetics_scores = aesthetic_model(embeddings)
        aesthetics_scores = aesthetics_scores.squeeze(-1)
        print("aesthetics_score:", aesthetics_scores)
    end_time = time.time()
    print(f"Time to calculate embeddings: {(end_time - start_time) * 1000} milliseconds")
    print("Returning embeddings for one request.", len(embeddings))

    return jsonify({
        "embeddings": embeddings.cpu().numpy().tolist(),
        "aesthetics_scores": aesthetics_scores.cpu().numpy().tolist()
    })

def prompt_pimping(input_text):
    output = pimper_model.generate(tokenizer(input_text, return_tensors="pt").input_ids.to("cuda"), max_length=30)
    result_text = tokenizer.decode(output[0])
    return result_text

import os
if __name__ == "__main__":
    print("Starting Flask app...")
    # app.run(debug=False, host="0.0.0.0", port=os.environ.get("PORT", 5555))

    import time

    # Run predict a few times with different prompts and measure the times
    test_prompts = ["Authentic shaman making sushi. risohraph", "A futuristic cityscape", "A serene beach at dawn"]
    for prompt in test_prompts:
        print(f"Running predict for prompt: {prompt}")
        start_time = time.time()
        data = {
            "model": "turbo",
            "width": 768,
            "height": 768,
            "steps": 4,
            "prompts": [prompt]*1,
            "refine": False,
            "negative_prompt": "ugly, chaotic"
        }
        response, predict_duration = predictor.predict_batch(data)
        end_time = time.time()
        print(f"Response: {response}")
        print(f"Time taken for prompt '{prompt}': {(end_time - start_time) * 1000} milliseconds")
