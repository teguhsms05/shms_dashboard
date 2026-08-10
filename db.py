import psycopg2
from psycopg2.extras import RealDictCursor
from config import DB_CONFIG

# =========================
# DB Connection
# =========================
conn = psycopg2.connect(**DB_CONFIG)
conn.autocommit = True

# # Auto Migration: Add port if not exists
try:
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE sensor_info ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);")
        cur.execute("ALTER TABLE sensor_info ADD COLUMN IF NOT EXISTS port INTEGER;")
        
        # User Table Auto Migration
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public."user"
            (
                id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
                username text COLLATE pg_catalog."default",
                password text COLLATE pg_catalog."default",
                role text COLLATE pg_catalog."default",
                CONSTRAINT user_pkey PRIMARY KEY (id)
            )
        """)
        # Seed initial users if table is empty
        cur.execute('SELECT COUNT(*) FROM public."user"')
        if cur.fetchone()[0] == 0:
            cur.execute("""
                INSERT INTO public."user" (username, password, role) 
                VALUES 
                ('admin', 'shms2026', 'admin'),
                ('operator', 'barelang123', 'operator')
            """)
except Exception as e:
    print(f"Migration check error: {e}")


# =========================
# Latest ANM2D (1 data)
# untuk realtime chart
# =========================
def latest_anm2d(sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, wind_speed, wind_direction FROM anm2d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT 1"
            cur.execute(query, params)
            return cur.fetchone()

    except Exception as e:
        print("DB ERROR latest_anm2d:", e)
        return None


# =========================
# ANM2D Timeseries
# untuk history / zoom
# =========================
def anm2d_timeseries(limit=300, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, wind_speed, wind_direction FROM anm2d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR anm2d_timeseries:", e)
        return []


# =========================
# (Optional) Latest multi sensor Anemometer 2D
# =========================
def latest_values(limit=10):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    sensor_id,
                    sensor_type,
                    wind_speed,
                    wind_direction,
                    unit,
                    quality
                FROM anm2d
                ORDER BY time DESC
                LIMIT %s
            """, (limit,))
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR latest_values:", e)
        return []

