import random
import requests
from ._dtypes import (
    ImageType,
    ImageURL,
    Models,
    Image,
)

BASE_URL: str = 'https://pollinations.ai/prompt/'

def _request_image(
    prompt: str,
    *,
    model: str = 'turbo',
    width: int = 1024,
    height: int = 1024,
    seed: int = 'random') -> ImageType:
    '''
    Request an image from the Pollinations API.
    '''

    prompt_add_on: str = '?'
    if model.lower() not in Models.__dict__:
        raise ValueError(f'\n\nInvalid model: {model}')

    if seed == 'random':
        seed = random.randint(0, 1000000000)

    prompt_add_on += f'model={model}&width={width}&height={height}&seed={seed}'
    url: str = f'{BASE_URL}{prompt}{prompt_add_on}'
    response: requests.Response = requests.get(url)
    image_url = ImageURL(
        url=response.url,
        model=model,
        width=width,
        height=height,
        seed=seed,
    )
    image = ImageType(
        prompt=prompt,
        url=image_url,
        date=response.headers['Date'],
        binary=response.content,
        model=model,
        width=width,
        height=height,
        seed=seed,
    )
    return image
