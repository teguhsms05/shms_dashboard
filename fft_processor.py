import math
from logger import get_logger

_log = get_logger("fft")


class FFTProcessor:
    def __init__(self, yield_func=None):
        self._yield = yield_func or (lambda _: None)

    def fft(self, real, imag):
        n = len(real)
        j = 0
        for i in range(n):
            if j > i:
                real[i], real[j] = real[j], real[i]
                imag[i], imag[j] = imag[j], imag[i]
            m = n >> 1
            while m >= 1 and j >= m:
                j -= m
                m >>= 1
            j += m

        size = 2
        while size <= n:
            half = size >> 1
            step = -2.0 * math.pi / size
            for i in range(0, n, size):
                for k in range(half):
                    w_re = math.cos(k * step)
                    w_im = math.sin(k * step)
                    idx1 = i + k
                    idx2 = i + k + half
                    t_re = real[idx2] * w_re - imag[idx2] * w_im
                    t_im = real[idx2] * w_im + imag[idx2] * w_re
                    real[idx2] = real[idx1] - t_re
                    imag[idx2] = imag[idx1] - t_im
                    real[idx1] += t_re
                    imag[idx1] += t_im
            size <<= 1
            self._yield(0)

    @staticmethod
    def get_peaks(magnitudes, Fs, n, count=3):
        peaks = []
        for i in range(1, len(magnitudes) - 1):
            if magnitudes[i] > magnitudes[i - 1] and magnitudes[i] > magnitudes[i + 1]:
                freq = (i * Fs) / n
                if freq < 0.1:
                    continue
                peaks.append({"freq": freq, "mag": magnitudes[i]})

        peaks.sort(key=lambda x: x['mag'], reverse=True)
        top_peaks = peaks[:count]
        top_peaks.sort(key=lambda x: x['freq'])
        return top_peaks

    def process_fft_history(self, sensor_id, buf_copy, filename):
        try:
            segment_size = 4096
            Fs = 100
            num_segments = len(buf_copy) // segment_size
            if num_segments < 1:
                return
            num_segments = min(num_segments, 2)

            peaks_result = {}
            for axis in ['x', 'y', 'z']:
                avg_mags = [0.0] * (segment_size // 2)
                for s in range(num_segments):
                    start_idx = len(buf_copy) - (num_segments - s) * segment_size
                    slice_data = buf_copy[start_idx: start_idx + segment_size]
                    real = [p[axis] for p in slice_data]
                    for i in range(segment_size):
                        real[i] *= 0.5 * (1 - math.cos(2 * math.pi * i / (segment_size - 1)))
                    imag = [0.0] * segment_size
                    self.fft(real, imag)
                    n_half = segment_size // 2
                    for i in range(n_half):
                        mag = math.sqrt(real[i] ** 2 + imag[i] ** 2) / n_half
                        avg_mags[i] += mag
                for i in range(len(avg_mags)):
                    avg_mags[i] /= num_segments
                peaks_result[axis] = self.get_peaks(avg_mags, Fs, segment_size)

            from db import insert_acc_fft
            insert_acc_fft(sensor_id, peaks_result, filename)
            _log.info(f"[ACC DB] SUCCESS: FFT History saved for {sensor_id}")
        except Exception as e:
            _log.info(f"[ACC DB] ERROR in process_fft_history: {e}")
