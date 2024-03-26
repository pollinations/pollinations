import io
from PIL import Image

class Models:
    default = 'turbo'
    turbo = 'turbo'
    dreamshaper = 'dreamshaper'
    deliberate = 'deliberate'
    pixart = 'pixart'
    playground = 'playground'
    dpo = 'dpo'
    dalle3xl = 'dalle3xl'
    formulaxl = 'formulaxl'

class ImageType:
    '''
    pollinations.ai.types.ImageType

    Parameters:
        prompt (str): Prompt for the image.
        url (str): URL for the image.
        date (str): Date the image was generated.
        binary (bin): Binary content of the image.
        *,
        model (str): Model to use for the image.
        width (int): Width of the image.
        height (int): Height of the image.
        seed (int): Seed to use for the image.

    Variables:
        prompt (str): Prompt for the image.
        url (str): URL for the image.
        date (str): Date the image was generated.
        binary (bin): Binary content of the image.
        *,
        model (str): Model to use for the image.
        width (int): Width of the image.
        height (int): Height of the image.
        seed (int): Seed to use for the image.
    '''
    def __init__(
        self, prompt: str, url: str, date: str, binary: bin, *args, model: str = None, width: int = None, height: int = None, seed: int = None, **kwargs
    ) -> None:
        self.prompt: str = prompt
        self.width: int = width if width else 1024
        self.height: int = height if height else 1024
        self.model: str = model if model else 'turbo'
        self.seed: int = seed if seed else 'random'
        self.url: str = url
        self.date: str = date
        self.binary: bin = binary

    def save(self, path: str) -> Image:
        '''
        Save the image to the specified path.
        '''
        if self.binary:
            image: Image = Image.open(io.BytesIO(self.binary))
            image.save(path)
        else:
            raise ValueError('No binary content provided from the image.')
        return self

    def __repr__(self, *args, **kwargs) -> str:
        return f"Image(prompt={self.prompt}, width={self.width}, height={self.height}, model={self.model}, seed={self.seed}, url={self.url}, date={self.date}, binary={str(self.binary)[:10]}...)"

    def __str__(self, *args, **kwargs) -> str:
        return self.__repr__()

class ImageURL:
    '''
    pollinations.ai.types.ImageURL
    '''
    def __init__(self, url: str, *args, model: str = None, width: int = None, height: int = None, seed: int = None, **kwargs) -> None:
        self.url: str = url
        self.model: str = model if model else 'turbo'
        self.width: int = width if width else 1024
        self.height: int = height if height else 1024
        self.seed: int = seed if seed else 'random'

    def __repr__(self, *args, **kwargs) -> str:
        return f"ImageURL(url={str(self.url)[:10]}...)"

    def __str__(self, *args, **kwargs) -> str:
        return self.__repr__()
