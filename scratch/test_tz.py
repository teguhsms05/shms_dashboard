import psycopg2

try:
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=6543,
        dbname="shms",
        user="postgres",
        password="postgres123"
    )
    cur = conn.cursor()
    cur.execute("SELECT (now() AT TIME ZONE 'Asia/Jakarta')::text")
    row = cur.fetchone()
    print("Local Time (Asia/Jakarta):", row[0])
    conn.close()
except Exception as e:
    print("Error:", e)
