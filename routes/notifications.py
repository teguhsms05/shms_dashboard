from flask import Blueprint, jsonify, request
from db import get_notifications, add_notification, mark_notifications_read, delete_notification

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route("/api/notifications")
def api_notifications():
    limit = request.args.get("limit", 20, type=int)
    data = get_notifications(limit)
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)


@notifications_bp.route("/api/notifications/mark-read", methods=["POST"])
def api_mark_notifications_read():
    mark_notifications_read()
    return jsonify({"status": "ok"})


@notifications_bp.route("/api/notifications/add", methods=["POST"])
def api_add_notification():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    add_notification(
        title=data.get("title", "Alert"),
        message=data.get("message", ""),
        status=data.get("status", "info"),
        sensor_id=data.get("sensor_id")
    )
    return jsonify({"status": "ok"})


@notifications_bp.route("/api/notifications/<int:notif_id>", methods=["DELETE"])
def api_delete_notification(notif_id):
    delete_notification(notif_id)
    return jsonify({"status": "ok"})
