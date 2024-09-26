"""
pollinations.ai

Classes:
    ImageModel (ai.ImageModel): Text-to-image generative AI model.
    ImageObject (ai.ImageObject): Image object.

Functions:
    sample(str): Returns a sample prompt for the Image model.
    sample_style(str): Returns a style of prompt for the Image model.
    sample_batch(list, size=10): Returns a batch of sample prompts for the Image model.
    help(str): Returns general help information for pollinations.ai

Variables:
    samples (list): List of sample prompts for the Image model.
    styles (dict): Dictionary of prompt styles for the Image model.
    realistic (str): styles[realistic]
    cartoon (str): styles[cartoon]
    anime (str): styles[anime]
    logo (str): styles[logo]

    BANNED_WORDS (list): List of banned words for the Image model filter.

"""

import random
from .. import abc
from .. import ext
from ..types import (
    ImageObject,
)
from ..models import (
    ImageModel
)

Image: ImageModel = ImageModel

samples: list = ext.samples
styles: dict = ext.styles

realistic: str = ext.realistic
cartoon: str = ext.cartoon
anime: str = ext.anime
logo: str = ext.logo

sample_style: object = ext.sample_style
sample: object = ext.sample
sample_batch: object = ext.sample_batch


@abc.resource(deprecated=True)
def help(*args, **kwargs) -> str:
    """
    pollinations.ai.help

    Return:
        str: Help information for pollinations.ai
    """
    help_return: str = (
        """
  sample(): returns 1 random sample prompt

  sample_style(): returns a style of art (realistic, cartoon, anime, logo))

  sample_batch(size: int): returns size batch of random sample prompts

  Image(save_file: str (OPTIONAL)): inialize the ai.Image

  Image.set_filter(filter: list): set the filter for list of backlisted words

  Image.generate(prompt: str): generate an image from a prompt

  Image.generate_batch(prompts: list): generate an image from a batch of prompts

  Image.save(save_file: str (OPTIONAL)): save the image to a file

  Image.load(load_file: str (OPTIONAL)): load the image from a file

  Image.image(): return the image object

  """
        ""
    )
    return help_return


filtered: list = abc.filtered
