"""
pollinations.types.GitObject

Classes:
    GitObject (types.GitObject): Github object.
"""

from .. import abc


@abc.resource(deprecated=False)
class GitObject(abc.GitProtocol):
    """
    pollinations.ai.types.GitObject

    Parameters:
        type (str): Type of the object.
        url (str): URL of the object.
        date (str): Date of the object.
        content (str): Content of the object.
        json (dict): JSON of the object.

    Variables:
        type (str): Type of the object.
        url (str): URL of the object.
        date (str): Date of the object.
        content (str): Content of the object.
        json (dict): JSON of the object.
    """

    def __init__(
        self,
        type: str,
        url: str,
        date: str,
        content: str,
        json: dict,
        *args,
        **kwargs,
    ) -> None:
        self.type: str = type
        self.url: str = url
        self.date: str = date
        self.content: str = content
        self.json: dict = json
        
    def __repr__(self, *args, **kwargs) -> str:
        return f"GitObject(type={self.type}, url={self.url}, date={self.date}, content={self.content}, json={self.json})"
