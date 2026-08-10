"""
Script untuk membersihkan dan maintenance data tiltmeter
- Hapus data lama (> 7 hari)
- Agregasi data lama menjadi statistik
- Cegah duplikasi
"""

import sys
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from db import conn
from logger import get_logger

_log = get_logger("cleanup")

def create_indexes():
    """Buat index untuk performa query yang lebih baik"""
    try:
        _log.info("📌 Creating indexes...")

        with conn.cursor() as cur:
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tiltmeter_time 
                ON tiltmeter (time DESC)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tiltmeter_sensor_time 
                ON tiltmeter (sensor_id, time DESC)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tiltmeter_source_ts 
                ON tiltmeter (source_ts)
            """)

        _log.info("✅ Indexes created")
    except Exception as e:
        _log.error(f"❌ Index error: {e}")

def remove_duplicates():
    """Hapus duplikasi data dengan timestamp yang sama"""
    try:
        _log.info("🔍 Removing duplicates...")
        
        query = """
        WITH duplicates AS (
            SELECT 
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY sensor_id, source_ts 
                    ORDER BY id DESC
                ) as rn
            FROM tiltmeter
            WHERE source_ts IS NOT NULL
        )
        DELETE FROM tiltmeter
        WHERE id IN (
            SELECT id FROM duplicates WHERE rn > 1
        )
        """
        with conn.cursor() as cur:
            cur.execute(query)
            deleted = cur.rowcount
        _log.info(f"✅ Removed {deleted} duplicate rows")
    except Exception as e:
        _log.error(f"❌ Deduplication error: {e}")

def archive_old_data(days=7):
    """Pindahkan data lama ke tabel archive, atau hapus langsung"""
    try:
        _log.info(f"📦 Archiving data older than {days} days...")
        
        cutoff_date = datetime.now() - timedelta(days=days)
        
        query = f"""
        DELETE FROM tiltmeter 
        WHERE time < %s
        """
        with conn.cursor() as cur:
            cur.execute(query, (cutoff_date,))
            deleted = cur.rowcount
        _log.info(f"✅ Deleted {deleted} rows older than {days} days")
        
    except Exception as e:
        _log.error(f"❌ Archive error: {e}")

def get_table_stats():
    """Tampilkan statistik tabel"""
    try:
        _log.info("\n📊 Table Statistics:")
        
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM tiltmeter")
            count = cur.fetchone()[0]
            _log.info(f"  Total rows: {count:,}")

            cur.execute("""
                SELECT pg_size_pretty(pg_total_relation_size('tiltmeter')) as size
            """)
            size = cur.fetchone()[0]
            _log.info(f"  Table size: {size}")

            cur.execute("""
                SELECT MIN(time) as oldest, MAX(time) as newest 
                FROM tiltmeter
            """)
            oldest, newest = cur.fetchone()
            _log.info(f"  Date range: {oldest} to {newest}")

            cur.execute("""
                SELECT sensor_id, COUNT(*) as cnt 
                FROM tiltmeter 
                GROUP BY sensor_id 
                ORDER BY cnt DESC
            """)
            _log.info("\n  Rows per sensor:")
            for row in cur.fetchall():
                _log.info(f"    {row[0]}: {row[1]:,}")
            
    except Exception as e:
        _log.error(f"❌ Stats error: {e}")

def optimize_table():
    """Optimize tabel setelah cleanup"""
    try:
        _log.info("\n🔧 Optimizing table...")
        with conn.cursor() as cur:
            cur.execute("VACUUM ANALYZE tiltmeter")
        _log.info("✅ Table optimized")
    except Exception as e:
        _log.error(f"❌ Optimize error: {e}")

if __name__ == "__main__":
    _log.info("=" * 50)
    _log.info("TILTMETER DATA CLEANUP & MAINTENANCE")
    _log.info("=" * 50)
    
    get_table_stats()
    
    _log.info("\n" + "=" * 50)
    _log.info("Running maintenance...")
    _log.info("=" * 50)
    
    # 1. Buat index untuk performa
    create_indexes()
    
    # 2. Hapus duplikasi
    remove_duplicates()
    
    # 3. Hapus data lama (7 hari)
    archive_old_data(days=7)
    
    # 4. Optimize table
    optimize_table()
    
    # 5. Tampilkan hasil
    get_table_stats()
    
    _log.info("\n" + "=" * 50)
    _log.info("✅ Cleanup completed!")
    _log.info("=" * 50)
