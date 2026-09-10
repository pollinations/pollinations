from contextvars import ContextVar

request_authorization: ContextVar[str] = ContextVar("request_authorization", default="")


def authorization_or(default_token: str) -> str:
    return request_authorization.get() or f"Bearer {default_token}"
