import psycopg2

def create_statistic_table():
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
            # Drop table if exists for clean slate (optional, but requested schema had serial ID which might conflict if partially created)
            # Actually, user said IF NOT EXISTS, so I'll follow that.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS public.anm2d_statistic
                (
                    id serial PRIMARY KEY,
                    "time" timestamp without time zone DEFAULT now(),
                    sensor_id character varying(50),
                    sensor_type character varying(50),
                    unit character varying(50),
                    min_wind_speed double precision,
                    max_wind_speed double precision,
                    avg_wind_speed double precision,
                    min_wind_direction double precision,
                    max_wind_direction double precision,
                    avg_wind_direction double precision
                )
            """)
            print("Table anm2d_statistic created successfully!")
        conn.close()
    except Exception as e:
        print("Error creating table:", e)

if __name__ == "__main__":
    create_statistic_table()
