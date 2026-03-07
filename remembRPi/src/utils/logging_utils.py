"""
Logging utilities for remembR.

Provides a centralized logger with file and console output,
configured from app_config.yaml.
"""

import logging
import logging.handlers
import os
from pathlib import Path


_logger: logging.Logger | None = None


def setup_logging(level: str = "INFO", log_file: str | None = None,
                  max_bytes: int = 10_485_760, backup_count: int = 3) -> logging.Logger:
    """Configure and return the remembR logger."""
    global _logger

    logger = logging.getLogger("remembR")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Avoid duplicate handlers on repeated calls
    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s %(name)s.%(module)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)

    # File handler (optional)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=max_bytes, backupCount=backup_count,
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    _logger = logger
    return logger


def get_logger() -> logging.Logger:
    """Return the remembR logger, creating it with defaults if needed."""
    global _logger
    if _logger is None:
        _logger = setup_logging()
    return _logger
