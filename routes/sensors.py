from flask import Blueprint, render_template, jsonify, request, redirect, url_for, session
from db import (
    get_sensors_list,
    latest_sensor_reading,
    sensor_timeseries,
    sensor_history,
    sensor_range,
    sensor_statistik_range,
    get_tilt_displacement_timeseries,
    get_tilt_displacement_latest,
    get_sensor_thresholds,
    get_acc_fft_history_query,
    get_latest_cable_stays,
    cable_stay_history,
    get_latest_cable_tensions,
    cable_tension_history_data,
    cable_tension_by_range,
    get_temp_sensor_locations,
    get_strain_sensor_locations,
    get_cable_tension_positions,
    save_sensor_position,
    batch_save_sensor_positions,
    atrhs_history,
)
from data_normalisation import compute_residuals_and_spc_limits
from routes.common import login_required, ACC_SENSORS, STRAIN_SENSORS

sensors_bp = Blueprint('sensors', __name__)


def _ts(row):
    return (row.get("source_ts") or row["time"]).isoformat() if row else None


def _serialize_stat_row(r):
    d = dict(r)
    if d.get("time") and hasattr(d["time"], "isoformat"):
        d["time"] = d["time"].isoformat()
    return d


# ── Sensor Thresholds ──
@sensors_bp.route("/api/sensor-thresholds/<sensor_id>")
def api_sensor_thresholds(sensor_id):
    row = get_sensor_thresholds(sensor_id)
    if not row:
        return jsonify({"th1": None, "th2": None, "th3": None})
    return jsonify({k: (float(v) if hasattr(v, '__float__') else v) for k, v in row.items()})


# ════════════════════════════════════════════
# ANEMOMETER 2D
# ════════════════════════════════════════════
S2D = "Anemometer 2D"

@sensors_bp.route("/anm2d")
def anm2d_page():
    sensors = get_sensors_list(S2D)
    if sensors:
        return redirect(f"/anm2d/{sensors[0]}")
    return render_template("anm2d.html", sensor_id=None)

@sensors_bp.route("/anm2d/<sensor_id>")
def anm2d_sensor_page(sensor_id):
    sensors = get_sensors_list(S2D)
    found = next((s for s in sensors if s.lower() == sensor_id.lower()), None)
    if not found:
        if sensors:
            return redirect(f"/anm2d/{sensors[0]}")
        return render_template("anm2d.html", sensor_id=None)
    return render_template("anm2d.html", sensor_id=found)

@sensors_bp.route("/api/anm2d/latest")
def api_anm2d_latest():
    r = latest_sensor_reading(S2D, request.args.get("sensor_id"))
    if not r: return jsonify({})
    return jsonify({"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"]})

@sensors_bp.route("/api/anm2d")
def api_anm2d():
    rows = sensor_timeseries(S2D, request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"]} for r in rows])

@sensors_bp.route("/api/anm2d/history")
def api_anm2d_history():
    rows = sensor_history(S2D, request.args.get("limit", 100, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"], "sensor_id": r["sensor_id"]} for r in rows])

@sensors_bp.route("/api/anm2d/statistik")
def api_anm2d_statistik():
    rows = sensor_statistik_range(S2D, None, None, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])

@sensors_bp.route("/api/anm2d/statistik/range")
def api_anm2d_statistik_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_statistik_range(S2D, s, e, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])

@sensors_bp.route("/api/anm2d/range")
def api_anm2d_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_range(S2D, s, e)
    return jsonify([{"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"], "sensor_id": r["sensor_id"]} for r in rows])


# ════════════════════════════════════════════
# ANEMOMETER 3D
# ════════════════════════════════════════════
S3D = "Anemometer 3D"

@sensors_bp.route("/anm3d")
@login_required
def anm3d_page():
    sensors = get_sensors_list(S3D)
    if sensors: return redirect(f"/anm3d/{sensors[0]}")
    return render_template("anm3d.html", sensor_id=None)

@sensors_bp.route("/anm3d/<sensor_id>")
@login_required
def anm3d_sensor_page(sensor_id):
    sensors = get_sensors_list(S3D)
    if sensor_id not in sensors:
        if sensors: return redirect(f"/anm3d/{sensors[0]}")
        return render_template("anm3d.html", sensor_id=None)
    return render_template("anm3d.html", sensor_id=sensor_id)

