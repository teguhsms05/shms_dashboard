import json, time, random, threading, msvcrt, sys
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883

SENSORS = ["temp01", "temp02", "temp03"]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(BROKER, PORT, 60)
client.loop_start()

def generate_temp_data(sensor_id):
    return {
        "ts": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "sensor_id": sensor_id,
        "sensor_type": "temp",
        "values": {
            "temperature": round(random.uniform(20, 35), 2),
        },
        "unit": {"temperature": "C"},
        "quality": 0
    }

def run_publisher():
    print(f"📡 Temp Publisher started. Sending to shms/site01/sensor/temp/")
    try:
        while True:
            for sid in SENSORS:
                data = generate_temp_data(sid)
                topic = f"shms/site01/sensor/temp/{sid}"
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
