"""
Cable Stay Accelerometer Simulation & Tension Publisher
========================================================
Simulates 12 accelerometer sensors on cable-stay units.
-   Generates vibration signals at 100 Hz (asyncio)
-   Windowing: 10 s (1000 samples)
-   Band-pass filter 0.1 - 10 Hz (scipy.signal.sosfilt)
-   FFT  →  extract top-3 natural frequencies (n=1,2,3)
-   Cable tension:
        T_n = 4·m·L²·(f_n/n)² - (E·I·n²·π²)/L²
-   Final T = mean(T₁, T₂, T₃)
-   SQLAlchemy →  CableMaster (param lookup) + CableTensionHistory
-   RAM-efficient: pre-allocated ndarrays, SOS filter, in-place FFT,
      async DB writer with bulk - insert.
"""

import asyncio
import gc
import math
import time
from datetime import datetime, timezone

import numpy as np
from scipy.signal import butter, sosfilt, find_peaks
from scipy.fft import rfft, rfftfreq

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Index,
)
from sqlalchemy.orm import (
    declarative_base,
    sessionmaker,
    Session,
)
from sqlalchemy.pool import NullPool

from config import DB_CONFIG
from logger import get_logger
from cable_tension import CableTensionCalculator

_log = get_logger("cable_acc_sim")

# ═══════════════════════════════════════════════════════════════
# DB  —  SQLAlchemy setup  (standalone, does not interfere with psycopg2 pool)
# ═══════════════════════════════════════════════════════════════
DB_URL = (
    f"postgresql+psycopg2://{DB_CONFIG['user']}:{DB_CONFIG['password']}"
    f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
)

engine = create_engine(
    DB_URL,
    poolclass=NullPool,   # one fresh conn per session; no leaked background-pool threads
    echo=False,
)

Base = declarative_base()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# ──  Models  ────────────────────────────────────────────────────
class CableMaster(Base):
    __tablename__ = "cable_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sensor_id = Column(String(50), unique=True, nullable=False, index=True)
    panjang_kabel = Column(Float, nullable=False, comment="L — cable length [m]")
    massa_kabel = Column(Float, nullable=False, comment="m — mass per unit length [kg/m]")
    strand_total = Column(Integer, nullable=False)
    diameter_total = Column(Float, nullable=False, comment="total diameter [m]")
    modulus_elastisitas = Column(Float, nullable=False, comment="E — Young modulus [Pa]")
    momen_inersia = Column(Float, nullable=False, comment="I — moment of inertia [m⁴]")

    __table_args__ = (
        Index("idx_cable_master_sensor", "sensor_id"),
        {"extend_existing": True},
    )


class CableTensionHistory(Base):
    __tablename__ = "cable_tension_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    time = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    sensor_id = Column(String(50), nullable=False, index=True)
    f1 = Column(Float, comment="natural frequency mode 1 [Hz]")
    f2 = Column(Float, comment="natural frequency mode 2 [Hz]")
    f3 = Column(Float, comment="natural frequency mode 3 [Hz]")
    t1 = Column(Float, comment="T₁ from mode 1 [kN]")
    t2 = Column(Float, comment="T₂ from mode 2 [kN]")
    t3 = Column(Float, comment="T₃ from mode 3 [kN]")
    tension_avg = Column(Float, comment="mean(T₁,T₂,T₃) [kN]")

    __table_args__ = (
        Index("idx_cth_time", "time"),
        Index("idx_cth_sensor", "sensor_id"),
        {"extend_existing": True},
    )


Base.metadata.create_all(engine)

