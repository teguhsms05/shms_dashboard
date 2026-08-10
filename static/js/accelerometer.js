// ===============================
// Accelerometer Page – Structural Health
// ===============================

// ---- Tab Switching ----
document.addEventListener("DOMContentLoaded", () => {
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            tabs.forEach(b => b.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("tab-" + target).classList.add("active");

            // Load data when tab is activated
            if (target === "health") loadHealthIndex();
            if (target === "spectrum") loadModalSpectrum();
            if (target === "modal") loadModalTrend();
            if (target === "alerts") loadAlerts();
            if (target === "modeshape") loadModeShape();
        });
    });

    // Initial load
    loadHealthIndex();
});

// ---- 0. Modal Spectrum (FFT-like) ----
let spectrumRoot = null;

async function loadModalSpectrum() {
    try {
        const res = await fetch("/api/health/spectrum");
        const data = await res.json();

        if (spectrumRoot) spectrumRoot.dispose();

        const el = document.getElementById("spectrum-chart");
        if (!el) return;

        if (data.length === 0) {
            el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">No spectral data available</p>';
            return;
        }

        el.innerHTML = "";
        spectrumRoot = am5.Root.new("spectrum-chart");
        spectrumRoot.setThemes([am5themes_Animated.new(spectrumRoot)]);

        const chart = spectrumRoot.container.children.push(
            am5xy.XYChart.new(spectrumRoot, {
                panX: false, panY: false, wheelX: "none", wheelY: "none"
            })
        );

        // Create axes
        const xAxis = chart.xAxes.push(
            am5xy.ValueAxis.new(spectrumRoot, {
                renderer: am5xy.AxisRendererX.new(spectrumRoot, { minGridDistance: 50, stroke: am5.color(0xcccccc), strokeOpacity: 1 }),
                tooltip: am5.Tooltip.new(spectrumRoot, {}),
                extraMax: 0.1
            })
        );
        xAxis.get("renderer").grid.template.setAll({ visible: true, strokeOpacity: 0.1 });

        const yAxis = chart.yAxes.push(
            am5xy.ValueAxis.new(spectrumRoot, {
                min: 0,
                max: 6,
                renderer: am5xy.AxisRendererY.new(spectrumRoot, { stroke: am5.color(0xcccccc), strokeOpacity: 1 })
            })
        );

        // Add series (LineSeries for the "FFT" look)
        const series = chart.series.push(
            am5xy.LineSeries.new(spectrumRoot, {
                name: "Modal Spectrum",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "amplitude",
                valueXField: "frequency",
                stroke: am5.color(0x3b82f6),
                tooltip: am5.Tooltip.new(spectrumRoot, {
                    labelText: "Mode {mode}: {valueX} Hz"
                })
            })
        );

        series.strokes.template.setAll({
            strokeWidth: 2
        });

        series.fills.template.setAll({
            visible: true,
            fillOpacity: 0.1,
            fill: am5.color(0x3b82f6)
        });

        // Add bullets ONLY to the peak points
        series.bullets.push(function () {
            let container = am5.Container.new(spectrumRoot, {
                templateField: "bulletSettings"
            });
            container.children.push(am5.Circle.new(spectrumRoot, {
                radius: 4,
                fill: am5.color(0x3b82f6),
                stroke: am5.color(0xffffff),
                strokeWidth: 2
            }));
            return am5.Bullet.new(spectrumRoot, {
                sprite: container
            });
        });

        // Generate Realistic FFT Simulation
        let chartData = [];
        const sorted = data.sort((a, b) => a.frequency - b.frequency);
        const maxFreq = sorted.length > 0 ? parseFloat(sorted[sorted.length - 1].frequency) : 1.0;
        const chartLimit = maxFreq + 0.5;

        // 1. Generate Noisy Baseline
        for (let f = 0; f <= chartLimit; f += 0.005) {
            // Small random noise (0 to 0.15)
            let noise = Math.random() * 0.15;
            chartData.push({ frequency: f, amplitude: noise });
        }

        // 2. Overlay Peaks (Spikes)
        sorted.forEach(d => {
            const f = parseFloat(d.frequency);
            const m = parseInt(d.mode_number);
            const peakHeight = m; // Amplitude scales with mode number

            const offset = 0.02;

            chartData.push({ frequency: f - offset, amplitude: Math.random() * 0.1, bulletSettings: { visible: false } });
            chartData.push({ frequency: f, amplitude: peakHeight, mode: m, bulletSettings: { visible: true } });
            chartData.push({ frequency: f + offset, amplitude: Math.random() * 0.1, bulletSettings: { visible: false } });
        });

        // Re-sort data so the line series draws correctly
        chartData.sort((a, b) => a.frequency - b.frequency);

        series.data.setAll(chartData);

        // Add cursor
        chart.set("cursor", am5xy.XYCursor.new(spectrumRoot, {
            behavior: "none",
            xAxis: xAxis
        }));

    } catch (e) {
        console.warn("Spectrum load error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat data spektrum accelerometer", "Accelerometer");
    }
}

