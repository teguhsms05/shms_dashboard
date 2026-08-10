from flask import Blueprint, render_template, jsonify, request, redirect, url_for
from db import (
    get_bridge_info,
    sensor_range,
    monitoring_summary, monthly_sensor_stats, monthly_sensor_timeseries,
    monthly_avg_readings, get_storage_info,
)
from routes.common import login_required

reports_bp = Blueprint('reports', __name__)


@reports_bp.route("/reports")
def reports_page():
    return redirect(url_for("reports.monthly_report_page"))


@reports_bp.route("/reports/weekly")
def weekly_report_page():
    bridge_data = get_bridge_info()
    return render_template("report_weekly.html", bridge_data=bridge_data)


@reports_bp.route("/reports/monthly")
def monthly_report_page():
    bridge_data = get_bridge_info()
    return render_template("report_monthly.html", bridge_data=bridge_data)


@reports_bp.route("/api/monthly-avg")
def api_monthly_avg():
    months = request.args.get("months", 12, type=int)
    data = monthly_avg_readings(months)
    return jsonify(data)


@reports_bp.route("/api/atrh/range")
def api_atrh_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_range("ATRH", s, e)
    return jsonify([{"time": r["time"].isoformat(), "temperature": r["temperature"], "humidity": r["humidity"], "sensor_id": r["sensor_id"]} for r in rows])


@reports_bp.route("/api/temp/range")
def api_temp_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_range("Temperature", s, e)
    return jsonify([{"time": (r.get("source_ts") or r["time"]).isoformat(), "temperature": r["temperature"], "sensor_id": r["sensor_id"]} for r in rows])


@reports_bp.route("/api/monitoring-summary")
def api_monitoring_summary():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    data = monitoring_summary(start, end)
    return jsonify(data)


@reports_bp.route("/api/report/monthly-sensor-stats")
def api_monthly_sensor_stats():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    data = monthly_sensor_stats(start, end)
    return jsonify(data)


@reports_bp.route("/api/report/monthly-sensor-timeseries")
def api_monthly_sensor_timeseries():
    sensor_id = request.args.get("sensor_id")
    start = request.args.get("start")
    end = request.args.get("end")
    if not sensor_id or not start or not end:
        return jsonify([])
    data = monthly_sensor_timeseries(sensor_id, start, end)
    return jsonify(data)


@reports_bp.route("/api/storage")
def api_storage():
    rows = get_storage_info()
    data = []
    for r in rows:
        data.append({
            "disk_name": r["disk_name"],
            "total": r["disk_total"],
            "used": r["disk_used"],
            "free": r["disk_free"],
            "percent": r["disk_percentage"],
            "updated": r["local_datetime"].isoformat() if r["local_datetime"] else None
        })
    return jsonify(data)
