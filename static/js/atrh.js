// ===============================
// ATRH Page - Real-Time Chart + Data Table
// ===============================
const _sid = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const ATRH_API = `/api/atrhs/latest?dummy=1${_sid}`;
const ATRH_HISTORY_API = `/api/atrhs/history?dummy=1${_sid}`;
const MAX_CHART_POINTS = 120; // 2 minutes rolling

let isStreaming = true;
const socket = io();

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
// amCharts 5 - ATRH Real-Time Chart
// ===============================
am5.ready(function () {

    var root = am5.Root.new("atrh-chart");
    root.setThemes([
        am5themes_Animated.new(root),
        am5.Theme.new(root, {
            "AxisLabel": {
                "minor": {
                    "fill": am5.color(0x999999),
                    "fontSize": "0.8em"
                }
            }
        })
    ]);

    var chart = root.container.children.push(
        am5xy.XYChart.new(root, {
            panX: false,
            panY: false,
            wheelX: "panX",
            wheelY: "zoomX",
            pinchZoomX: true
        })
    );

    // Add zoom-out button
    SHMChart.applyZoomButton(chart, root);

    // ===============================
    // X Axis (Time)
    // ===============================
    const C = SHMChart.colors();
    var xAxis = SHMChart.createDateXAxis(chart, root, C);

    // ===============================
    // Y Axis - Temperature (Left)
    // ===============================
    var yAxisTemp = SHMChart.createValueYAxis(chart, root, C, { extraMax: 0, min: 20, max: 60 });
    const lblTemp = SHMChart.addYLabel(yAxisTemp, root, 'Temperature (°C)', C);

    const isDark = C.isDark;
    const textColor = C.text;

    // ===============================
    // Y Axis - Humidity (Right)
    // ===============================
    var yAxisRH = SHMChart.createValueYAxis(chart, root, C, { opposite: true, extraMax: 0, min: 0, max: 100 });
    const lblRH = SHMChart.addYLabel(yAxisRH, root, 'Humidity (%)', C, true);

    const THRESHOLD_API = `/api/sensor-thresholds/${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`;

    // Thresholds — dynamic from DB
    async function applyThresholds(series) {
        try {
            const res = await fetch(THRESHOLD_API);
            const th = await res.json();

            if (th.th1 != null) {
                SHMChart.addThreshold(yAxisTemp, root, th.th1, 0xf59e0b, `Warning: ${th.th1}°C`);

                // Dynamic Coloring for Warning
                if (series) {
                    const rangeDataItem = yAxisTemp.makeDataItem({ value: th.th1, endValue: th.th2 || 100 });
                    const range = series.createAxisRange(rangeDataItem);
                    range.strokes.template.setAll({
                        stroke: am5.color(0xf59e0b),
                        strokeWidth: 2
                    });
                }
            }
            if (th.th2 != null) {
                SHMChart.addThreshold(yAxisTemp, root, th.th2, 0xef4444, `Critical: ${th.th2}°C`);
                // yAxisTemp.set("max", th.th2 * 1.1); // Optional: autoscale headroom

                // Dynamic Coloring for Critical
                if (series) {
                    const rangeDataItem = yAxisTemp.makeDataItem({ value: th.th2, endValue: 100 });
                    const range = series.createAxisRange(rangeDataItem);
                    range.strokes.template.setAll({
                        stroke: am5.color(0xef4444),
                        strokeWidth: 2
                    });
                }
            }
        } catch (e) {
            console.warn("Failed to fetch thresholds:", e);
        }
    }

    // ===============================
    // Series - Temperature
    // ===============================
    var tempSeries = chart.series.push(
        am5xy.LineSeries.new(root, {
            name: "Temperature",
            xAxis: xAxis,
            yAxis: yAxisTemp,
            valueYField: "temperature",
            valueXField: "time",
            stroke: am5.color(0x3b82f6)
        })
    );
    tempSeries.strokes.template.setAll({ strokeWidth: 2 });

    // ===============================
    // Series - Humidity
    // ===============================
    var rhSeries = chart.series.push(
        am5xy.LineSeries.new(root, {
            name: "Humidity",
            xAxis: xAxis,
            yAxis: yAxisRH,
            valueYField: "humidity",
            valueXField: "time",
            stroke: am5.color(0xf59e0b)
        })
    );
    rhSeries.strokes.template.setAll({ strokeWidth: 2 });

    // ===============================
    // Invisible Series for Shared Tooltip
    // ===============================
    var tooltipSeries = chart.series.push(am5xy.LineSeries.new(root, {
        name: "Tooltip Series",
        xAxis: xAxis,
        yAxis: yAxisTemp,
        valueYField: "temperature",
        valueXField: "time",
        opacity: 0,
        tooltip: am5.Tooltip.new(root, {
            labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n[bold]Temp:[/] {temperature}°C\n[bold]RH:[/] {humidity}%",
            pointerOrientation: "horizontal"
        })
    }));
    tooltipSeries.strokes.template.set("visible", false);
    tooltipSeries.fills.template.set("visible", false);
    SHMChart.applyTooltipBg(tooltipSeries);

    // ===============================
    // Cursor (snap to tooltips only)
    // ===============================
    var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
        xAxis: xAxis,
        behavior: "zoomX",
        snapToSeries: [tooltipSeries]
    }));
    cursor.lineY.set("visible", false);



    // ===============================
    // Bullets - Static dot on every point
    // ===============================
    tempSeries.bullets.push(function (root, series, dataItem) {
        var container = am5.Container.new(root, {});
        var color = series.get("stroke");

        // Hollow Dot for ALL points
        container.children.push(am5.Circle.new(root, {
            radius: 4,
            fill: root.interfaceColors.get("background"),
            stroke: color,
            strokeWidth: 2
        }));

        return am5.Bullet.new(root, { sprite: container });
    });
    rhSeries.bullets.push(function (root, series, dataItem) {
        var container = am5.Container.new(root, {});
        var color = series.get("stroke");

        // Hollow Dot for ALL points
        container.children.push(am5.Circle.new(root, {
            radius: 4,
            fill: root.interfaceColors.get("background"),
            stroke: color,
            strokeWidth: 2
        }));

        return am5.Bullet.new(root, { sprite: container });
    });

    // ===============================
    // Series - Pulses (Only for the latest point)
    // Dedicated series makes pulse management easy and stable
    // ===============================
    var tempPulseSeries = SHMChart.createPulseSeries(chart, root, xAxis, yAxisTemp, 'temperature', 0x3b82f6);
    var rhPulseSeries = SHMChart.createPulseSeries(chart, root, xAxis, yAxisRH, 'humidity', 0xf59e0b);

    function createLabelSeries(yAxis, color, field, initialText, dy) {
        var ls = chart.series.push(am5xy.LineSeries.new(root, {
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "time"
        }));
        ls.strokes.template.setAll({ strokeWidth: 0, strokeOpacity: 0 });
        ls.bullets.push(function (root, series, dataItem) {
            const val = dataItem.get("valueY");
            const unit = field === 'temperature' ? "°C" : "%";
            const text = (val != null) ? val.toFixed(1) + unit : "--" + unit;

            var lbl = am5.Label.new(root, {
                text: text,
                fill: am5.color(0xffffff),
                fontSize: 11,
                fontWeight: "600",
                centerX: am5.p50,
                centerY: am5.p100,
                dy: dy,
                paddingTop: 3, paddingBottom: 3,
                paddingLeft: 8, paddingRight: 8,
                background: am5.RoundedRectangle.new(root, {
                    fill: am5.color(color),
                    fillOpacity: 0.92,
                    cornerRadiusTL: 4, cornerRadiusTR: 4,
                    cornerRadiusBL: 4, cornerRadiusBR: 4,
                    strokeOpacity: 0
                })
            });
            return am5.Bullet.new(root, { locationY: 1, sprite: lbl });
        });
        return ls;
    }

    var tempLabelSeries = createLabelSeries(yAxisTemp, 0x3b82f6, 'temperature', "--°C", -18);
    var rhLabelSeries = createLabelSeries(yAxisRH, 0xf59e0b, 'humidity', "--%", -15);

    function updateLatestTooltip(point) {
        if (!point) return;
        if (point.temperature != null) tempLabelSeries.data.setAll([{ time: point.time, temperature: point.temperature }]);
        if (point.humidity != null) rhLabelSeries.data.setAll([{ time: point.time, humidity: point.humidity }]);
    }

    // ===============================
    // Initial Data + Streaming
    // ===============================
    var chartData = [];

    // === Sensor Watchdog ===
    const atrhWatcher = window.SHMToast
        ? window.SHMToast.watchSensor({ sensorName: `ATRH ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim(), timeoutMs: 120000 })
        : null;

    async function loadChartHistory() {
        try {
            const res = await fetch(ATRH_HISTORY_API + "&limit=10");
            const rows = await res.json();
            if (!rows || rows.length === 0) return;

            rows.reverse();
            rows.forEach(r => {
                chartData.push({
                    time: new Date(r.time).getTime(),
                    temperature: r.temperature,
                    humidity: r.humidity
                });
            });

            tempSeries.data.setAll(chartData);
            rhSeries.data.setAll(chartData);
            tooltipSeries.data.setAll(chartData);

            const latest = chartData[chartData.length - 1];
            tempPulseSeries.data.setAll([latest]);
            rhPulseSeries.data.setAll([latest]);
            updateLatestTooltip(latest);

            const lastRow = rows[rows.length - 1];
            document.getElementById('summary-temp').textContent = lastRow.temperature?.toFixed(1) || '--';
            document.getElementById('summary-rh').textContent = lastRow.humidity?.toFixed(1) || '--';

        } catch (e) {
            console.warn("History load error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal memuat data riwayat ATRH", "ATRH");
        }
    }

    function startStreaming() {
        socket.on('atrh_update', (d) => {
            if (!isStreaming) return;
            if (!d.time) return;

            // Filter by SENSOR_ID if it exists
            if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID && d.sensor_id !== SENSOR_ID) {
                return;
            }

            const point = {
                time: new Date(d.time).getTime(),
                temperature: d.temperature,
                humidity: d.humidity
            };

            // Reset watchdog — data relevan diterima
            if (atrhWatcher) atrhWatcher.update();

            if (chartData.length > 0 && point.time === chartData[chartData.length - 1].time) return;

            chartData.push(point);
            if (chartData.length > MAX_CHART_POINTS) {
                chartData.shift();
                tempSeries.data.removeIndex(0);
                rhSeries.data.removeIndex(0);
            }

            tempSeries.data.push(point);
            rhSeries.data.push(point);
            tooltipSeries.data.push(point);

            // Simply update the Pulse Series with the single newest point
            tempPulseSeries.data.setAll([point]);
            rhPulseSeries.data.setAll([point]);
            updateLatestTooltip(point);

            document.getElementById('summary-temp').textContent = d.temperature?.toFixed(1) || '--';
            document.getElementById('summary-rh').textContent = d.humidity?.toFixed(1) || '--';
            loadDataTable(10);
        });
    }

    // Sequence: Load 100 historial points first, then start 1s interval
    loadChartHistory().then(() => {
        applyThresholds(tempSeries);
        startStreaming();
    });

    // ===============================
    // Stop/Start Toggle
    // ===============================
    var toggleBtn = document.getElementById('btn-toggle-stream');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (isStreaming) {
                isStreaming = false;
                toggleBtn.textContent = 'Start';
                toggleBtn.classList.remove('btn-stop');
                toggleBtn.classList.add('btn-start');
            } else {
                isStreaming = true;
                toggleBtn.textContent = 'Stop';
                toggleBtn.classList.remove('btn-start');
                toggleBtn.classList.add('btn-stop');
            }
        });
    }

    // ===============================
    // Theme change — re-apply axis colors
    // ===============================
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisTemp, yAxisRH], [lblTemp, lblRH]);
    });

    // ===============================
    // Data Table Sorting
    // ===============================
    let realtimeTableData = [];
    let currentSortCol = 'time';
    let currentSortDesc = true;

    function renderRealtimeTable() {
        const tbody = document.getElementById('atrh-table-body');
        if (!tbody) return;

        // Sort data
        realtimeTableData.sort((a, b) => {
            let valA = a[currentSortCol];
            let valB = b[currentSortCol];

            if (currentSortCol === 'time') {
                valA = new Date(a.time).getTime();
                valB = new Date(b.time).getTime();
            }

            if (valA == null) valA = '';
            if (valB == null) valB = '';

            if (valA < valB) return currentSortDesc ? 1 : -1;
            if (valA > valB) return currentSortDesc ? -1 : 1;
            return 0;
        });

        // Limit to 10 rows
        if (realtimeTableData.length > 10) {
            realtimeTableData = realtimeTableData.slice(0, 10);
        }

        tbody.innerHTML = '';
        realtimeTableData.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(r.time).toLocaleString('id-ID')}</td>
                <td>${r.temperature?.toFixed(1) ?? '--'} °C</td>
                <td>${r.humidity?.toFixed(1) ?? '--'} %</td>
                <td>${r.sensor_id || '--'}</td>
            `;
            tbody.appendChild(tr);
        });

        // Update headers UI
        document.querySelectorAll('.datatable-card .sortable-header').forEach(th => {
            if (th.closest('#tab-statistik')) return; // Ignore statistik tab if any
            const col = th.getAttribute('data-sort');
            const icon = th.querySelector('.sort-icon');
            if (col === currentSortCol) {
                icon.textContent = currentSortDesc ? '▼' : '▲';
            } else {
                icon.textContent = '';
            }
        });
    }

    // Attach click listeners to headers
    document.querySelectorAll('.datatable-card .sortable-header').forEach(th => {
        if (th.closest('#tab-statistik')) return;
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (currentSortCol === col) {
                currentSortDesc = !currentSortDesc;
            } else {
                currentSortCol = col;
                currentSortDesc = currentSortCol === 'time' ? true : false; // Default desc for time, asc for others
            }
            renderRealtimeTable();
        });
    });

    async function loadDataTable(limit = 10) {
        try {
            const res = await fetch(ATRH_HISTORY_API + "&limit=" + limit);
            const rows = await res.json();

            realtimeTableData = rows;
            renderRealtimeTable();

        } catch (e) {
            console.warn("History fetch error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal mengambil data ATRH", "ATRH");
        }
    }

    // Initial table load (10 rows as requested)
    loadDataTable(10);

    // ===============================
    // Interactive Legend Toggle
    // ===============================
    function updateTooltipText() {
        let labelData = [];
        const tActive = !document.getElementById('legend-temp').classList.contains('inactive');
        const rActive = !document.getElementById('legend-rh').classList.contains('inactive');

        if (tActive) labelData.push("[bold]Temp:[/] {temperature}°C");
        if (rActive) labelData.push("[bold]RH:[/] {humidity}%");

        tooltipSeries.get("tooltip").set("labelText", labelData.join("\n"));

        if (labelData.length === 0) {
            tooltipSeries.hide();
        } else {
            tooltipSeries.show();
        }
    }

    SHMChart.setupLegendToggle('legend-temp', tempSeries, tempPulseSeries, yAxisTemp, updateTooltipText);
    SHMChart.setupLegendToggle('legend-rh', rhSeries, rhPulseSeries, yAxisRH, updateTooltipText);


    // ===============================
    // Export PDF
    // ===============================
    var pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(ATRH_HISTORY_API + "&limit=500");
                const rows = await res.json();

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });

                const sensorLabel = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? SENSOR_ID.toUpperCase() : 'All Sensors';
                doc.setFontSize(14);
                doc.text(`ATRH Real-Time Data – ${sensorLabel}`, 14, 15);
                doc.setFontSize(9);
                doc.setTextColor(100);
                doc.text(`Exported at: ${new Date().toLocaleString('id-ID')}`, 14, 22);

                const tableData = rows.map(r => [
                    new Date(r.time).toLocaleString('id-ID'),
                    r.temperature?.toFixed(1) ?? '--',
                    r.humidity?.toFixed(1) ?? '--',
                    r.sensor_id || '--'
                ]);

                doc.autoTable({
                    startY: 27,
                    head: [['Datetime', 'Temperature (°C)', 'Humidity (%)', 'Sensor ID']],
                    body: tableData,
                    theme: 'striped',
                    headStyles: { fillColor: [59, 130, 246] },
                    styles: { fontSize: 8 }
                });

                doc.save(`atrh_data_${SENSOR_ID || 'all'}.pdf`);
            } catch (e) {
                console.warn("PDF export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export PDF ATRH", "Export");
            }
        });
    }

    // ===============================
    // Export CSV
    // ===============================
    var csvBtn = document.getElementById('btn-export-csv');
    if (csvBtn) {
        csvBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(ATRH_HISTORY_API + "&limit=500");
                const rows = await res.json();

                let csv = "Datetime,Temperature (°C),Humidity (%),Sensor ID\n";
                rows.forEach(r => {
                    csv += `${r.time},${r.temperature},${r.humidity},${r.sensor_id}\n`;
                });

                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `atrh_data_${SENSOR_ID || 'all'}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("CSV export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export CSV ATRH", "Export");
            }
        });
    }

});

// ── Full Card Capture ──
window.captureATRH = function () {
    const target = document.getElementById("atrhCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'ATRH');
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
        link.download = `ATRH_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureATRH error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'ATRH');
    });
};

