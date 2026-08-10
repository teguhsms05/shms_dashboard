import psycopg2
from psycopg2.extras import RealDictCursor
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

# DB Configuration
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 6543,
    "dbname": "shms",
    "user": "postgres",
    "password": "postgres123"
}

def get_connection():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    return conn

def get_last_stat_time():
    """
    Get the latest timestamp from anm2d_statistic table.
    """
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(time) FROM anm2d_statistic")
            last_time = cur.fetchone()[0]
        conn.close()
        return last_time
    except Exception as e:
        print(f"[{datetime.now()}] Error getting last stat time:", e)
        return None

def aggregate_anm2d(start_time, end_time):
    """
    Calculate min, max, avg statistics for anm2d data between start_time and end_time.
    Values are rounded to 2 decimal places.
    """
    query = """
        SELECT 
            sensor_id,
            sensor_type,
            unit,
            MIN(wind_speed) as min_ws,
            MAX(wind_speed) as max_ws,
            AVG(wind_speed) as avg_ws,
            MIN(wind_direction) as min_wd,
            MAX(wind_direction) as max_wd,
            AVG(wind_direction) as avg_wd
        FROM anm2d
        WHERE time >= %s AND time < %s
        GROUP BY sensor_id, sensor_type, unit
    """
    
    insert_query = """
        INSERT INTO anm2d_statistic (
            time, sensor_id, sensor_type, unit, 
            min_wind_speed, max_wind_speed, avg_wind_speed, 
            min_wind_direction, max_wind_direction, avg_wind_direction
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Fetch Aggregated Data
            cur.execute(query, (start_time, end_time))
            rows = cur.fetchall()
            
            if not rows:
                return

            # 2. Prevent Duplicates: Delete existing stats for this exact interval before inserting
            cur.execute("DELETE FROM anm2d_statistic WHERE time = %s", (start_time,))

            # 3. Insert into Statistic Table with rounding
            for r in rows:
                cur.execute(insert_query, (
                    start_time,
                    r['sensor_id'],
                    r['sensor_type'],
                    r['unit'],
                    round(r['min_ws'] or 0, 2),
                    round(r['max_ws'] or 0, 2),
                    round(r['avg_ws'] or 0, 2),
                    round(r['min_wd'] or 0, 2),
                    round(r['max_wd'] or 0, 2),
                    round(r['avg_wd'] or 0, 2)
                ))
            
            print(f"[{datetime.now()}] Successfully processed {len(rows)} sensors for interval starting at {start_time}")
            
        conn.close()
    except Exception as e:
        print(f"[{datetime.now()}] Error in aggregate_anm2d:", e)

def aggregate_anm3d(start_time, end_time):
    """
    Calculate min, max, avg statistics for anm3d data between start_time and end_time.
    """
    query = """
        SELECT 
            sensor_id,
            sensor_type,
            unit,
            MIN(wind_speed) as min_ws,
            MAX(wind_speed) as max_ws,
            AVG(wind_speed) as avg_ws,
            MIN(wind_direction) as min_wd,
            MAX(wind_direction) as max_wd,
            AVG(wind_direction) as avg_wd,
            MIN(wind_elevation) as min_we,
            MAX(wind_elevation) as max_we,
            AVG(wind_elevation) as avg_we
        FROM anm3d
        WHERE time >= %s AND time < %s
        GROUP BY sensor_id, sensor_type, unit
    """
    
    insert_query = """
        INSERT INTO anm3d_statistic (
            time, sensor_id, sensor_type, unit, 
            min_wind_speed, max_wind_speed, avg_wind_speed, 
            min_wind_direction, max_wind_direction, avg_wind_direction,
            min_wind_elevation, max_wind_elevation, avg_wind_elevation
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (start_time, end_time))
            rows = cur.fetchall()
            
            if not rows:
                return

            # Prevent Duplicates: Delete existing stats for this exact interval before inserting
            cur.execute("DELETE FROM anm3d_statistic WHERE time = %s", (start_time,))

            for r in rows:
                cur.execute(insert_query, (
                    start_time,
                    r['sensor_id'],
                    r['sensor_type'],
                    r['unit'],
                    round(r['min_ws'] or 0, 2),
                    round(r['max_ws'] or 0, 2),
                    round(r['avg_ws'] or 0, 2),
                    round(r['min_wd'] or 0, 2),
                    round(r['max_wd'] or 0, 2),
                    round(r['avg_wd'] or 0, 2),
                    round(r['min_we'] or 0, 2),
                    round(r['max_we'] or 0, 2),
                    round(r['avg_we'] or 0, 2)
                ))
            
            print(f"[{datetime.now()}] Successfully processed {len(rows)} ANM3D sensors for interval starting at {start_time}")
            
        conn.close()
    except Exception as e:
        print(f"[{datetime.now()}] Error in aggregate_anm3d:", e)

