import time
from .._core._handler import *
from .._core._handler import _request_image
from ..ext import *

models = ['turbo', 'dreamshaper', 'deliberate', 'pixart', 'playground', 'dpo', 'dalle3xl', 'formulaxl']

class GlobalCooldown:
    def __init__(self, cooldown: int = 10):
        self.cooldown: int = cooldown
        self.last_request: int = time.time() - 11

cooldown = GlobalCooldown()

class Model:
    '''
    pollinations.ai.Model
    '''
    def __init__(self, *args, **kwargs) -> None:
        self.model = Models.turbo
        self.width = 1024
        self.height = 1024
        self.seed = 'random'
        self.prompt = ''
        self.last = None

    def generate(self, prompt: str, *, model: str = Models.turbo, width: int = 1024, height: int = 1024, seed: int = 'random') -> ImageType:
        '''
        Generate an image from the specified prompt.
        '''
        if model.lower() not in models:
            raise ValueError(f'\n\nInvalid model: {model}')

        if cooldown.last_request + cooldown.cooldown > time.time():
            time_until_allowed = cooldown.cooldown - (time.time() - cooldown.last_request)
            raise ValueError(f'\n\nCooldown: {time_until_allowed} seconds until allowed.')
            
        image = _request_image(
            prompt=prompt,
            model=model,
            width=width,
            height=height,
            seed=seed,
        )
        self.model = model
        self.width = width
        self.height = height
        self.seed = seed
        self.prompt = prompt
        self.last = image
        cooldown.last_request = time.time()
        return image

    def save(self, path: str) -> Image:
        '''
        Save the image to the specified path.
        '''
        if self.last:
            self.last.save(path)
        else:
            raise ValueError('No image generated yet.')

        return self

    def __repr__(self, *args, **kwargs) -> str:
        return f"Model(model={self.model!r}, width={self.width}, height={self.height}, seed={self.seed}, prompt={self.prompt!r}, last={str(self.last)[:10]}...)"

    def __str__(self, *args, **kwargs) -> str:
        return self.__repr__()

Image = Model
default = Models.default
turbo = Models.turbo
dreamshaper = Models.dreamshaper
deliberate = Models.deliberate
pixart = Models.pixart
playground = Models.playground
dpo = Models.dpo
dalle3xl = Models.dalle3xl
formulaxl = Models.formulaxl