# ═══════════════════════════════════════════════════════════════
# Cable Master seed data  (12 cables – symmetrical bridge layout)
# ═══════════════════════════════════════════════════════════════
CABLE_PARAMS = {
    "CBL01":  {"L": 99.418, "berat_kn_m": 0.569, "strands": 58}, #P1-Timur-SS08
    "CBL02":  {"L": 70.136, "berat_kn_m": 0.432, "strands": 44}, #P1-Timur-SS05
    "CBL03":  {"L": 35.441, "berat_kn_m": 0.314, "strands": 32}, #P1-Timur-SS01
    "CBL04":  {"L": 34.183, "berat_kn_m": 0.314, "strands": 32}, #P1-Timur-MS01
    "CBL05":  {"L": 67.158, "berat_kn_m": 0.442, "strands": 45}, #P1-Timur-MS05
    "CBL06":  {"L": 94.158, "berat_kn_m": 0.500, "strands": 51}, #P1-TImur-MS08
    "CBL07":  {"L": 99.418, "berat_kn_m": 0.500, "strands": 58}, #P1-Barat-SS08
    "CBL08":  {"L": 70.136, "berat_kn_m": 0.442, "strands": 44}, #P1-Barat-SS05
    "CBL09":  {"L": 35.441, "berat_kn_m": 0.314, "strands": 32}, #P1-Barat-SS01
    "CBL10": {"L": 34.183, "berat_kn_m": 0.314, "strands": 32}, #P1-Barat-MS01
    "CBL11": {"L": 67.158, "berat_kn_m": 0.432, "strands": 45}, #P1-Barat-MS05
    "CBL12": {"L": 94.158, "berat_kn_m": 0.569, "strands": 51}, #P1-Barat-MS08
    "CBL13": {"L": 94.158, "berat_kn_m": 0.500, "strands": 51}, #P2-Timur-MS08
    "CBL14": {"L": 67.158, "berat_kn_m": 0.432, "strands": 45}, #P2-Timur-MS05
    "CBL15": {"L": 34.183, "berat_kn_m": 0.314, "strands": 32}, #P2-Timur-MS01
    "CBL16": {"L": 35.441, "berat_kn_m": 0.314, "strands": 32}, #P2-Timur-S01S
    "CBL17": {"L": 70.136, "berat_kn_m": 0.432, "strands": 45}, #P2-Timur-SS05
    "CBL18": {"L": 99.418, "berat_kn_m": 0.569, "strands": 58}, #P2-Timur-SS08
    "CBL19": {"L": 94.158, "berat_kn_m": 0.500, "strands": 58}, #P2-Barat-MS08
    "CBL20": {"L": 67.158, "berat_kn_m": 0.442, "strands": 45}, #P2-Barat-MS05
    "CBL21": {"L": 34.183, "berat_kn_m": 0.314, "strands": 32}, #P2-Barat-MS01
    "CBL22": {"L": 35.441, "berat_kn_m": 0.314, "strands": 32}, #P2-Barat-SS01
    "CBL23": {"L": 70.136, "berat_kn_m": 0.442, "strands": 44}, #P2-Barat-SS05
    "CBL24": {"L": 99.418, "berat_kn_m": 0.500, "strands": 58}, #P2-Barat-SS08
}

TARGET_FREQUENCIES = {
    "CBL01": [1.5, 3.0, 4.56],
    "CBL02": [2.008, 3.98, 5.929],
    "CBL03": [4.63, 6.38, 9.135],
    "CBL04": [4.8],
    "CBL05": [2.01, 4.034, 6.085],
    "CBL06": [1.46, 2.95, 4.45],
    "CBL07": [1.476, 3.0, 4.53],
    "CBL08": [1.963, 3.918, 5.884],
    "CBL09": [4.79, 8.95],
    "CBL10": [4.995, 9.48],
    "CBL11": [2.045, 3.993, 5.503],
    "CBL12": [1.505, 2.935, 4.366],
    "CBL13": [1.478, 2.936, 4.569],
    "CBL14": [2.008, 3.98, 5.929],
    "CBL15": [4.788, 8.47, 9.5],
    "CBL16": [4.856, 9.548],
    "CBL17": [2.01, 4.034, 6.085],
    "CBL18": [1.44, 2.878, 4.3],
    "CBL19": [1.492, 3.011, 4.361],
    "CBL20": [1.963, 3.918, 5.884],
    "CBL21": [4.827, 8.624],
    "CBL22": [5.014, 6.392, 8.775],
    "CBL23": [2.045, 3.993, 5.503],
    "CBL24": [1.395, 2.805, 4.285],
}

def seed_cable_master():
    """Insert CableMaster rows if table is empty — computes D_eq & I via Calculator."""
    with SessionLocal() as s:
        if s.query(CableMaster).count() == 0:
            for sid, p in CABLE_PARAMS.items():
                calc = CableTensionCalculator(
                    panjang=p["L"],
                    berat_kn_per_m=p["berat_kn_m"],
                    jumlah_strand=p["strands"],
                )
                s.add(
                    CableMaster(
                        sensor_id=sid,
                        panjang_kabel=p["L"],
                        massa_kabel=p["berat_kn_m"],
                        strand_total=p["strands"],
                        diameter_total=round(calc.D_eq, 6),
                        modulus_elastisitas=calc.E,
                        momen_inersia=calc.I,
                    )
                )
            s.commit()
            _log.info("Seeded %d cable master records", len(CABLE_PARAMS))
        else:
            _log.info("CableMaster table already populated — skip seed")


seed_cable_master()