# =========================
# Anemometer 2D History (for data table)
# =========================
def anm2d_history(limit=100, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, wind_speed, wind_direction, sensor_id FROM anm2d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR anm2d_history:", e)
        return []

def get_anm2d_sensors():
    """Get all distinct sensor IDs from the anm2d table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id 
                FROM anm2d 
                WHERE sensor_id IS NOT NULL
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_anm2d_sensors:", e)
        return []

def anm2d_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    wind_speed,
                    wind_direction,
                    sensor_id
                FROM anm2d
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm2d_by_range:", e)
        return []

# =========================
# ANM2D Statistik History
# =========================
def anm2d_statistik_history(limit=100, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT s.*, si.th1, si.th2 
                FROM anm2d_statistic s
                LEFT JOIN sensor_info si ON s.sensor_id = si.sensor_id
            """
            params = []
            if sensor_id:
                query += " WHERE s.sensor_id = %s "
                params.append(sensor_id)
            query += " ORDER BY s.time DESC LIMIT %s "
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm2d_statistik_history:", e)
        return []

def anm2d_statistik_by_range(start_date, end_date, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT DISTINCT ON (s.time, s.sensor_id) s.*, si.th1, si.th2 
                FROM anm2d_statistic s
                LEFT JOIN sensor_info si ON s.sensor_id = si.sensor_id
                WHERE s.time >= %s AND s.time <= %s
            """
            params = [start_date, end_date]
            if sensor_id:
                query += " AND s.sensor_id = %s "
                params.append(sensor_id)
            query += " ORDER BY s.time ASC "
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm2d_statistik_by_range:", e)
        return []

# =========================================================================================
# =========================
# Latest ANM3D (1 data)
# untuk realtime chart
# =========================
def latest_anm3d(sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, wind_speed, wind_direction, wind_elevation FROM anm3d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT 1"
            cur.execute(query, params)
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR latest_anm3d:", e)
        return None


# =========================
# ANM3D Timeseries
# untuk history / zoom
# =========================
def anm3d_timeseries(limit=300, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, wind_speed, wind_direction, wind_elevation FROM anm3d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm3d_timeseries:", e)
        return []


# =========================
# ANM3D History (for data table)
# =========================
def anm3d_history(limit=100, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, wind_speed, wind_direction, wind_elevation, sensor_id FROM anm3d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm3d_history:", e)
        return []


def get_anm3d_sensors():
    """Get all distinct sensor IDs from the anm3d table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id
                FROM anm3d
                WHERE sensor_id IS NOT NULL
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_anm3d_sensors:", e)
        return []


def anm3d_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT time, wind_speed, wind_direction, wind_elevation, sensor_id
                FROM anm3d
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm3d_by_range:", e)
        return []

def anm3d_statistik_by_range(start_date, end_date, sensor_id=None):
    """Fetch 10-min aggregated statistics from anm3d_statistic table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT DISTINCT ON (s.time, s.sensor_id) s.*, si.th1, si.th2 
                FROM anm3d_statistic s
                LEFT JOIN sensor_info si ON s.sensor_id = si.sensor_id
                WHERE s.time >= %s AND s.time <= %s
            """
            params = [start_date, end_date]
            if sensor_id:
                query += " AND s.sensor_id = %s "
                params.append(sensor_id)
            query += " ORDER BY s.time ASC "
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm3d_statistik_by_range:", e)
        return []


# =========================================================================================
# =========================
# Latest atrhs (1 data)
# untuk realtime chart
# =========================
def latest_atrhs(sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, temperature, humidity FROM atrhs "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT 1"
            cur.execute(query, params)
            return cur.fetchone()

    except Exception as e:
        print("DB ERROR latest_atrhs:", e)
        return None


# =========================
# atrhs Timeseries
# untuk history / zoom
# =========================
def atrhs_timeseries(limit=300, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, temperature, humidity FROM atrhs "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR atrhs_timeseries:", e)
        return []


# =========================
# (Optional) Latest multi sensor
# =========================
def latest_values(limit=10):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    sensor_id,
                    sensor_type,
                    temperature,
                    humidity,
                    unit,
                    quality
                FROM atrhs
                ORDER BY time DESC
                LIMIT %s
            """, (limit,))
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR latest_values:", e)
        return []

# =========================
# atrhs History (for data table)
# =========================
def atrhs_history(limit=100, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, temperature, humidity, sensor_id FROM atrhs "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR atrhs_history:", e)
        return []

def get_atrhs_sensors():
    """Get all distinct sensor IDs from the atrhs table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id 
                FROM atrhs 
                WHERE sensor_id IS NOT NULL
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_atrhs_sensors:", e)
        return []

def atrhs_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature,
                    humidity,
                    sensor_id
                FROM atrhs
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR atrhs_by_range:", e)
        return []

def atrhs_statistik_by_range(start_date, end_date, sensor_id=None):
    """Fetch 10-min aggregated statistics from atrhs_statistic table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT DISTINCT ON (s.time, s.sensor_id) s.*, si.th1, si.th2 
                FROM atrhs_statistic s
                LEFT JOIN sensor_info si ON s.sensor_id = si.sensor_id
                WHERE s.time >= %s AND s.time <= %s
            """
            params = [start_date, end_date]
            if sensor_id:
                query += " AND s.sensor_id = %s "
                params.append(sensor_id)
            query += " ORDER BY s.time ASC "
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR atrhs_statistik_by_range:", e)
        return []

# =========================================================================================
# =========================
# Latest TEMP (1 data)
# untuk realtime chart
# =========================
def latest_temp():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature
                FROM temps
                ORDER BY time DESC
                LIMIT 1
            """)
            return cur.fetchone()

    except Exception as e:
        print("DB ERROR latest_temp:", e)
        return None

# =========================
# TEMP History (for data table)
# =========================
def temp_history(limit=100):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature,
                    sensor_id
                FROM temps
                ORDER BY time DESC
                LIMIT %s
            """, (limit,))
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR temp_history:", e)
        return []

def temp_history_by_sensor(sensor_id, limit=100):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature,
                    sensor_id
                FROM temps
                WHERE sensor_id = %s
                ORDER BY time DESC
                LIMIT %s
            """, (sensor_id, limit,))
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR temp_history_by_sensor:", e)
        return []

def temp_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature,
                    sensor_id
                FROM temps
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR temp_by_range:", e)
        return []

def temp_statistik_by_range(start_date, end_date, sensor_id=None):
    """Fetch 10-min aggregated statistics from temps_statistic table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT DISTINCT ON (time, sensor_id) * FROM temps_statistic
                WHERE time >= %s AND time <= %s
            """
            params = [start_date, end_date]
            if sensor_id:
                query += " AND sensor_id = %s "
                params.append(sensor_id)
            query += " ORDER BY time ASC "
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR temp_statistik_by_range:", e)
        return []

def latest_temp_by_sensor(sensor_id):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature
                FROM temps
                WHERE sensor_id = %s
                ORDER BY time DESC
                LIMIT 1
            """, (sensor_id,))
            return cur.fetchone()

    except Exception as e:
        print("DB ERROR latest_temp_by_sensor:", e)
        return None

def get_temp_sensors():
    """Get all distinct sensor IDs from the temps table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id
                FROM temps
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]

    except Exception as e:
        print("DB ERROR get_temp_sensors:", e)
        return []

def temp_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    time,
                    temperature,
                    sensor_id
                FROM temps
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR temp_by_range:", e)
        return []
# =========================================================================================
# =========================
# Monitoring Summary (for Monthly Report)
# =========================
TEMP_THRESHOLD_LOW = -10.0
TEMP_THRESHOLD_HIGH = 60.0
HUMIDITY_THRESHOLD_LOW = 0.0
HUMIDITY_THRESHOLD_HIGH = 100.0
CABLE_FORCE_THRESHOLD_HIGH = 600.0
WIND_SPEED_THRESHOLD_HIGH = 25.0

def monitoring_summary(start_date, end_date):
    """
    Build a per-sensor monitoring summary for the given date range.
    Returns a list of dicts with:
      sensor_id, sensor_type, group, channel, total_readings,
      abnormal_count, system_error, operation_ok, threshold_ok, remark
    """
    results = []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # --- atrhs sensors ---
            cur.execute("""
                SELECT
                    sensor_id,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE temperature < %s OR temperature > %s
                           OR humidity < %s OR humidity > %s
                    ) AS abnormal
                FROM atrhs
                WHERE time >= %s AND time <= %s
                GROUP BY sensor_id
                ORDER BY sensor_id
            """, (TEMP_THRESHOLD_LOW, TEMP_THRESHOLD_HIGH,
                  HUMIDITY_THRESHOLD_LOW, HUMIDITY_THRESHOLD_HIGH,
                  start_date, end_date))
            for r in cur.fetchall():
                sid = r["sensor_id"] or "atrhs01"
                results.append({
                    "sensor_id": sid,
                    "sensor_type": "ATRH",
                    "group": "A",
                    "channel": sid.upper(),
                    "total_readings": r["total"],
                    "abnormal_count": r["abnormal"],
                    "system_error": 0,
                    "operation_ok": r["total"] > 0,
                    "threshold_ok": r["abnormal"] == 0,
                    "remark": "" if r["abnormal"] == 0 else (
                        "too much noise" if r["abnormal"] > 30 else "partial noise"
                    )
                })

            # --- Temperature sensors ---
            cur.execute("""
                SELECT
                    sensor_id,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE temperature < %s OR temperature > %s
                    ) AS abnormal
                FROM temps
                WHERE time >= %s AND time <= %s
                GROUP BY sensor_id
                ORDER BY sensor_id
            """, (TEMP_THRESHOLD_LOW, TEMP_THRESHOLD_HIGH,
                  start_date, end_date))
            for idx, r in enumerate(cur.fetchall()):
                sid = r["sensor_id"] or f"temp{idx+1:02d}"
                results.append({
                    "sensor_id": sid,
                    "sensor_type": "Temperature",
                    "group": "B",
                    "channel": sid.upper(),
                    "total_readings": r["total"],
                    "abnormal_count": r["abnormal"],
                    "system_error": 0,
                    "operation_ok": r["total"] > 0,
                    "threshold_ok": r["abnormal"] == 0,
                    "remark": "" if r["abnormal"] == 0 else (
                        "too much noise" if r["abnormal"] > 30 else "partial noise"
                    )
                })

            # --- Cable Stay sensors ---
            cur.execute("""
                SELECT
                    sensor_id,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE force > %s
                    ) AS abnormal
                FROM cable_stays
                WHERE time >= %s AND time <= %s
                GROUP BY sensor_id
                ORDER BY sensor_id
            """, (CABLE_FORCE_THRESHOLD_HIGH, start_date, end_date))
            for r in cur.fetchall():
                sid = r["sensor_id"] or "cs01"
                results.append({
                    "sensor_id": sid,
                    "sensor_type": "Cable Stay",
                    "group": "C",
                    "channel": sid.upper(),
                    "total_readings": r["total"],
                    "abnormal_count": r["abnormal"],
                    "system_error": 0,
                    "operation_ok": r["total"] > 0,
                    "threshold_ok": r["abnormal"] == 0,
                    "remark": "" if r["abnormal"] == 0 else (
                        "force limit exceeded" if r["abnormal"] > 30 else "minor peak"
                    )
                })

            # --- Wind Monitor sensors ---
            cur.execute("""
                SELECT
                    sensor_id,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE wind_speed > %s
                    ) AS abnormal
                FROM anm2d
                WHERE time >= %s AND time <= %s
                GROUP BY sensor_id
                ORDER BY sensor_id
            """, (WIND_SPEED_THRESHOLD_HIGH, start_date, end_date))
            for r in cur.fetchall():
                sid = r["sensor_id"] or "anm2d01"
                results.append({
                    "sensor_id": sid,
                    "sensor_type": "Anemometer 2D",
                    "group": "D",
                    "channel": sid.upper(),
                    "total_readings": r["total"],
                    "abnormal_count": r["abnormal"],
                    "system_error": 0,
                    "operation_ok": r["total"] > 0,
                    "threshold_ok": r["abnormal"] == 0,
                    "remark": "" if r["abnormal"] == 0 else (
                        "high wind speed" if r["abnormal"] > 30 else "gust detected"
                    )
                })

    except Exception as e:
        print("DB ERROR monitoring_summary:", e)

    return results


# =========================
# Monthly Averages (for dashboard bar chart)
# =========================
def monthly_avg_readings(months=12):
    """
    Returns monthly averages of atrhs temperature, humidity,
    and structural temperature for the past N months.
    """
    results = []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT
                date_trunc('month', time) AS month,
                ROUND(AVG(temperature)::numeric, 1) AS avg_temp,
                ROUND(AVG(humidity)::numeric, 1)    AS avg_rh
            FROM atrhs
            WHERE time >= NOW() - INTERVAL '%s months'
            GROUP BY date_trunc('month', time)
            ORDER BY month
        """, (months,))
        atrhs_rows = cur.fetchall()

        cur.execute("""
            SELECT
                date_trunc('month', time) AS month,
                ROUND(AVG(temperature)::numeric, 1) AS avg_stemp
            FROM temps
            WHERE time >= NOW() - INTERVAL '%s months'
            GROUP BY date_trunc('month', time)
            ORDER BY month
        """, (months,))
        temp_rows = cur.fetchall()
        cur.close()

        # Merge by month
        temp_map = {}
        for r in temp_rows:
            key = r["month"].strftime("%Y-%m")
            temp_map[key] = r["avg_stemp"]

        for r in atrhs_rows:
            key = r["month"].strftime("%Y-%m")
            results.append({
                "month": key,
                "avg_temp": float(r["avg_temp"]) if r["avg_temp"] else 0,
                "avg_rh": float(r["avg_rh"]) if r["avg_rh"] else 0,
                "avg_stemp": float(temp_map.get(key, 0))
            })

    except Exception as e:
        print("DB ERROR monthly_avg_readings:", e)

    return results


