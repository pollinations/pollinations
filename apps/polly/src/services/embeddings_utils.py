import logging

logger = logging.getLogger(__name__)


def validate_and_get_openai_client(api_key: str, service_name: str = "embeddings"):
    if not api_key:
        logger.error(f"OPENAI_EMBEDDINGS_API environment variable not set for {service_name}")
        raise ValueError("OPENAI_EMBEDDINGS_API is required")

    if not api_key.startswith("sk-"):
        logger.error(
            f"⚠️ OPENAI_EMBEDDINGS_API is invalid for {service_name}!\n"
            "  Expected: OpenAI API key starting with 'sk-'\n"
            "  Got: (key content hidden for security)\n"
            "  \n"
            "  This likely means:\n"
            "  1. Your API key is incorrect or expired\n"
            "  2. You're using the wrong API key (not OpenAI)\n"
            "  \n"
            "  Get a valid OpenAI API key from: https://platform.openai.com/api-keys\n"
            "  Make sure your key has Embedding API access enabled."
        )
        raise ValueError("Invalid OPENAI_EMBEDDINGS_API - must be a valid OpenAI API key starting with 'sk-'")

    from openai import OpenAI

    return OpenAI(api_key=api_key)
