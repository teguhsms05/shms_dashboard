import sys
import os
# Add current dir to path to import db
sys.path.append(os.getcwd())

from db import process_tilt_displacement
import psycopg2
from psycopg2.extras import RealDictCursor

print("Manually triggering process_tilt_displacement()...")
count = process_tilt_displacement()
print(f"Processed {count} minutes.")

# Check the table results
try:
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=6543,
        dbname="shms",
        user="postgres",
        password="postgres123"
    )
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT time, COUNT(*) as cnt 
            FROM tilt_displacement 
            GROUP BY time 
            ORDER BY time DESC 
            LIMIT 5;
        """)
        rows = cur.fetchall()
        print("\n--- Rows per Timestamp AFTER manual trigger ---")
        for r in rows:
            print(f"{r['time']} | {r['cnt']}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