// ===============================
// Statistik Search & Chart (10-min)
// ===============================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-tab') === 'statistik') {
                initStatistikSearch();
            }
        });
    });
});

function initStatistikSearch() {
    if (window._statInitialized) return;
    window._statInitialized = true;

    const yearSelect = document.getElementById('select-stat-year');
    const monthSelect = document.getElementById('select-stat-month');
    const weekSelect = document.getElementById('select-stat-week');
    const startInput = document.getElementById('input-stat-start');
    const endInput = document.getElementById('input-stat-end');
    const searchBtn = document.getElementById('btn-stat-search');

    if (!yearSelect || !searchBtn) return;

    // Initialize Flatpickr
    const fpStart = flatpickr(startInput, {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        allowInput: true
    });
    const fpEnd = flatpickr(endInput, {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        allowInput: true
    });

    document.getElementById('btn-stat-start-cal')?.addEventListener('click', () => fpStart.open());
    document.getElementById('btn-stat-end-cal')?.addEventListener('click', () => fpEnd.open());

    fetch('/api/weekly_periods/years')
        .then(res => res.json())
        .then(years => {
            years.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = y;
                yearSelect.appendChild(opt);
            });
        });

    yearSelect.addEventListener('change', async () => {
        monthSelect.innerHTML = '<option value="">Pilih Bulan</option>';
        weekSelect.innerHTML = '<option value="">Pilih Minggu</option>';
        if (!yearSelect.value) return;
        const res = await fetch(`/api/weekly_periods/months?year=${yearSelect.value}`);
        const months = await res.json();
        const monthOrder = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
        months.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = m;
            monthSelect.appendChild(opt);
        });
    });

    monthSelect.addEventListener('change', async () => {
        weekSelect.innerHTML = '<option value="">Pilih Minggu</option>';
        if (!monthSelect.value) return;
        const res = await fetch(`/api/weekly_periods/weeks?year=${yearSelect.value}&month=${monthSelect.value}`);
        const weeks = await res.json();
        window._statWeeks = weeks;
        weeks.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.periode_label; opt.textContent = w.periode_label;
            weekSelect.appendChild(opt);
        });
    });

    weekSelect.addEventListener('change', () => {
        if (!weekSelect.value || !window._statWeeks) return;
        const selected = window._statWeeks.find(w => w.periode_label === weekSelect.value);
        if (selected) {
            const startStr = selected.start_date.replace('T', ' ').split('.')[0];
            const endStr = selected.end_date.replace('T', ' ').split('.')[0];
            startInput.value = startStr;
            endInput.value = endStr;
            fpStart.setDate(startStr);
            fpEnd.setDate(endStr);
        }
    });

    searchBtn.addEventListener('click', () => {
        const start = startInput.value;
        const end = endInput.value;
        if (!start || !end) {
            if (window.SHMToast) window.SHMToast.warning("Silakan pilih periode terlebih dahulu", "Search");
            return;
        }
        loadStatistikByRange(start, end);
    });

    const optionSelect = document.getElementById('select-stat-option');
    if (optionSelect) {
        optionSelect.addEventListener('change', () => {
            if (!statRoot) return;
            const val = optionSelect.value;
            const chart = statRoot.container.children.getIndex(0);
            if (!chart) return;

            const yAxisTemp = chart.yAxes.getIndex(0);
            const yAxisRH = chart.yAxes.getIndex(1);

            const lblTemp = yAxisTemp?.get("customLabel");
            const lblRH = yAxisRH?.get("customLabel");

            const tempLegends = [
                document.getElementById('legend-stat-avg-temp'),
                document.getElementById('legend-stat-max-temp'),
                document.getElementById('legend-stat-min-temp')
            ];
            const rhLegends = [
                document.getElementById('legend-stat-avg-rh'),
                document.getElementById('legend-stat-max-rh'),
                document.getElementById('legend-stat-min-rh')
            ];

            const toggleDisplay = (arr, displayValue) => {
                arr.forEach(el => {
                    if (el) el.style.display = displayValue;
                });
            };

            if (val === 'semua') {
                // Show all temp series
                statSeriesRefs.tempSeries.forEach(s => s.show());
                // Show all RH series
                statSeriesRefs.rhSeries.forEach(s => s.show());

                if (yAxisTemp) {
                    yAxisTemp.show();
                    yAxisTemp.set("visible", true);
                    if (lblTemp) { lblTemp.show(); lblTemp.set("visible", true); }
                    const r = yAxisTemp.get("renderer");
                    if (r?.gridContainer) r.gridContainer.set("visible", true);
                    if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                }
                if (yAxisRH) {
                    yAxisRH.show();
                    yAxisRH.set("visible", true);
                    if (lblRH) { lblRH.show(); lblRH.set("visible", true); }
                    const r = yAxisRH.get("renderer");
                    if (r?.gridContainer) r.gridContainer.set("visible", true);
                    if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                }
                toggleDisplay(tempLegends, '');
                toggleDisplay(rhLegends, '');
                [...tempLegends, ...rhLegends].forEach(el => {
                    if (el) el.classList.remove('inactive-legend');
                });
            } else if (val === 'temp') {
                // Show temp series
                statSeriesRefs.tempSeries.forEach(s => s.show());
                // Hide RH series
                statSeriesRefs.rhSeries.forEach(s => s.hide());

                if (yAxisTemp) {
                    yAxisTemp.show();
                    yAxisTemp.set("visible", true);
                    if (lblTemp) { lblTemp.show(); lblTemp.set("visible", true); }
                    const r = yAxisTemp.get("renderer");
                    if (r?.gridContainer) r.gridContainer.set("visible", true);
                    if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                }
                if (yAxisRH) {
                    yAxisRH.hide();
                    yAxisRH.set("visible", false);
                    if (lblRH) { lblRH.hide(); lblRH.set("visible", false); }
                    const r = yAxisRH.get("renderer");
                    if (r?.gridContainer) r.gridContainer.set("visible", false);
                    if (r?.labelsContainer) r.labelsContainer.set("visible", false);
                }
                toggleDisplay(tempLegends, '');
                toggleDisplay(rhLegends, 'none');
                tempLegends.forEach(el => { if (el) el.classList.remove('inactive-legend'); });
                rhLegends.forEach(el => { if (el) el.classList.add('inactive-legend'); });
            } else if (val === 'rh') {
                // Hide temp series
                statSeriesRefs.tempSeries.forEach(s => s.hide());
                // Show RH series
                statSeriesRefs.rhSeries.forEach(s => s.show());

                if (yAxisTemp) {
                    yAxisTemp.hide();
                    yAxisTemp.set("visible", false);
                    if (lblTemp) { lblTemp.hide(); lblTemp.set("visible", false); }
                    const r = yAxisTemp.get("renderer");
                    if (r?.gridContainer) r.gridContainer.set("visible", false);
                    if (r?.labelsContainer) r.labelsContainer.set("visible", false);
                }
                if (yAxisRH) {
                    yAxisRH.show();
                    yAxisRH.set("visible", true);
                    if (lblRH) { lblRH.show(); lblRH.set("visible", true); }
                    const r = yAxisRH.get("renderer");
                    if (r?.gridContainer) r.gridContainer.set("visible", true);
                    if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                }
                toggleDisplay(tempLegends, 'none');
                toggleDisplay(rhLegends, '');
                tempLegends.forEach(el => { if (el) el.classList.add('inactive-legend'); });
                rhLegends.forEach(el => { if (el) el.classList.remove('inactive-legend'); });
            }
        });
    }
}

