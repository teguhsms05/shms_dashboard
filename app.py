import math
from flask import Flask, render_template, jsonify, request, redirect, session, flash, url_for, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room
from db import *
from datetime import datetime, timedelta
import functools
import secrets
import random
import time
import socket
import json
import os
from collections import deque
import glob
from cable_tension import TENSION_WARN_KN, TENSION_CRITICAL_KN
from data_normalisation import compute_residuals_and_spc_limits

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.secret_key = "shms-barelang-secret-2026"
app.permanent_session_lifetime = timedelta(days=30)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

print(f"[{datetime.now()}] --- app.py MODULE LOADED ---")

# ── Login-required decorator ──
def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated

# Inject `sensors` + helpers into every template
@app.context_processor
def inject_sensors():
    extra = {"current_year": datetime.now().year}
    try:
        extra.update(
            temp_sensors=get_temp_sensors(),
            atrh_sensors=get_atrhs_sensors(),
            cable_sensors=get_cable_stay_sensors(),
            cable_tension_sensors=get_cable_tension_sensors(),
            anm2d_sensors=get_anm2d_sensors(),
            anm3d_sensors=get_anm3d_sensors(),
            tiltmeter_sensors=get_tiltmeter_sensors(),
            strain_sensors=get_sensors_list("Strain"),
            strain_trigger_sensors=[s["str_id"] for s in STRAIN_SENSORS],
            acc_kdi_sensors=[s["acc_id"] for s in ACC_SENSORS]
        )
    except Exception as e:
        print("⚠️ inject_sensors ERROR:", e)
        extra.update(temp_sensors=[], atrh_sensors=[], cable_sensors=[], cable_tension_sensors=[], anm2d_sensors=[], anm3d_sensors=[], tiltmeter_sensors=[], strain_sensors=[], strain_trigger_sensors=[], acc_kdi_sensors=[])
    return extra

# =========================
# Login / Logout
# =========================
@app.route("/login", methods=["GET", "POST"])
def login_page():
    # Auto-login if session is active
    if session.get("logged_in"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        remember = request.form.get("remember")  # "on" if checked, None if not
        
        user_record = get_user_by_username(username)
        if user_record and user_record["password"] == password:
            session.permanent = bool(remember)
            session["logged_in"] = True
            session["username"]   = username
            session["role"] = user_record["role"]
            flash(f"Welcome back, {username}!", "success")
            return redirect(url_for("dashboard"))
        else:
            flash("Invalid username or password.", "error")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("login_page"))

# =========================
# Dashboard
# =========================
@app.route("/")
@login_required
def dashboard():
    return render_template("home.html")

@app.route("/threshold", methods=["GET", "POST"])
@login_required
def threshold_page():
    if request.method == "POST":
        sensor = request.form.get("sensor")
        min_value = request.form.get("min_value")
        max_value = request.form.get("max_value")
        # TODO: Save threshold to DB or config (implement as needed)
        flash(f"Threshold for {sensor} saved: min={min_value}, max={max_value}", "success")
        return redirect(url_for("threshold_page"))
    return render_template("threshold.html")
@app.route("/dsi-project")
@login_required
def dsi_project():
    return render_template("dsi_project.html")

# =========================
# Cross Correlation
# =========================
@app.route("/correlation")
@login_required
def correlation_page():
    return render_template("correlation.html")

# =========================
# Bridge Info
# =========================
@app.route("/bridge-info")
def bridge_info():
    return render_template("bridge_info.html")

# =========================
# System Documents
# =========================
@app.route("/system-doc")
def system_doc():
    return render_template("system_doc.html")

# =========================
# Monitoring Items
# =========================
@app.route("/monitoring-items")
def monitoring_items():
    return render_template("monitoring_items.html")

# =========================
# User Management
# =========================
@app.route("/user-management", methods=["GET", "POST"])
@login_required
def user_management():
    # Optional: ensure only admin can access this page
    if session.get("role") != "admin" and session.get("username") != "admin":
        flash("You do not have permission to access User Management.", "error")
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        action = request.form.get("action")
        if action == "delete":
            user_id = request.form.get("id")
            if delete_user(user_id):
                flash("User deleted successfully!", "success")
            else:
                flash("Failed to delete user.", "error")
        else:
            data = {
                "id": request.form.get("id"),
                "username": request.form.get("username"),
                "password": request.form.get("password"),
                "role": request.form.get("role")
            }
            if data["id"]:
                if update_user(data):
                    flash("User updated successfully!", "success")
                else:
                    flash("Failed to update user.", "error")
            else:
                if add_user(data):
                    flash("User added successfully!", "success")
                else:
                    flash("Failed to add user.", "error")
        return redirect(url_for("user_management"))

    users = get_all_users()
    return render_template("user_management.html", users=users)

# =========================
# Sensor Info New (Input & Table)
# =========================
@app.route("/sensor-info-new", methods=["GET", "POST"])
@login_required
def sensor_info_new():
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
            "th3": request.form.get("th3", type=float),
        }
        
        if data["id"]:
            # UPDATE
            if update_sensor_info(data):
                flash("Sensor info updated successfully!", "success")
            else:
                flash("Failed to update sensor info.", "error")
        else:
            # ADD
            if add_sensor_info(data):
                flash("Sensor info added successfully!", "success")
            else:
                flash("Failed to add sensor info.", "error")
                
        return redirect(url_for("sensor_info_new"))
    
    rows = get_sensor_info()
    # Convert dates to string for JSON compatibility in the template
    for r in rows:
        if r.get("install_at") and hasattr(r["install_at"], "isoformat"):
            r["install_at"] = r["install_at"].strftime("%Y-%m-%d")
            
    return render_template("sensor_info_new.html", rows=rows)

# =========================
# Sensor / Channel Info
# =========================
@app.route("/sensor-info")
def sensor_info():
    rows = get_sensor_info()
    return render_template("sensor_info.html", rows=rows)

# =========================
# Logger Info
# =========================
@app.route("/logger-info")
def logger_info():
    rows = get_logger_info()
    return render_template("logger_info.html", rows=rows)
# =========================================================================================
# =========================
# Anemometer 2D Page
# =========================
@app.route("/anm2d")
def anm2d_page():
    sensors = get_anm2d_sensors()
    if sensors:
        return redirect(f"/anm2d/{sensors[0]}")
    return render_template("anm2d.html", sensor_id=None)

@app.route("/anm2d/<sensor_id>")
def anm2d_sensor_page(sensor_id):
    sensors = get_anm2d_sensors()
    # Case-insensitive check
    found_id = next((s for s in sensors if s.lower() == sensor_id.lower()), None)
    if not found_id:
        if sensors:
            return redirect(f"/anm2d/{sensors[0]}")
        return render_template("anm2d.html", sensor_id=None)
    return render_template("anm2d.html", sensor_id=found_id)

