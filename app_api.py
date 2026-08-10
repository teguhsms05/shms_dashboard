from flask import Flask, render_template, jsonify, request, redirect
from db import *

app = Flask(__name__)

# Inject `sensors` into every template (needed by base.html sidebar)
@app.context_processor
def inject_sensors():
    try:
        return dict(
            temp_sensors=get_temp_sensors(),
            atrh_sensors=get_atrhs_sensors(),
            cable_sensors=get_cable_stay_sensors()
        )
    except Exception as e:
        print("⚠️ inject_sensors ERROR:", e)
        return dict(temp_sensors=[], atrh_sensors=[], cable_sensors=[])

# =========================
# Dashboard
# =========================
@app.route("/")
def dashboard():
    return render_template("home.html")

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
def accelerometer_page():
    return render_template("accelerometer.html")

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
# Run
# =========================
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5005,
        debug=True
    )