@sensors_bp.route("/api/anm3d/latest")
def api_anm3d_latest():
    r = latest_sensor_reading(S3D, request.args.get("sensor_id"))
    if not r: return jsonify({})
    return jsonify({"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"], "wind_elevation": r["wind_elevation"]})

@sensors_bp.route("/api/anm3d")
def api_anm3d():
    rows = sensor_timeseries(S3D, request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"], "wind_elevation": r["wind_elevation"]} for r in rows])

@sensors_bp.route("/api/anm3d/history")
def api_anm3d_history():
    rows = sensor_history(S3D, request.args.get("limit", 100, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"], "wind_elevation": r["wind_elevation"], "sensor_id": r["sensor_id"]} for r in rows])

@sensors_bp.route("/api/anm3d/statistik/range")
def api_anm3d_statistik_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_statistik_range(S3D, s, e, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])

@sensors_bp.route('/api/anm3d/<sensor_id>/latest')
def api_anm3d_latest_by_sensor(sensor_id):
    try:
        r = latest_sensor_reading(S3D, sensor_id)
        if r and r.get("time"): r["time"] = r["time"].isoformat()
        return jsonify(r or {})
    except Exception as e: return jsonify({"error": str(e)}), 500

@sensors_bp.route("/api/anm3d/range")
def api_anm3d_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_range(S3D, s, e)
    return jsonify([{"time": r["time"].isoformat(), "wind_speed": r["wind_speed"], "wind_direction": r["wind_direction"], "wind_elevation": r["wind_elevation"], "sensor_id": r["sensor_id"]} for r in rows])


# ════════════════════════════════════════════
# ATRHS
# ════════════════════════════════════════════
AT = "ATRH"

@sensors_bp.route("/atrhs")
def atrhs_page():
    sensors = get_sensors_list(AT)
    if sensors: return redirect(f"/atrhs/{sensors[0]}")
    return render_template("atrhs.html", sensor_id=None)

@sensors_bp.route("/atrhs/<sensor_id>")
def atrh_sensor_page(sensor_id):
    sensors = get_sensors_list(AT)
    if sensor_id not in sensors:
        if sensors: return redirect(f"/atrhs/{sensors[0]}")
        return render_template("atrhs.html", sensor_id=None)
    return render_template("atrhs.html", sensor_id=sensor_id)

@sensors_bp.route("/api/atrhs/latest")
def api_atrhs_latest():
    r = latest_sensor_reading(AT, request.args.get("sensor_id"))
    if not r: return jsonify({})
    return jsonify({"time": r["time"].isoformat(), "temperature": r["temperature"], "humidity": r["humidity"]})

@sensors_bp.route("/api/atrhs")
def api_atrhs():
    rows = sensor_timeseries(AT, request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "temperature": r["temperature"], "humidity": r["humidity"]} for r in rows])

@sensors_bp.route("/api/atrhs/history")
def api_atrh_history():
    rows = sensor_history(AT, request.args.get("limit", 100, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "temperature": r["temperature"], "humidity": r["humidity"], "sensor_id": r["sensor_id"]} for r in rows])

@sensors_bp.route("/api/atrhs/statistik/range")
def api_atrhs_statistik_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_statistik_range(AT, s, e, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])


# ════════════════════════════════════════════
# TILTMETER
# ════════════════════════════════════════════
TM = "Tiltmeter"

@sensors_bp.route("/tiltmeter")
@login_required
def tiltmeter_page():
    sensors = get_sensors_list(TM)
    if sensors: return redirect(f"/tiltmeter/{sensors[0]}")
    return render_template("tiltmeter.html", sensor_id=None)

@sensors_bp.route("/tiltmeter/<sensor_id>")
@login_required
def tiltmeter_sensor_page(sensor_id):
    sensors = get_sensors_list(TM)
    if sensor_id not in sensors:
        if sensors: return redirect(f"/tiltmeter/{sensors[0]}")
        return render_template("tiltmeter.html", sensor_id=None)
    return render_template("tiltmeter.html", sensor_id=sensor_id)

@sensors_bp.route("/api/tiltmeter/latest")
def api_tiltmeter_latest():
    r = latest_sensor_reading(TM, request.args.get("sensor_id"))
    if not r: return jsonify({})
    return jsonify({"time": r["time"].isoformat(), "angle_x": r["angle_x"], "angle_y": r["angle_y"]})

