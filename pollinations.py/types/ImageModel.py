"""
pollinations.types.ImageModel

Classes:
    ImageModel (types.ImageModel): Text-to-image generative AI model.
    ImageObject (types.ImageObject): Image object.
"""

import requests
import random
from .. import abc
from .ImageObject import ImageObject


@abc.resource(deprecated=False)
class ImageModel:
    """
    pollinations.ai.types.ImageModel

    Paremeters:
        save_file (str): File to save the image to.
        params (dict): Parameters for the image(s).

    Variables:
        save_file (str): File to save the image to.
        prompt (str): The last prompt used. (If any)
        filter (list): List of words for the ai not to generate with.
        default_filter (list): List of general inappropriate words. (abc.BANNED_WORDS)
        data (object): types.ImageObject or list of types.ImageObject
        self.is_filtered (bool): Whether the ai is filtered or not.

    Functions:
        set_filter(object, filter: list): Set the filter for the ai.
        generate(ImageObject, prompt: str): Generate an image.
        generate_batch(list, prompts: list): Generate a batch of images.
        save(ImageObject, save_file: str=None): Save the image.
        load(bin, save_file: str): Load the image. (returns binary)
        image(ImageObject): Returns self.data
    """

    params = {
        "prompt": None,
        "width": 1024,
        "height": 1024,
        "seed": 0,
        "model": "turbo",
        "file": "pollinations-Image.png",
    }

    def __init__(
        self, save_file: str = "pollinations-Image.png", *args, **kwargs
    ) -> None:
        self.base: str = "image.pollinations"
        self.save_file: str = save_file
        self.prompt: str = None
        self.default_filter: list = abc.BANNED_WORDS
        self.filter: list = self.default_filter
        self.data: object = object
        self.is_filtered: bool = False

        self.prompt = self.params.get("prompt", "...")
        self.width = self.params.get("width", 1024)
        self.height = self.params.get("height", 1024)
        self.seed = self.params.get("seed", random.randint(0, 2**32 - 1))
        self.model = self.params.get("model", "turbo")
        self.file = self.params.get("file", "pollinations-Image.png")

    def __repr__(self, *args, **kwargs) -> str:
        return f"ImageModel(save_file={self.save_file})"

    @abc.resource(deprecated=False)
    def set_filter(self, filter: list, *args, **kwargs) -> object:
        """
        pollinations.ai.types.ImageModel.set_filter

        Parameters:
            filter (list): List of words for the ai not to generate with.

        Return:
            self (ImageModel): Returns self.
        """ ""
        self.filter: list = filter
        return self

    @abc.resource(deprecated=False)
    def generate(
        self,
        *args,
        prompt: str = "",
        model: str = None,
        width: int = 1024,
        height: int = 1024,
        seed: int = None,
        nologo: bool = False,
        **kwargs,
    ) -> str:
        """
        pollinations.ai.types.ImageModel.generate

        Parameters:
            prompt (str): The prompt for the image.
            model (str): The model for the ai to use.
            width (int): The width of the image.
            height (int): The height of the image.
            seed (int): The seed for the ai.
            nologo (bool): Whether to remove the logo from the image.

        Return:
            ImageObject (class): Returns the ImageObject for the generated image.
        """
        if seed is None:
            seed: int = random.randint(0, 2**32 - 1)

        if prompt != "":
            self.prompt: str = prompt
        else:
            if self.prompt == "":
                self.prompt: str = "..."
        self.width: int = width
        self.height: int = height
        self.seed: int = seed
        self.model: str = model
        self.nologo: bool = nologo

        model_list: list = ["turbo", "pixart", "deliberate"]
        if model:
            if model not in model_list:
                raise ValueError(f"Invalid model: {model} | Choose from {model_list}")
        else:
            model: str = "turbo"

        words: list = self.prompt.split(" ")

        for word in words:
            if word in self.filter:
                self.is_filtered: bool = True
                return Exception(f"types.ImageModel >>> InvalidPrompt (filtered)")

        request_string: str = f"{abc.proto}{self.base}{abc.ai}{self.prompt}?"
        if self.model:
            request_string += f"model={self.model}&"
        if self.width:
            request_string += f"width={self.width}&"
        if self.height:
            request_string += f"height={self.height}&"
        if self.seed:
            request_string += f"seed={self.seed}&"
        if self.nologo:
            request_string += f"nologo=true&"
        request_string: str = request_string[:-1]
        request = requests.get(request_string)
        self.data: ImageObject = ImageObject(
            prompt,
            request.url,
            request.headers["Date"],
            content=request.content,
            model=model,
            width=width,
            height=height,
            seed=seed,
            nologo=nologo,
        )
        self.data.save: object = self.save

        return self.data

    @abc.resource(deprecated=False)
    def generate_batch(
        self,
        prompts: list = ["..."],
        save: bool = False,
        path: str = None,
        naming: str = "counter",
        *args,
        model: str = None,
        width: int = 1024,
        height: int = 1024,
        seed: int = None,
        nologo: bool = False,
        **kwargs,
    ) -> list:
        """
        pollinations.ai.types.ImageModel.generate_batch

        Parameters:
            prompts (list): List of prompts for the images.
            model (str): The model for the ai to use.
            width (int): The width of the image.
            height (int): The height of the image.
            seed (int): The seed for the ai.
            nologo (bool): Whether to remove the logo from the image.
            save (bool): Whether to save the images or not.
            path (str): Path to save the images to.
            naming (str): Naming convention for the images. (counter or prompt)

        Return:
            ImageObject (list): Returns a list of ImageObjects for the generated images.
        """
        if isinstance(self.prompt, list):
            self.prompts: list = self.prompt
        else:
            self.prompts: list = prompts
        self.data: list = []
        counter: int = 1
        self.width: int = width
        self.height: int = height
        self.seed: int = seed
        self.model: str = model
        self.nologo: bool = nologo

        for prompt in self.prompts:
            words: list = prompt.split(" ")
            for word in words:
                if word in self.filter:
                    self.is_filtered: bool = True
                    return Exception(f"types.ImageModel >>> InvalidPrompt (filtered)")

            request_string: str = f"{abc.proto}{self.base}{abc.ai}{prompt}?"
            if self.model:
                request_string += f"model={self.model}&"
            if self.width:
                request_string += f"width={self.width}&"
            if self.height:
                request_string += f"height={self.height}&"
            if self.seed:
                request_string += f"seed={self.seed}&"
            if self.nologo:
                request_string += f"nologo=true&"
            request_string: str = request_string[:-1]
            request = requests.get(request_string)
            image: ImageObject = ImageObject(
                prompt,
                request.url,
                request.headers["Date"],
                content=request.content,
                model=model,
                width=width,
                height=height,
                seed=seed,
                nologo=nologo,
            )
            image.save: object = self.save
            self.data.append(image)

            if save:
                if naming == "counter":
                    file_name: str = counter
                else:
                    file_name: str = prompt
                with open(
                    f'{path if path else ""}/batch{file_name}-pollinations.png', "wb"
                ) as handler:
                    handler.write(image.content)

            counter += 1
        return self.data

    @abc.resource(deprecated=False)
    def save(self, save_file: str = None, *args, **kwargs) -> ImageObject:
        """
        pollinations.ai.types.ImageModel.save

        Parameters:
            save_file (str): File name to save the image to.

        Return:
            ImageObject (class): Returns the ImageObject for the saved image.
        """
        if not self.is_filtered:
            if save_file is None:
                save_file = self.save_file

            with open(save_file, "wb") as handler:
                handler.write(self.data.content)

            return self.data
        else:
            return Exception(f"types.ImageModel >>> Cannot Save (filtered)")

    @abc.resource(deprecated=False)
    def load(self, load_file: str = None, *args, **kwargs) -> str:
        """
        pollinations.ai.types.ImageModel.load

        Parameters:
            load_file (str): File name to load the image from.

        Return:
            str (binary): Returns the binary info of the image.
        """
        if load_file is None:
            load_file = self.save_file

        with open(load_file, "rb") as handler:
            return handler.read()

    @abc.resource(deprecated=False)
    def image(self, *args, **kwargs) -> ImageObject:
        """
        pollinations.ai.types.ImageModel.image

        Return:
            ImageObject (class): Returns the ImageObject for the image.
        """
        return self.data