# =========================
# API – Anemometer 2D Latest (REALTIME)
# dipanggil tiap 1 detik
# =========================
@app.route("/api/anm2d/latest")
def api_anm2d_latest():
    sensor_id = request.args.get("sensor_id")
    row = latest_anm2d(sensor_id)
    if not row:
        return jsonify({})

    return jsonify({
        "time": row["time"].isoformat(),
        "wind_speed": row["wind_speed"],
        "wind_direction": row["wind_direction"]
    })

# =========================
# API – Anemometer 2D Timeseries
# untuk zoom / history
# =========================
@app.route("/api/anm2d")
def api_anm2d():
    limit = request.args.get("limit", 300, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = anm2d_timeseries(limit=limit, sensor_id=sensor_id)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "wind_speed": r["wind_speed"],
            "wind_direction": r["wind_direction"]
        }
        for r in rows
    ])


# =========================
# API – Anemometer 2D History (for data table)
# =========================
@app.route("/api/anm2d/history")
def api_anm2d_history():
    limit = request.args.get("limit", 100, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = anm2d_history(limit, sensor_id)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "wind_speed": r["wind_speed"],
            "wind_direction": r["wind_direction"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

@app.route("/api/sensor-thresholds/<sensor_id>")
def api_sensor_thresholds(sensor_id):
    row = get_sensor_thresholds(sensor_id)
    if not row:
        return jsonify({"th1": None, "th2": None, "th3": None})
    
    # Convert Decimals to float for JSON compatibility
    data = {}
    for k, v in row.items():
        if hasattr(v, '__float__'):
            data[k] = float(v)
        else:
            data[k] = v
    return jsonify(data)

@app.route("/api/anm2d/statistik")
def api_anm2d_statistik():
    limit = request.args.get("limit", 100, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = anm2d_statistik_history(limit, sensor_id)
    return jsonify([
        {
            "id": r["id"],
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "sensor_type": r["sensor_type"],
            "unit": r["unit"],
            "min_wind_speed": r["min_wind_speed"],
            "max_wind_speed": r["max_wind_speed"],
            "avg_wind_speed": r["avg_wind_speed"],
            "min_wind_direction": r["min_wind_direction"],
            "max_wind_direction": r["max_wind_direction"],
            "avg_wind_direction": r["avg_wind_direction"],
            "th1": r["th1"],
            "th2": r["th2"]
        }
        for r in rows
    ])

@app.route("/api/anm2d/statistik/range")
def api_anm2d_statistik_range():
    start = request.args.get("start")
    end = request.args.get("end")
    sensor_id = request.args.get("sensor_id")
    if not start or not end:
        return jsonify([])
    rows = anm2d_statistik_by_range(start, end, sensor_id)
    return jsonify([
        {
            "id": r["id"],
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "sensor_type": r["sensor_type"],
            "unit": r["unit"],
            "min_wind_speed": r["min_wind_speed"],
            "max_wind_speed": r["max_wind_speed"],
            "avg_wind_speed": r["avg_wind_speed"],
            "min_wind_direction": r["min_wind_direction"],
            "max_wind_direction": r["max_wind_direction"],
            "avg_wind_direction": r["avg_wind_direction"],
            "th1": r["th1"],
            "th2": r["th2"]
        }
        for r in rows
    ])

@app.route("/api/anm3d/statistik/range")
def api_anm3d_statistik_range():
    start = request.args.get("start")
    end = request.args.get("end")
    sensor_id = request.args.get("sensor_id")
    if not start or not end:
        return jsonify([])
    rows = anm3d_statistik_by_range(start, end, sensor_id)
    return jsonify([
        {
            "id": r["id"],
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "sensor_type": r["sensor_type"],
            "unit": r["unit"],
            "min_wind_speed": r["min_wind_speed"],
            "max_wind_speed": r["max_wind_speed"],
            "avg_wind_speed": r["avg_wind_speed"],
            "min_wind_direction": r["min_wind_direction"],
            "max_wind_direction": r["max_wind_direction"],
            "avg_wind_direction": r["avg_wind_direction"],
            "min_wind_elevation": r["min_wind_elevation"],
            "max_wind_elevation": r["max_wind_elevation"],
            "avg_wind_elevation": r["avg_wind_elevation"],
            "th1": r.get("th1"),
            "th2": r.get("th2")
        }
        for r in rows
    ])

@app.route("/api/atrhs/statistik/range")
def api_atrhs_statistik_range():
    start = request.args.get("start")
    end = request.args.get("end")
    sensor_id = request.args.get("sensor_id")
    if not start or not end:
        return jsonify([])
    rows = atrhs_statistik_by_range(start, end, sensor_id)
    return jsonify([
        {
            "id": r["id"],
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "sensor_type": r["sensor_type"],
            "unit": r["unit"],
            "min_temperature": r["min_temperature"],
            "max_temperature": r["max_temperature"],
            "avg_temperature": r["avg_temperature"],
            "min_humidity": r["min_humidity"],
            "max_humidity": r["max_humidity"],
            "avg_humidity": r["avg_humidity"],
            "th1": r.get("th1"),
            "th2": r.get("th2")
        }
        for r in rows
    ])

@app.route("/api/temp/statistik/range")
def api_temp_statistik_range():
    start = request.args.get("start")
    end = request.args.get("end")
    sensor_id = request.args.get("sensor_id")
    if not start or not end:
        return jsonify([])
    rows = temp_statistik_by_range(start, end, sensor_id)
    return jsonify([
        {
            "id": r["id"],
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "sensor_type": r["sensor_type"],
            "unit": r["unit"],
            "min_temperature": r["min_temperature"],
            "max_temperature": r["max_temperature"],
            "avg_temperature": r["avg_temperature"]
        }
        for r in rows
    ])


@app.route('/api/anm3d/<sensor_id>/latest')
def api_anm3d_latest_by_sensor(sensor_id):
    """API untuk latest data ANM3D per sensor tertentu (untuk Dashboard Home)."""
    try:
        row = latest_anm3d(sensor_id)
        if row:
            if row.get("time"):
                row["time"] = row["time"].isoformat()
            return jsonify(row)
        return jsonify({})
    except Exception as e:
        print(f"Error api_anm3d_latest_by_sensor: {e}")
        return jsonify({"error": str(e)}), 500

# =========================================================================================
# =========================
# Anemometer 3D Page
# =========================
@app.route("/anm3d")
@login_required
def anm3d_page():
    sensors = get_anm3d_sensors()
    if sensors:
        return redirect(f"/anm3d/{sensors[0]}")
    return render_template("anm3d.html", sensor_id=None)

@app.route("/anm3d/<sensor_id>")
@login_required
def anm3d_sensor_page(sensor_id):
    sensors = get_anm3d_sensors()
    if sensor_id not in sensors:
        if sensors:
            return redirect(f"/anm3d/{sensors[0]}")
        return render_template("anm3d.html", sensor_id=None)
    return render_template("anm3d.html", sensor_id=sensor_id)

# =========================
# API – Anemometer 3D Latest (REALTIME)
# =========================
@app.route("/api/anm3d/latest")
def api_anm3d_latest():
    sensor_id = request.args.get("sensor_id")
    row = latest_anm3d(sensor_id)
    if not row:
        return jsonify({})
    return jsonify({
        "time":           row["time"].isoformat(),
        "wind_speed":     row["wind_speed"],
        "wind_direction": row["wind_direction"],
        "wind_elevation": row["wind_elevation"],
    })

# =========================
# API – Anemometer 3D Timeseries
# =========================
@app.route("/api/anm3d")
def api_anm3d():
    limit     = request.args.get("limit", 300, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = anm3d_timeseries(limit=limit, sensor_id=sensor_id)
    return jsonify([
        {
            "time":           r["time"].isoformat(),
            "wind_speed":     r["wind_speed"],
            "wind_direction": r["wind_direction"],
            "wind_elevation": r["wind_elevation"],
        }
        for r in rows
    ])

# =========================
# API – Anemometer 3D History (for data table)
# =========================
@app.route("/api/anm3d/history")
def api_anm3d_history():
    limit     = request.args.get("limit", 100, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = anm3d_history(limit, sensor_id)
    return jsonify([
        {
            "time":           r["time"].isoformat(),
            "wind_speed":     r["wind_speed"],
            "wind_direction": r["wind_direction"],
            "wind_elevation": r["wind_elevation"],
            "sensor_id":      r["sensor_id"],
        }
        for r in rows
    ])


# =========================
# Tiltmeter Page
# =========================
@app.route("/tiltmeter")
@login_required
def tiltmeter_page():
    sensors = get_tiltmeter_sensors()
    if sensors:
        return redirect(f"/tiltmeter/{sensors[0]}")
    return render_template("tiltmeter.html", sensor_id=None)

@app.route("/tiltmeter/<sensor_id>")
@login_required
def tiltmeter_sensor_page(sensor_id):
    sensors = get_tiltmeter_sensors()
    if sensor_id not in sensors:
        if sensors:
            return redirect(f"/tiltmeter/{sensors[0]}")
        return render_template("tiltmeter.html", sensor_id=None)
    return render_template("tiltmeter.html", sensor_id=sensor_id)

# =========================
# API – Tiltmeter Latest (REALTIME)
# =========================
@app.route("/api/tiltmeter/latest")
def api_tiltmeter_latest():
    sensor_id = request.args.get("sensor_id")
    row = latest_tiltmeter(sensor_id)
    if not row:
        return jsonify({})
    return jsonify({
        "time":        row["time"].isoformat(),
        "angle_x":     row["angle_x"],
        "angle_y":     row["angle_y"],
    })

# =========================
# API – Tiltmeter Timeseries
# =========================
@app.route("/api/tiltmeter")
def api_tiltmeter():
    limit     = request.args.get("limit", 300, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = tiltmeter_timeseries(limit=limit, sensor_id=sensor_id)
    return jsonify([
        {
            "time":        r["time"].isoformat(),
            "angle_x":     r["angle_x"],
            "angle_y":     r["angle_y"],
        }
        for r in rows
    ])

# =========================
# API – Tiltmeter History (for table)
# =========================
@app.route("/api/tiltmeter/history")
def api_tiltmeter_history():
    limit     = request.args.get("limit", 100, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = tiltmeter_history(limit, sensor_id)
    return jsonify([
        {
            "time":        r["time"].isoformat(),
            "angle_x":     r["angle_x"],
            "angle_y":     r["angle_y"],
            "sensor_id":   r["sensor_id"],
        }
        for r in rows
    ])

# =========================
# API – Tiltmeter Statistik
# =========================
@app.route("/api/tiltmeter/statistik/range")
def api_tiltmeter_statistik_range():
    start = request.args.get("start")
    end = request.args.get("end")
    sensor_id = request.args.get("sensor_id")
    if not start or not end:
        return jsonify([])
    rows = tiltmeter_statistik_by_range(start, end, sensor_id)
    return jsonify([
        {
            "id": r["id"],
            "time": r["time"].isoformat(),
            "sensor_id": r["sensor_id"],
            "sensor_type": r["sensor_type"],
            "unit": r["unit"],
            "min_angle_x": r["min_angle_x"],
            "max_angle_x": r["max_angle_x"],
            "avg_angle_x": r["avg_angle_x"],
            "min_angle_y": r["min_angle_y"],
            "max_angle_y": r["max_angle_y"],
            "avg_angle_y": r["avg_angle_y"],
            "th1": r.get("th1"),
            "th2": r.get("th2")
        }
        for r in rows
    ])


# =========================
# API – Tiltmeter Displacement Timeseries
# =========================
@app.route("/api/tiltmeter/displacement")
def api_tiltmeter_displacement():
    limit     = request.args.get("limit", 300, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = get_tilt_displacement_timeseries(limit=limit, sensor_id=sensor_id)
    return jsonify([
        {
            "time":          r["time"].isoformat(),
            "sensor_id":     r["sensor_id"],
            "deflection_mm": r["deflection_mm"],
        }
        for r in rows
    ])

# =========================
# API – Tiltmeter Displacement Latest (per sensor)
# =========================
@app.route("/api/tiltmeter/displacement/latest")
def api_tiltmeter_displacement_latest():
    rows = get_tilt_displacement_latest()
    return jsonify([
        {
            "time":          r["time"].isoformat(),
            "sensor_id":     r["sensor_id"],
            "deflection_mm": r["deflection_mm"],
        }
        for r in rows
    ])

# =========================
# atrhs Page
# =========================
@app.route("/atrhs")
def atrhs_page():
    sensors = get_atrhs_sensors()
    if sensors:
        return redirect(f"/atrhs/{sensors[0]}")
    return render_template("atrhs.html", sensor_id=None)

@app.route("/atrhs/<sensor_id>")
def atrh_sensor_page(sensor_id):
    sensors = get_atrhs_sensors()
    if sensor_id not in sensors:
        if sensors:
            return redirect(f"/atrhs/{sensors[0]}")
        return render_template("atrhs.html", sensor_id=None)
    return render_template("atrhs.html", sensor_id=sensor_id)

# =========================
# API – atrhs Latest (REALTIME)
# dipanggil tiap 1 detik
# =========================
@app.route("/api/atrhs/latest")
def api_atrhs_latest():
    sensor_id = request.args.get("sensor_id")
    row = latest_atrhs(sensor_id)
    if not row:
        return jsonify({})

    return jsonify({
        "time": row["time"].isoformat(),
        "temperature": row["temperature"],
        "humidity": row["humidity"]
    })


# =========================
# API – atrhs Timeseries
# untuk zoom / history
# =========================
@app.route("/api/atrhs")
def api_atrhs():
    limit = request.args.get("limit", 300, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = atrhs_timeseries(limit=limit, sensor_id=sensor_id)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "temperature": r["temperature"],
            "humidity": r["humidity"]
        }
        for r in rows
    ])


# =========================
# API – ATRH History (for data table)
# =========================
@app.route("/api/atrhs/history")
def api_atrh_history():
    limit = request.args.get("limit", 100, type=int)
    sensor_id = request.args.get("sensor_id")
    rows = atrhs_history(limit, sensor_id)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "temperature": r["temperature"],
            "humidity": r["humidity"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

# =========================
# TEMPERATURE Pages (Dynamic per sensor)
# =========================
@app.route("/temp")
def temp_page():
    sensors = get_temp_sensors()
    if sensors:
        return redirect(f"/temp/{sensors[0]}")
    return render_template("temp.html", sensor_id=None, sensors=[])

@app.route("/temp/<sensor_id>")
def temp_sensor_page(sensor_id):
    sensors = get_temp_sensors()
    if sensor_id not in sensors:
        if sensors:
            return redirect(f"/temp/{sensors[0]}")
        return render_template("temp.html", sensor_id=None, sensors=[])
    return render_template("temp.html", sensor_id=sensor_id, sensors=sensors)

# =========================
# API – TEMP Sensors List
# =========================
@app.route("/api/temp/sensors")
def api_temp_sensors():
    return jsonify(get_temp_sensors())

# =========================
# API – TEMP Latest (per sensor)
# =========================
@app.route("/api/temp/latest")
def api_temp_latest():
    sensor_id = request.args.get("sensor_id")
    if sensor_id:
        row = latest_temp_by_sensor(sensor_id)
    else:
        row = latest_temp()
    if not row:
        return jsonify({})
    return jsonify({
        "time": row["time"].isoformat(),
        "temperature": row["temperature"]
    })


# =========================
# API – TEMP Latest (per sensor_id)
# =========================
@app.route("/api/temp/latest/<sensor_id>")
def api_temp_latest_by_sensor(sensor_id):
    if sensor_id:
        row = latest_temp_by_sensor(sensor_id)
    else:
        row = latest_temp()
    if not row:
        return jsonify({})
    return jsonify({
        "time": row["time"].isoformat(),
        "temperature": row["temperature"]
    })

# =========================
# API – Monthly Averages (for dashboard bar chart)
# =========================
@app.route("/api/monthly-avg")
def api_monthly_avg():
    months = request.args.get("months", 12, type=int)
    data = monthly_avg_readings(months)
    return jsonify(data)

# =========================
# API – TEMP History (per sensor)
# =========================
@app.route("/api/temp/history")
def api_temp_history():
    limit = request.args.get("limit", 100, type=int)
    sensor_id = request.args.get("sensor_id")
    if sensor_id:
        rows = temp_history_by_sensor(sensor_id, limit)
    else:
        rows = temp_history(limit)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "temperature": r["temperature"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

# =========================
# Reports Pages
# =========================
@app.route("/reports")
def reports_page():
    return redirect("/reports/monthly")

@app.route("/reports/weekly")
def weekly_report_page():
    return render_template("report_weekly.html")

@app.route("/reports/monthly")
def monthly_report_page():
    return render_template("report_monthly.html")

# =========================
# API – Range Reports
# =========================
@app.route("/api/atrh/range")
def api_atrh_range():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    rows = atrhs_by_range(start, end)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "temperature": r["temperature"],
            "humidity": r["humidity"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

@app.route("/api/temp/range")
def api_temp_range():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    rows = temp_by_range(start, end)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "temperature": r["temperature"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

@app.route("/api/anm2d/range")
def api_anm2d_range():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    rows = anm2d_by_range(start, end)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "wind_speed": r["wind_speed"],
            "wind_direction": r["wind_direction"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

@app.route("/api/anm3d/range")
def api_anm3d_range():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    rows = anm3d_by_range(start, end)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "wind_speed": r["wind_speed"],
            "wind_direction": r["wind_direction"],
            "wind_elevation": r["wind_elevation"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

@app.route("/api/tiltmeter/range")
def api_tiltmeter_range():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    rows = tiltmeter_by_range(start, end)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "angle_x": r["angle_x"],
            "angle_y": r["angle_y"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])

@app.route("/api/cable-stay/range")
def api_cable_stay_range():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    rows = cable_stays_by_range(start, end)
    return jsonify([
        {
            "time": r["time"].isoformat(),
            "force": r["force"],
            "stress": r["stress"],
            "temperature": r["temperature"],
            "sensor_id": r["sensor_id"]
        }
        for r in rows
    ])


# =========================
# API – Monitoring Summary (for Monthly Report Table)
# =========================
@app.route("/api/monitoring-summary")
def api_monitoring_summary():
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        return jsonify([])
    data = monitoring_summary(start, end)
    return jsonify(data)


# =========================
# API – Storage Info
# =========================
@app.route("/api/storage")
def api_storage():
    rows = get_storage_info()
    data = []
    for r in rows:
        # Calculate percentage if not provided or just use DB
        # total/used are likely strings representing bytes
        # We'll pass them raw and format in JS
        data.append({
            "disk_name": r["disk_name"],
            "total": r["disk_total"],
            "used": r["disk_used"],
            "free": r["disk_free"],
            "percent": r["disk_percentage"],
            "updated": r["local_datetime"].isoformat() if r["local_datetime"] else None
        })
    return jsonify(data)


# =========================
# Accelerometer Page
# =========================
@app.route("/accelerometer")
@login_required
def accelerometer_page():
    return render_template("accelerometer.html")

# Vibration Page
@app.route("/vibration")
@login_required
def vibration_page():
    return render_template("vibration.html")

# Acc KDI Page (redirect to first sensor)
@app.route("/acc-kdi")
@login_required
def acc_kdi_page():
    if ACC_SENSORS:
        return redirect(f"/acc-kdi/{ACC_SENSORS[0]['acc_id']}")
    return render_template("acc_kdi.html", sensor_id=None)

# Acc KDI Per-Sensor Page
@app.route("/acc-kdi/<sensor_id>")
@login_required
def acc_kdi_sensor_page(sensor_id):
    # Verify sensor exists in ACC_SENSORS
    found = next((s for s in ACC_SENSORS if s["acc_id"].upper() == sensor_id.upper()), None)
    if not found:
        if ACC_SENSORS:
            return redirect(f"/acc-kdi/{ACC_SENSORS[0]['acc_id']}")
        return render_template("acc_kdi.html", sensor_id=None)
    
    # In this case, we use the real sensor SN for JS comparison if needed, 
    # but strain_trigger uses the ID. Let's pass the real SN to window.CURRENT_SENSOR_ID
    return render_template("acc_kdi.html", sensor_id=found["acc_id"], sensor_sn=found["sensor_id"])

# Strain Page
@app.route("/strain")
@login_required
def strain_page():
    sensors = get_sensors_list("Strain")
    if sensors:
        return redirect(f"/strain/{sensors[0]}")
    return render_template("strain.html", sensor_id=None)

@app.route("/strain/<sensor_id>")
@login_required
def strain_sensor_page(sensor_id):
    return render_template("strain.html", sensor_id=sensor_id)

# Strain Trigger Page (redirect to first sensor)
@app.route("/strain-trigger")
@login_required
def strain_trigger_page():
    sensor_ids = [s["str_id"] for s in STRAIN_SENSORS]
    if sensor_ids:
        return redirect(f"/strain-trigger/{sensor_ids[0]}")
    return render_template("strain_trigger.html", sensor_id=None)

# Strain Trigger Per-Sensor Page
@app.route("/strain-trigger/<sensor_id>")
@login_required
def strain_trigger_sensor_page(sensor_id):
    sensor_ids = [s["str_id"] for s in STRAIN_SENSORS]
    if sensor_id.upper() not in [s.upper() for s in sensor_ids]:
        if sensor_ids:
            return redirect(f"/strain-trigger/{sensor_ids[0]}")
        return render_template("strain_trigger.html", sensor_id=None)
    return render_template("strain_trigger.html", sensor_id=sensor_id.upper())

# =========================
# API – Structural Health
# =========================
@app.route("/api/health/latest")
def api_latest_health():
    row = get_latest_health()
    if not row:
        return jsonify({})
    if row.get("analysis_time"):
        row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(row)

@app.route("/api/health/dashboard-summary")
def api_dashboard_summary():
    data = get_dashboard_summary()
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)

@app.route("/api/health/modal-trend")
def api_modal_trend():
    mode_number = request.args.get("mode_number", type=int)
    if mode_number is None:
        return jsonify([])
    data = get_modal_trend(mode_number)
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)

@app.route("/api/health/latest-alerts")
def api_latest_alerts():
    data = get_latest_alerts()
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)

@app.route("/api/health/mode-shape")
def api_mode_shape():
    mode_number = request.args.get("mode_number", type=int)
    if mode_number is None:
        return jsonify({})
    row = get_mode_shape(mode_number)
    # Check if row is not None and format analysis_time if it exists
    if row:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
        return jsonify(row)
    return jsonify({})

@app.route("/api/health/spectrum")
def api_modal_spectrum():
    data = get_modal_spectrum()
    for row in data:
        if row.get("analysis_time"):
            row["analysis_time"] = row["analysis_time"].isoformat()
    return jsonify(data)


# =========================
# Cable Stay Page
# =========================
@app.route("/cable-stay/realtime")
def cable_stay_realtime():
    return render_template("cable_stay_realtime.html")

@app.route("/cable-stay/sensor/<sid>")
def cable_stay_sensor(sid):
    return render_template("cable_stay_sensor.html", sensor_id=sid)

# =========================
# API – Cable Stay
# =========================
@app.route("/api/cable-stay/latest")
def api_cable_stay_latest():
    data = get_latest_cable_stays()
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)

@app.route("/api/cable-stay/history")
def api_cable_stay_history():
    sid = request.args.get("sensor_id")
    limit = request.args.get("limit", default=100, type=int)
    if not sid:
        return jsonify([])
    data = cable_stay_history(sid, limit)
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)


# =========================
# API – Notifications
# =========================
@app.route("/api/notifications")
def api_notifications():
    limit = request.args.get("limit", 20, type=int)
    data = get_notifications(limit)
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)

@app.route("/api/notifications/mark-read", methods=["POST"])
def api_mark_notifications_read():
    mark_notifications_read()
    return jsonify({"status": "ok"})

@app.route("/api/notifications/<int:notif_id>", methods=["DELETE"])
def api_delete_notification(notif_id):
    delete_notification(notif_id)
    return jsonify({"status": "ok"})

# =========================
# API – Weekly Periods
# =========================
@app.route("/api/weekly_periods/years")
def api_weekly_years():
    return jsonify(get_weekly_years())

@app.route("/api/weekly_periods/months")
def api_weekly_months():
    year = request.args.get("year")
    if not year:
        return jsonify([])
    return jsonify(get_weekly_months(year))

@app.route("/api/weekly_periods/weeks")
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

@app.route("/api/acc_kdi/statistics")
def api_acc_kdi_statistics():
    sensor_id = request.args.get("sensor_id")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    if not sensor_id: return jsonify([])
    data = get_acc_fft_history_query(sensor_id, start_date, end_date)
    for row in data:
        if row.get("time"): row["time"] = row["time"].isoformat()
    return jsonify(data)

# =========================
# Internal Bridge (for subscriber)
# =========================
@app.route("/api/internal/emit", methods=["POST"])
def internal_emit():
    # Only allow from localhost in production for security
    
    data = request.json
    event = data.get("event")
    payload = data.get("payload")
    if event and payload:
        socketio.emit(event, payload)
        return jsonify({"status": "sent"}), 200
    return jsonify({"status": "error"}), 400

# =========================
# Simulation – Strain & Temp
# =========================
# Simulation – Strain & Temp
# =========================
def background_strain_simulation():
    """Generates simulated strain & temp data for SG-01."""
    while True:
        try:
            strain_base = 5 * (random.random() - 0.5)
            strain_spike = -25 * random.random() if random.random() < 0.1 else 0
            strain_val = round(strain_base + strain_spike, 3)
            temp_val = round(28.5 + (random.random() - 0.5) * 0.4, 1)
            
            payload = {
                "time": datetime.now().strftime("%H:%M:%S"),
                "strain_ue": strain_val,
                "temp_c": temp_val,
                "sensor_id": "SG-01"
            }
            socketio.emit("strain_update", payload)
        except Exception as e:
            print(f"Error in background_strain_simulation: {e}")
        socketio.sleep(1)

def background_strain_trigger_simulation():
    """Generates simulated strain & temp data for SG-TRIGGER-01."""
    while True:
        try:
            # Trigger simulation usually has more spikes or different baseline
            strain_base = 2 * (random.random() - 0.5)
            strain_spike = -45 * random.random() if random.random() < 0.05 else 0
            strain_val = round(strain_base + strain_spike, 3)
            temp_val = round(30.2 + (random.random() - 0.5) * 0.2, 1)
            
            payload = {
                "time": datetime.now().strftime("%H:%M:%S"),
                "timestamp": int(time.time() * 1000),
                "strain_ue": strain_val,
                "temp_c": temp_val,
                "sensor_id": "SG-TRIGGER-01"
            }
            socketio.emit("strain_trigger_update", payload)
        except Exception as e:
            print(f"Error in background_strain_trigger_simulation: {e}")

        # Sampling rate strain_trigger = 100 Hz
        socketio.sleep(0.01)

ACC_SENSORS = [
    {"acc_id": "acc3-kdi-04", "sensor_id": "20231001026", "host": "103.111.81.238", "port": 5554},
    {"acc_id": "acc2-kdi-01", "sensor_id": "20231001032", "host": "103.111.81.238", "port": 5558},
    # add more sensors here if needed
]

# --- ACC Logging Configuration ---
ACC_DATA_DIR = "data/acc"
ACC_RAW_DIR = os.path.join(ACC_DATA_DIR, "raw")
ACC_EVENT_DIR = os.path.join(ACC_DATA_DIR, "events")
os.makedirs(ACC_RAW_DIR, exist_ok=True)
os.makedirs(ACC_EVENT_DIR, exist_ok=True)

ACC_BUFFERS = {}  # {sensor_id: deque(maxlen=12000)}
ACC_EVENT_STATE = {} # {sensor_id: {"active": False, "filename": None, "last_active": 0}}
ACC_EVENT_THRESHOLD = 50.0 # Adjust based on data unit (mg)
ACC_ROLLING_INTERVAL = 120 # Seconds / 2 minutes

def python_fft(real, imag):
    n = len(real)
    j = 0
    for i in range(n):
        if j > i:
            real[i], real[j] = real[j], real[i]
            imag[i], imag[j] = imag[j], imag[i]
        m = n >> 1
        while m >= 1 and j >= m:
            j -= m
            m >>= 1
        j += m
    
    size = 2
    while size <= n:
        half = size >> 1
        step = -2.0 * 3.141592653589793 / size
        for i in range(0, n, size):
            for k in range(half):
                w_re = math.cos(k * step)
                w_im = math.sin(k * step)
                idx1 = i + k
                idx2 = i + k + half
                t_re = real[idx2] * w_re - imag[idx2] * w_im
                t_im = real[idx2] * w_im + imag[idx2] * w_re
                real[idx2] = real[idx1] - t_re
                imag[idx2] = imag[idx1] - t_im
                real[idx1] += t_re
                imag[idx1] += t_im
        size <<= 1
        # Yield to other greenlets every octave
        socketio.sleep(0)

def get_peaks(magnitudes, Fs, n, count=3):
    peaks = []
    for i in range(1, len(magnitudes) - 1):
        if magnitudes[i] > magnitudes[i-1] and magnitudes[i] > magnitudes[i+1]:
            freq = (i * Fs) / n
            if freq < 0.1: continue # Ignore noise
            peaks.append({"freq": freq, "mag": magnitudes[i]})
    
    # Ambil puncak tertinggi berdasarkan magnitudo
    peaks.sort(key=lambda x: x['mag'], reverse=True)
    top_peaks = peaks[:count]
    
    # Urutkan berdasarkan frekuensi (ascending) agar f1 < f2 < f3
    top_peaks.sort(key=lambda x: x['freq'])
    
    return top_peaks

def process_fft_history(sensor_id, buf_copy, filename):
    try:
        # Configuration for Averaging
        segment_size = 4096
        Fs = 100 # Hz
        
        # Determine number of non-overlapping segments we can fit
        num_segments = len(buf_copy) // segment_size
        if num_segments < 1: return
        
        # Use at most 2 segments to keep processing time reasonable
        num_segments = min(num_segments, 2)
        
        peaks_result = {}
        for axis in ['x', 'y', 'z']:
            avg_mags = [0.0] * (segment_size // 2)
            
            for s in range(num_segments):
                start_idx = len(buf_copy) - (num_segments - s) * segment_size
                slice_data = buf_copy[start_idx : start_idx + segment_size]
                
                real = [p[axis] for p in slice_data]
                # Apply Hanning window
                for i in range(segment_size):
                    real[i] *= 0.5 * (1 - math.cos(2 * 3.141592653589793 * i / (segment_size - 1)))
                
                imag = [0.0] * segment_size
                python_fft(real, imag)
                
                n_half = segment_size // 2
                for i in range(n_half):
                    mag = math.sqrt(real[i]**2 + imag[i]**2) / n_half
                    avg_mags[i] += mag
            
            # Divide by number of segments to get average
            for i in range(len(avg_mags)):
                avg_mags[i] /= num_segments
            
            peaks_result[axis] = get_peaks(avg_mags, Fs, segment_size)
            
        insert_acc_fft(sensor_id, peaks_result, filename)
        print(f"[ACC DB] SUCCESS: FFT History saved for {sensor_id}")
    except Exception as e:
        print(f"[ACC DB] ERROR in process_fft_history: {e}")

def save_rolling_raw(sensor_id):
    if sensor_id not in ACC_BUFFERS: return
    now = datetime.now()
    filename = f"{now.strftime('%Y%m%d_%H%M%S')}_{sensor_id}.txt"
    filepath = os.path.join(ACC_RAW_DIR, filename)
    
    # Cleanup old RAW files: Keep only the last 5 files (10 minutes of data)
    old_files = sorted(glob.glob(os.path.join(ACC_RAW_DIR, f"*_{sensor_id}.txt")))
    while len(old_files) >= 5:
        try:
            os.remove(old_files[0])
            old_files.pop(0)
        except:
            break
        
    with open(filepath, "w") as f:
        f.write("Time,X,Y,Z\n")
        # Snapshot current buffer
        buf_copy = list(ACC_BUFFERS[sensor_id])
        for p in buf_copy:
            f.write(f"{p['time']},{p['x']},{p['y']},{p['z']}\n")
            
        # Also process and save FFT peaks to DB
        socketio.start_background_task(process_fft_history, sensor_id, buf_copy, filename)

    print(f"[ACC LOG] Saved rolling RAW: {filename}")

def handle_event_detection(sensor_id, payload):
    if sensor_id not in ACC_EVENT_STATE:
        ACC_EVENT_STATE[sensor_id] = {"active": False, "filename": None, "last_active": 0}
    
    state = ACC_EVENT_STATE[sensor_id]
    mag = max(abs(payload['x']), abs(payload['y']), abs(payload['z']))
    
    if mag >= ACC_EVENT_THRESHOLD:
        state["last_active"] = time.time()
        if not state["active"]:
            state["active"] = True
            now = datetime.now()
            state["filename"] = f"{now.strftime('%Y%m%d_%H%M%S')}_{sensor_id}.txt"
            filepath = os.path.join(ACC_EVENT_DIR, state["filename"])
            with open(filepath, "w") as f:
                f.write("Time,X,Y,Z\n")
            print(f"[ACC EVENT] Triggered! Recording to {state['filename']}")
    
    if state["active"]:
        # Record data
        filepath = os.path.join(ACC_EVENT_DIR, state["filename"])
        with open(filepath, "a") as f:
            f.write(f"{payload['time']},{payload['x']},{payload['y']},{payload['z']}\n")
        
        # Stop check with hysteresis (3 seconds)
        if time.time() - state["last_active"] > 3:
            print(f"[ACC EVENT] Finished: {state['filename']}")
            state["active"] = False
            state["filename"] = None
def background_acc_kdi_stream(sensor_id,host,port):
    """Continuously reads from telnet port and emits via socketio."""
    print(f"[ACC KDI] Starting background task for {sensor_id}...")
    while True:
        # Task now runs 24/7 regardless of subscribers
        s = None
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            s.settimeout(10)
            s.connect((host, port))
            print(f"[ACC KDI] Connected to {host}:{port} ({sensor_id})")
            decoder = json.JSONDecoder()
            buffer = ""
            pkt_count = 0
            last_packet_time = time.time()
            
            while True:
                # Watchdog check: If no valid packet for 15s, reconnect
                if time.time() - last_packet_time > 15:
                    print(f"[{sensor_id}] Watchdog Triggered: No data for 15s. Reconnecting...")
                    break
                    
                # Runs continuously
                # Set a small timeout for recv so we can check the watchdog periodically
                s.settimeout(2)
                try:
                    chunk = s.recv(4096)
                except socket.timeout:
                    continue # Go back to top of loop to check watchdog/last_packet_time
                except Exception as e:
                    print(f"[{sensor_id}] Recv error: {e}")
                    break
                
                if not chunk:
                    print(f"[{sensor_id}] Connection closed by remote host.")
                    break
                
                buffer += chunk.decode('utf-8', errors='ignore')
                
                while buffer:
                    buffer = buffer.lstrip()
                    if not buffer:
                        break
                        
                    if not buffer.startswith('{'):
                        idx = buffer.find('{')
                        if idx == -1:
                            buffer = ""
                            break
                        buffer = buffer[idx:]
                        
                    try:
                        obj, idx = decoder.raw_decode(buffer)
                        buffer = buffer[idx:]
                        
                        payload = {
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "sensor_id": obj.get("sn", "N/A"),
                            "x": float(obj.get("x", 0)),
                            "y": float(obj.get("y", 0)),
                            "z": float(obj.get("z", 0))
                        }

                        # --- Logging Logic ---
                        if sensor_id not in ACC_BUFFERS:
                            ACC_BUFFERS[sensor_id] = deque(maxlen=12000)
                        
                        ACC_BUFFERS[sensor_id].append(payload)
                        
                        if 'last_raw_save' not in locals(): last_raw_save = time.time()
                        
                        # Trigger save every 120s or every 12000 packets
                        time_passed = time.time() - last_raw_save
                        if time_passed >= ACC_ROLLING_INTERVAL or pkt_count % 12000 == 0:
                            if pkt_count >= 1000: # Don't save empty/small buffers at start
                                print(f"[ACC LOG] Triggering save for {sensor_id} (Pkt: {pkt_count}, Time: {time_passed:.1f}s)")
                                save_rolling_raw(sensor_id)
                                last_raw_save = time.time()
                                pkt_count = 0 # Reset count for next cycle
                            
                        handle_event_detection(sensor_id, payload)
                        
                        # Use a small internal buffer for batching to reduce socket.io overhead
                        if 'batch' not in locals(): batch = []
                        batch.append(payload)
                        
                        if len(batch) >= 10:
                            socketio.emit("acc_stream_update", batch, to=f"room_acc_{sensor_id}")
                            batch = []
                        
                        pkt_count += 1
                        last_packet_time = time.time() # Reset watchdog on valid packet
                        if pkt_count % 1000 == 0:
                            print(f"[ACC KDI] {sensor_id} HEARTBEAT: Received {pkt_count} packets total.")
                            
                        socketio.sleep(0) # Yield logic
                    except json.JSONDecodeError:
                        break # Incomplete JSON, wait for more data
                    except Exception:
                        idx = buffer.find('}', 1)
                        if idx != -1:
                            buffer = buffer[idx+1:]
                        else:
                            buffer = ""
        except Exception as e:
            print(f"[{sensor_id}] Telnet error: {e}. Retrying in 5s...")
        finally:
            if s:
                try: s.close()
                except: pass
            socketio.sleep(5) # Wait before retry

STRAIN_SENSORS = [
    {"str_id": "STRAIN_05", "host": "36.64.86.161", "port": 4025},
    {"str_id": "STRAIN_11", "host": "36.64.86.161", "port": 4031},
    # add more sensors here if needed
]

def background_strain_stream(sensor_id, host, port):
    """Strain trigger stream from telnet for a specific sensor."""
    print(f"[STRAIN] Starting background task for {sensor_id}...")
    while True:
        subscribers = ACTIVE_SENSORS["strain"].get(sensor_id, set())
        if not subscribers:
            print(f"[STRAIN] No more subscribers for {sensor_id}. Current registry: {ACTIVE_SENSORS['strain']}. Stopping task.")
            break

        s = None
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(10)
            s.connect((host, port))
            print(f"[{sensor_id}] Connected to {host}:{port}")
            decoder = json.JSONDecoder()
            buffer = ""
            while True:
                subscribers = ACTIVE_SENSORS["strain"].get(sensor_id, set())
                if not subscribers:
                    break
                chunk = s.recv(4096)
                if not chunk:
                    break

                buffer += chunk.decode('utf-8', errors='ignore')

                while buffer:
                    buffer = buffer.lstrip()
                    if not buffer:
                        break

                    if not buffer.startswith('{'):
                        idx = buffer.find('{')
                        if idx == -1:
                            buffer = ""
                            break
                        buffer = buffer[idx:]

                    try:
                        obj, idx = decoder.raw_decode(buffer)
                        buffer = buffer[idx:]
                        
                        mV = float(obj.get("mV", 0))
                        co = float(obj.get("co", 1))
                        
                        # Konversi ke mikrostrain (ue)
                        #strain_ue = (mV * 2000) * co if co != 0 else 0.0
                        strain_ue = mV * co if co != 0 else 0.0
                        
                        payload = {
                            "sensor_id": sensor_id,
                            "sn": obj.get("sn", "N/A"),
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "timestamp": datetime.now().timestamp() * 1000,
                            "mv": mV,
                            "co": co,
                            "strain_ue": strain_ue
                        }
                        print(f"[{sensor_id}] mV={mV}, co={co}, strain={strain_ue:.4f} με")
                        socketio.emit("strain_trigger_update", payload, to=f"room_strain_{sensor_id}")
                        socketio.sleep(0)
                    except json.JSONDecodeError:
                        break
                    except Exception:
                        idx = buffer.find('}', 1)
                        if idx != -1:
                            buffer = buffer[idx + 1:]
                        else:
                            buffer = ""

        except Exception as e:
            print(f"[{sensor_id}] Telnet error: {e}")
        finally:
            if s:
                try:
                    s.close()
                except:
                    pass
        socketio.sleep(5) # Wait before reconnecting
        
# =========================
# On-Demand Management
# =========================
ACTIVE_SENSORS = {"acc": {}, "strain": {}}

@socketio.on('subscribe_sensor')
def handle_subscribe(data):
    sid = data.get('sensor_id')
    stype = data.get('type') # 'acc' or 'strain'
    if not sid or not stype: return
    
    if sid not in ACTIVE_SENSORS[stype]:
        ACTIVE_SENSORS[stype][sid] = set()
    
    is_new_task = len(ACTIVE_SENSORS[stype][sid]) == 0
    ACTIVE_SENSORS[stype][sid].add(request.sid)
    join_room(f"room_{stype}_{sid}")
    
    referer = request.headers.get('Referer', 'Unknown')
    print(f"DEBUG: Client {request.sid} SUBSCRIBED to {stype}:{sid} from {referer}. Current subs: {ACTIVE_SENSORS[stype][sid]}")
    
    if is_new_task:
        if stype == "acc":
            # Tasks for ACC are now pre-started 24/7 at server boot
            pass
        elif stype == "strain":
            found = next((s for s in STRAIN_SENSORS if s["str_id"] == sid), None)
            if found:
                socketio.start_background_task(background_strain_stream, found["str_id"], found["host"], found["port"])

@socketio.on('unsubscribe_sensor')
def handle_unsubscribe(data):
    sid = data.get('sensor_id')
    stype = data.get('type')
    if not sid or not stype: return
    
    if sid in ACTIVE_SENSORS[stype] and request.sid in ACTIVE_SENSORS[stype][sid]:
        ACTIVE_SENSORS[stype][sid].remove(request.sid)
        leave_room(f"room_{stype}_{sid}")
        print(f"DEBUG: Client {request.sid} UNSUBSCRIBED from {stype}:{sid}. Remaining: {ACTIVE_SENSORS[stype][sid]}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client {request.sid} disconnected. Cleaning up subscriptions...")
    for stype in ACTIVE_SENSORS:
        for sid in list(ACTIVE_SENSORS[stype].keys()):
            if request.sid in ACTIVE_SENSORS[stype][sid]:
                ACTIVE_SENSORS[stype][sid].remove(request.sid)
                print(f"Removed {request.sid} from {stype}:{sid}")

# Ensure background_acc_kdi_stream NOT running on client connect unless subscribed
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

# =========================


# =========================
# CABLE TENSION (FFT-based)
# =========================

@app.route("/cable-tension/realtime")
def cable_tension_realtime():
    return render_template(
        "cable_tension_realtime.html",
        tension_warn_kn=TENSION_WARN_KN,
        tension_critical_kn=TENSION_CRITICAL_KN,
        is_admin=(session.get('role') == 'admin'),
    )

@app.route("/api/cable-tension/positions")
def api_cable_tension_positions():
    rows = get_cable_tension_positions()
    return jsonify([{
        "sensor_id": r["sensor_id"],
        "pos_x": r["x"], "pos_y": r["y"],
        "label": r.get("label", "")
    } for r in rows])

@app.route("/api/cable-tension/positions/batch", methods=["POST"])
@login_required
def api_batch_save_cable_tension_positions():
    if session.get('role') != 'admin':
        return jsonify({"ok": False, "error": "Admin access required"}), 403
    data = request.get_json() or []
    if not isinstance(data, list):
        return jsonify({"ok": False, "error": "Expected array"}), 400
    converted = [{"sensor_id": d["sensor_id"], "x": d["pos_x"], "y": d["pos_y"]} for d in data]
    ok, err = batch_save_sensor_positions(converted)
    return jsonify({"ok": ok, "error": err, "count": len(data)})

@app.route("/cable-tension/sensor/<sid>")
def cable_tension_sensor(sid):
    return render_template(
        "cable_tension_sensor.html",
        sensor_id=sid,
        tension_warn_kn=TENSION_WARN_KN,
        tension_critical_kn=TENSION_CRITICAL_KN,
    )

@app.route("/api/cable-tension/latest")
def api_cable_tension_latest():
    data = get_latest_cable_tensions()
    for row in data:
        if row.get("time"):
            row["time"] = row["time"].isoformat()
    return jsonify(data)

@app.route("/api/cable-tension/history")
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

@app.route("/api/cable-tension/range")
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

@app.route("/api/cable-tension/normalized")
def api_cable_tension_normalized():
    sid = request.args.get("sensor_id")
    limit = request.args.get("limit", default=500, type=int)
    target = request.args.get("target", default="tension_avg")

    if not sid:
        return jsonify({"error": "sensor_id is required"}), 400

    ct_rows = cable_tension_history_data(sid, limit)
    ct_rows = list(reversed(ct_rows))

    if not ct_rows:
        return jsonify({"error": "No cable tension data found"}), 404

    atrh_rows = atrhs_history(limit=limit * 2)
    atrh_rows = list(reversed(atrh_rows))

    temps_paired = []
    values_paired = []
    timestamps = []

    for ct in ct_rows:
        ct_time = ct["time"]
        ct_val = ct.get(target)
        if ct_val is None:
            continue

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
        return jsonify({"error": "Insufficient paired data (need >=3 points)"}), 400

    result = compute_residuals_and_spc_limits(temps_paired, values_paired)

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

# =========================
# STRAIN SENSOR LOCATION
# =========================

@app.route("/strain/sensor-location")
@login_required
def strain_sensor_location():
    return render_template("strain_sensor_location.html", is_admin=(session.get('role') == 'admin'))

@app.route("/api/strain/sensor-locations")
def api_strain_sensor_locations():
    return jsonify(get_strain_sensor_locations())

@app.route("/api/strain/sensor-locations", methods=["POST"])
@login_required
def api_save_strain_sensor_position():
    if session.get('role') != 'admin':
        return jsonify({"ok": False, "error": "Admin access required"}), 403
    d = request.get_json() or {}
    sid, px, py = d.get("sensor_id"), d.get("pos_x"), d.get("pos_y")
    if not sid or px is None or py is None:
        return jsonify({"ok": False, "error": "Missing fields"}), 400
    try:
        fpx, fpy = float(px), float(py)
    except (TypeError, ValueError) as e:
        return jsonify({"ok": False, "error": f"Invalid number: {e}"}), 400
    ok, err = save_strain_sensor_position(sid, fpx, fpy)
    return jsonify({"ok": ok, "error": err})

@app.route("/api/strain/sensor-locations/batch", methods=["POST"])
@login_required
def api_batch_save_strain_sensor_positions():
    if session.get('role') != 'admin':
        return jsonify({"ok": False, "error": "Admin access required"}), 403
    data = request.get_json() or []
    if not isinstance(data, list):
        return jsonify({"ok": False, "error": "Expected array"}), 400
    ok, err = batch_save_strain_sensor_positions(data)
    return jsonify({"ok": ok, "error": err, "count": len(data)})

# =========================
# Run
# =========================
if __name__ == "__main__":
    # Start background tasks only in the main worker process to avoid duplicates
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        print("[INIT] Starting background tasks for Acc KDI...")
        for sensor in ACC_SENSORS:
            socketio.start_background_task(background_acc_kdi_stream, sensor["acc_id"], sensor["host"], sensor["port"])
    
    # Telnet & Strain tasks still started on-demand
    
    socketio.run(
        app,
        host="0.0.0.0",
        port=5005,
        debug=True
    )
