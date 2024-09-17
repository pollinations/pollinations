#  MIT License
#
#  Copyright (c) 2023 pollinations-ai
#
#  Permission is hereby granted, free of charge, to any person obtaining a copy
#  of this software and associated documentation files (the "Software"), to deal
#  in the Software without restriction, including without limitation the rights
#  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
#  copies of the Software, and to permit persons to whom the Software is
#  furnished to do so, subject to the following conditions:
#
#  The above copyright notice and this permission notice shall be included in all
#  copies or substantial portions of the Software.
#
#  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
#  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
#  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
#  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
#  SOFTWARE.


"""
Interact with text-to-image and text-to-text generative AI models.

Classes:
    Image (types.ImageModel): text-to-image generative AI model.
    (deprecated) > Text (types.TextModel): text-to-text generative AI model.

Object Classes:
    ImageObject (types.ImageObject): Image object.
    (deprecated) > TextObject (types.TextObject): Text object.

Functions:
    help(str): Prints general/basic information.
    sample(str): Returns a sample prompt for the Image model.
    sample_style(str): Returns a style of prompt for the Image model.
    sample_batch(list, size=10): Returns a batch of sample prompts for the Image model.
"""

from . import ai as _ai

__version__: str = "0.5.2"


ai: object = _ai

help: object = ai.help

Image: object = ai.Image
# Text: object = ai.Text

sample: object = ai.sample
sample_style: object = ai.sample_style
sample_batch: object = ai.sample_batch
