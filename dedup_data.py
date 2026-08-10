"""
Check and remove duplicate rows across all sensor data tables.
Keeps 1 row per (sensor_id, time) — retains the highest id.
"""
from collections import OrderedDict
from psycopg2 import sql
from db import conn
from logger import get_logger

_log = get_logger("dedup")

TABLES = OrderedDict([
    ("temps",           "sensor_id, time"),
    ("atrhs",           "sensor_id, time"),
    ("strain",          "sensor_id, time"),
    ("cable_stays",     "sensor_id, time"),
    ("tiltmeter",       "sensor_id, time"),
    ("anm2d",           "sensor_id, time"),
    ("anm3d",           "sensor_id, time"),
    ("temps_statistic", "sensor_id, time"),
    ("atrhs_statistic", "sensor_id, time"),
    ("strain_statistic", "sensor_id, time"),
    ("tiltmeter_statistic", "sensor_id, time"),
    ("anm2d_statistic", "sensor_id, time"),
    ("anm3d_statistic", "sensor_id, time"),
])

total_deleted = 0
_log.info(f"{'TABLE':<28s} {'TOTAL':>8s} {'DUPS':>8s} {'DELETED':>8s}")
_log.info("-" * 56)

for table, conflict_cols in TABLES.items():
    try:
        table_id = sql.Identifier(table)
        with conn.cursor() as cur:
            cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(table_id))
            total = cur.fetchone()[0]
        if total == 0:
            _log.info(f"{table:<28s} {0:>8d} {0:>8d} {0:>8d}")
            continue

        col_ids = sql.SQL(", ").join(sql.Identifier(c.strip()) for c in conflict_cols.split(","))
        dup_query = sql.SQL(
            "SELECT COUNT(*) FROM (SELECT 1 FROM {} GROUP BY {} HAVING COUNT(*) > 1) sub"
        ).format(table_id, col_ids)
        with conn.cursor() as cur:
            cur.execute(dup_query)
            dup_groups = cur.fetchone()[0]

        if dup_groups == 0:
            _log.info(f"{table:<28s} {total:>8d} {0:>8d} {0:>8d}")
            continue

        del_query = sql.SQL(
            "DELETE FROM {} WHERE id IN ("
            "SELECT id FROM ("
            "SELECT id, ROW_NUMBER() OVER (PARTITION BY {} ORDER BY id DESC) AS rn "
            "FROM {}"
            ") sub WHERE rn > 1)"
        ).format(table_id, col_ids, table_id)
        with conn.cursor() as cur:
            cur.execute(del_query)
            deleted = cur.rowcount
        total_deleted += deleted
        _log.info(f"{table:<28s} {total:>8d} {dup_groups:>8d} {deleted:>8d}")

    except Exception as e:
        _log.info(f"{table:<28s} {'ERROR':>8s}  {str(e)[:50]}")

_log.info("-" * 56)
_log.info(f"{'TOTAL DELETED':<28s} {total_deleted:>24d}")

if total_deleted > 0:
    _log.info("\nRunning VACUUM ANALYZE on affected tables...")
    for table in TABLES:
        try:
            with conn.cursor() as cur:
                cur.execute(sql.SQL("VACUUM ANALYZE {}").format(sql.Identifier(table)))
            _log.info(f"  {table} - OK")
        except:
            pass
    _log.info("Done.")
