"""Entry point for the Polli Discord bot."""

import logging
import sys

import discord

from src.bot import bot
from src.core.config import config
from src.core.logging import setup_logging


def main() -> None:
    # uvloop gives a 2-4x faster event loop, but is Linux-only.
    try:
        import uvloop

        uvloop.install()
    except ImportError:
        pass

    setup_logging(level=getattr(logging, config.log_level.upper(), logging.INFO))
    logger = logging.getLogger(__name__)

    logger.info("Starting %s...", config.bot.name)
    config.validate()

    try:
        bot.run(config.discord.token, log_handler=None)
    except discord.errors.PrivilegedIntentsRequired:
        logger.error(
            "Message Content Intent is not enabled for this bot. "
            "Enable it at https://discord.com/developers/applications"
        )
        sys.exit(1)
    except discord.errors.LoginFailure:
        logger.error("Discord rejected the token — check DISCORD_TOKEN in .env")
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception:
        logger.exception("Unexpected error")
        sys.exit(1)


if __name__ == "__main__":
    main()
