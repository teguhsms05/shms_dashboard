from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify
from db import (
    get_bridge_info, update_bridge_info,
    get_sensor_info, add_sensor_info, update_sensor_info,
    get_logger_info,
    get_sensor_status_overview, get_sensor_realtime_query_data,
    get_email_config, get_email_recipients, save_email_config,
    add_email_recipient, update_email_recipient, delete_email_recipient,
    get_weekly_years, get_weekly_months, get_weekly_periods,
)
from routes.common import login_required

admin_bp = Blueprint('admin', __name__)


# ── Bridge Info ──
@admin_bp.route("/bridge-info")
@login_required
def bridge_info():
    data = get_bridge_info()
    return render_template("bridge_info.html", data=data)


@admin_bp.route("/api/bridge-info", methods=["GET"])
def api_bridge_info():
    data = get_bridge_info()
    if not data:
        return jsonify({})
    result = {}
    for k, v in data.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return jsonify(result)


@admin_bp.route("/api/bridge-info", methods=["POST"])
@login_required
def api_update_bridge_info():
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400
    if update_bridge_info(data):
        return jsonify({"status": "ok"})
    return jsonify({"error": "Failed to update"}), 500


# ── System Documents ──
@admin_bp.route("/system-doc")
def system_doc():
    return render_template("system_doc.html")


# ── Monitoring Items ──
@admin_bp.route("/monitoring-items")
def monitoring_items():
    return render_template("monitoring_items.html")


# ── Sensor Info ──
@admin_bp.route("/sensor-info", methods=["GET", "POST"])
@login_required
def sensor_info():
    if request.method == "POST":
        data = {
            "id": request.form.get("id"),
            "sensor_id": request.form.get("sensor_id"),
            "sensor_code": request.form.get("sensor_code"),
            "channel_code": request.form.get("channel_code"),
            "logger": request.form.get("logger"),
            "channel_index": request.form.get("channel_index", type=int),
            "sensor_type": request.form.get("sensor_type"),
            "sensor_group": request.form.get("sensor_group"),
            "sampling_hz": request.form.get("sampling_hz", type=float),
            "direction": request.form.get("direction"),
            "location": request.form.get("location"),
            "operation": request.form.get("operation"),
            "trigger_setting": request.form.get("trigger_setting"),
            "manufacturer": request.form.get("manufacturer"),
            "model": request.form.get("model"),
            "serial_no": request.form.get("serial_no"),
            "install_at": request.form.get("install_at"),
            "ip_address": request.form.get("ip_address"),
            "port": request.form.get("port", type=int),
            "th1": request.form.get("th1", type=float),
            "th2": request.form.get("th2", type=float),
            "th1_tension": request.form.get("th1_tension", type=float),
            "th2_tension": request.form.get("th2_tension", type=float),
            "th1_compression": request.form.get("th1_compression", type=float),
            "th2_compression": request.form.get("th2_compression", type=float),
        }
        if data["id"]:
            if update_sensor_info(data):
                flash("Sensor info updated successfully!", "success")
            else:
                flash("Failed to update sensor info.", "error")
        else:
            if add_sensor_info(data):
                flash("Sensor info added successfully!", "success")
            else:
                flash("Failed to add sensor info.", "error")
        return redirect(url_for("admin.sensor_info"))

    rows = get_sensor_info()
    for r in rows:
        if r.get("install_at") and hasattr(r["install_at"], "isoformat"):
            r["install_at"] = r["install_at"].strftime("%Y-%m-%d")
    return render_template("sensor_info.html", rows=rows)


# ── Logger Info ──
@admin_bp.route("/logger-info")
def logger_info():
    rows = get_logger_info()
    return render_template("logger_info.html", rows=rows)


# ── Sensor Status ──
@admin_bp.route("/sensor-status")
def sensor_status_page():
    return render_template("sensor_status.html")


@admin_bp.route("/api/sensor-status")
def api_sensor_status():
    data = get_sensor_status_overview()
    return jsonify(data)


@admin_bp.route("/api/sensor-status/query/<sensor_id>")
def api_sensor_status_query(sensor_id):
    data = get_sensor_realtime_query_data(sensor_id)
    return jsonify(data)


# ── Email Config ──
@admin_bp.route("/email-config", methods=["GET", "POST"])
@login_required
def email_config_page():
    if request.method == "POST":
        data = {
            "smtp_host": request.form.get("smtp_host", "smtp.gmail.com"),
            "smtp_port": request.form.get("smtp_port", 587, type=int),
            "smtp_user": request.form.get("smtp_user", ""),
            "smtp_password": request.form.get("smtp_password", ""),
            "from_email": request.form.get("from_email", ""),
            "is_active": request.form.get("is_active") == "on",
        }
        if save_email_config(data):
            flash("Email configuration saved successfully!", "success")
        else:
            flash("Failed to save email configuration.", "error")
        return redirect(url_for("admin.email_config_page"))

    config = get_email_config()
    recipients = get_email_recipients()
    return render_template("email_config.html", config=config, recipients=recipients)


@admin_bp.route("/api/email-recipients", methods=["POST"])
@login_required
def api_add_email_recipient():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    if not name or not email:
        return jsonify({"error": "Name and email are required"}), 400
    if add_email_recipient(name, email):
        return jsonify({"status": "ok"})
    return jsonify({"error": "Failed to add recipient (email may already exist)"}), 400


@admin_bp.route("/api/email-recipients/<int:recipient_id>", methods=["PUT"])
@login_required
def api_update_email_recipient(recipient_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    is_active = data.get("is_active", True)
    if not name or not email:
        return jsonify({"error": "Name and email are required"}), 400
    if update_email_recipient(recipient_id, name, email, is_active):
        return jsonify({"status": "ok"})
    return jsonify({"error": "Failed to update recipient"}), 400


@admin_bp.route("/api/email-recipients/<int:recipient_id>", methods=["DELETE"])
@login_required
def api_delete_email_recipient(recipient_id):
    delete_email_recipient(recipient_id)
    return jsonify({"status": "ok"})


# ── Weekly Periods ──
@admin_bp.route("/api/weekly_periods/years")
def api_weekly_years():
    return jsonify(get_weekly_years())


@admin_bp.route("/api/weekly_periods/months")
def api_weekly_months():
    year = request.args.get("year")
    if not year:
        return jsonify([])
    return jsonify(get_weekly_months(year))


@admin_bp.route("/api/weekly_periods/weeks")
def api_weekly_weeks():
    year = request.args.get("year")
    month = request.args.get("month")
    if not year or not month:
        return jsonify([])
    rows = get_weekly_periods(year, month)
    return jsonify([
        {
            "periode_label": r["periode_label"],
            "start_date": r["start_date"].isoformat(),
            "end_date": r["end_date"].isoformat()
        }
        for r in rows
    ])
