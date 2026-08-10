import json, time, random, threading, msvcrt, sys
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883

SENSORS = ["atrh01"]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(BROKER, PORT, 60)
client.loop_start()

def generate_atrh_data(sensor_id):
    return {
        "ts": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "sensor_id": sensor_id,
        "sensor_type": "atrh",
        "values": {
            "temperature": round(random.uniform(20, 35), 2),
            "humidity": round(random.uniform(50, 95), 2)
        },
        "unit": {"temperature": "C", "humidity": "%"},
        "quality": 0
    }

def run_publisher():
    print(f"📡 ATRH Publisher started. Sending to shms/site01/sensor/atrh/")
    try:
        while True:
            for sid in SENSORS:
                data = generate_atrh_data(sid)
                topic = f"shms/site01/sensor/atrh/{sid}"
                client.publish(topic, json.dumps(data), qos=1, retain=True)
                print(f"[{sid}] Sent: {data['ts']} - {data['values']}")
            
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n>>> KeyboardInterrupt detected.")
    finally:
        client.loop_stop()
        client.disconnect()
        sys.exit(0)

if __name__ == "__main__":
    run_publisher()


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