def aggregate_atrhs(start_time, end_time):
    """
    Calculate min, max, avg statistics for atrhs data between start_time and end_time.
    """
    query = """
        SELECT 
            sensor_id,
            sensor_type,
            unit,
            MIN(temperature) as min_temp,
            MAX(temperature) as max_temp,
            AVG(temperature) as avg_temp,
            MIN(humidity) as min_rh,
            MAX(humidity) as max_rh,
            AVG(humidity) as avg_rh
        FROM atrhs
        WHERE time >= %s AND time < %s
        GROUP BY sensor_id, sensor_type, unit
    """
    
    insert_query = """
        INSERT INTO atrhs_statistic (
            time, sensor_id, sensor_type, unit, 
            min_temperature, max_temperature, avg_temperature, 
            min_humidity, max_humidity, avg_humidity
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (start_time, end_time))
            rows = cur.fetchall()
            
            if not rows:
                return

            # Prevent Duplicates: Delete existing stats for this exact interval before inserting
            cur.execute("DELETE FROM atrhs_statistic WHERE time = %s", (start_time,))

            for r in rows:
                cur.execute(insert_query, (
                    start_time,
                    r['sensor_id'],
                    r['sensor_type'],
                    r['unit'],
                    round(r['min_temp'] or 0, 2),
                    round(r['max_temp'] or 0, 2),
                    round(r['avg_temp'] or 0, 2),
                    round(r['min_rh'] or 0, 2),
                    round(r['max_rh'] or 0, 2),
                    round(r['avg_rh'] or 0, 2)
                ))
            
            print(f"[{datetime.now()}] Successfully processed {len(rows)} ATRHS sensors for interval starting at {start_time}")
            
        conn.close()
    except Exception as e:
        print(f"[{datetime.now()}] Error in aggregate_atrhs:", e)

def aggregate_temps(start_time, end_time):
    """
    Calculate min, max, avg statistics for temps data between start_time and end_time.
    """
    query = """
        SELECT 
            sensor_id,
            sensor_type,
            unit,
            MIN(temperature) as min_temp,
            MAX(temperature) as max_temp,
            AVG(temperature) as avg_temp
        FROM temps
        WHERE time >= %s AND time < %s
        GROUP BY sensor_id, sensor_type, unit
    """
    
    insert_query = """
        INSERT INTO temps_statistic (
            time, sensor_id, sensor_type, unit, 
            min_temperature, max_temperature, avg_temperature
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (start_time, end_time))
            rows = cur.fetchall()
            
            if not rows:
                return

            # Prevent Duplicates: Delete existing stats for this exact interval before inserting
            cur.execute("DELETE FROM temps_statistic WHERE time = %s", (start_time,))

            for r in rows:
                cur.execute(insert_query, (
                    start_time,
                    r['sensor_id'],
                    r['sensor_type'],
                    r['unit'],
                    round(r['min_temp'] or 0, 2),
                    round(r['max_temp'] or 0, 2),
                    round(r['avg_temp'] or 0, 2)
                ))
            
            print(f"[{datetime.now()}] Successfully processed {len(rows)} TEMPS sensors for interval starting at {start_time}")
            
        conn.close()
    except Exception as e:
        print(f"[{datetime.now()}] Error in aggregate_temps:", e)

