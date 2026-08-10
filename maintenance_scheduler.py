"""
Scheduled maintenance untuk SHMS data retention
Jalankan dengan: python maintenance_scheduler.py
Atau setup cron: 0 2 * * * cd /path && python maintenance_scheduler.py
"""

import schedule
import time
from logger import get_logger

_log = get_logger("maintenance")
import subprocess
import sys
from datetime import datetime

def run_cleanup():
    """Jalankan cleanup script"""
    _log.info(f"\n{'='*60}")
    _log.info(f"[{datetime.now()}] Starting scheduled cleanup...")
    _log.info(f"{'='*60}")
    
    try:
        result = subprocess.run(
            [sys.executable, "cleanup_retention.py"],
            cwd=".",
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )
        
        _log.info(result.stdout)
        if result.stderr:
            _log.info("STDERR:", result.stderr)
            
        if result.returncode == 0:
            _log.info(f"[{datetime.now()}] ✅ Cleanup completed successfully")
        else:
            _log.info(f"[{datetime.now()}] ❌ Cleanup failed with code {result.returncode}")
            
    except subprocess.TimeoutExpired:
        _log.info(f"[{datetime.now()}] ❌ Cleanup timeout (> 5 min)")
    except Exception as e:
        _log.info(f"[{datetime.now()}] ❌ Cleanup error: {e}")

def schedule_jobs():
    """Setup jadwal maintenance"""
    # Jalankan cleanup setiap hari jam 2 pagi (2 AM)
    schedule.every().day.at("02:00").do(run_cleanup)
    
    # Alternatif: Jalankan setiap 6 jam
    # schedule.every(6).hours.do(run_cleanup)
    
    _log.info("✅ Scheduler initialized")
    _log.info("   - Daily cleanup at 02:00 AM")
    _log.info("   - Data retention: 7 days")
    _log.info("   - Press Ctrl+C to stop")
    _log.info()

def main():
    schedule_jobs()
    
    # Keep scheduler running
    while True:
        try:
            schedule.run_pending()
            time.sleep(60)  # Check every minute
        except KeyboardInterrupt:
            _log.info("\n⛔ Scheduler stopped")
            break
        except Exception as e:
            _log.info(f"❌ Scheduler error: {e}")
            time.sleep(60)

if __name__ == "__main__":
    main()
