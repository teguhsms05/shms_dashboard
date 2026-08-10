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
    cur.execute("SELECT now(), CURRENT_TIMESTAMP(0)")
    row = cur.fetchone()
    print("Database Now:", row[0])
    print("CURRENT_TIMESTAMP(0):", row[1])
    
    cur.execute("SELECT count(*) FROM acc_fft_history")
    count = cur.fetchone()[0]
    print("Total records in acc_fft_history:", count)
    
    if count > 0:
        cur.execute("SELECT time FROM acc_fft_history ORDER BY time DESC LIMIT 1")
        last_time = cur.fetchone()[0]
        print("Last record time:", last_time)
        
    conn.close()
except Exception as e:
    print("Error:", e)
