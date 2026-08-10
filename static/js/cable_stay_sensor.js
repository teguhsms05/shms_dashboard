// ===============================
// Cable Stay Sensor Detailed Monitoring
// ===============================
// SENSOR_ID is injected by the Flask template (cable_stay_sensor.html)
const _sid = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const CABLE_API = `/api/cable-stay/latest?dummy=1${_sid}`;
const CABLE_HISTORY_API = `/api/cable-stay/history?dummy=1${_sid}`;
const MAX_CHART_POINTS = 120;

let isStreaming = true;
const socket = io();
let chartData = [];
let sensorChartRoot = null;
let forceSeries, stressSeries, tempSeries, sbSeries, tooltipSeries;
let forcePulse, stressPulse, tempPulse;
let xAxis, yAxisForce, yAxisStress, yAxisTemp;

// ===============================
// Tab Switching
// ===============================
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(tc => {
                tc.classList.toggle('active', tc.id === `tab-${target}`);
            });
        });
    });
});

// ===============================
// amCharts 5 - Cable Stay Sensor Chart
// ===============================
function initAllCharts() {
    initSensorChart();
}

function initSensorChart() {
    const el = document.getElementById("sensor-chart");
    if (!el) return;

    if (sensorChartRoot) {
        sensorChartRoot.dispose();
    }

    const C = SHMChart.colors();
    const textColor = C.text;
    const gridColor = C.grid;

    sensorChartRoot = am5.Root.new("sensor-chart");
    const root = sensorChartRoot;

    root.setThemes([
        am5themes_Animated.new(root)
    ]);

    var chart = SHMChart.createXYChart(root);

    // Axes
    xAxis = SHMChart.createDateXAxis(chart, root, C);

    yAxisForce = SHMChart.createValueYAxis(chart, root, C, { min: 380, max: 650 });
    var lblForce = SHMChart.addYLabel(yAxisForce, root, 'Force (kN)', C);

    // Thresholds - Force
    SHMChart.addThreshold(yAxisForce, root, 400, 0xf59e0b, '400 kN');
    SHMChart.addThreshold(yAxisForce, root, 600, 0xef4444, '600 kN');

    yAxisStress = SHMChart.createValueYAxis(chart, root, C);
    var lblStress = SHMChart.addYLabel(yAxisStress, root, 'Stress (MPa)', C);

    yAxisTemp = SHMChart.createValueYAxis(chart, root, C, { opposite: true });
    var lblCableTemp = SHMChart.addYLabel(yAxisTemp, root, 'Temperature (°C)', C, true);

    // Store labels for theme refresh
    window._cableYLabels = [lblForce, lblStress, lblCableTemp];

    // Series
    function createSeries(name, field, axis, color) {
        var series = chart.series.push(
            am5xy.LineSeries.new(root, {
                name: name,
                xAxis: xAxis,
                yAxis: axis,
                valueYField: field,
                valueXField: "time",
                stroke: am5.color(color)
            })
        );
        series.strokes.template.setAll({ strokeWidth: 2 });
        series.bullets.push(function (root, series, dataItem) {
            return am5.Bullet.new(root, {
                sprite: am5.Circle.new(root, {
                    radius: 3,
                    fill: root.interfaceColors.get("background"),
                    stroke: series.get("stroke"),
                    strokeWidth: 2
                })
            });
        });
        return series;
    }

    forceSeries = createSeries("Force", "force", yAxisForce, 0x3b82f6);
    stressSeries = createSeries("Stress", "stress", yAxisStress, 0xef4444);
    tempSeries = createSeries("Temp", "temperature", yAxisTemp, 0x22c55e);

    // Shared Tooltip
    tooltipSeries = chart.series.push(am5xy.LineSeries.new(root, {
        name: "Tooltip Series",
        xAxis: xAxis,
        yAxis: yAxisForce,
        valueYField: "force",
        valueXField: "time",
        opacity: 0,
        tooltip: am5.Tooltip.new(root, {
            labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n[bold]Force:[/] {force} kN\n[bold]Stress:[/] {stress} MPa\n[bold]Temp:[/] {temperature} °C",
            pointerOrientation: "horizontal"
        })
    }));

    SHMChart.applyTooltipBg(tooltipSeries);
    tooltipSeries.strokes.template.set("visible", false);

    // Pulse Series
    forcePulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisForce, 'force', 0x3b82f6);
    stressPulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisStress, 'stress', 0xef4444);
    tempPulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisTemp, 'temperature', 0x22c55e);



    // Cursor
    var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
        xAxis: xAxis,
        behavior: "zoomX",
        snapToSeries: [tooltipSeries]
    }));
    cursor.lineY.set("visible", false);

    // Refresh data if available
    if (chartData.length > 0) {
        forceSeries.data.setAll(chartData);
        stressSeries.data.setAll(chartData);
        tempSeries.data.setAll(chartData);
        tooltipSeries.data.setAll(chartData);
        updatePulse(chartData[chartData.length - 1]);
    }

    // Setup toggles AFTER series/axes are initialized
    SHMChart.setupLegendToggle('legend-force', forceSeries, forcePulse, yAxisForce);
    SHMChart.setupLegendToggle('legend-stress', stressSeries, stressPulse, yAxisStress);
    SHMChart.setupLegendToggle('legend-temp', tempSeries, tempPulse, yAxisTemp);

    // Initialize tooltip text and visibility
    updateTooltipText();
}

