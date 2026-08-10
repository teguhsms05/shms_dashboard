import json, time, random, threading, msvcrt, sys
from datetime import datetime
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT   = 1883

# Sensor IDs untuk anemometer 3D
SENSORS = ["anm3d01", "anm3d02"]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(BROKER, PORT, 60)
client.loop_start()

def publish_sensor(sensor_id):
    topic = f"shms/site01/sensor/anm3d/{sensor_id}"
    while True:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        payload = {
            "sensor_id":   sensor_id,
            "sensor_type": "anm3d",
            "ts":          now,
            "values": {
                "wind_speed":     round(random.uniform(0.5, 25.0), 2),   # m/s
                "wind_direction": round(random.uniform(0.0, 360.0), 2),  # derajat
                "wind_elevation": round(random.uniform(-15.0, 15.0), 2), # derajat (elevasi vertikal)
            },
            "unit": {
                "wind_speed":     "m/s",
                "wind_direction": "deg",
                "wind_elevation": "deg",
            },
            "quality": 0
        }
        client.publish(topic, json.dumps(payload), qos=1, retain=True)
        print(f"[{sensor_id}] Sent: {now} - {payload['values']}")
        time.sleep(60)

# Jalankan setiap sensor di thread terpisah, offset 5 detik
threads = []
for sensor in SENSORS:
    t = threading.Thread(target=publish_sensor, args=(sensor,), daemon=True)
    t.start()
    threads.append(t)
    time.sleep(5)

# Tetap aktif, tekan Ctrl+X untuk keluar
try:
    while True:
        if msvcrt.kbhit():
            key = msvcrt.getch()
            if key == b'\x18':
                print("\n>>> Ctrl+X detected. Exiting...")
                break
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\n>>> KeyboardInterrupt detected.")
finally:
    client.loop_stop()
    client.disconnect()
    sys.exit(0)
