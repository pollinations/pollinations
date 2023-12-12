"""
pollinations.ai

Classes:
    ImageModel (ai.ImageModel): Text-to-image generative AI model.
    
Functions:
    sample(str): Returns a sample prompt for the Image model.
    sample_style(str): Returns a style of prompt for the Image model.
    sample_batch(list, size=10): Returns a batch of sample prompts for the Image model.
    help(str): Returns general help information for pollinations.ai

Variables:
    samples (list): List of sample prompts for the Image model.
    styles (dict): Dictionary of prompt styles for the Image model.
    impressionism (str): styles["impressionism"]
    expressionism (str): styles["expressionism"]
    romanticism (str): styles["romanticism"]
    surrealism (str): styles["surrealism"]
    watercolor (str): styles["watercolor"]
    futuristic (str): styles["futuristic"]
    minimalist (str): styles["minimalist"]
    modernism (str): styles["modernism"]
    steampunk (str): styles["steampunk"]
    realistic (str): styles["realistic"]
    graffiti (str): styles["graffiti"]
    abstract (str): styles["abstract"]
    vintage (str): styles["vintage"]
    cartoon (str): styles["cartoon"]
    cubism (str): styles["cubism"]
    gothic (str): styles["gothic"]
    anime (str): styles["anime"]
    logo (str): styles["logo"]

    BANNED_WORDS (list): List of banned words for the Image model filter.

"""

import random
from .. import abc
from .. import ext
from ..types import (
    ImageModel,
)

Image: ImageModel = ImageModel

samples: list = ext.samples
styles: dict = ext.styles

impressionism: str = ext.impressionism
expressionism: str = ext.expressionism
romanticism: str =  ext.romanticism
surrealism: str =  ext.surrealism
watercolor: str =  ext.watercolor
futuristic: str =  ext.futuristic
minimalist: str =  ext.minimalist
modernism: str =  ext.modernism
steampunk: str =  ext.steampunk
realistic: str = ext.realistic
graffiti: str =  ext.graffiti
abstract: str =  ext.abstract
cartoon: str =  ext.cartoon
vintage: str =  ext.vintage
cubism: str =  ext.cubism
gothic: str =  ext.gothic
anime: str =  ext.anime
logo: str =  ext.logo

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

  sample_style(): returns a style of art)

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


BANNED_WORDS: list = abc.BANNED_WORDS
