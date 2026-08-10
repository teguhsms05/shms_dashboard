from db import conn

try:
    with conn.cursor() as cur:
        # Check if anm2d01 exists first
        cur.execute("SELECT sensor_id FROM sensor_info WHERE sensor_id = 'anm2d01'")
        if cur.fetchone():
            print("Sensor anm2d01 exists, updating...")
            cur.execute("UPDATE sensor_info SET th1 = 18.5, th2 = 25.0 WHERE sensor_id = 'anm2d01'")
            conn.commit()
            print("Update committed.")
        else:
            print("Sensor anm2d01 NOT FOUND in sensor_info table.")
            # Let's see what's in there
            cur.execute("SELECT sensor_id FROM sensor_info LIMIT 5")
            sensors = cur.fetchall()
            print("Sample sensors:", sensors)
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