# =========================
# Storage Info
# =========================
def get_storage_info():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Revisi query untuk mendapatkan data TERBARU untuk setiaps DISK
            cur.execute("""
                SELECT DISTINCT ON (disk_name)
                    disk_name,
                    disk_total,
                    disk_used,
                    disk_free,
                    disk_percentage,
                    local_datetime
                FROM storage_info
                ORDER BY disk_name, local_datetime DESC
            """)
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR get_storage_info:", e)
        return []


# =========================
# Sensor / Channel Info
# =========================
def get_sensor_info():
    """Get all sensor/channel info from the sensor_info table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    id,
                    sensor_id,
                    sensor_code,
                    channel_code,
                    logger,
                    channel_index,
                    sensor_type,
                    sensor_group,
                    sampling_hz,
                    direction,
                    location,
                    operation,
                    trigger_setting,
                    manufacturer,
                    model,
                    serial_no,
                    install_at,
                    ip_address,
                    port,
                    th1, th2, th3


                FROM sensor_info
                ORDER BY id
            """)
            return cur.fetchall()

    except Exception as e:
        with open("d:\\KNOWLEDGE\\2026\\shms_mqtt\\debug_sensor.txt", "a") as f:
            f.write(f"DB ERROR get_sensor_info: {e}\n")
        print("DB ERROR get_sensor_info:", e)
        return []


