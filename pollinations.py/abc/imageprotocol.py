"""
pollinations.abc.imageprotocol

Classes:
    ImageProtocol: Image protocol for the ImageObject class.
"""

from typing import Protocol


class ImageProtocol(Protocol):
    """
    ImageProtocol: Image protocol for the ImageObject class.
    """

    prompt: str
    negative: str
    model: str
    width: int
    height: int
    seed: int
    url: str
    date: str
    content: bin
