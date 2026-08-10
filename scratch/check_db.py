import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host="127.0.0.1",
    port=6543,
    dbname="shms",
    user="postgres",
    password="postgres123"
)

try:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM weekly_periods LIMIT 5")
        rows = cur.fetchall()
        for r in rows:
            print(r)
finally:
    conn.close()