def add_sensor_info(data):
    """Add a new sensor/channel info record to the sensor_info table."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO sensor_info (
                    sensor_id, sensor_code, channel_code, logger, channel_index,
                    sensor_type, sensor_group, sampling_hz, direction, location,
                    operation, trigger_setting, manufacturer, model, serial_no,
                    install_at, ip_address, port, th1, th2, th3


                ) VALUES (
                    %(sensor_id)s, %(sensor_code)s, %(channel_code)s, %(logger)s, %(channel_index)s,
                    %(sensor_type)s, %(sensor_group)s, %(sampling_hz)s, %(direction)s, %(location)s,
                    %(operation)s, %(trigger_setting)s, %(manufacturer)s, %(model)s, %(serial_no)s,
                    %(install_at)s, %(ip_address)s, %(port)s, %(th1)s, %(th2)s, %(th3)s


                )
            """, data)
        return True
    except Exception as e:
        print("DB ERROR add_sensor_info:", e)
        return False


def update_sensor_info(data):
    """Update an existing sensor/channel info record in the sensor_info table."""
    try:
        # Ensure ID is an integer
        if data.get('id'):
            data['id'] = int(data['id'])
            
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE sensor_info SET
                    sensor_id = %(sensor_id)s,
                    sensor_code = %(sensor_code)s,
                    channel_code = %(channel_code)s,
                    logger = %(logger)s,
                    channel_index = %(channel_index)s,
                    sensor_type = %(sensor_type)s,
                    sensor_group = %(sensor_group)s,
                    sampling_hz = %(sampling_hz)s,
                    direction = %(direction)s,
                    location = %(location)s,
                    operation = %(operation)s,
                    trigger_setting = %(trigger_setting)s,
                    manufacturer = %(manufacturer)s,
                    model = %(model)s,
                    serial_no = %(serial_no)s,
                    install_at = %(install_at)s,
                    ip_address = %(ip_address)s,
                    port = %(port)s,
                    th1 = %(th1)s,

                    th2 = %(th2)s,
                    th3 = %(th3)s
                WHERE id = %(id)s
            """, data)
            updated = cur.rowcount > 0
            if not updated:
                print(f"DB WARNING: No sensor_info record found with ID {data.get('id')}")
            return updated
    except Exception as e:
        print("DB ERROR update_sensor_info:", e)
        return False





def get_sensor_thresholds(sensor_id):
    """Get thresholds (th1, th2, th3) for a specific sensor_id."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT th1, th2, th3 FROM sensor_info WHERE sensor_id = %s LIMIT 1", (sensor_id,))
            return cur.fetchone()
    except Exception as e:
        print(f"DB ERROR get_sensor_thresholds for {sensor_id}:", e)
        return None


# =========================
# Logger Info
# =========================
def get_logger_info():
    """Get all logger info from the logger_info table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    logger_code,
                    type,
                    location,
                    logger_name,
                    logger_product,
                    logger_manufacture,
                    logger_model,
                    logger_serial,
                    install_timestamp,
                    ip_address,
                    status
                FROM logger_info
                ORDER BY id
            """)
            return cur.fetchall()

    except Exception as e:
        print("DB ERROR get_logger_info:", e)
        return []
        
# =========================
# Structural Health Index
# =========================
def get_latest_health():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT *
                FROM structural_health_index
                ORDER BY analysis_time DESC
                LIMIT 1
            """)
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR get_latest_health:", e)
        return None

def get_dashboard_summary():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    s.analysis_time,
                    s.health_score,
                    a.mode_number,
                    a.freq_drift_percent,
                    a.status
                FROM structural_health_index s
                JOIN modal_alert_status a
                ON s.analysis_time = a.analysis_time
                ORDER BY s.analysis_time DESC
                LIMIT 6
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_dashboard_summary:", e)
        return []

def get_modal_trend(mode_number):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT analysis_time, frequency
                FROM modal_results
                WHERE mode_number = %s
                ORDER BY analysis_time
            """, (mode_number,))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_modal_trend:", e)
        return []

def get_latest_alerts():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT *
                FROM modal_alert_status
                WHERE status != 'NORMAL'
                ORDER BY analysis_time DESC
                LIMIT 20
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_latest_alerts:", e)
        return []

def get_mode_shape(mode_number):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT shape_vector
                FROM mode_shapes
                WHERE mode_number = %s
                ORDER BY analysis_time DESC
                LIMIT 1
            """, (mode_number,))
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR get_mode_shape:", e)
        return None

def get_modal_spectrum():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get latest frequency for each unique mode_number
            cur.execute("""
                SELECT DISTINCT ON (mode_number) mode_number, frequency, analysis_time
                FROM modal_results
                ORDER BY mode_number, analysis_time DESC
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_modal_spectrum:", e)
        return []