// ---- 1. Health Index ----
async function loadHealthIndex() {
    try {
        // Latest health
        const healthRes = await fetch("/api/health/latest");
        const health = await healthRes.json();

        const scoreEl = document.getElementById("health-score-val");
        const timeEl = document.getElementById("health-time");
        const scoreBox = document.getElementById("health-score-box");

        if (health && health.health_score !== undefined) {
            scoreEl.textContent = parseFloat(health.health_score).toFixed(1);
            timeEl.textContent = health.analysis_time || "—";

            // Color based on score
            const score = parseFloat(health.health_score);
            if (score >= 80) scoreBox.style.borderColor = "#22c55e";
            else if (score >= 50) scoreBox.style.borderColor = "#f59e0b";
            else scoreBox.style.borderColor = "#ef4444";
        } else {
            scoreEl.textContent = "—";
            timeEl.textContent = "No data";
        }

        // Dashboard summary
        const summaryRes = await fetch("/api/health/dashboard-summary");
        const summary = await summaryRes.json();
        const tbody = document.getElementById("summary-table-body");
        tbody.innerHTML = "";

        if (summary.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No data available</td></tr>';
            return;
        }

        summary.forEach(row => {
            const statusClass = row.status === "NORMAL" ? "status-normal" :
                row.status === "WARNING" ? "status-warning" : "status-danger";
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.analysis_time || "—"}</td>
                <td>${row.health_score !== undefined ? parseFloat(row.health_score).toFixed(1) : "—"}</td>
                <td>Mode ${row.mode_number || "—"}</td>
                <td>${row.freq_drift_percent !== undefined ? parseFloat(row.freq_drift_percent).toFixed(2) : "—"}%</td>
                <td><span class="accel-status ${statusClass}">${row.status || "—"}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn("Health index load error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat indeks kesehatan struktur", "Accelerometer");
    }
}

// ---- 2. Modal Trend ----
let modalTrendRoot = null;

async function loadModalTrend() {
    const modeNumber = document.getElementById("mode-selector").value;
    try {
        const res = await fetch(`/api/health/modal-trend?mode_number=${modeNumber}`);
        const data = await res.json();

        // Dispose previous chart
        if (modalTrendRoot) modalTrendRoot.dispose();

        const el = document.getElementById("modal-trend-chart");
        if (!el) return;

        if (data.length === 0) {
            el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">No trend data for Mode ' + modeNumber + '</p>';
            return;
        }

        el.innerHTML = "";
        modalTrendRoot = am5.Root.new("modal-trend-chart");
        modalTrendRoot.setThemes([am5themes_Animated.new(modalTrendRoot)]);

        const chart = modalTrendRoot.container.children.push(
            am5xy.XYChart.new(modalTrendRoot, {
                panX: true, panY: false, wheelX: "panX", wheelY: "zoomX"
            })
        );

        const xAxis = chart.xAxes.push(
            am5xy.DateAxis.new(modalTrendRoot, {
                baseInterval: { timeUnit: "minute", count: 1 },
                renderer: am5xy.AxisRendererX.new(modalTrendRoot, { stroke: am5.color(0xcccccc), strokeOpacity: 1 }),
                tooltip: am5.Tooltip.new(modalTrendRoot, {})
            })
        );

        const yAxis = chart.yAxes.push(
            am5xy.ValueAxis.new(modalTrendRoot, {
                renderer: am5xy.AxisRendererY.new(modalTrendRoot, { stroke: am5.color(0xcccccc), strokeOpacity: 1 })
            })
        );

        const series = chart.series.push(
            am5xy.LineSeries.new(modalTrendRoot, {
                name: "Frequency",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "frequency",
                valueXField: "time",
                stroke: am5.color(0x6366f1),
                tooltip: am5.Tooltip.new(modalTrendRoot, {
                    labelText: "Freq: {valueY.formatNumber('#.###')} Hz"
                })
            })
        );

        series.strokes.template.setAll({ strokeWidth: 2 });

        const chartData = data.map(d => ({
            time: new Date(d.analysis_time).getTime(),
            frequency: parseFloat(d.frequency)
        }));

        series.data.setAll(chartData);
        chart.set("cursor", am5xy.XYCursor.new(modalTrendRoot, {}));

    } catch (e) {
        console.warn("Modal trend load error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat data modal trend", "Accelerometer");
    }
}

document.getElementById("mode-selector")?.addEventListener("change", loadModalTrend);

// ---- 3. Alerts ----
async function loadAlerts() {
    try {
        const res = await fetch("/api/health/latest-alerts");
        const data = await res.json();
        const tbody = document.getElementById("alerts-table-body");
        tbody.innerHTML = "";

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No alerts – all systems normal</td></tr>';
            return;
        }

        data.forEach(row => {
            const statusClass = row.status === "WARNING" ? "status-warning" : "status-danger";
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.analysis_time || "—"}</td>
                <td>Mode ${row.mode_number || "—"}</td>
                <td>${row.freq_drift_percent !== undefined ? parseFloat(row.freq_drift_percent).toFixed(2) : "—"}%</td>
                <td><span class="accel-status ${statusClass}">${row.status || "—"}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn("Alerts load error:", e);
        if (window.SHMToast) window.SHMToast.warning("Gagal memuat data alerts accelerometer", "Accelerometer");
    }
}

// ---- 4. Mode Shape ----
let modeShapeRoot = null;

async function loadModeShape() {
    const modeNumber = document.getElementById("modeshape-selector").value;
    try {
        const res = await fetch(`/api/health/mode-shape?mode_number=${modeNumber}`);
        const data = await res.json();

        if (modeShapeRoot) modeShapeRoot.dispose();

        const el = document.getElementById("modeshape-chart");
        if (!el) return;

        if (!data || !data.shape_vector) {
            el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">No mode shape data for Mode ' + modeNumber + '</p>';
            return;
        }

        el.innerHTML = "";
        const vector = data.shape_vector;

        modeShapeRoot = am5.Root.new("modeshape-chart");
        modeShapeRoot.setThemes([am5themes_Animated.new(modeShapeRoot)]);

        const chart = modeShapeRoot.container.children.push(
            am5xy.XYChart.new(modeShapeRoot, {
                panX: false, panY: false
            })
        );

        const xAxis = chart.xAxes.push(
            am5xy.CategoryAxis.new(modeShapeRoot, {
                categoryField: "node",
                renderer: am5xy.AxisRendererX.new(modeShapeRoot, { minGridDistance: 30, stroke: am5.color(0xcccccc), strokeOpacity: 1 })
            })
        );

        const yAxis = chart.yAxes.push(
            am5xy.ValueAxis.new(modeShapeRoot, {
                renderer: am5xy.AxisRendererY.new(modeShapeRoot, { stroke: am5.color(0xcccccc), strokeOpacity: 1 })
            })
        );

        const series = chart.series.push(
            am5xy.LineSeries.new(modeShapeRoot, {
                name: "Shape",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "value",
                categoryXField: "node",
                stroke: am5.color(0x8b5cf6),
                tooltip: am5.Tooltip.new(modeShapeRoot, {
                    labelText: "Node {categoryX}: {valueY.formatNumber('#.####')}"
                })
            })
        );

        series.strokes.template.setAll({ strokeWidth: 2 });
        series.bullets.push(() => am5.Bullet.new(modeShapeRoot, {
            sprite: am5.Circle.new(modeShapeRoot, {
                radius: 4, fill: am5.color(0x8b5cf6)
            })
        }));

        // Convert object to array if needed (DB returns a dict)
        let vectorArray = [];
        if (Array.isArray(vector)) {
            vectorArray = vector.map((v, i) => ({ node: "N" + (i + 1), value: parseFloat(v) }));
        } else if (typeof vector === 'object' && vector !== null) {
            vectorArray = Object.entries(vector).map(([key, val]) => ({
                node: key,
                value: parseFloat(val)
            }));
            // Sort by key if they are like ACC_01, ACC_02
            vectorArray.sort((a, b) => a.node.localeCompare(b.node));
        }

        xAxis.data.setAll(vectorArray);
        series.data.setAll(vectorArray);

    } catch (e) {
        console.warn("Mode shape load error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat data mode shape", "Accelerometer");
    }
}

document.getElementById("modeshape-selector")?.addEventListener("change", loadModeShape);