# ═══════════════════════════════════════════════════════════════
# Signal‑processing constants
# ═══════════════════════════════════════════════════════════════
FS = 100                # sampling rate  [Hz]
WINDOW_S = 10           # window length  [s]
WINDOW_N = FS * WINDOW_S  # 1000 samples
LOWCUT = 0.1            # band-pass low  [Hz]
HIGHCUT = 12.0          # band-pass high [Hz]
FILTER_ORDER = 6        # Butterworth order
N_MODES = 3             # modes to extract
FREQ_MIN = 0.15         # ignore peaks below [Hz] (below band-pass transition)
FREQ_MAX = 11.5         # ignore peaks above [Hz]

# ── Pre‑compute stable SOS coefficients (once) ──────────────────
_sos = butter(
    FILTER_ORDER,
    [LOWCUT, HIGHCUT],
    btype="band",
    fs=FS,
    output="sos",
)

# Frequency bins (once)
_freqs = rfftfreq(WINDOW_N, 1.0 / FS)

# Hanning window (once – multiply in‑place)
_HANN = 0.5 * (1.0 - np.cos(2.0 * math.pi * np.arange(WINDOW_N) / (WINDOW_N - 1)))


# ═══════════════════════════════════════════════════════════════
#  Accelerometer signal generator
# ═══════════════════════════════════════════════════════════════
def generate_acc_signal(
    target_freqs: list[float],
    fs: int,
    duration_s: float,
    noise_sigma: float = 0.002,
) -> np.ndarray:
    """
    Generate cable vibration signal using precise target natural frequencies.

    Signal = Σ A_i · sin(2π·f_i·t + φ_i) + Gaussian noise.

    Amplitude decays with mode number; slight random drift (±2 %) and
    phase shift simulate real-world variability.
    """
    n_samples = int(fs * duration_s)
    t = np.arange(n_samples) / fs
    signal = np.zeros(n_samples, dtype=np.float64)

    n_modes = len(target_freqs)
    for i, f_target in enumerate(target_freqs):
        n = i + 1
        drift = 1.0 + 0.02 * math.sin(n * 0.37 + np.random.rand())
        fn = f_target * drift
        amp = (0.008 / (n ** 0.8)) * (1.0 + 0.05 * np.random.randn())
        signal += amp * np.sin(2.0 * math.pi * fn * t + np.random.rand() * math.pi)

    signal += noise_sigma * np.random.randn(n_samples)
    return signal.astype(np.float32)


# ═══════════════════════════════════════════════════════════════
#  Single‑sensor simulation coroutine
# ═══════════════════════════════════════════════════════════════
async def simulate_sensor(sensor_id: str, params: dict):
    """
    Continuously generate vibration window, process FFT,
    compute tension via CableTensionCalculator, push to DB queue.
    """
    target_freqs = TARGET_FREQUENCIES.get(sensor_id, [])
    if not target_freqs:
        _log.warning("[%s] No target frequencies — skipping", sensor_id)
        return

    calc = CableTensionCalculator(
        panjang=params["L"],
        berat_kn_per_m=params["berat_kn_m"],
        jumlah_strand=params["strands"],
    )

    _log.info(
        "[%s] Started (L=%.1f m, m=%.1f kg/m, target freqs=%s)",
        sensor_id, calc.panjang, calc.massa_per_m, target_freqs,
    )

    loop_time = WINDOW_S
    buffer = np.empty(WINDOW_N, dtype=np.float32)

    while True:
        t_start = time.monotonic()

        chunk = generate_acc_signal(
            target_freqs=target_freqs,
            fs=FS,
            duration_s=WINDOW_S,
        )

        buffer = chunk

        freqs = process_window(buffer, target_freqs)
        min_needed = min(len(target_freqs), N_MODES)

        if len(freqs) >= min_needed:
            detail = calc.calculate_tension_detail(freqs[:N_MODES])
        else:
            _log.warning("[%s] Only %d peaks found (need %d) — skipping tension", sensor_id, len(freqs), min_needed)
            await asyncio.sleep(0.1)
            continue

        f_vals = freqs[:N_MODES]
        while len(f_vals) < 3:
            f_vals.append(0.0)

        try:
            _DB_QUEUE.put_nowait({
                "sensor_id": sensor_id,
                "f1": round(f_vals[0], 4),
                "f2": round(f_vals[1], 4),
                "f3": round(f_vals[2], 4),
                "t1": detail.get("t1") if detail.get("t1") is not None else 0.0,
                "t2": detail.get("t2") if detail.get("t2") is not None else 0.0,
                "t3": detail.get("t3") if detail.get("t3") is not None else 0.0,
                "tension_avg": detail["tension_avg"],
            })
        except asyncio.QueueFull:
            _log.warning("[%s] DB queue full — dropping frame", sensor_id)

        elapsed = time.monotonic() - t_start
        sleep_for = max(0.0, loop_time - elapsed)
        await asyncio.sleep(sleep_for)

        if sensor_id == CABLE_IDS[0]:
            gc.collect()
