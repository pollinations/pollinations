<div id="header">
  <img src="https://i.ibb.co/p049Y5S/86964862.png" width="50"/>   <img src="https://i.ibb.co/r6JZ336/sketch1700556567238.png" width="250">
</div>

# [pollinations.ai - Image Generation](https://pypi.org/project/pollinations.ai)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/toolkitr/tkr/blob/main/LICENSE)
[![Python Versions](https://img.shields.io/badge/python-3.7%20|%203.8%20|%203.9%20|%203.10%20|%203.11%20|%203.12%20-blue)](https://www.python.org/downloads/)

```
pollinations.ai: (https://pollinations.ai/)

This is a WRAPPER designed for easy text-image generation.
```

## Installing
```shell
pip install -U pollinations
pip install -U pollinations.ai

# Linux/macOS
python3 -m pip install -U pollinations
python3 -m pip install -U pollinations.ai

# Windows
py -3 -m pip install -U pollinations
py -3 -m pip install -U pollinations.ai
```

## Simple Examples
```python
import pollinations.ai as ai

# Version 1
model: ai.Image = ai.Image()
image: ai.ImageObject = model.generate(
      prompt="A cat playing with a ball",
      # negative...width...height...height...seed...model...nologo
)
image.save("cat_playing_with_ball.png")
print(image)
# -------------------------------------------- #
# Version 2
class Model(ai.Image):
      params: dict = {
            "prompt": "cat in space",
            #negative...width...height...height...seed...model...nologo
      }

model: ai.Image = Model()
model.generate().save()
```
```python
def generate(
        self,
        prompt: str = "...",
        *args,
        negative: str = "",
        width: int = 1024,
        height: int = 1024,
        seed: int = 0,
        model: str = None,
        nologo: bool = None,
        **kwargs,
    ) -> types.ImageObject:
```
## Batch Generation
```python
import pollinations.ai as ai

# Version 1
model: ai.Image = ai.Image()
prompts: list = ["cat in space", "dog in space"]
images: list[ai.ImageObject] = model.generate_batch(prompts, save=True, path="my/path/here")
# -------------------------------------------- #
# Version 2
class Model(ai.Image):
      params: dict = {
            "prompt": ["lion in space", "dog in space"]
      }

model: ai.Image = Model()
model.generate_batch(save=True, path="my/path/here")
```
```python
def generate_batch(
        self,
        prompts: list = ["..."],
        negative: list = ["..."],
        save: bool = False,
        path: str = "pollinations-Image.png",
        naming: str = "counter",
        *args,
        model: str = None,
        width: int = 1024,
        height: int = 1024,
        seed: int = 0,
        nologo: bool = False,
        **kwargs,
    ) -> list[types.ImageObject]:
```

## Setting model filter
```python
import pollinations.ai as ai

model: ai.Image = ai.Image()
model.set_filter(ai.filtered)
model.set_filter(["custom", "words", "here"])

# If any word from a prompt is in the filter it will return an exception.
```


# Links
- [Pollinations.ai](https://pollinations.ai/)
- [Discord](https://discord.gg/8HqSRhJVxn)
- [Github](https://github.com/pollinations)
- [Youtube](https://www.youtube.com/channel/UCk4yKnLnYfyUmCCbDzOZOug)
- [Instagram](https://instagram.com/pollinations_ai)
- [Twitter (X)](https://twitter.com/pollinations_ai)