let statRoot = null;
let statSeriesRefs = {
    tempSeries: [],
    rhSeries: []
};
async function loadStatistikByRange(start, end) {
    try {
        if (window.SHMToast) window.SHMToast.info(`Mencari data ${start} s/d ${end}...`, "Search");
        const sidUrl = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
        const res = await fetch(`/api/atrhs/statistik/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${sidUrl}`);
        const data = await res.json();

        const legendCont = document.getElementById('atrh-statistik-legend');
        const summaryCont = document.getElementById('atrh-statistik-summary');

        if (!data.length) {
            if (window.SHMToast) window.SHMToast.warning("Data statistik tidak ditemukan untuk periode ini", "Statistik");
            
            // Clear summary
            const sumIds = ['stat-summary-min-temp', 'stat-summary-max-temp', 'stat-summary-avg-temp', 'stat-summary-min-rh', 'stat-summary-max-rh', 'stat-summary-avg-rh'];
            sumIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '--';
            });

            // Clear table
            const tbody = document.getElementById('atrh-statistik-table-body');
            if (tbody) tbody.innerHTML = '';

            // Clear chart
            if (statRoot) {
                statRoot.dispose();
                statRoot = null;
            }

            if (legendCont) legendCont.style.display = 'none';
            if (summaryCont) summaryCont.style.display = 'none';
            return;
        }

        if (window.SHMToast) window.SHMToast.success("Data Statistik ditemukan untuk periode ini", "Statistik");

        if (legendCont) legendCont.style.display = 'flex';
        if (summaryCont) summaryCont.style.display = 'flex';


        const first = data[0];
        document.getElementById('stat-summary-min-temp').textContent = first.min_temperature?.toFixed(1) || '--';
        document.getElementById('stat-summary-max-temp').textContent = first.max_temperature?.toFixed(1) || '--';
        document.getElementById('stat-summary-avg-temp').textContent = first.avg_temperature?.toFixed(1) || '--';
        document.getElementById('stat-summary-min-rh').textContent = first.min_humidity?.toFixed(1) || '--';
        document.getElementById('stat-summary-max-rh').textContent = first.max_humidity?.toFixed(1) || '--';
        document.getElementById('stat-summary-avg-rh').textContent = first.avg_humidity?.toFixed(1) || '--';

        renderStatistikChart(data);
        populateStatistikTable(data);

        // Apply current option filter to newly rendered chart
        const optionSelect = document.getElementById('select-stat-option');
        if (optionSelect) {
            optionSelect.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        console.error("Load statistik error:", e);
    }
}

