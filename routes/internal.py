from flask import Blueprint, jsonify, request
from config import INTERNAL_API_TOKEN

internal_bp = Blueprint('internal', __name__)


@internal_bp.route("/api/internal/emit", methods=["POST"])
def internal_emit():
    token = request.headers.get("X-Internal-Token", "")
    if not token or token != INTERNAL_API_TOKEN:
        return jsonify({"status": "error", "message": "unauthorized"}), 403

    from flask import current_app
    socketio = current_app.extensions.get('socketio')
    if not socketio:
        return jsonify({"status": "error", "message": "SocketIO not initialized"}), 500

    data = request.json
    event = data.get("event")
    payload = data.get("payload")
    if event and payload:
        socketio.emit(event, payload)
        return jsonify({"status": "sent"}), 200
    return jsonify({"status": "error"}), 400
