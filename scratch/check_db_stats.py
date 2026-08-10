import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect("host=localhost dbname=shms_mqtt user=postgres password=postgres")

def check_db():
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT time, sensor_id FROM acc_fft_history ORDER BY time DESC LIMIT 10")
            rows = cur.fetchall()
            print("Latest 10 records:")
            for r in rows:
                print(f"Time: {r['time']}, Sensor: {r['sensor_id']}")
    except Exception as e:
        print("Error:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    check_db()
