import json
import psycopg2
import paho.mqtt.client as mqtt
import requests
from datetime import datetime
from db import process_tilt_displacement

# =========================
# Database Connection
# =========================
DB = psycopg2.connect(
    host="127.0.0.1",
    port=6543,
    dbname="shms",
    user="postgres",
    password="postgres123"
)
DB.autocommit = True
cur = DB.cursor()

# =========================
# Sensor Configuration
# =========================
# Map sensor_type to table and its data columns
SENSOR_CONFIG = {
    "atrh": {
        "table": "atrhs",
        "columns": ["temperature", "humidity"]
    },
    "temp": {
        "table": "temps",
        "columns": ["temperature"]
    },
    "cable": {
        "table": "cable_stays",
        "columns": ["force", "stress", "temperature"]
    },
    "anm2d": {
        "table": "anm2d",
        "columns": ["wind_speed", "wind_direction"]
    },
    "anm3d": {
        "table" : "anm3d",
        "columns": ["wind_speed", "wind_direction", "wind_elevation"]
    },
    "tiltmeter": {
        "table": "tiltmeter",
        "columns": ["angle_x", "angle_y"]
    }
}

# =========================
# Ensure Tables Exist
# =========================
def ensure_tables():
    for stype, cfg in SENSOR_CONFIG.items():
        # Common columns for all SHM tables
        columns_sql = """
            id SERIAL PRIMARY KEY,
            time TIMESTAMP DEFAULT now(),
            source_ts TIMESTAMP,
            sensor_id VARCHAR(50),
            sensor_type VARCHAR(50),
            unit VARCHAR(50)
        """
        # Append sensor-specific data columns
        for col in cfg["columns"]:
            columns_sql += f", {col} FLOAT"
            
        query = f"CREATE TABLE IF NOT EXISTS {cfg['table']} ({columns_sql})"
        cur.execute(query)
        
    print(f"Database tables ensured: {', '.join([c['table'] for c in SENSOR_CONFIG.values()])}")

ensure_tables()

def notify_server(sensor_type, data):
    """Sends a POST request to the Flask server to notify it of new data."""
    try:
        event_map = {
            "temp": "temp_update",
            "atrh": "atrh_update",
            "cable": "cable_update",
            "anm2d": "anm2d_update",
            "anm3d": "anm3d_update",
            "tiltmeter": "tiltmeter_update"
        }
        event = event_map.get(sensor_type)
        if not event:
            return

        # Prepare normalized payload for frontend
        payload = {
            "time": data.get("ts"),
            "sensor_id": data.get("sensor_id")
        }
        # Merge values
        payload.update(data.get("values", {}))

        requests.post(
            "http://127.0.0.1:5005/api/internal/emit",
            json={"event": event, "payload": payload},
            timeout=1
        )
    except Exception as e:
        print(f"⚠️ Notify Server Error: {e}")

# =========================
# MQTT Callbacks
# =========================
def on_connect(client, userdata, flags, reason_code, properties):
    print("✅ MQTT connected:", reason_code)
    client.subscribe("shms/site01/sensor/#", qos=1)

