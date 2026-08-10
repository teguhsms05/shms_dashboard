@echo off
REM Task Scheduler batch untuk menjalankan cleanup_retention.py
REM Letakkan di: d:\KNOWLEDGE\2026\shms_mqtt\run_cleanup.bat

cd /d d:\KNOWLEDGE\2026\shms_mqtt
echo [%date% %time%] Starting cleanup... >> cleanup.log

REM Activate venv dan jalankan script
call venv_mqtt\Scripts\activate.bat
python cleanup_retention.py >> cleanup.log 2>&1

REM Log completion
echo [%date% %time%] Cleanup completed >> cleanup.log
