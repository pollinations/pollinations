import random

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


def sample(*args, **kwargs) -> str:
    return styles.get(random.choice(list(styles.keys())))