# =========================
# Cable Stay
# =========================
def get_cable_stay_sensors():
    """Get all distinct sensor IDs from the cable_stays table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id 
                FROM cable_stays 
                WHERE sensor_id IS NOT NULL
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_cable_stay_sensors:", e)
        return []

def get_latest_cable_stays():
    """Get the latest record for each cable stay sensor."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT ON (sensor_id) 
                    time, sensor_id, force, stress, temperature
                FROM cable_stays
                ORDER BY sensor_id, time DESC
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_latest_cable_stays:", e)
        return []

def latest_cable_stay_by_sensor(sensor_id):
    """Get the latest single record for a specific cable stay sensor."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT time, sensor_id, force, stress, temperature
                FROM cable_stays
                WHERE sensor_id = %s
                ORDER BY time DESC
                LIMIT 1
            """, (sensor_id,))
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR latest_cable_stay_by_sensor:", e)
        return None

def cable_stay_history(sensor_id, limit=100):
    """Get historical data for a specific cable stay sensor."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT time, sensor_id, force, stress, temperature
                FROM cable_stays
                WHERE sensor_id = %s
                ORDER BY time DESC
                LIMIT %s
            """, (sensor_id, limit))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR cable_stay_history:", e)
        return []

# =========================
# Wind Monitor (ANM 2D)
# =========================
def get_anm2d_sensors():
    """Get all distinct sensor IDs from the anm2d table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id 
                FROM anm2d 
                WHERE sensor_id IS NOT NULL
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_wind_sensors:", e)
        return []

def latest_anm2d(sensor_id=None):
    """Get the latest record for wind data from anm2d."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, sensor_id, wind_speed, wind_direction FROM anm2d "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT 1"
            cur.execute(query, params)
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR latest_anm2d:", e)
        return None

def anm2d_by_range(start, end):
    """Get wind data within a time range."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT time, sensor_id, wind_speed, wind_direction
                FROM anm2d
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start, end))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR anm2d_by_range:", e)
        return []

# =========================
# Tiltmeter
# =========================
def latest_tiltmeter(sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur: 
            query = "SELECT time, sensor_id, angle_x, angle_y FROM tiltmeter "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT 1"
            cur.execute(query, params)
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR latest_tiltmeter:", e)
        return None

def tiltmeter_timeseries(limit=300, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, sensor_id, angle_x, angle_y FROM tiltmeter "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR tiltmeter_timeseries:", e)
        return []

def tiltmeter_history(limit=100, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, sensor_id, angle_x, angle_y FROM tiltmeter "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR tiltmeter_history:", e)
        return []

def get_tiltmeter_sensors():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id 
                FROM tiltmeter 
                WHERE sensor_id IS NOT NULL 
                ORDER BY sensor_id ASC
            """)
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_tiltmeter_sensors:", e)
        return []

def tiltmeter_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT time, sensor_id, angle_x, angle_y
                FROM tiltmeter
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR tiltmeter_by_range:", e)
        return []

def tiltmeter_statistik_by_range(start_date, end_date, sensor_id=None):
    """Fetch 10-min aggregated statistics from tiltmeter_statistic table."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT DISTINCT ON (s.time, s.sensor_id) s.*, si.th1, si.th2 
                FROM tiltmeter_statistic s
                LEFT JOIN sensor_info si ON s.sensor_id = si.sensor_id
                WHERE s.time >= %s AND s.time <= %s
            """
            params = [start_date, end_date]
            if sensor_id:
                query += " AND s.sensor_id = %s "
                params.append(sensor_id)
            query += " ORDER BY s.time ASC "
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR tiltmeter_statistik_by_range:", e)
        return []

