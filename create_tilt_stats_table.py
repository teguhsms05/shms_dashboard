import psycopg2

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 1883, # Wait, port 1883 is MQTT. DB port in stats_service.py was 6543 or something. 
    # Let me check stats_service.py again for DB_CONFIG.
    "dbname": "shms",
    "user": "postgres",
    "password": "postgres123"
}

# Actually I'll use the values from stats_service.py
# host: 127.0.0.1, port: 6543, dbname: shms, user: postgres, password: postgres123

def create_table():
    try:
        conn = psycopg2.connect(host="127.0.0.1", port=6543, dbname="shms", user="postgres", password="postgres123")
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tiltmeter_statistic (
                    id SERIAL PRIMARY KEY,
                    time TIMESTAMP NOT NULL,
                    sensor_id VARCHAR(50) NOT NULL,
                    sensor_type VARCHAR(50),
                    unit VARCHAR(20),
                    min_angle_x DOUBLE PRECISION,
                    max_angle_x DOUBLE PRECISION,
                    avg_angle_x DOUBLE PRECISION,
                    min_angle_y DOUBLE PRECISION,
                    max_angle_y DOUBLE PRECISION,
                    avg_angle_y DOUBLE PRECISION,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_tilt_stat_time ON tiltmeter_statistic(time);
                CREATE INDEX IF NOT EXISTS idx_tilt_stat_sensor ON tiltmeter_statistic(sensor_id);
            """)
            print("Table tiltmeter_statistic created successfully.")
        conn.close()
    except Exception as e:
        print("Error creating table:", e)

if __name__ == "__main__":
    create_table()
