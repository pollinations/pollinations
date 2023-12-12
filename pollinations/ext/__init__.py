'''
pollinations.ext

Functions:
    sample(str): Returns a sample prompt for the Image model.
    sample_style(str): Returns a style of prompt for the Image model.
    sample_batch(list, size=10): Returns a batch of sample prompts for the Image model.

Variables:
    samples (list): List of sample prompts for the Image model.
    styles (dict): Dictionary of prompt styles for the Image model.
    realistic (str): styles[realistic]
    cartoon (str): styles[cartoon]
    anime (str): styles[anime]
    logo (str): styles[logo]
'''

import random
from .. import abc

samples: list = abc.samples
styles: dict = {
    "realistic": "realistic, realism, real life, ultra realistic, high quality, real",
    "cartoon": "cartoony, cartoon, cartoonish",
    "anime": "anime, anime art, anime style",
    "logo": "logo, logo design, logo graphic design, logo digital art",
}

realistic: str = styles.get("realistic")
cartoon: str = styles.get("cartoon")
anime: str = styles.get("anime")
logo: str = styles.get("logo")


@abc.resource(deprecated=False)
def sample_style(*args, **kwargs) -> str:
    return styles.get(random.choice(list(styles.keys())))


@abc.resource(deprecated=False)
def sample(*args, **kwargs) -> str:
    return f"prompt: {random.choice(samples)}, details: ({sample_style()})"


@abc.resource(deprecated=False)
def sample_batch(size: int, *args, **kwargs) -> list:
    return [sample() for iter in range(size)]