def cable_stays_by_range(start_date, end_date):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT time, sensor_id, force, stress, temperature
                FROM cable_stays
                WHERE time >= %s AND time <= %s
                ORDER BY time ASC
            """, (start_date, end_date))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR cable_stays_by_range:", e)
        return []

# =========================
# Tilt Displacement
# =========================
import math as _math

def get_tilt_disp_properties():
    """Ambil parameter fisik jembatan terbaru dari tilt_dsp_properties."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    id,
                    bridge_name,
                    l_bridge,
                    delta_x,
                    threshold_warning_mm,
                    threshold_critical_mm,
                    threshold_emergency_mm,
                    threshold_rotation_deg
                FROM tilt_dsp_properties
                ORDER BY time DESC
                LIMIT 1
            """)
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR get_tilt_disp_properties:", e)
        return None

def process_tilt_displacement():
    """
    Proses data tiltmeter mentah → defleksi kumulatif menggunakan:
      1. Downsampling AVG per-menit (mengurangi noise kendaraan)
      2. Integrasi numerik Trapezoidal antar sensor
    Hanya memproses data yang lebih baru dari MAX(time) di tilt_displacement.
    """
    try:
        props = get_tilt_disp_properties()
        if not props:
            print("⚠️ process_tilt_displacement: Properti jembatan belum tersedia di tilt_dsp_properties.")
            return 0

        delta_x_mm = (props["delta_x"] or 1.0) * 1000.0

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Query data mentah dengan rata-rata per menit (hanya data baru)
            cur.execute("""
                SELECT
                    date_trunc('minute', "time") AS bucket_time,
                    sensor_id,
                    AVG(angle_y) AS avg_angle_y
                FROM tiltmeter
                WHERE "time" >= (
                    SELECT COALESCE(MAX("time"), '2026-01-01'::timestamp)
                    FROM tilt_displacement
                )
                GROUP BY bucket_time, sensor_id
                ORDER BY bucket_time ASC, sensor_id ASC
            """)
            rows = cur.fetchall()

        if not rows:
            return 0

        # 2. Kelompokkan per bucket_time
        data_by_time = {}
        for row in rows:
            t = row["bucket_time"]
            if t not in data_by_time:
                data_by_time[t] = {}
            data_by_time[t][row["sensor_id"]] = row["avg_angle_y"]

        results_to_insert = []

        # 3. Kalkulasi geometris per menit (integrasi Trapezoidal)
        for ts, sensors in data_by_time.items():
            sensor_keys = sorted(sensors.keys())
            if len(sensor_keys) < 2:
                continue

            current_deflection = 0.0

            # Titik awal (sensor pertama) → defleksi 0
            results_to_insert.append((ts, sensor_keys[0], 0.0))

            for i in range(1, len(sensor_keys)):
                s_prev = sensor_keys[i - 1]
                s_curr = sensor_keys[i]

                angle_prev = sensors[s_prev]
                angle_curr = sensors[s_curr]

                if angle_prev is None or angle_curr is None:
                    continue

                theta_prev = _math.radians(angle_prev)
                theta_curr = _math.radians(angle_curr)

                avg_theta = (theta_prev + theta_curr) / 2.0
                dy = delta_x_mm * _math.tan(avg_theta)

                current_deflection += dy
                results_to_insert.append((ts, s_curr, round(current_deflection, 3)))

        # 4. Simpan ke tilt_displacement
        if results_to_insert:
            with conn.cursor() as cur:
                from psycopg2.extras import execute_batch
                execute_batch(cur, """
                    INSERT INTO tilt_displacement (time, sensor_id, deflection_mm)
                    VALUES (%s, %s, %s)
                    ON CONFLICT ("time", sensor_id) DO UPDATE 
                    SET deflection_mm = EXCLUDED.deflection_mm
                """, results_to_insert)
            processed = len(data_by_time)
            print(f"📐 Displacement: {processed} menit data berhasil diproses ({len(results_to_insert)} baris)")
            return processed

        return 0

    except Exception as e:
        print("DB ERROR process_tilt_displacement:", e)
        return 0

def get_tilt_displacement_timeseries(limit=300, sensor_id=None):
    """Timeseries defleksi untuk chart, diurutkan dari terbaru."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT time, sensor_id, deflection_mm FROM tilt_displacement "
            params = []
            if sensor_id:
                query += "WHERE sensor_id = %s "
                params.append(sensor_id)
            query += "ORDER BY time DESC LIMIT %s"
            params.append(limit)
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_tilt_displacement_timeseries:", e)
        return []

def get_tilt_displacement_latest():
    """Ambil defleksi terbaru untuk setiap sensor (1 baris per sensor_id)."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT ON (sensor_id)
                    time, sensor_id, deflection_mm
                FROM tilt_displacement
                ORDER BY sensor_id, time DESC
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_tilt_displacement_latest:", e)
        return []

# =========================
# Notifications
# =========================
def init_notif_table():
    """Create the notifications table if it doesn't exist."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    status TEXT NOT NULL,
                    sensor_id TEXT,
                    is_read BOOLEAN DEFAULT FALSE
                )
            """)
    except Exception as e:
        print("DB ERROR init_notif_table:", e)

def add_notification(title, message, status, sensor_id=None):
    """Add or update a notification for a sensor for the current day."""
    try:
        with conn.cursor() as cur:
            # Check if notification exists for this sensor on the same day
            cur.execute("""
                SELECT id FROM notifications 
                WHERE sensor_id = %s 
                AND date_trunc('day', time) = date_trunc('day', CURRENT_TIMESTAMP)
                LIMIT 1
            """, (sensor_id,))
            row = cur.fetchone()
            
            if row:
                # Update existing notification with latest data
                cur.execute("""
                    UPDATE notifications 
                    SET title = %s, message = %s, status = %s, time = CURRENT_TIMESTAMP, is_read = FALSE
                    WHERE id = %s
                """, (title, message, status, row[0]))
            else:
                # Insert new notification
                cur.execute("""
                    INSERT INTO notifications (title, message, status, sensor_id)
                    VALUES (%s, %s, %s, %s)
                """, (title, message, status, sensor_id))
    except Exception as e:
        print("DB ERROR add_notification:", e)

def get_notifications(limit=20):
    """Get the latest notifications."""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, time, title, message, status, sensor_id, is_read
                FROM notifications
                ORDER BY time DESC
                LIMIT %s
            """, (limit,))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_notifications:", e)
        return []

def mark_notifications_read():
    """Mark all unread notifications as read."""
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE")
    except Exception as e:
        print("DB ERROR mark_notifications_read:", e)

def delete_notification(notif_id):
    """Delete a specific notification."""
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM notifications WHERE id = %s", (notif_id,))
    except Exception as e:
        print("DB ERROR delete_notification:", e)

