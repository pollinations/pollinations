"""
pollinations.abc.gitprotocol

Classes:
    GitProtocol: Git protocol for the GitObject class.
"""

from typing import Protocol


class GitProtocol(Protocol):
    """
    GitProtocol: Git protocol for the GitObject class.
    """

    type: str
    url: str
    date: str
    content: str
    json: dict