am5.ready(function () {
    initAllCharts();
    loadHistory().then(startStreaming);

    // === Sensor Watchdog ===
    // Toast muncul jika tidak ada data masuk dalam 90 detik
    const cableWatcher = window.SHMToast
        ? window.SHMToast.watchSensor({ sensorName: `Cable Stay ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim(), timeoutMs: 90000 })
        : null;
    // Expose agar startStreaming bisa mengaksesnya
    window._cableWatcher = cableWatcher;

    // Theme change — re-apply axis colors
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisForce, yAxisStress, yAxisTemp], window._cableYLabels || []);
    });
});

// ===============================
// Data Loading & Streaming
// ===============================
async function loadHistory() {
    try {
        const res = await fetch(CABLE_HISTORY_API + "&limit=30");
        const rows = await res.json();
        if (!rows || rows.length === 0) return;

        chartData = rows.map(r => ({
            time: new Date(r.time).getTime(),
            force: r.force,
            stress: r.stress,
            temperature: r.temperature
        })).reverse();

        forceSeries.data.setAll(chartData);
        stressSeries.data.setAll(chartData);
        tempSeries.data.setAll(chartData);
        if (sbSeries) sbSeries.data.setAll(chartData);
        tooltipSeries.data.setAll(chartData);

        const last = chartData[chartData.length - 1];
        updatePulse(last);
        updateSummary(last);
        updateTable(rows);
    } catch (e) {
        console.error("History load error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat data historis Cable Stay", "Cable Stay");
    }
}

function startStreaming() {
    socket.on('cable_update', (d) => {
        if (!isStreaming) return;
        if (!d.time) return;

        // Filter by SENSOR_ID
        if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID && d.sensor_id !== SENSOR_ID) {
            return;
        }

        // Reset watchdog — data relevan diterima
        if (window._cableWatcher) window._cableWatcher.update();

        const point = {
            time: new Date(d.time).getTime(),
            force: d.force,
            stress: d.stress,
            temperature: d.temperature
        };

        if (chartData.length > 0 && point.time === chartData[chartData.length - 1].time) return;

        chartData.push(point);
        if (chartData.length > MAX_CHART_POINTS) chartData.shift();

        forceSeries.data.setAll(chartData);
        stressSeries.data.setAll(chartData);
        tempSeries.data.setAll(chartData);
        if (sbSeries) sbSeries.data.setAll(chartData);
        tooltipSeries.data.setAll(chartData);

        updatePulse(point);
        updateSummary(point);
        prependTableRow({ time: d.time, force: d.force, stress: d.stress, temperature: d.temperature });
    });
}

function updatePulse(point) {
    forcePulse.data.setAll([point]);
    stressPulse.data.setAll([point]);
    tempPulse.data.setAll([point]);
}

function updateSummary(d) {
    document.getElementById("summary-force").textContent = d.force.toFixed(2);
    document.getElementById("summary-stress").textContent = d.stress.toFixed(2);
    document.getElementById("summary-temp").textContent = d.temperature.toFixed(2);
}

function updateTable(rows) {
    const tbody = document.getElementById("sensor-table-body");
    tbody.innerHTML = "";
    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                <td>${new Date(r.time).toLocaleString('id-ID')}</td>
                <td>${r.force.toFixed(2)}</td>
                <td>${r.stress.toFixed(2)}</td>
                <td>${r.temperature.toFixed(2)}</td>
            `;
        tbody.appendChild(tr);
    });
}

function prependTableRow(r) {
    const tbody = document.getElementById('sensor-table-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>${new Date(r.time).toLocaleString('id-ID')}</td>
            <td>${r.force.toFixed(2)}</td>
            <td>${r.stress.toFixed(2)}</td>
            <td>${r.temperature.toFixed(2)}</td>
        `;
    tbody.insertBefore(tr, tbody.firstChild);
    if (tbody.rows.length > 30) tbody.deleteRow(tbody.rows.length - 1);
}

// ===============================
// Interactive Legend Toggle
// ===============================
function updateTooltipText() {
    if (!tooltipSeries) return;

    let labelData = [];
    const fEl = document.getElementById('legend-force');
    const sEl = document.getElementById('legend-stress');
    const tEl = document.getElementById('legend-temp');

    const fActive = fEl ? !fEl.classList.contains('inactive') : true;
    const sActive = sEl ? !sEl.classList.contains('inactive') : true;
    const tActive = tEl ? !tEl.classList.contains('inactive') : true;
    labelData.push("{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n");
    if (fActive) labelData.push("[bold]Force:[/] {force} kN");
    if (sActive) labelData.push("[bold]Stress:[/] {stress} MPa");
    if (tActive) labelData.push("[bold]Temp:[/] {temperature} °C");

    tooltipSeries.get("tooltip").set("labelText", labelData.join("\n"));

    // Hide tooltip series if nothing is active
    if (labelData.length === 0) {
        tooltipSeries.hide();
    } else {
        tooltipSeries.show();
    }
}

function setupLegendToggle(elementId, mainSeries, pulseSeries, axis) {
    const el = document.getElementById(elementId);
    if (el) {
        el.addEventListener('click', () => {
            const isCurrentlyVisible = !el.classList.contains('inactive');
            if (isCurrentlyVisible) {
                mainSeries.hide();
                pulseSeries.hide();
                if (axis) axis.hide();
                el.classList.add('inactive');
            } else {
                mainSeries.show();
                pulseSeries.show();
                if (axis) axis.show();
                el.classList.remove('inactive');
            }
            updateTooltipText();
        });
    }
}

// setupLegendToggle calls moved into initSensorChart

loadHistory().then(startStreaming);

// ===============================
// Actions & Exports
// ===============================
document.getElementById("btn-toggle-stream").addEventListener("click", function () {
    isStreaming = !isStreaming;
    this.textContent = isStreaming ? "Stop" : "Start";
    this.className = isStreaming ? "btn-stop" : "btn-start";
});

document.getElementById("btn-export-csv").addEventListener("click", async () => {
    const res = await fetch(CABLE_HISTORY_API + "&limit=500");
    const rows = await res.json();
    let csv = "Datetime,Force (kN),Stress (MPa),Temp (C)\n";
    rows.forEach(r => csv += `${r.time},${r.force},${r.stress},${r.temperature}\n`);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cable_stay_${SENSOR_ID}.csv`;
    a.click();
});

document.getElementById("btn-export-pdf").addEventListener("click", async () => {
    const res = await fetch(CABLE_HISTORY_API + "&limit=500");
    const rows = await res.json();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text(`Sensor ${SENSOR_ID} - Cable Stay Data`, 14, 15);
    const body = rows.map(r => [new Date(r.time).toLocaleString('id-ID'), r.force.toFixed(2), r.stress.toFixed(2), r.temperature.toFixed(2)]);
    doc.autoTable({ startY: 25, head: [['Datetime', 'Force (kN)', 'Stress (MPa)', 'Temp (C)']], body: body });
    doc.save(`cable_stay_${SENSOR_ID}.pdf`);
});

// ── Full Card Capture ──
window.captureCableSensor = function () {
    const target = document.getElementById("cableSensorCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Cable Sensor');
        return;
    }

    html2canvas(target, {
        useCORS: true,
        scale: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || "#ffffff"
    }).then(canvas => {
        const link = document.createElement("a");
        const date = new Date();
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const dateStr = dd + mm + yyyy;

        const sid = typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : 'Data';
        link.download = `Cable_Stay_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureCableSensor error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Cable Sensor');
    });
};