# =========================
# Weekly Periods
# =========================
def get_weekly_years():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT DISTINCT year FROM weekly_periods ORDER BY year DESC")
            return [str(r['year']).strip() for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_weekly_years:", e)
        return []

def get_weekly_months(year):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT DISTINCT month FROM weekly_periods WHERE year = %s ORDER BY month ASC", (year,))
            return [r['month'] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_weekly_months:", e)
        return []

def get_weekly_periods(year, month):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT periode_label, start_date, end_date 
                FROM weekly_periods 
                WHERE year = %s AND month = %s 
                ORDER BY start_date ASC
            """, (year, month))
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_weekly_periods:", e)
        return []

def init_anm3d_statistik_table():
    """Create the anm3d_statistic table if it doesn't exist."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS anm3d_statistic (
                    id SERIAL PRIMARY KEY,
                    time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                    sensor_id VARCHAR(50),
                    sensor_type VARCHAR(50),
                    unit VARCHAR(20),
                    min_wind_speed DOUBLE PRECISION,
                    max_wind_speed DOUBLE PRECISION,
                    avg_wind_speed DOUBLE PRECISION,
                    min_wind_direction DOUBLE PRECISION,
                    max_wind_direction DOUBLE PRECISION,
                    avg_wind_direction DOUBLE PRECISION,
                    min_wind_elevation DOUBLE PRECISION,
                    max_wind_elevation DOUBLE PRECISION,
                    avg_wind_elevation DOUBLE PRECISION,
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_anm3d_stat_time ON anm3d_statistic(time);
                CREATE INDEX IF NOT EXISTS idx_anm3d_stat_sensor ON anm3d_statistic(sensor_id);
            """)
    except Exception as e:
        print("DB ERROR init_anm3d_statistik_table:", e)

def init_acc_fft_table():
    """Create the acc_fft_history table if it doesn't exist."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS acc_fft_history (
                    id SERIAL PRIMARY KEY,
                    time TIMESTAMP(0) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    sensor_id VARCHAR(50) NOT NULL,
                    
                    -- X Axis Peaks (Top 3)
                    x_f1 DOUBLE PRECISION, x_m1 DOUBLE PRECISION,
                    x_f2 DOUBLE PRECISION, x_m2 DOUBLE PRECISION,
                    x_f3 DOUBLE PRECISION, x_m3 DOUBLE PRECISION,
                    
                    -- Y Axis Peaks (Top 3)
                    y_f1 DOUBLE PRECISION, y_m1 DOUBLE PRECISION,
                    y_f2 DOUBLE PRECISION, y_m2 DOUBLE PRECISION,
                    y_f3 DOUBLE PRECISION, y_m3 DOUBLE PRECISION,
                    
                    -- Z Axis Peaks (Top 3)
                    z_f1 DOUBLE PRECISION, z_m1 DOUBLE PRECISION,
                    z_f2 DOUBLE PRECISION, z_m2 DOUBLE PRECISION,
                    z_f3 DOUBLE PRECISION, z_m3 DOUBLE PRECISION,
                    
                    filename VARCHAR(255)
                );
                CREATE INDEX IF NOT EXISTS idx_acc_fft_time ON acc_fft_history(time);
                CREATE INDEX IF NOT EXISTS idx_acc_fft_sensor ON acc_fft_history(sensor_id);
            """)
            
        # Attempt ALTER in a separate transaction to avoid blocking everything
        try:
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE acc_fft_history ALTER COLUMN time TYPE TIMESTAMP(0) WITH TIME ZONE;")
        except:
            pass
            
    except Exception as e:
        print("DB ERROR init_acc_fft_table:", e)

def insert_acc_fft(sensor_id, peaks, filename=None):
    """
    Inserts FFT peak results into the database.
    peaks: dict with keys 'x', 'y', 'z' each containing a list of {f, m}
    """
    try:
        with conn.cursor() as cur:
            def get_p(axis, i):
                p_list = peaks.get(axis, [])
                if len(p_list) > i:
                    f = round(p_list[i]['freq'], 4)
                    m = round(p_list[i]['mag'], 6)
                    return f, m
                return None, None

            xf1, xm1 = get_p('x', 0); xf2, xm2 = get_p('x', 1); xf3, xm3 = get_p('x', 2)
            yf1, ym1 = get_p('y', 0); yf2, ym2 = get_p('y', 1); yf3, ym3 = get_p('y', 2)
            zf1, zm1 = get_p('z', 0); zf2, zm2 = get_p('z', 1); zf3, zm3 = get_p('z', 2)

            cur.execute("""
                INSERT INTO acc_fft_history (
                    time, sensor_id, filename,
                    x_f1, x_m1, x_f2, x_m2, x_f3, x_m3,
                    y_f1, y_m1, y_f2, y_m2, y_f3, y_m3,
                    z_f1, z_m1, z_f2, z_m2, z_f3, z_m3
                ) VALUES (CURRENT_TIMESTAMP(0), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                sensor_id, filename,
                xf1, xm1, xf2, xm2, xf3, xm3,
                yf1, ym1, yf2, ym2, yf3, ym3,
                zf1, zm1, zf2, zm2, zf3, zm3
            ))
    except Exception as e:
        print("DB ERROR insert_acc_fft:", e)

def get_acc_fft_history_query(sensor_id, start_date=None, end_date=None):
    """Retrieves historical FFT peaks for a sensor, with optional date filtering."""
    try:
        from psycopg2.extras import RealDictCursor
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT * FROM acc_fft_history WHERE sensor_id = %s"
            params = [sensor_id]
            
            if start_date:
                query += " AND time AT TIME ZONE 'Asia/Jakarta' >= %s"
                params.append(start_date)
            if end_date:
                query += " AND time AT TIME ZONE 'Asia/Jakarta' <= %s"
                params.append(end_date)
                
            query += " ORDER BY time ASC LIMIT 5000"
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_acc_fft_history_query:", e)
        return []

# Initialize tables on import
init_notif_table()
init_anm3d_statistik_table()
init_acc_fft_table()

# =========================
# User Management
# =========================
def get_all_users():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT id, username, password, role FROM public."user" ORDER BY id ASC')
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_all_users:", e)
        return []

def get_user_by_username(username):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT id, username, password, role FROM public."user" WHERE username = %s', (username,))
            return cur.fetchone()
    except Exception as e:
        print("DB ERROR get_user_by_username:", e)
        return None