def process_window(raw_window: np.ndarray, target_freqs: list[float] | None = None) -> list[float]:
    """
    Apply Hanning window → SOS bandpass filter → RFFT → extract peaks.

    target_freqs hint allows dynamic peak-detection tuning for 1-/2-mode cables.
    Returns list of floating‑point frequencies (up to N_MODES).
    """
    # Hanning window (in‑place multiply to avoid copy)
    signal = raw_window.astype(np.float64) * _HANN

    # SOS bandpass filter (in‑place override)
    filtered = sosfilt(_sos, signal)

    # Real FFT
    spectrum = np.abs(rfft(filtered))
    mag = spectrum[:len(_freqs)] / (WINDOW_N / 2.0)  # normalise

    n_target = len(target_freqs) if target_freqs else 3
    height_frac = 0.15 / n_target if n_target <= 2 else 0.05
    peaks_idx, props = find_peaks(
        mag,
        height=max(height_frac * np.max(mag), 1e-9) if np.max(mag) > 0 else 1e-9,
        distance=max(int(0.1 * WINDOW_N / FS), 5),
    )

    peak_freqs = _freqs[peaks_idx]
    peak_mags = mag[peaks_idx]

    # Keep only peaks inside (FREQ_MIN, FREQ_MAX)
    mask = (peak_freqs >= FREQ_MIN) & (peak_freqs <= FREQ_MAX)
    peak_freqs = peak_freqs[mask]
    peak_mags = peak_mags[mask]

    # Sort descending by magnitude, take top N_MODES, then sort ascending by freq
    if len(peak_freqs) == 0:
        return []

    order = np.argsort(peak_mags)[::-1]
    top_freqs = peak_freqs[order][:N_MODES]
    top_freqs.sort()

    # Cleanup
    del signal, filtered, spectrum, mag
    return top_freqs.tolist()


# ═══════════════════════════════════════════════════════════════
#  Async DB writer  (single consumer, bulk insert)
# ═══════════════════════════════════════════════════════════════
_DB_QUEUE: "asyncio.Queue[dict]" = asyncio.Queue(maxsize=1000)


async def db_writer():
    """Drain the queue and bulk‑insert into CableTensionHistory."""
    batch: list[dict] = []
    while True:
        item = await _DB_QUEUE.get()
        batch.append(item)

        # Flush every 50 items or when queue is empty
        if len(batch) >= 50 or (_DB_QUEUE.empty() and batch):
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _bulk_insert, batch)
                _log.info("Wrote %d tension records to DB", len(batch))
            except Exception:
                _log.exception("DB writer bulk insert failed")
            finally:
                batch.clear()
                gc.collect()


def _bulk_insert(items: list[dict]):
    with SessionLocal() as s:
        s.bulk_insert_mappings(CableTensionHistory, items)
        s.commit()


# ═══════════════════════════════════════════════════════════════
#  Entry point
# ═══════════════════════════════════════════════════════════════
CABLE_IDS = list(CABLE_PARAMS.keys())  # ["CBL01", …, "CBL12"]


async def main():
    _log.info("=== Cable Stay Accelerometer Simulation ===")
    _log.info("Sensors: %s", CABLE_IDS)
    _log.info("Fs = %d Hz | Window = %d s (%d samples)", FS, WINDOW_S, WINDOW_N)
    _log.info("Band-pass: %.1f – %.1f Hz", LOWCUT, HIGHCUT)

    # Start DB writer background task
    writer_task = asyncio.create_task(db_writer(), name="db_writer")

    # Launch one coroutine per sensor
    sensor_tasks = [
        asyncio.create_task(simulate_sensor(sid, CABLE_PARAMS[sid]), name=sid)
        for sid in CABLE_IDS
    ]

    _log.info("%d sensor + 1 writer coroutines running…", len(sensor_tasks))

    try:
        await asyncio.gather(writer_task, *sensor_tasks)
    except KeyboardInterrupt:
        _log.info("Shutdown requested")
    finally:
        for t in [writer_task, *sensor_tasks]:
            t.cancel()
        await asyncio.gather(*[writer_task, *sensor_tasks], return_exceptions=True)
        engine.dispose()
        _log.info("Shutdown complete.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
