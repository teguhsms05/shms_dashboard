import time
import json
import random
import paho.mqtt.client as mqtt
from datetime import datetime

MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
TOPIC_BASE = "shms/site01/sensor/cable/"

def generate_cable_data(sensor_id):
    # Base stress around 300-400 MPa
    # Some sensors higher to test thresholds
    base_stress = 350
    if sensor_id in ["CS01", "CS02", "CS03"]: # Simulate higher stress
        base_stress = 550
    if sensor_id == "CS04": # Simulate alert stress
        base_stress = 720
        
    stress = base_stress + random.uniform(-20, 20)
    force = stress * 0.8 # Simulated force proportional to stress
    temp = 25 + random.uniform(-2, 2)
    
    return {
        "ts": datetime.now().isoformat(),
        "sensor_id": sensor_id,
        "sensor_type": "cable",
        "values": {
            "force": round(force, 2),
            "stress": round(stress, 2),
            "temperature": round(temp, 2)
        },
        "unit": {
            "force": "kN",
            "stress": "MPa",
            "temperature": "°C"
        },
        "quality": 1
    }

def run_publisher():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    print(f"📡 Cable Publisher started. Sending to {TOPIC_BASE}")

    sensors = [f"CS{i:02d}" for i in range(1, 25)]

    try:
        while True:
            for sid in sensors:
                data = generate_cable_data(sid)
                topic = f"{TOPIC_BASE}{sid}"
                client.publish(topic, json.dumps(data))
                # print(f"Published {sid}: {data['values']['stress']} MPa")
            
            print(f"✅ Published 24 cable sensors at {datetime.now().strftime('%H:%M:%S')}")
            time.sleep(5)
    except KeyboardInterrupt:
        print("Stopped.")
    finally:
        client.disconnect()

if __name__ == "__main__":
    run_publisher()
