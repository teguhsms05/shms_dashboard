import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta

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

def aggregate_tiltmeter(start_time, end_time):
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
                return 0

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
            return len(rows)
        conn.close()
    except Exception as e:
        print(f"Error at {start_time}:", e)
        return -1

def backfill(days=15):
    now = datetime.now()
    now = now.replace(minute=(now.minute // 10) * 10, second=0, microsecond=0)
    
    total_processed = 0
    total_intervals = days * 24 * 6
    print(f"Starting backfill for {days} days ({total_intervals} intervals)...")
    
    for i in range(total_intervals):
        end = now - timedelta(minutes=i * 10)
        start = end - timedelta(minutes=10)
        count = aggregate_tiltmeter(start, end)
        if count > 0:
            print(f"Processed {count} sensors for {start}")
            total_processed += count
        elif count == -1:
            pass # Error already printed
            
    print(f"Backfill complete. Total inserted: {total_processed}")

if __name__ == "__main__":
    backfill(15)