@sensors_bp.route("/api/tiltmeter")
def api_tiltmeter():
    rows = sensor_timeseries(TM, request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "angle_x": r["angle_x"], "angle_y": r["angle_y"]} for r in rows])

@sensors_bp.route("/api/tiltmeter/history")
def api_tiltmeter_history():
    rows = sensor_history(TM, request.args.get("limit", 100, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "angle_x": r["angle_x"], "angle_y": r["angle_y"], "sensor_id": r["sensor_id"]} for r in rows])

@sensors_bp.route("/api/tiltmeter/statistik/range")
def api_tiltmeter_statistik_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_statistik_range(TM, s, e, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])

@sensors_bp.route("/api/tiltmeter/displacement")
def api_tiltmeter_displacement():
    rows = get_tilt_displacement_timeseries(request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "sensor_id": r["sensor_id"], "deflection_mm": r["deflection_mm"]} for r in rows])

@sensors_bp.route("/api/tiltmeter/displacement/latest")
def api_tiltmeter_displacement_latest():
    rows = get_tilt_displacement_latest()
    return jsonify([{"time": r["time"].isoformat(), "sensor_id": r["sensor_id"], "deflection_mm": r["deflection_mm"]} for r in rows])

@sensors_bp.route("/api/tiltmeter/range")
def api_tiltmeter_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_range(TM, s, e)
    return jsonify([{"time": r["time"].isoformat(), "angle_x": r["angle_x"], "angle_y": r["angle_y"], "sensor_id": r["sensor_id"]} for r in rows])


# ════════════════════════════════════════════
# TEMPERATURE
# ════════════════════════════════════════════
TP = "Temperature"

@sensors_bp.route("/temp")
@login_required
def temp_page():
    sensors = get_sensors_list(TP)
    if sensors: return redirect(f"/temp/{sensors[0]}")
    return render_template("temp.html", sensor_id=None)

@sensors_bp.route("/temp/sensor-location")
@login_required
def temp_sensor_location():
    return render_template("temp_sensor_location.html")

@sensors_bp.route("/temp/<sensor_id>")
@login_required
def temp_sensor_page(sensor_id):
    sensors = get_sensors_list(TP)
    if sensor_id not in sensors:
        if sensors: return redirect(f"/temp/{sensors[0]}")
        return render_template("temp.html", sensor_id=None)
    return render_template("temp.html", sensor_id=sensor_id)

@sensors_bp.route("/api/temp/sensors")
def api_temp_sensors():
    return jsonify(get_sensors_list(TP))

@sensors_bp.route("/api/temp/latest")
def api_temp_latest():
    r = latest_sensor_reading(TP, request.args.get("sensor_id"))
    if not r: return jsonify({})
    return jsonify({"time": _ts(r), "temperature": r["temperature"]})

@sensors_bp.route("/api/temp/latest/<sensor_id>")
def api_temp_latest_by_sensor(sensor_id):
    r = latest_sensor_reading(TP, sensor_id)
    if not r: return jsonify({})
    return jsonify({"time": _ts(r), "temperature": r["temperature"]})

