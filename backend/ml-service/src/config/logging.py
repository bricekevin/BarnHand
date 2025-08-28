"""Logging configuration for ML service."""
import logging
import sys
from loguru import logger
from .settings import settings


class InterceptHandler(logging.Handler):
    """Intercept standard logging messages toward Loguru."""
    
    def emit(self, record: logging.LogRecord) -> None:
        """Emit log record to Loguru."""
        # Get corresponding Loguru level if it exists
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame, depth = sys._getframe(6), 6
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def setup_logging() -> None:
    """Configure logging for the application."""
    
    # Remove default loguru handler
    logger.remove()
    
    # Add new handler with custom format
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>"
    )
    
    if settings.environment == "development":
        # Colorized output for development
        logger.add(
            sys.stderr,
            format=log_format,
            level=settings.log_level,
            colorize=True,
            backtrace=True,
            diagnose=True
        )
    else:
        # JSON output for production
        logger.add(
            sys.stderr,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} | {message}",
            level=settings.log_level,
            serialize=True,
            backtrace=False,
            diagnose=False
        )
    
    # Suppress noisy third-party loggers
    logging.getLogger("multipart").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    
    # Intercept standard logging
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    
    logger.info("Logging configured", 
                environment=settings.environment, 
                level=settings.log_level)