"""
Cable-Stay Tension Calculator (OOP)
====================================
Menghitung gaya tarik kabel cable-stayed berdasarkan frekuensi natural
getaran dengan koreksi kekakuan lentur (bending stiffness).

Physics:
    T_n = 4·m·L²·(f_n/n)² − (E·I·n²·π²)/L²

Input  berat dari DB  →  dikonversi dari kN/m ke massa kg/m (g = 9.80665).
Diameter ekuivalen & momen inersia dihitung dinamis dari jumlah strand saja
(tidak menerima I mentah dari database).
"""

from __future__ import annotations

import math

GRAVITY = 9.80665               # m/s²
A_ONE_STRAND_MM2 = 140.0        # mm²  — luas satu strand
_A_ONE_STRAND_M2 = A_ONE_STRAND_MM2 * 1e-6

# ── Threshold tegangan (ubah sewaktu-waktu sesuai kebutuhan) ──
TENSION_WARN_KN = 6500.0         # batas warning (kuning) [kN]
TENSION_CRITICAL_KN = 7500.0     # batas critical (merah) [kN]


class CableTensionCalculator:
    """Kalkulator tegangan kabel individual.

    Parameters
    ----------
    panjang : float
        Panjang kabel L [m].
    berat_kn_per_m : float
        Berat per satuan panjang dari database [kN/m].
    jumlah_strand : int
        Jumlah strand baja dalam kabel.
    modulus_elastisitas : float
        Modulus Young E [Pa].  Default 200 GPa.
    """

    def __init__(
        self,
        panjang: float,
        berat_kn_per_m: float,
        jumlah_strand: int,
        modulus_elastisitas: float = 200e9,
    ) -> None:
        if panjang <= 0:
            raise ValueError(f"panjang harus > 0, dapat: {panjang}")
        if berat_kn_per_m <= 0:
            raise ValueError(f"berat_kn_per_m harus > 0, dapat: {berat_kn_per_m}")
        if jumlah_strand <= 0:
            raise ValueError(f"jumlah_strand harus > 0, dapat: {jumlah_strand}")

        self.panjang = panjang                     # L  [m]
        self.massa_per_m = (berat_kn_per_m * 1000.0) / GRAVITY  # m  [kg/m]
        self.jumlah_strand = jumlah_strand         # n
        self.E = modulus_elastisitas               # [Pa]

        # ── derived geometry  (invariant once constructed) ──
        self.A_total = jumlah_strand * _A_ONE_STRAND_M2          # [m²]
        self.D_eq = math.sqrt(4.0 * self.A_total / math.pi)      # [m]
        self.I = (math.pi * (self.D_eq ** 4)) / 64.0              # [m⁴]

        # precompute constants used in tension formula
        self._L2 = self.panjang ** 2
        self._four_m_l2 = 4.0 * self.massa_per_m * self._L2
        self._EI_pi2 = self.E * self.I * (math.pi ** 2)

    # ── public API ──────────────────────────────────────────────

    def calculate_tension(self, frequencies: list[float]) -> float:
        """Hitung rata-rata gaya tarik kabel [kN] dari list frekuensi natural.

        Setiap elemen ``frequencies`` diasumsikan sebagai mode 1, 2, 3, … .
        Mode dengan frekuensi ≤ 0 diabaikan.

        Returns
        -------
        float
            Rata-rata T_n [kN].  Return 0.0 jika tidak ada mode valid.
        """
        tensions: list[float] = []

        for n, f_n in enumerate(frequencies, start=1):
            if f_n <= 0.0:
                continue
            T_n = self._tension_single_mode(f_n, n)
            tensions.append(T_n)

        if not tensions:
            return 0.0

        avg_N = sum(tensions) / len(tensions)
        return avg_N * 1e-3  # N → kN

    def calculate_tension_detail(self, frequencies: list[float]) -> dict:
        """Sama seperti ``calculate_tension``, tapi mengembalikan detail per mode.

        Returns
        -------
        dict
            {'t1': …, 't2': …, 't3': …, 'tension_avg': …}  dalam kN.
            Nilai None untuk mode yang tidak tersedia/frekuensi ≤ 0.
        """
        result: dict[str, float | None] = {}

        tensions_valid: list[float] = []
        for n in range(1, 4):
            key = f"t{n}"
            if n <= len(frequencies) and frequencies[n - 1] > 0.0:
                T_n = self._tension_single_mode(frequencies[n - 1], n)
                result[key] = round(T_n * 1e-3, 2)
                tensions_valid.append(T_n)
            else:
                result[key] = None

        if tensions_valid:
            result["tension_avg"] = round(
                (sum(tensions_valid) / len(tensions_valid)) * 1e-3, 2
            )
        else:
            result["tension_avg"] = 0.0

        return result

    # ── internal ────────────────────────────────────────────────

    def _tension_single_mode(self, f_n: float, n: int) -> float:
        """T_n = 4·m·L²·(f_n/n)² − (E·I·n²·π²)/L²   →  [N]"""
        term1 = self._four_m_l2 * ((f_n / n) ** 2)
        term2 = (self._EI_pi2 * (n ** 2)) / self._L2
        return term1 - term2

    def __repr__(self) -> str:
        return (
            f"CableTensionCalculator(L={self.panjang:.3f} m, "
            f"m={self.massa_per_m:.3f} kg/m, "
            f"strands={self.jumlah_strand}, "
            f"D_eq={self.D_eq * 1e3:.1f} mm, "
            f"I={self.I:.3e} m⁴)"
        )