function populateStatistikTable(data) {
    const tbody = document.getElementById('atrh-statistik-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const reversedData = [...data].reverse();

    reversedData.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(d.time).toLocaleString('id-ID')}</td>
            <td>${d.sensor_id || '--'}</td>
            <td>${d.min_temperature != null ? d.min_temperature.toFixed(2) : '--'}</td>
            <td>${d.max_temperature != null ? d.max_temperature.toFixed(2) : '--'}</td>
            <td>${d.avg_temperature != null ? d.avg_temperature.toFixed(2) : '--'}</td>
            <td>${d.min_humidity != null ? d.min_humidity.toFixed(2) : '--'}</td>
            <td>${d.max_humidity != null ? d.max_humidity.toFixed(2) : '--'}</td>
            <td>${d.avg_humidity != null ? d.avg_humidity.toFixed(2) : '--'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStatistikChart(data) {
    if (statRoot) {
        statRoot.dispose();
    }
    statRoot = am5.Root.new("atrh-stat-chart");
    statRoot.setThemes([am5themes_Animated.new(statRoot)]);

    const chart = SHMChart.createXYChart(statRoot);
    const C = SHMChart.colors();
    const xAxis = SHMChart.createDateXAxis(chart, statRoot, C, { timeUnit: "minute", count: 10 });

    const yAxisTemp = SHMChart.createValueYAxis(chart, statRoot, C, { min: 20, max: 60 });
    const lblTemp = SHMChart.addYLabel(yAxisTemp, statRoot, 'Temperature (°C)', C);
    yAxisTemp.set("customLabel", lblTemp);

    // Add Thresholds to Statistik Chart
    if (data.length > 0) {
        const first = data[0];
        if (first.th1 != null) {
            SHMChart.addThreshold(yAxisTemp, statRoot, first.th1, 0xf59e0b, `Warning: ${first.th1}°C`);
        }
        if (first.th2 != null) {
            SHMChart.addThreshold(yAxisTemp, statRoot, first.th2, 0xef4444, `Critical: ${first.th2}°C`);
        }
    }

    const yAxisRH = SHMChart.createValueYAxis(chart, statRoot, C, { opposite: true, min: 0, max: 100 });
    const lblRH = SHMChart.addYLabel(yAxisRH, statRoot, 'Humidity (%)', C, true);
    yAxisRH.set("customLabel", lblRH);
    yAxisRH.get('renderer').grid.template.set('visible', false);

    const chartData = data.map(d => ({
        time: new Date(d.time).getTime(),
        min_temp: d.min_temperature,
        max_temp: d.max_temperature,
        avg_temp: d.avg_temperature,
        min_rh: d.min_humidity,
        max_rh: d.max_humidity,
        avg_rh: d.avg_humidity
    }));

    function addSeries(name, field, yAxis, color, visible = true) {
        const series = chart.series.push(am5xy.LineSeries.new(statRoot, {
            name: name,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "time",
            stroke: am5.color(color),
            tooltip: am5.Tooltip.new(statRoot, {
                labelText: "[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name}: {valueY.formatNumber('#.#')} " + (field.includes('rh') ? '%' : '°C'),
                getFillFromSprite: false,
                pointerOrientation: "horizontal"
            })
        }));

        const bg = series.get("tooltip").get("background");
        if (bg) {
            bg.setAll({
                fill: am5.color(color),
                fillOpacity: 1,
                stroke: am5.color(color)
            });
        }

        series.bullets.push(function () {
            return am5.Bullet.new(statRoot, {
                sprite: am5.Circle.new(statRoot, {
                    radius: 4,
                    fill: statRoot.interfaceColors.get("background"),
                    stroke: am5.color(color),
                    strokeWidth: 2
                })
            });
        });

        series.strokes.template.setAll({ strokeWidth: 2 });
        if (!visible) series.hide();
        series.data.setAll(chartData);
        return series;
    }

    const s1 = addSeries("Avg Temp", "avg_temp", yAxisTemp, 0x3b82f6);
    const s2 = addSeries("Max Temp", "max_temp", yAxisTemp, 0xef4444);
    const s3 = addSeries("Min Temp", "min_temp", yAxisTemp, 0x10b981);

    const s4 = addSeries("Avg RH", "avg_rh", yAxisRH, 0xf59e0b);
    const s5 = addSeries("Max RH", "max_rh", yAxisRH, 0x10b981);
    const s6 = addSeries("Min RH", "min_rh", yAxisRH, 0xec4899);

    // Store series references for filtering
    statSeriesRefs.tempSeries = [s1, s2, s3];
    statSeriesRefs.rhSeries = [s4, s5, s6];

    // Attach Legend Toggles
    const toggle = (id, s, relatedSeries, axis, label) => {
        const el = document.getElementById(id);
        if (!el) return;

        // Sync initial state
        if (s.get("visible") === false) el.classList.add('inactive-legend');
        else el.classList.remove('inactive-legend');

        el.replaceWith(el.cloneNode(true)); // Clear older listeners
        const newEl = document.getElementById(id);
        newEl.addEventListener('click', () => {
            let isNowVisible;
            if (s.get("visible") !== false) {
                s.hide();
                newEl.classList.add('inactive-legend');
                isNowVisible = false;
            } else {
                s.show();
                newEl.classList.remove('inactive-legend');
                isNowVisible = true;
            }

            if (relatedSeries && axis) {
                const anyVisible = relatedSeries.some(rs => {
                    if (rs === s) return isNowVisible;
                    return rs.get("visible") !== false;
                });

                if (anyVisible) {
                    axis.show();
                    axis.set("visible", true);
                    if (label) {
                        label.show();
                        label.set("visible", true);
                    }
                    const r = axis.get("renderer");
                    if (r && r.gridContainer) r.gridContainer.set("visible", true);
                    if (r && r.labelsContainer) r.labelsContainer.set("visible", true);
                } else {
                    axis.hide();
                    axis.set("visible", false);
                    if (label) {
                        label.hide();
                        label.set("visible", false);
                    }
                    const r = axis.get("renderer");
                    if (r && r.gridContainer) r.gridContainer.set("visible", false);
                    if (r && r.labelsContainer) r.labelsContainer.set("visible", false);
                }
            }
        });
    };

    const tempSeries = [s1, s2, s3];
    const rhSeries = [s4, s5, s6];

    toggle('legend-stat-avg-temp', s1, tempSeries, yAxisTemp, lblTemp);
    toggle('legend-stat-max-temp', s2, tempSeries, yAxisTemp, lblTemp);
    toggle('legend-stat-min-temp', s3, tempSeries, yAxisTemp, lblTemp);

    toggle('legend-stat-avg-rh', s4, rhSeries, yAxisRH, lblRH);
    toggle('legend-stat-max-rh', s5, rhSeries, yAxisRH, lblRH);
    toggle('legend-stat-min-rh', s6, rhSeries, yAxisRH, lblRH);

    const cursor = chart.set("cursor", am5xy.XYCursor.new(statRoot, {
        xAxis: xAxis,
        behavior: "zoomX"
    }));
    cursor.lineY.set("visible", false);

    xAxis.set("tooltip", am5.Tooltip.new(statRoot, { themeTags: ["axis"] }));
    xAxis.get("tooltip").set("visible", false);

    xAxis.data.setAll(chartData);

    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisTemp, yAxisRH], [lblTemp, lblRH]);
    });

    const optionSelect = document.getElementById('select-stat-option');
    if (optionSelect) optionSelect.dispatchEvent(new Event('change'));

}

