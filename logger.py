import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
LOG_FILE = os.path.join(LOG_DIR, "shms.log")
MAX_BYTES = 10 * 1024 * 1024
BACKUP_COUNT = 5

os.makedirs(LOG_DIR, exist_ok=True)

_formatter = logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)

_file_handler = RotatingFileHandler(
    LOG_FILE, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8"
)
_file_handler.setFormatter(_formatter)

_root_logger = logging.getLogger("shms")
_root_logger.setLevel(logging.INFO)
_root_logger.addHandler(_console_handler)
_root_logger.addHandler(_file_handler)
_root_logger.propagate = False


def get_logger(name):
    return _root_logger.getChild(name)
