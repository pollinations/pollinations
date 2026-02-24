import logging
import sys

import discord

from src.bot import bot
from src.config import config
from src.logging_config import setup_logging


def main():
    # Use uvloop for 2-4x faster async event loop (Linux only)
    try:
        import uvloop

        uvloop.install()
    except ImportError:
        pass

    setup_logging(level=logging.INFO)
    logger = logging.getLogger(__name__)

    logger.info("Starting Polly Helper Bot...")
    config.validate()

    try:
        bot.run(config.discord_token, log_handler=None)
    except discord.errors.PrivilegedIntentsRequired:
        logger.error(
            "Privileged Intents Required!\n"
            "Enable 'Message Content Intent' in Discord Developer Portal:\n"
            "https://discord.com/developers/applications"
        )
        sys.exit(1)
    except discord.errors.LoginFailure:
        logger.error("Invalid Discord token. Check your DISCORD_TOKEN.")
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