def aggregate_tiltmeter(start_time, end_time):
    """
    Calculate min, max, avg statistics for tiltmeter data between start_time and end_time.
    """
    query = """
        SELECT 
            sensor_id,
            'tiltmeter' as sensor_type,
            'deg' as unit,
            MIN(angle_x) as min_ax,
            MAX(angle_x) as max_ax,
            AVG(angle_x) as avg_ax,
            MIN(angle_y) as min_ay,
            MAX(angle_y) as max_ay,
            AVG(angle_y) as avg_ay
        FROM tiltmeter
        WHERE time >= %s AND time < %s
        GROUP BY sensor_id
    """
    
    insert_query = """
        INSERT INTO tiltmeter_statistic (
            time, sensor_id, sensor_type, unit, 
            min_angle_x, max_angle_x, avg_angle_x, 
            min_angle_y, max_angle_y, avg_angle_y
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (start_time, end_time))
            rows = cur.fetchall()
            
            if not rows:
                return

            # Prevent Duplicates: Delete existing stats for this exact interval before inserting
            cur.execute("DELETE FROM tiltmeter_statistic WHERE time = %s", (start_time,))

            for r in rows:
                cur.execute(insert_query, (
                    start_time,
                    r['sensor_id'],
                    r['sensor_type'],
                    r['unit'],
                    round(r['min_ax'] or 0, 4),
                    round(r['max_ax'] or 0, 4),
                    round(r['avg_ax'] or 0, 4),
                    round(r['min_ay'] or 0, 4),
                    round(r['max_ay'] or 0, 4),
                    round(r['avg_ay'] or 0, 4)
                ))
            
            print(f"[{datetime.now()}] Successfully processed {len(rows)} Tiltmeter sensors for interval starting at {start_time}")
            
        conn.close()
    except Exception as e:
        print(f"[{datetime.now()}] Error in aggregate_tiltmeter:", e)

def backfill(days=7):
    """
    Aggregates data for the last N days, 10 minutes by 10 minutes.
    """
    now = datetime.now()
    now = now.replace(minute=(now.minute // 10) * 10, second=0, microsecond=0)
    
    total_intervals = days * 24 * 6
    with ThreadPoolExecutor(max_workers=5) as executor:
        for i in range(total_intervals):
            end = now - timedelta(minutes=i * 10)
            start = end - timedelta(minutes=10)
            # Parallelize across sensor types for this interval
            executor.submit(aggregate_anm2d, start, end)
            executor.submit(aggregate_anm3d, start, end)
            executor.submit(aggregate_atrhs, start, end)
            executor.submit(aggregate_temps, start, end)
            executor.submit(aggregate_tiltmeter, start, end)

def process_incremental():
    """
    Checks from last processed record up to currently completed interval.
    """
    # For simplicity, we process both based on their own last stat time
    def get_last_time(table):
        try:
            conn = get_connection()
            with conn.cursor() as cur:
                cur.execute(f"SELECT MAX(time) FROM {table}")
                last_time = cur.fetchone()[0]
                if not last_time:
                    if "anm2d" in table: source_table = "anm2d"
                    elif "anm3d" in table: source_table = "anm3d"
                    elif "atrhs" in table: source_table = "atrhs"
                    elif "tiltmeter" in table: source_table = "tiltmeter"
                    else: source_table = "temps"
                    cur.execute(f"SELECT MIN(time) FROM {source_table}")
                    last_time = cur.fetchone()[0]
            conn.close()
            return last_time
        except: return None

    # Current 10-min interval (e.g., if now is 15:07, now_rounded is 15:00)
    now = datetime.now()
    now_rounded = now.replace(minute=(now.minute // 10) * 10, second=0, microsecond=0)

    with ThreadPoolExecutor(max_workers=5) as executor:
        # 1. Process ANM2D
        last_2d = get_last_time("anm2d_statistic")
        if last_2d:
            last_2d = last_2d.replace(tzinfo=None, minute=(last_2d.minute // 10) * 10, second=0, microsecond=0)
            ptr = last_2d + timedelta(minutes=10)
            while ptr <= now_rounded:
                executor.submit(aggregate_anm2d, ptr - timedelta(minutes=10), ptr)
                ptr += timedelta(minutes=10)

        # 2. Process ANM3D
        last_3d = get_last_time("anm3d_statistic")
        if last_3d:
            last_3d = last_3d.replace(tzinfo=None, minute=(last_3d.minute // 10) * 10, second=0, microsecond=0)
            ptr = last_3d + timedelta(minutes=10)
            while ptr <= now_rounded:
                executor.submit(aggregate_anm3d, ptr - timedelta(minutes=10), ptr)
                ptr += timedelta(minutes=10)

        # 3. Process ATRHS
        last_atrhs = get_last_time("atrhs_statistic")
        if last_atrhs:
            last_atrhs = last_atrhs.replace(tzinfo=None, minute=(last_atrhs.minute // 10) * 10, second=0, microsecond=0)
            ptr = last_atrhs + timedelta(minutes=10)
            while ptr <= now_rounded:
                executor.submit(aggregate_atrhs, ptr - timedelta(minutes=10), ptr)
                ptr += timedelta(minutes=10)

        # 4. Process TEMPS
        last_temps = get_last_time("temps_statistic")
        if last_temps:
            last_temps = last_temps.replace(tzinfo=None, minute=(last_temps.minute // 10) * 10, second=0, microsecond=0)
            ptr = last_temps + timedelta(minutes=10)
            while ptr <= now_rounded:
                executor.submit(aggregate_temps, ptr - timedelta(minutes=10), ptr)
                ptr += timedelta(minutes=10)

        # 5. Process Tiltmeter
        last_tilt = get_last_time("tiltmeter_statistic")
        if last_tilt:
            last_tilt = last_tilt.replace(tzinfo=None, minute=(last_tilt.minute // 10) * 10, second=0, microsecond=0)
            ptr = last_tilt + timedelta(minutes=10)
            while ptr <= now_rounded:
                executor.submit(aggregate_tiltmeter, ptr - timedelta(minutes=10), ptr)
                ptr += timedelta(minutes=10)

def main_loop():
    """
    Main loop that runs every 10 minutes and catches up if behind.
    """
    print("ANM2D & ANM3D Statistics Service Started (Incremental 10-min intervals).")
    
    while True:
        process_incremental()
        
        # Calculate time to sleep until next 10-min mark
        now = datetime.now()
        next_interval = (now + timedelta(minutes=10)).replace(minute=((now.minute // 10) + 1) * 10 % 60, second=0, microsecond=0)
        if next_interval <= now:
            next_interval += timedelta(minutes=10)
        
        sleep_seconds = (next_interval - now).total_seconds()
        if sleep_seconds < 0: sleep_seconds = 60 # Safety
        
        print(f"Next catch-up at {next_interval}. Sleeping for {sleep_seconds:.2f} seconds.")
        time.sleep(sleep_seconds)

if __name__ == "__main__":
    # If run with --backfill N, it will aggregate past N days
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == "--backfill":
        try:
            days = int(sys.argv[2])
            backfill(days)
        except ValueError:
            print("Invalid backfill days.")
    else:
        main_loop()
