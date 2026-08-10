import json, time, random, threading, msvcrt, sys
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883

SENSORS = ["anm2d01"]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(BROKER, PORT, 60)
client.loop_start()

def publish_sensor(sensor_id):
    topic = f"shms/site01/sensor/anm_2d/{sensor_id}"
    while True:
        payload = {
            "sensor_id": sensor_id,
            "sensor_type": "anm2d",
            "ts": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "values": {
                "wind_speed": round(random.uniform(10, 20), 1),
                "wind_direction": round(random.uniform(0, 360), 0)
            },
            "unit": {"wind_speed": "m/s", "wind_direction": "deg"}
        }
        client.publish(topic, json.dumps(payload), qos=1, retain=True)
        print(f"[{sensor_id}] Sent: {payload['ts']} - {payload['values']}")
        time.sleep(5)

threads = []
for sensor in SENSORS:
    t = threading.Thread(target=publish_sensor, args=(sensor,), daemon=True)
    t.start()
    threads.append(t)

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