def add_user(data):
    try:
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO public."user" (username, password, role) VALUES (%s, %s, %s)',
                (data.get('username'), data.get('password'), data.get('role'))
            )
            return True
    except Exception as e:
        print("DB ERROR add_user:", e)
        return False

def update_user(data):
    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE public."user" SET username=%s, password=%s, role=%s WHERE id=%s',
                (data.get('username'), data.get('password'), data.get('role'), data.get('id'))
            )
            return True
    except Exception as e:
        print("DB ERROR update_user:", e)
        return False

def delete_user(user_id):
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM public."user" WHERE id=%s', (user_id,))
            return True
    except Exception as e:
        print("DB ERROR delete_user:", e)
        return False

# =========================
# Cable Tension (FFT-based)
# =========================

def get_sensors_list(sensor_type):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT DISTINCT sensor_id FROM sensor_info WHERE sensor_type = %s AND sensor_id IS NOT NULL ORDER BY sensor_id ASC",
                (sensor_type,),
            )
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_sensors_list:", e)
        return []

def get_cable_tension_sensors():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT DISTINCT sensor_id FROM cable_tension_history WHERE sensor_id IS NOT NULL ORDER BY sensor_id ASC"
            )
            return [r["sensor_id"] for r in cur.fetchall()]
    except Exception as e:
        print("DB ERROR get_cable_tension_sensors:", e)
        return []

def get_latest_cable_tensions():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT ON (sensor_id)
                    time, sensor_id, f1, f2, f3, t1, t2, t3, tension_avg
                FROM cable_tension_history
                ORDER BY sensor_id, time DESC
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_latest_cable_tensions:", e)
        return []

def cable_tension_history_data(sensor_id, limit=100):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT time, sensor_id, f1, f2, f3, t1, t2, t3, tension_avg FROM cable_tension_history WHERE sensor_id = %s ORDER BY time DESC LIMIT %s",
                (sensor_id, limit),
            )
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR cable_tension_history_data:", e)
        return []

def cable_tension_by_range(start, end, sensor_id=None):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if sensor_id:
                cur.execute(
                    "SELECT time, sensor_id, f1, f2, f3, t1, t2, t3, tension_avg FROM cable_tension_history WHERE time >= %s AND time <= %s AND sensor_id = %s ORDER BY time ASC",
                    (start, end, sensor_id),
                )
            else:
                cur.execute(
                    "SELECT time, sensor_id, f1, f2, f3, t1, t2, t3, tension_avg FROM cable_tension_history WHERE time >= %s AND time <= %s ORDER BY time ASC",
                    (start, end),
                )
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR cable_tension_by_range:", e)
        return []

def get_cable_tension_positions():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT sensor_id, x, y, label
                FROM sensor_positions
                WHERE sensor_type = 'cable_tension'
                ORDER BY sensor_id ASC
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_cable_tension_positions:", e)
        return []

def save_sensor_position(data):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO sensor_positions (sensor_id, sensor_type, x, y, label)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (sensor_id, sensor_type) DO UPDATE
                SET x = EXCLUDED.x, y = EXCLUDED.y, label = EXCLUDED.label
            """, (data["sensor_id"], data.get("sensor_type", "cable_tension"),
                  data["x"], data["y"], data.get("label", "")))
            return True
    except Exception as e:
        print("DB ERROR save_sensor_position:", e)
        return False

def batch_save_sensor_positions(data_list):
    try:
        with conn.cursor() as cur:
            for d in data_list:
                cur.execute("""
                    INSERT INTO sensor_positions (sensor_id, sensor_type, x, y, label)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (sensor_id, sensor_type) DO UPDATE
                    SET x = EXCLUDED.x, y = EXCLUDED.y, label = EXCLUDED.label
                """, (d["sensor_id"], d.get("sensor_type", "cable_tension"),
                      d["x"], d["y"], d.get("label", "")))
            return True, None
    except Exception as e:
        print("DB ERROR batch_save_sensor_positions:", e)
        return False, str(e)

def get_strain_sensor_locations():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT si.sensor_id, si.sensor_code,
                    COALESCE(sp.x, 10) AS pos_x, COALESCE(sp.y, 40) AS pos_y
                FROM sensor_info si
                LEFT JOIN sensor_positions sp ON sp.sensor_id = si.sensor_id AND sp.sensor_type = 'strain'
                WHERE si.sensor_type = 'Strain' AND si.sensor_id IS NOT NULL
                ORDER BY si.sensor_id ASC
            """)
            return cur.fetchall()
    except Exception as e:
        print("DB ERROR get_strain_sensor_locations:", e)
        return []

def save_strain_sensor_position(sensor_id, pos_x, pos_y):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO sensor_positions (sensor_id, sensor_type, x, y)
                VALUES (%s, 'strain', %s, %s)
                ON CONFLICT (sensor_id, sensor_type) DO UPDATE
                SET x = EXCLUDED.x, y = EXCLUDED.y
            """, (sensor_id, pos_x, pos_y))
            return True, None
    except Exception as e:
        print("DB ERROR save_strain_sensor_position:", e)
        return False, str(e)

def batch_save_strain_sensor_positions(data_list):
    try:
        with conn.cursor() as cur:
            for d in data_list:
                cur.execute("""
                    INSERT INTO sensor_positions (sensor_id, sensor_type, x, y)
                    VALUES (%s, 'strain', %s, %s)
                    ON CONFLICT (sensor_id, sensor_type) DO UPDATE
                    SET x = EXCLUDED.x, y = EXCLUDED.y
                """, (d["sensor_id"], d["pos_x"], d["pos_y"]))
            return True, None
    except Exception as e:
        print("DB ERROR batch_save_strain_sensor_positions:", e)
        return False, str(e)
