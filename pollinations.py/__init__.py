#  MIT License
#
#  Copyright (c) 2023 pollinations
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
Interact with text-to-image generative AI models.

Current Models:
    turbo
    dreamshaper
    deliberate
    pixart
    playground
    dpo
    dalle3xl
    formulaxl

Classes:
    Image (types.Model): text-to-image generative AI model.
      -> Also Model (same as Image)
    ImageType (types.ImageType): Image wrapper.
    ImageURL (types.ImageURL): Image URL wrapper.

Methods:
    sample (ext.sample): Returns a sample style for the Image model.
"""

from .ai import *
from .ext import *

Image = Model

default = Models.default
turbo = Models.turbo
dreamshaper = Models.dreamshaper
deliberate = Models.deliberate
pixart = Models.pixart
playground = Models.playground
dpo = Models.dpo
dalle3xl = Models.dalle3xl
formulaxl = Models.formulaxl

__version__ = "1.3.2"
__author__ = "pollinations"
__license__ = "MIT"
__copyright__ = "Copyright 2023 pollinations"
__all__ = ["Image", "ImageType", "ImageURL", "sample"]
