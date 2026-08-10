import psycopg2

def create_atrhs_statistic_table():
    try:
        conn = psycopg2.connect(
            host="127.0.0.1",
            port=6543,
            dbname="shms",
            user="postgres",
            password="postgres123"
        )
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS public.atrhs_statistic
                (
                    id serial PRIMARY KEY,
                    "time" timestamp without time zone DEFAULT now(),
                    sensor_id character varying(50),
                    sensor_type character varying(50),
                    unit character varying(50),
                    min_temperature double precision,
                    max_temperature double precision,
                    avg_temperature double precision,
                    min_humidity double precision,
                    max_humidity double precision,
                    avg_humidity double precision
                );
                CREATE INDEX IF NOT EXISTS idx_atrhs_stat_time ON atrhs_statistic(time);
                CREATE INDEX IF NOT EXISTS idx_atrhs_stat_sensor ON atrhs_statistic(sensor_id);
            """)
            print("Table atrhs_statistic created successfully!")
        conn.close()
    except Exception as e:
        print("Error creating table:", e)

if __name__ == "__main__":
    create_atrhs_statistic_table()
