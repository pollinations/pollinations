'''
pollinations.types.ImageObject

Classes:
    ImageObject (types.ImageObject): Image object.
'''

from .. import abc


@abc.resource(deprecated=False)
class ImageObject(abc.ImageProtocol):
    '''
    pollinations.ai.types.ImageObject

    Parameters:
        prompt (str): Prompt for the image.
        url (str): URL for the image.
        date (str): Date the image was generated.
        content (binary): Binary content of the image.

    Variables:
        prompt (str): Prompt for the image.
        url (str): URL for the image.
        date (str): Date the image was generated.
        content (binary): Binary content of the image.
    '''''
    def __init__(
        self, prompt: str, url: str, date: str, content: bin, *args, model: str = None, width: int = None, height: int = None, seed: int = None, **kwargs
    ) -> None:
        self.prompt: str = prompt
        self.width: int = width if width else 1024
        self.height: int = height if height else 1024
        self.model: str = model if model else 'default'
        self.seed: int = seed if seed else 'random'
        self.url: str = url
        self.date: str = date
        self.content: bin = content

    def __repr__(self, *args, **kwargs) -> str:
        return f"ImageObject(prompt={self.prompt}, width={self.width}, height={self.height}, model={self.model}, seed={self.seed}, url={self.url}, date={self.date}, content={str(self.content)[:10]}...)"

    def __str__(self, *args, **kwargs) -> str:
        return self.__repr__()
