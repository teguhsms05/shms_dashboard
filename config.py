import os
import secrets
from logger import get_logger

_log = get_logger("config")
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "103.25.223.28"),
    "port": int(os.getenv("DB_PORT", "6543")),
    "dbname": os.getenv("DB_NAME", "shms"),
    "user": os.getenv("DB_USER", "dsi"),
    "password": os.getenv("DB_PASSWORD", "delta2026"),
}

DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "5"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "30"))

_configured_key = os.getenv("SECRET_KEY", "").strip()
if not _configured_key:
    _configured_key = secrets.token_hex(32)
    _log.warning("╔══════════════════════════════════════════════════════════╗")
    _log.warning("║  WARNING: SECRET_KEY is not set in .env!                ║")
    _log.warning("║  A random key has been generated for this session.     ║")
    _log.warning("║  Add SECRET_KEY=<key> to your .env file.               ║")
    _log.warning("╚══════════════════════════════════════════════════════════╝")
SECRET_KEY = _configured_key

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "shms/site01/sensor/#")

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "5005"))
APP_DEBUG = os.getenv("APP_DEBUG", "false").lower() == "true"

_internal_token = os.getenv("INTERNAL_API_TOKEN", "").strip()
if not _internal_token:
    _internal_token = secrets.token_hex(16)
    _log.warning(" INTERNAL_API_TOKEN not set. Generated temporary token.")
INTERNAL_API_TOKEN = _internal_token
