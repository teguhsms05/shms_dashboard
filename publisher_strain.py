import json, time, random, threading, sys
from datetime import datetime
import paho.mqtt.client as mqtt
from logger import get_logger

_log = get_logger("publisher")

BROKER = "localhost"
PORT   = 1883

# Sensor IDs untuk Strain
SENSORS = ["STRAIN01", "STRAIN02", "STRAIN03", "STRAIN04", "STRAIN05"]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(BROKER, PORT, 60)
client.loop_start()

# Base strain simulation
BASE_STRAIN = {
    "STRAIN01":  12.5,
    "STRAIN02":  15.0,
    "STRAIN03":  -8.2,
    "STRAIN04":  -10.5,
    "STRAIN05":  5.0
}

def publish_sensor(sensor_id):
    topic = f"shms/site01/sensor/strain/{sensor_id}"
    base_strain = BASE_STRAIN.get(sensor_id, 0.0)
    counter = 0
    THRESHOLD_CYCLE = 20  # Setiap 20 data points, akan ada spike ke threshold
    
    while True:
        counter += 1
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Noise simulation
        noise_strain = random.uniform(-2.0, 2.0)
        temp_c = random.uniform(28.0, 32.0)
        
        strain_value = base_strain + noise_strain
        
        # Every 100 data points, inject spike touching warning(20) / critical(25) threshold
        if counter % THRESHOLD_CYCLE == 0: 
            
            target = 20 if (counter // THRESHOLD_CYCLE) % 2 == 0 else 25
            sign = 1 if base_strain >= 0 else -1
            strain_value = sign * (target + random.uniform(-0.5, 0.5))
        
        payload = {
            "sensor_id":   sensor_id,
            "sensor_type": "strain",
            "ts":          now,
            "values": {
                "strain_ue":   round(strain_value, 2),
                "temp_c":      round(temp_c, 1),
            },
            "unit": {
                "strain_ue":   "ue",
                "temp_c":      "C"
            },
            "quality": 0
        }
        client.publish(topic, json.dumps(payload), qos=1, retain=False)
        _log.info(f"[{sensor_id}] Sent: {now} - {payload['values']}")
        time.sleep(5)

# Jalankan setiap sensor di thread terpisah (tanpa offset waktu)
threads = []
for sensor in SENSORS:
    t = threading.Thread(target=publish_sensor, args=(sensor,), daemon=True)
    t.start()
    threads.append(t)

# Tetap aktif, tekan Ctrl+X untuk keluar
try:
    while True:
        if sys.platform == "win32" and __import__("msvcrt").kbhit():
            key = __import__("msvcrt").getch()
            if key == b'\x18':
                _log.info("\n>>> Ctrl+X detected. Exiting...")
                break
        time.sleep(0.1)
except KeyboardInterrupt:
    _log.info("\n>>> KeyboardInterrupt detected.")
finally:
    client.loop_stop()
    client.disconnect()
    sys.exit(0)
