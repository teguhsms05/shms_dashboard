import psycopg2
from db import conn_params

def check_columns():
    try:
        conn = psycopg2.connect(**conn_params)
        with conn.cursor() as cur:
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='sensor_info'")
            columns = [r[0] for r in cur.fetchall()]
            print("Columns in sensor_info:", columns)
        conn.close()
    except Exception as e:
        print(f"Error checking columns: {e}")

if __name__ == "__main__":
    check_columns()
