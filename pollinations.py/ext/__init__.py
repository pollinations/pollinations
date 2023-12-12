'''
pollinations.ext

Functions:
    sample(str): Returns a sample prompt for the Image model.
    sample_style(str): Returns a style of prompt for the Image model.
    sample_batch(list, size=10): Returns a batch of sample prompts for the Image model.

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
'''

import random
from .. import abc

samples: list = abc.samples
styles: dict = {
    "impressionism": "impressionism, light, color, brushstrokes, plein air",
    "expressionism": "expressionism, emotion, distortion, psychological",
    "romanticism": "romanticism, emotion, nature, sublime",
    "surrealism": "surrealism, dreamlike, subconscious, fantastical",
    "watercolor": "watercolor, watercolour, painting, artistic, vibrant",
    "futuristic": "futuristic, modern, future, high tech, tech",
    "minimalist": "minimalist, minimal, simplicity, clean, simple",
    "modernism": "modernism, contemporary, avant-garde, abstract expressionism",
    "steampunk": "steampunk, gears, realistic, old steampunk",
    "realistic": "realistic, realism, real life, ultra realistic, high quality, real",
    "graffiti": "graffiti, urban, street art, spray paint, rebellious",
    "abstract": "abstract, abstraction, non-representational, conceptual",
    "vintage": "vintage, retro, old-fashioned, nostalgic",
    "cartoon": "cartoony, cartoon, cartoonish",
    "cubism": "cubism, geometric, fragmented, multiple viewpoints",
    "gothic": "gothic, dark, mysterious, eerie, ornate",
    "anime": "anime, anime art, anime style",
    "logo": "logo, logo design, logo graphic design, logo digital art",
}

impressionism: str =  styles.get("impressionism")
expressionism: str =  styles.get("expressionism")
romanticism: str =  styles.get("romanticism")
surrealism: str =  styles.get("surrealism")
watercolor: str =  styles.get("watercolor")
futuristic: str =  styles.get("futuristic")
minimalist: str =  styles.get("minimalist")
modernism: str =  styles.get("modernism")
steampunk: str =  styles.get("steampunk")
realistic: str = styles.get("realistic")
graffiti: str =  styles.get("graffiti")
abstract: str =  styles.get("abstract")
cartoon: str = styles.get("cartoon")
vintage: str =  styles.get("vintage")
cubism: str =  styles.get("cubism")
gothic: str =  styles.get("gothic")
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