window.captureATRHStatistik = function () {
    const target = document.getElementById("atrhStatistikCardArea");
    if (!target) return;
    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: html2canvas tidak ditemukan', 'Statistik');
        return;
    }
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const bg = theme === 'dark' ? '#1e293b' : '#ffffff';

    html2canvas(target, {
        useCORS: true,
        scale: 2,
        backgroundColor: bg
    }).then(canvas => {
        const link = document.createElement("a");
        const sid = typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : 'Data';
        link.download = `ATRH_Statistik_${sid}_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

// Export PDF Statistik
document.getElementById('btn-export-pdf-stat')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#atrh-statistik-table-body tr')];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(14);
    doc.text(`ATRH Statistik Data (10 Menit) – ${SENSOR_ID || 'All Sensors'}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exported at: ${new Date().toLocaleString('id-ID')}`, 14, 22);

    const tableData = rows.map(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        return cells;
    });

    doc.autoTable({
        startY: 27,
        head: [['Datetime', 'Sensor ID', 'Min Temp', 'Max Temp', 'Avg Temp', 'Min RH', 'Max RH', 'Avg RH', 'TH1', 'TH2']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 }
    });

    doc.save(`atrh_statistik_${SENSOR_ID || 'all'}.pdf`);
});

document.getElementById('btn-export-csv-stat')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#atrh-statistik-table-body tr')];
    const csv = ['Datetime,Sensor ID,Min Temp (°C),Max Temp (°C),Avg Temp (°C),Min RH (%),Max RH (%),Avg RH (%),TH1,TH2'];
    rows.forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        csv.push(cells.join(','));
    });
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atrh_statistik_${SENSOR_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
});
