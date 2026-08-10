from flask import Blueprint, render_template, jsonify, request
from db import (
    get_latest_health, get_dashboard_summary, get_modal_trend,
    get_latest_alerts, get_mode_shape, get_modal_spectrum,
    get_sensors_list,
    get_sensor_sampling_hz, get_sensor_type_by_id, correlation_resample_multi,
)
from routes.common import login_required

health_bp = Blueprint('health', __name__)


# ── Accelerometer ──
@health_bp.route("/accelerometer")
@login_required
def accelerometer_page():
    return render_template("accelerometer.html")


# ── Vibration ──
@health_bp.route("/vibration")
@login_required
def vibration_page():
    return render_template("vibration.html")


# ── Correlation ──
@health_bp.route("/correlation")
@login_required
def correlation_page():
    return render_template("correlation.html",
                           anm2d_sensors=get_sensors_list("Anemometer 2D"),
                           anm3d_sensors=get_sensors_list("Anemometer 3D"),
                           atrh_sensors=get_sensors_list("ATRH"),
                           temp_sensors=get_sensors_list("Temperature"),
                           tiltmeter_sensors=get_sensors_list("Tiltmeter"),
                           strain_sensors=get_sensors_list("Strain"),
                           cable_sensors=get_sensors_list("Cable Stay"))


@health_bp.route("/api/correlation/resample", methods=["POST"])
def api_correlation_resample():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    sensor_ids = data.get("sensor_ids", [])
    start_str = data.get("start")
    end_str = data.get("end")

    if not sensor_ids or not start_str or not end_str:
        return jsonify({"error": "Missing sensor_ids, start, or end"}), 400

    sampling_rates = []
    for sid in sensor_ids:
        hz = get_sensor_sampling_hz(sid)
        if hz and hz > 0:
            sampling_rates.append(hz)

    if not sampling_rates:
        return jsonify({"error": "No valid sampling rates found for selected sensors"}), 400

    min_hz = min(sampling_rates)
    interval_sec = 1.0 / min_hz

    result = {}
    for sid in sensor_ids:
        sensor_type = get_sensor_type_by_id(sid)
        if not sensor_type:
            continue

        columns = []
        if sensor_type == 'Strain':
            columns = ['strain_ue', 'temp_c']
        elif sensor_type in ('Anemometer 2D', 'Anemometer 3D'):
            columns = ['wind_speed', 'wind_direction']
        elif sensor_type == 'ATRH':
            columns = ['temperature', 'humidity']
        elif sensor_type == 'Structural Temperature':
            columns = ['temperature']
        elif sensor_type == 'Tiltmeter':
            columns = ['angle_x', 'angle_y']
        elif sensor_type == 'Cable Stay':
            columns = ['force', 'stress', 'temperature']

        if not columns:
            continue

        rows = correlation_resample_multi(sid, start_str, end_str, interval_sec, columns)
        result[sid] = rows

    return jsonify({"interval_sec": round(interval_sec, 2), "data": result})


# ── Structural Health APIs ──
@health_bp.route("/api/health/latest")
def api_latest_health():
    row = get_latest_health()
    if not row:
        return jsonify({})
    if row.get("analysis_time"):
        row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(row)


@health_bp.route("/api/health/dashboard-summary")
def api_dashboard_summary():
    data = get_dashboard_summary()
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)


@health_bp.route("/api/health/modal-trend")
def api_modal_trend():
    mode_number = request.args.get("mode_number", type=int)
    if mode_number is None:
        return jsonify([])
    data = get_modal_trend(mode_number)
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)


@health_bp.route("/api/health/latest-alerts")
def api_latest_alerts():
    data = get_latest_alerts()
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)


@health_bp.route("/api/health/mode-shape")
def api_mode_shape():
    mode_number = request.args.get("mode_number", type=int)
    if mode_number is None:
        return jsonify({})
    row = get_mode_shape(mode_number)
    if row:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
        return jsonify(row)
    return jsonify({})


@health_bp.route("/api/health/spectrum")
def api_modal_spectrum():
    data = get_modal_spectrum()
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)
