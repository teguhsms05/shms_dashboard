import json, time, random, threading, msvcrt, sys
from datetime import datetime
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT   = 1883

# Sensor IDs untuk Tiltmeter
SENSORS = ["TILT01", "TILT02", "TILT03", "TILT04", "TILT05", "TILT06"]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(BROKER, PORT, 60)
client.loop_start()


# Mapping base angle (angle_y) untuk mensimulasikan lengkungan jembatan
# Sumbu longitudinal jembatan adalah sumbu-Y.
# Agar defleksinya membentuk kurva parabola (ayunan simetris) kembali ke 0:
# T1 (Kiri) menukik turun: nilai sudut positif besar +
# T2 (Seperempat Kiri) menukik lebih landai: nilai positif kecil +
# T3 (Tengah) berada di dasar lengkungan, datar: nilai 0
# T4 (Seperempat Kanan) mulai menanjak naik: nilai negatif kecil -
# T5 (Kanan) menanjak curam ke pylon: nilai negatif besar -
#
# Nilai dibuat kecil (misal 0.04 derajat) agar defleksi realistis (puluhan/ratusan mm)
BASE_ANGLES_Y = {
    "TILT01":  0.08,
    "TILT02":  0.04,
    "TILT03":  0.00,
    "TILT04": -0.04,
    "TILT05": -0.08,
    "TILT06":  0.00   # Sensor referensi
}

def publish_sensor(sensor_id):
    topic = f"shms/site01/sensor/tiltmeter/{sensor_id}"
    base_y = BASE_ANGLES_Y.get(sensor_id, 0.0)
    
    while True:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Fluktuasi kecil karena angin/lalu lintas
        noise_x = random.uniform(-0.002, 0.002) # Lateral minim
        noise_y = random.uniform(-0.005, 0.005) # Longitudinal berfluktuasi proporsional
        
        payload = {
            "sensor_id":   sensor_id,
            "sensor_type": "tiltmeter",
            "ts":          now,
            "values": {
                "angle_x":     round(0.0 + noise_x, 4),
                "angle_y":     round(base_y + noise_y, 4),
            },
            "unit": {
                "angle_x":     "degree",
                "angle_y":     "degree"
            },
            "quality": 0
        }
        client.publish(topic, json.dumps(payload), qos=1, retain=True)
        print(f"[{sensor_id}] Sent: {now} - {payload['values']}")
        time.sleep(60)


# Jalankan setiap sensor di thread terpisah (tanpa offset waktu)
threads = []
for sensor in SENSORS:
    t = threading.Thread(target=publish_sensor, args=(sensor,), daemon=True)
    t.start()
    threads.append(t)

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