def on_message(client, userdata, msg):
    try:
        # Skip empty payloads (e.g. retained message clearing)
        if not msg.payload:
            return

        data = json.loads(msg.payload.decode())
        sensor_type = data.get("sensor_type")
        
        if sensor_type not in SENSOR_CONFIG:
            print(f"⚠️ Skipping unknown sensor type: {sensor_type}")
            return

        cfg = SENSOR_CONFIG[sensor_type]
        values = data.get("values", {})
        
        # 1. Prepare Metadata
        source_ts = data.get("ts")
        if source_ts:
            source_ts = datetime.fromisoformat(source_ts.replace("Z", "+00:00"))
            
        units = data.get("unit", {})
        unit_parts = [str(units.get(c, "")) for c in cfg["columns"] if units.get(c)]
        unit_str = " / ".join(filter(None, unit_parts)) or "—"

        # 2. Build Dynamic SQL
        # Base columns (explicitly including 'time' for TimescaleDB)
        cols = ["time", "source_ts", "sensor_id", "sensor_type", "unit"]
        params = [datetime.now().strftime('%Y-%m-%d %H:%M:%S'), source_ts, data.get("sensor_id"), sensor_type, unit_str]
        
        # Data columns from config
        for col in cfg["columns"]:
            cols.append(col)
            params.append(values.get(col))

        placeholders = ", ".join(["%s"] * len(cols))
        col_list = ", ".join(cols)
        
        query = f"INSERT INTO {cfg['table']} ({col_list}) VALUES ({placeholders})"
        cur.execute(query, params)

        # 3. Threshold check & Notifications
        check_thresholds(data, values)

        # 4. Notify Flask (WebSockets)
        notify_server(sensor_type, data)

        # 5. Jika tiltmeter, hitung displacement baru
        if sensor_type == "tiltmeter":
            try:
                process_tilt_displacement()
            except Exception as disp_err:
                print(f"⚠️ Displacement calc error: {disp_err}")

        print(f"📥 {sensor_type.upper()} → {cfg['table']} | ID: {data.get('sensor_id')} | time: {data.get('ts')}")

    except Exception as e:
        print("❌ Message Error:", e)

# =========================
# Alert Logic
# =========================
CABLE_MAPPING = {
    "CS01": "S-C7A", "CS02": "S-C5A", "CS03": "S-C3A", "CS04": "S-M3A", "CS05": "S-M5A", "CS06": "S-M7A",
    "CS07": "N-M7A", "CS08": "N-M5A", "CS09": "N-M3A", "CS10": "N-C3A", "CS11": "N-C5A", "CS12": "N-C7A",
    "CS13": "S-C7B", "CS14": "S-C5B", "CS15": "S-C3B", "CS16": "S-M3B", "CS17": "S-M5B", "CS18": "S-M7B",
    "CS19": "N-M7B", "CS20": "N-M5B", "CS21": "N-M3B", "CS22": "N-C3B", "CS23": "N-C5B", "CS24": "N-C7B"
}

def check_thresholds(data, values):
    sensor_type = data.get("sensor_type")
    sid = data.get("sensor_id")
    
    if sensor_type == "cable":
        force = values.get("force")
        stress = values.get("stress")
        tag = CABLE_MAPPING.get(sid, sid)
        
        # Danger level
        if (force and force >= 600) or (stress and stress >= 700):
            val_str = f"Force: {force:.2f} kN" if force >= 600 else f"Stress: {stress:.2f} MPa"
            save_notification(f"Danger: {tag}", f"{val_str} exceeded limit", 'danger', sid)
        # Warning level
        elif (force and force >= 400) or (stress and stress >= 500):
            val_str = f"Force: {force:.2f} kN" if force >= 400 else f"Stress: {stress:.2f} MPa"
            save_notification(f"Warning: {tag}", f"{val_str} reached warning level", 'warning', sid)

def save_notification(title, message, status, sensor_id):
    """Saves or updates a notification in the database (1 per sensor per day)."""
    try:
        # Check if notification exists for today
        cur.execute("""
            SELECT id FROM notifications 
            WHERE sensor_id = %s 
            AND date_trunc('day', time) = date_trunc('day', CURRENT_TIMESTAMP)
            LIMIT 1
        """, (sensor_id,))
        row = cur.fetchone()
        
        if row:
            # Update to latest alert data for today
            cur.execute("""
                UPDATE notifications 
                SET title = %s, message = %s, status = %s, time = CURRENT_TIMESTAMP, is_read = FALSE
                WHERE id = %s
            """, (title, message, status, row[0]))
        else:
            # New alert for today
            cur.execute("""
                INSERT INTO notifications (title, message, status, sensor_id)
                VALUES (%s, %s, %s, %s)
            """, (title, message, status, sensor_id))
    except Exception as e:
        print("❌ Save Notification Error:", e)

# =========================
# MQTT Client Init
# =========================
client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="shms-subscriber",
    clean_session=False
)

client.on_connect = on_connect
client.on_message = on_message

client.connect("127.0.0.1", 1883, 60)
client.reconnect_delay_set(min_delay=1, max_delay=30)
client.loop_forever()