@sensors_bp.route("/api/temp")
def api_temp():
    rows = sensor_timeseries(TP, request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": _ts(r), "temperature": r["temperature"]} for r in rows])

@sensors_bp.route("/api/temp/history")
def api_temp_history():
    rows = sensor_history(TP, request.args.get("limit", 100, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": _ts(r), "temperature": r["temperature"], "sensor_id": r["sensor_id"]} for r in rows])

@sensors_bp.route("/api/temp/statistik/range")
def api_temp_statistik_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_statistik_range(TP, s, e, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])

@sensors_bp.route("/api/temp/sensor-locations")
def api_temp_sensor_locations():
    return jsonify(get_temp_sensor_locations())

@sensors_bp.route("/api/temp/sensor-locations", methods=["POST"])
def api_save_temp_sensor_position():
    d = request.get_json() or {}
    sid, px, py = d.get("sensor_id"), d.get("pos_x"), d.get("pos_y")
    if not sid or px is None or py is None: return jsonify({"ok": False, "error": "Missing fields"}), 400
    try: fpx, fpy = float(px), float(py)
    except (TypeError, ValueError) as e: return jsonify({"ok": False, "error": f"Invalid number: {e}"}), 400
    ok, err = save_sensor_position(sid, fpx, fpy)
    return jsonify({"ok": ok, "error": err})

@sensors_bp.route("/api/temp/sensor-locations/batch", methods=["POST"])
def api_batch_save_temp_sensor_positions():
    data = request.get_json() or []
    if not isinstance(data, list): return jsonify({"ok": False, "error": "Expected array"}), 400
    ok, err = batch_save_sensor_positions(data)
    return jsonify({"ok": ok, "error": err, "count": len(data)})


# ════════════════════════════════════════════
# STRAIN
# ════════════════════════════════════════════
ST = "Strain"

@sensors_bp.route("/strain")
@login_required
def strain_page():
    sensors = get_sensors_list(ST)
    if sensors: return redirect(f"/strain/{sensors[0]}")
    return render_template("strain.html", sensor_id=None)

@sensors_bp.route("/strain/sensor-location")
@login_required
def strain_sensor_location():
    return render_template("strain_sensor_location.html", is_admin=(session.get('role') == 'admin'))

@sensors_bp.route("/strain/<sensor_id>")
@login_required
def strain_sensor_page(sensor_id):
    sensors = get_sensors_list(ST)
    if sensor_id not in sensors:
        if sensors: return redirect(f"/strain/{sensors[0]}")
        return render_template("strain.html", sensor_id=None)
    return render_template("strain.html", sensor_id=sensor_id)

@sensors_bp.route("/api/strain/latest")
def api_strain_latest():
    r = latest_sensor_reading(ST, request.args.get("sensor_id"))
    if not r: return jsonify({})
    return jsonify({"time": _ts(r), "strain_ue": r["strain_ue"], "temp_c": r["temp_c"]})

@sensors_bp.route("/api/strain")
def api_strain():
    rows = sensor_timeseries(ST, request.args.get("limit", 300, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": _ts(r), "strain_ue": r["strain_ue"], "temp_c": r["temp_c"]} for r in rows])

@sensors_bp.route("/api/strain/history")
def api_strain_history():
    rows = sensor_history(ST, request.args.get("limit", 100, type=int), request.args.get("sensor_id"))
    return jsonify([{"time": _ts(r), "strain_ue": r["strain_ue"], "temp_c": r["temp_c"], "sensor_id": r["sensor_id"]} for r in rows])

@sensors_bp.route("/api/strain/statistik/range")
def api_strain_statistik_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_statistik_range(ST, s, e, request.args.get("sensor_id"))
    return jsonify([_serialize_stat_row(r) for r in rows])

@sensors_bp.route("/api/strain/sensor-locations")
def api_strain_sensor_locations():
    return jsonify(get_strain_sensor_locations())

@sensors_bp.route("/api/strain/sensor-locations", methods=["POST"])
@login_required
def api_save_sensor_position():
    if session.get('role') != 'admin':
        return jsonify({"ok": False, "error": "Admin access required"}), 403
    d = request.get_json() or {}
    sid, px, py = d.get("sensor_id"), d.get("pos_x"), d.get("pos_y")
    if not sid or px is None or py is None: return jsonify({"ok": False, "error": "Missing fields"}), 400
    try: fpx, fpy = float(px), float(py)
    except (TypeError, ValueError) as e: return jsonify({"ok": False, "error": f"Invalid number: {e}"}), 400
    ok, err = save_sensor_position(sid, fpx, fpy)
    return jsonify({"ok": ok, "error": err})

@sensors_bp.route("/api/strain/sensor-locations/batch", methods=["POST"])
@login_required
def api_batch_save_sensor_positions():
    if session.get('role') != 'admin':
        return jsonify({"ok": False, "error": "Admin access required"}), 403
    data = request.get_json() or []
    if not isinstance(data, list): return jsonify({"ok": False, "error": "Expected array"}), 400
    ok, err = batch_save_sensor_positions(data)
    return jsonify({"ok": ok, "error": err, "count": len(data)})


# ════════════════════════════════════════════
# STRAIN TRIGGER
# ════════════════════════════════════════════
@sensors_bp.route("/strain-trigger")
@login_required
def strain_trigger_page():
    sensor_ids = [s["str_id"] for s in STRAIN_SENSORS]
    if sensor_ids: return redirect(f"/strain-trigger/{sensor_ids[0]}")
    return render_template("strain_trigger.html", sensor_id=None)

@sensors_bp.route("/strain-trigger/<sensor_id>")
@login_required
def strain_trigger_sensor_page(sensor_id):
    sensor_ids = [s["str_id"] for s in STRAIN_SENSORS]
    if sensor_id.upper() not in [s.upper() for s in sensor_ids]:
        if sensor_ids: return redirect(f"/strain-trigger/{sensor_ids[0]}")
        return render_template("strain_trigger.html", sensor_id=None)
    return render_template("strain_trigger.html", sensor_id=sensor_id.upper())


# ════════════════════════════════════════════
# ACC KDI
# ════════════════════════════════════════════
@sensors_bp.route("/acc-kdi")
@login_required
def acc_kdi_page():
    if ACC_SENSORS: return redirect(f"/acc-kdi/{ACC_SENSORS[0]['acc_id']}")
    return render_template("acc_kdi.html", sensor_id=None)

@sensors_bp.route("/acc-kdi/<sensor_id>")
@login_required
def acc_kdi_sensor_page(sensor_id):
    found = next((s for s in ACC_SENSORS if s["acc_id"].upper() == sensor_id.upper()), None)
    if not found:
        if ACC_SENSORS: return redirect(f"/acc-kdi/{ACC_SENSORS[0]['acc_id']}")
        return render_template("acc_kdi.html", sensor_id=None)
    return render_template("acc_kdi.html", sensor_id=found["acc_id"], sensor_sn=found["sensor_id"])

@sensors_bp.route("/api/acc_kdi/statistics")
def api_acc_kdi_statistics():
    sensor_id = request.args.get("sensor_id")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    if not sensor_id: return jsonify([])
    data = get_acc_fft_history_query(sensor_id, start_date, end_date)
    for row in data:
        if row.get("time"): row["time"] = row["time"].isoformat()
    return jsonify(data)


# ════════════════════════════════════════════
# CABLE STAY
# ════════════════════════════════════════════
@sensors_bp.route("/cable-stay/realtime")
def cable_stay_realtime():
    return render_template("cable_stay_realtime.html")

@sensors_bp.route("/cable-stay/sensor/<sid>")
def cable_stay_sensor(sid):
    return render_template("cable_stay_sensor.html", sensor_id=sid)

@sensors_bp.route("/api/cable-stay/latest")
def api_cable_stay_latest():
    data = get_latest_cable_stays()
    for row in data:
        if row.get("time"): row["time"] = row["time"].isoformat()
    return jsonify(data)

@sensors_bp.route("/api/cable-stay/history")
def api_cable_stay_history():
    sid = request.args.get("sensor_id")
    limit = request.args.get("limit", default=100, type=int)
    if not sid: return jsonify([])
    data = cable_stay_history(sid, limit)
    for row in data:
        if row.get("time"): row["time"] = row["time"].isoformat()
    return jsonify(data)

@sensors_bp.route("/api/cable-stay/range")
def api_cable_stay_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e: return jsonify([])
    rows = sensor_range("Cable Stay", s, e, request.args.get("sensor_id"))
    return jsonify([{"time": r["time"].isoformat(), "force": r["force"], "stress": r["stress"], "temperature": r["temperature"], "sensor_id": r["sensor_id"]} for r in rows])


# ════════════════════════════════════════════
# CABLE TENSION (FFT-based)
# ════════════════════════════════════════════
@sensors_bp.route("/cable-tension/realtime")
def cable_tension_realtime():
    from cable_tension import TENSION_WARN_KN, TENSION_CRITICAL_KN
    return render_template(
        "cable_tension_realtime.html",
        tension_warn_kn=TENSION_WARN_KN,
        tension_critical_kn=TENSION_CRITICAL_KN,
        is_admin=(session.get('role') == 'admin'),
    )


@sensors_bp.route("/api/cable-tension/positions")
def api_cable_tension_positions():
    return jsonify(get_cable_tension_positions())


@sensors_bp.route("/api/cable-tension/positions/batch", methods=["POST"])
@login_required
def api_batch_save_cable_tension_positions():
    if session.get('role') != 'admin':
        return jsonify({"ok": False, "error": "Admin access required"}), 403
    data = request.get_json() or []
    if not isinstance(data, list):
        return jsonify({"ok": False, "error": "Expected array"}), 400
    ok, err = batch_save_sensor_positions(data)
    return jsonify({"ok": ok, "error": err, "count": len(data)})


@sensors_bp.route("/cable-tension/sensor/<sid>")
def cable_tension_sensor(sid):
    from cable_tension import TENSION_WARN_KN, TENSION_CRITICAL_KN
    return render_template(
        "cable_tension_sensor.html",
        sensor_id=sid,
        tension_warn_kn=TENSION_WARN_KN,
        tension_critical_kn=TENSION_CRITICAL_KN,
    )


@sensors_bp.route("/api/cable-tension/latest")
def api_cable_tension_latest():
    data = get_latest_cable_tensions()
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)


@sensors_bp.route("/api/cable-tension/history")
def api_cable_tension_history():
    sid = request.args.get("sensor_id")
    limit = request.args.get("limit", default=100, type=int)
    if not sid:
        return jsonify([])
    data = cable_tension_history_data(sid, limit)
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)


@sensors_bp.route("/api/cable-tension/range")
def api_cable_tension_range():
    s, e = request.args.get("start"), request.args.get("end")
    if not s or not e:
        return jsonify([])
    rows = cable_tension_by_range(s, e, request.args.get("sensor_id"))
    result = []
    for r in rows:
        result.append({
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "f1": r["f1"], "f2": r["f2"], "f3": r["f3"],
            "t1": r["t1"], "t2": r["t2"], "t3": r["t3"],
            "tension_avg": r["tension_avg"],
        })
    return jsonify(result)


@sensors_bp.route("/api/cable-tension/normalized")
def api_cable_tension_normalized():
    """
    Data Normalisation & Thermal Compensation endpoint.
    Joins cable tension history with nearest ATRH temperature readings,
    fits a linear thermal model, and returns residuals with 3-sigma SPC limits.
    Based on Chapter 12 of Farrar & Worden (2013).
    """
    sid = request.args.get("sensor_id")
    limit = request.args.get("limit", default=500, type=int)
    target = request.args.get("target", default="tension_avg")  # tension_avg, f1, f2, f3

    if not sid:
        return jsonify({"error": "sensor_id is required"}), 400

    # 1) Fetch cable tension history (ordered DESC, we reverse for chronological)
    ct_rows = cable_tension_history_data(sid, limit)
    ct_rows = list(reversed(ct_rows))  # oldest first

    if not ct_rows:
        return jsonify({"error": "No cable tension data found"}), 404

    # 2) Fetch ATRH temperature history for the same time window
    atrh_rows = atrhs_history(limit=limit * 2)  # fetch more to ensure coverage
    atrh_rows = list(reversed(atrh_rows))  # oldest first

    # Build a temperature lookup: for each cable tension timestamp,
    # find the nearest ATRH temperature reading (within 30 minutes)
    from datetime import timedelta
    temps_paired = []
    values_paired = []
    timestamps = []

    for ct in ct_rows:
        ct_time = ct["time"]
        ct_val = ct.get(target)
        if ct_val is None:
            continue

        # Find nearest ATRH reading
        best_temp = None
        best_delta = timedelta(minutes=30)
        for atrh in atrh_rows:
            delta = abs(ct_time - atrh["time"])
            if delta < best_delta:
                best_delta = delta
                best_temp = atrh.get("temperature")

        if best_temp is not None:
            temps_paired.append(float(best_temp))
            values_paired.append(float(ct_val))
            timestamps.append(ct_time.isoformat())

    if len(temps_paired) < 3:
        return jsonify({"error": "Insufficient paired data (need ≥3 points)"}), 400

    # 3) Compute normalisation: regression, residuals, SPC limits
    result = compute_residuals_and_spc_limits(temps_paired, values_paired)

    # 4) Build response with timestamps
    data_points = []
    for i in range(len(timestamps)):
        data_points.append({
            "time": timestamps[i],
            "temperature": temps_paired[i],
            "raw_value": values_paired[i],
            "predicted": result["predicted"][i],
            "residual": result["residuals"][i],
        })

    return jsonify({
        "sensor_id": sid,
        "target_field": target,
        "model": {
            "slope": result["slope"],
            "intercept": result["intercept"],
            "r2_score": result["r2_score"],
        },
        "spc": {
            "mean_residual": result["mean_residual"],
            "std_residual": result["std_residual"],
            "ucl_3sigma": result["ucl_3sigma"],
            "lcl_3sigma": result["lcl_3sigma"],
            "outliers_count": result["outliers_count"],
        },
        "data": data_points,
    })
