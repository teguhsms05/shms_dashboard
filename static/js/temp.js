// ===============================
// TEMP Page - Real-Time Chart + Data Table
// ===============================
// SENSOR_ID is injected by the Flask template (temp.html)
const _sid = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const TEMP_API = `/api/temp/latest?dummy=1${_sid}`;
const TEMP_HISTORY_API = `/api/temp/history?dummy=1${_sid}`;
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
// amCharts 5 - TEMP Real-Time Chart
// ===============================
am5.ready(function () {

    var root = am5.Root.new("temp-chart");
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
    var yAxisTemp = SHMChart.createValueYAxis(chart, root, C, { strictMinMax: false, extraMin: 0.05 });
    const lblTemp = SHMChart.addYLabel(yAxisTemp, root, 'Temperature (°C)', C);

    // ===============================
    // Threshold Lines
    // ===============================
    SHMChart.addThreshold(yAxisTemp, root, 40, 0xef4444, "40°C");
    SHMChart.addThreshold(yAxisTemp, root, 35, 0xf59e0b, "35°C");


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
            stroke: am5.color(0x3b82f6),
            tooltip: am5.Tooltip.new(root, {
                labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\nTemp: {valueY}°C"
            })
        })
    );
    tempSeries.strokes.template.setAll({ strokeWidth: 2 });

    // ===============================
    // Cursor (snap to series — always shows values on hover)
    // ===============================
    var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
        xAxis: xAxis,
        behavior: "zoomX",
        snapToSeries: [tempSeries]
    }));
    cursor.lineY.set("visible", false);

    // Branded Tooltip
    SHMChart.applyTooltipBg(tempSeries);




    // ===============================
    // Hollow - Static dot on every point
    // ===============================
    tempSeries.bullets.push(function (root, series, dataItem) {
        var container = am5.Container.new(root, {});
        var color = series.get("stroke");

        // Hollow Dot for ALL points
        container.children.push(am5.Circle.new(root, {
            radius: 3.5,
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

    // ===============================
    // Persistent Label on Latest Point
    // ===============================
    var _latestTempText = "--°C";
    var _persistentLabelRef = null;

    var labelSeries = chart.series.push(am5xy.LineSeries.new(root, {
        xAxis: xAxis,
        yAxis: yAxisTemp,
        valueYField: "temperature",
        valueXField: "time"
    }));
    labelSeries.strokes.template.setAll({ strokeWidth: 0, strokeOpacity: 0 });

    labelSeries.bullets.push(function () {
        var lbl = am5.Label.new(root, {
            text: _latestTempText,
            fill: am5.color(0xffffff),
            fontSize: 11,
            fontWeight: "600",
            centerX: am5.p50,
            centerY: am5.p100,
            dy: -18,
            paddingTop: 3, paddingBottom: 3,
            paddingLeft: 8, paddingRight: 8,
            background: am5.RoundedRectangle.new(root, {
                fill: am5.color(0x3b82f6),
                fillOpacity: 0.92,
                cornerRadiusTL: 4, cornerRadiusTR: 4,
                cornerRadiusBL: 4, cornerRadiusBR: 4,
                strokeOpacity: 0
            })
        });
        _persistentLabelRef = lbl;
        return am5.Bullet.new(root, {
            locationY: 1,
            sprite: lbl
        });
    });

    function updateLatestTooltip(point) {
        if (!point || point.temperature == null) return;
        _latestTempText = point.temperature.toFixed(1) + "°C";
        labelSeries.data.setAll([{ time: point.time, temperature: point.temperature }]);
        // Also update directly if label already exists
        setTimeout(function() {
            if (_persistentLabelRef) {
                _persistentLabelRef.set("text", _latestTempText);
            }
        }, 50);
    }

    // ===============================
    // Initial Data + Streaming
    // ===============================
    var chartData = [];

    // === Sensor Watchdog ===
    const tempWatcher = window.SHMToast
        ? window.SHMToast.watchSensor({ sensorName: `Temperature ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim(), timeoutMs: 120000 })
        : null;

    async function loadChartHistory() {
        try {
            const res = await fetch(TEMP_HISTORY_API + "&limit=10");
            const rows = await res.json();
            if (!rows || rows.length === 0) return;

            rows.reverse();
            rows.forEach(r => {
                chartData.push({
                    time: new Date(r.time).getTime(),
                    temperature: r.temperature,
                });
            });

            tempSeries.data.setAll(chartData);

            // Update pulse series with latest point only
            const latest = chartData[chartData.length - 1];
            tempPulseSeries.data.setAll([latest]);
            updateLatestTooltip(latest);

            const lastRow = rows[rows.length - 1];
            const summaryEl = document.getElementById('summary-temp');
            if (summaryEl) summaryEl.textContent = lastRow.temperature?.toFixed(1) || '--';

        } catch (e) {
            console.warn("History load error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal memuat data riwayat Temperature", "Temperature");
        }
    }

    function startStreaming() {
        socket.on('temp_update', (d) => {
            if (!isStreaming) return;
            if (!d.time) return;

            // Filter by SENSOR_ID if it exists
            if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID && d.sensor_id !== SENSOR_ID) {
                return;
            }

            const point = {
                time: new Date(d.time).getTime(),
                temperature: d.temperature
            };

            // Reset watchdog — data relevan diterima
            if (tempWatcher) tempWatcher.update();

            if (chartData.length > 0 && point.time === chartData[chartData.length - 1].time) return;

            chartData.push(point);
            if (chartData.length > MAX_CHART_POINTS) {
                chartData.shift();
                tempSeries.data.removeIndex(0);
            }

            tempSeries.data.push(point);

            // Simply update the Pulse Series with the single newest point
            tempPulseSeries.data.setAll([point]);
            updateLatestTooltip(point);

            const summaryEl2 = document.getElementById('summary-temp');
            if (summaryEl2) summaryEl2.textContent = d.temperature?.toFixed(1) || '--';

            // Prepend new row directly — no extra HTTP request per tick
            prependTableRow({ time: d.time, temperature: d.temperature, sensor_id: d.sensor_id || '--' });
        });
    }

    // Sequence: Load 100 historial points first, then start 1s interval
    loadChartHistory().then(() => {
        startStreaming();
    });

    // ===============================
    // Stop/Start Toggle
    // ===============================
    var toggleBtn = document.getElementById('btn-toggle-stream');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            isStreaming = !isStreaming;
            if (isStreaming) {
                toggleBtn.textContent = 'Stop';
                toggleBtn.classList.remove('btn-start');
                toggleBtn.classList.add('btn-stop');
            } else {
                toggleBtn.textContent = 'Start';
                toggleBtn.classList.remove('btn-stop');
                toggleBtn.classList.add('btn-start');
            }
        });
    }

    // ===============================
    // Theme change — re-apply axis colors
    // ===============================
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisTemp], [lblTemp]);
    });

    // ===============================
    // Data Table Sorting
    // ===============================
    let realtimeTableData = [];
    let currentSortCol = 'time';
    let currentSortDesc = true;

    function renderRealtimeTable() {
        const tbody = document.getElementById('temp-table-body');
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
                <td>${r.temperature?.toFixed(1) ?? '--'}</td>
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
            const res = await fetch(TEMP_HISTORY_API + "&limit=" + limit);
            const rows = await res.json();

            realtimeTableData = rows;
            renderRealtimeTable();

        } catch (e) {
            console.warn("History fetch error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal mengambil data Temperature", "Temperature");
        }
    }

    // Initial table load (10 rows as requested)
    loadDataTable(10);

    // ===============================
    // Insert a single row to the data table (called from stream tick)
    // ===============================
    function prependTableRow(r) {
        // Add to array, then render
        // Since we resort anyway, push or unshift doesn't matter, but unshift is logically closer
        realtimeTableData.push(r);
        renderRealtimeTable();
    }

    // ===============================
    // Interactive Legend Toggle
    // ===============================
    SHMChart.setupLegendToggle('legend-temp', tempSeries, tempPulseSeries, yAxisTemp);

    // ===============================
    // Export CSV
    // ===============================
    var csvBtn = document.getElementById('btn-export-csv');
    if (csvBtn) {
        csvBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(TEMP_HISTORY_API + "&limit=500");
                const rows = await res.json();

                let csv = "Datetime,Temperature (\u00b0C),Sensor ID\n";
                rows.forEach(r => {
                    csv += `${r.time},${r.temperature},${r.sensor_id}\n`;
                });

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `temp_data_${SENSOR_ID || 'all'}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("CSV export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export CSV Temperature", "Export");
            }
        });
    }

    // ===============================
    // Export PDF (jsPDF + autotable)
    // ===============================
    var pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(TEMP_HISTORY_API + "&limit=500");
                const rows = await res.json();

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });

                const sensorLabel = SENSOR_ID ? SENSOR_ID.toUpperCase() : 'All Sensors';
                doc.setFontSize(14);
                doc.text(`Temperature Data – ${sensorLabel}`, 14, 15);
                doc.setFontSize(9);
                doc.setTextColor(120);
                doc.text(`Exported: ${new Date().toLocaleString('id-ID')}`, 14, 22);

                const body = rows.map(r => [
                    new Date(r.time).toLocaleString('id-ID'),
                    r.temperature?.toFixed(1) ?? '--',
                    r.sensor_id || '--'
                ]);

                doc.autoTable({
                    startY: 27,
                    head: [['Datetime', 'Temperature (\u00b0C)', 'Sensor ID']],
                    body: body,
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [59, 130, 246] }
                });

                doc.save(`temp_data_${SENSOR_ID || 'all'}.pdf`);
            } catch (e) {
                console.warn("PDF export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export PDF Temperature", "Export");
            }
        });
    }

});

// ── Full Card Capture ──
window.captureTemp = function () {
    const target = document.getElementById("tempCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Temperature');
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
        link.download = `Temperature_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureTemp error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Temperature');
    });
};

// ==========================================
// STATISTIK TAB LOGIC
// ==========================================
const STAT_API = `/api/temp/statistik/range`;

document.addEventListener('DOMContentLoaded', () => {
    // Only init if we are on a page that has the statistik tab
    if (document.getElementById('tab-statistik')) {
        initStatistikSearch();
    }
});

function initStatistikSearch() {
    if (window._statInitialized) return;
    window._statInitialized = true;

    const yearSelect = document.getElementById('stat-year');
    const monthSelect = document.getElementById('stat-month');
    const weekSelect = document.getElementById('stat-week');
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

    // Link Calendar Buttons
    document.getElementById('btn-stat-start-cal')?.addEventListener('click', () => fpStart.open());
    document.getElementById('btn-stat-end-cal')?.addEventListener('click', () => fpEnd.open());

    // Load Years
    fetch('/api/weekly_periods/years')
        .then(res => res.json())
        .then(years => {
            years.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = y;
                yearSelect.appendChild(opt);
            });
        });

    // Year -> Month cascade
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

    // Month -> Week cascade
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

    // Week selection -> Auto fill range
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
}

async function loadStatistikByRange(start, end) {
    try {
        if (window.SHMToast) window.SHMToast.info(`Mengambil data statistik dari ${start.split(' ')[0]} hingga ${end.split(' ')[0]}...`, "Loading");

        const sidParam = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
        const res = await fetch(`${STAT_API}?start=${start}&end=${end}${sidParam}`);
        const rows = await res.json();

        const legendCont = document.getElementById('temp-statistik-legend');
        const summaryCont = document.getElementById('temp-statistik-summary');

        if (!rows || rows.length === 0) {
            if (window.SHMToast) window.SHMToast.warning('Data statistik tidak ditemukan untuk periode ini', 'Statistik');

            if (legendCont) legendCont.style.display = 'none';
            if (summaryCont) summaryCont.style.display = 'none';

            // Clear summary
            document.getElementById('stat-summary-min-temp').textContent = '--';
            document.getElementById('stat-summary-max-temp').textContent = '--';
            document.getElementById('stat-summary-avg-temp').textContent = '--';

            // Clear chart & table
            if (statRoot) {
                statRoot.dispose();
                statRoot = null;
            }
            const tbody = document.getElementById('atrh-statistik-table-body') || document.getElementById('temp-statistik-table-body');
            if (tbody) tbody.innerHTML = '';
            
            return;
        }

        if (window.SHMToast) window.SHMToast.success("Data Statistik ditemukan untuk periode ini", "Statistik");

        if (legendCont) legendCont.style.display = 'flex';
        if (summaryCont) summaryCont.style.display = 'flex';

        // Calculate overarching Min/Max/Avg
        let gMin = null, gMax = null, sum = 0, count = 0;

        const chartData = rows.map(r => {
            const timeMs = new Date(r.time).getTime();

            if (r.min_temperature !== null) {
                if (gMin === null || r.min_temperature < gMin) gMin = r.min_temperature;
            }
            if (r.max_temperature !== null) {
                if (gMax === null || r.max_temperature > gMax) gMax = r.max_temperature;
            }
            if (r.avg_temperature !== null) {
                sum += r.avg_temperature;
                count++;
            }

            return {
                time: timeMs,
                min_temperature: r.min_temperature,
                max_temperature: r.max_temperature,
                avg_temperature: r.avg_temperature
            };
        });

        // Update Summary DOM
        document.getElementById('stat-summary-min-temp').textContent = gMin !== null ? gMin.toFixed(2) : '--';
        document.getElementById('stat-summary-max-temp').textContent = gMax !== null ? gMax.toFixed(2) : '--';
        document.getElementById('stat-summary-avg-temp').textContent = count > 0 ? (sum / count).toFixed(2) : '--';

        renderStatistikChart(chartData);
        populateStatistikTable(rows);


    } catch (e) {
        console.error("Error loading stat range:", e);
        if (window.SHMToast) window.SHMToast.danger('Koneksi terputus atau terjadi kesalahan.', 'Error');
    }
}

let statRoot = null;
function renderStatistikChart(data) {
    if (statRoot) {
        statRoot.dispose();
    }
    statRoot = am5.Root.new("temp-stat-chart");
    statRoot.setThemes([am5themes_Animated.new(statRoot)]);

    const chart = SHMChart.createXYChart(statRoot);
    const C = SHMChart.colors();
    const xAxis = SHMChart.createDateXAxis(chart, statRoot, C, { timeUnit: "minute", count: 10 });

    // Y Axis - Temperature (Left)
    const yAxisTemp = SHMChart.createValueYAxis(chart, statRoot, C);
    const lblTemp = SHMChart.addYLabel(yAxisTemp, statRoot, 'Temperature (°C)', C);

    const chartData = data.map(d => ({
        time: typeof d.time === 'number' ? d.time : new Date(d.time).getTime(),
        min_temperature: d.min_temperature,
        max_temperature: d.max_temperature,
        avg_temperature: d.avg_temperature,
    }));

    function addSeries(name, field, color) {
        const series = chart.series.push(am5xy.LineSeries.new(statRoot, {
            name: name,
            xAxis: xAxis,
            yAxis: yAxisTemp,
            valueYField: field,
            valueXField: "time",
            stroke: am5.color(color),
            tooltip: am5.Tooltip.new(statRoot, {
                labelText: "[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name}: {valueY.formatNumber('#.##')} °C",
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
        series.data.setAll(chartData);
        return series;
    }

    const s1 = addSeries("Avg Temperature", "avg_temperature", 0x10b981);
    const s2 = addSeries("Max Temperature", "max_temperature", 0xef4444);
    const s3 = addSeries("Min Temperature", "min_temperature", 0x3b82f6);

    // Legend Toggles
    const allSeries = [s1, s2, s3];
    const toggle = (id, s) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.replaceWith(el.cloneNode(true)); // remove old listeners
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

            // Check if any series is still visible
            const anyVisible = allSeries.some(rs => {
                if (rs === s) return isNowVisible;
                return rs.get("visible") !== false;
            });

            if (anyVisible) {
                yAxisTemp.show();
                if (lblTemp) lblTemp.show();
            } else {
                yAxisTemp.hide();
                if (lblTemp) lblTemp.hide();
            }
        });
    };

    toggle('legend-stat-avg-temp', s1);
    toggle('legend-stat-max-temp', s2);
    toggle('legend-stat-min-temp', s3);

    const cursor = chart.set("cursor", am5xy.XYCursor.new(statRoot, {
        xAxis: xAxis,
        behavior: "zoomX"
    }));
    cursor.lineY.set("visible", false);

    xAxis.set("tooltip", am5.Tooltip.new(statRoot, { themeTags: ["axis"] }));
    xAxis.get("tooltip").set("visible", false);

    xAxis.data.setAll(chartData);

    // Theme observer
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisTemp], [lblTemp]);
    });
}

function populateStatistikTable(rows) {
    const tbody = document.getElementById('temp-statistik-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(r.time).toLocaleString('id-ID')}</td>
            <td>${r.sensor_id || '--'}</td>
            <td>${r.min_temperature?.toFixed(2) ?? '--'}</td>
            <td>${r.max_temperature?.toFixed(2) ?? '--'}</td>
            <td>${r.avg_temperature?.toFixed(2) ?? '--'}</td>
        `;
        tbody.appendChild(tr);
    });

    // PDF Export for Stat
    const btnPdfStat = document.getElementById('btn-export-stat-pdf');
    if (btnPdfStat) {
        btnPdfStat.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });

            doc.setFontSize(14);
            doc.text(`Temperature Statistik Data (10 Menit) – ${SENSOR_ID || 'All Sensors'}`, 14, 15);
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Exported at: ${new Date().toLocaleString('id-ID')}`, 14, 22);

            const tableData = rows.map(r => [
                new Date(r.time).toLocaleString('id-ID'),
                r.sensor_id || '--',
                r.min_temperature?.toFixed(2) ?? '--',
                r.max_temperature?.toFixed(2) ?? '--',
                r.avg_temperature?.toFixed(2) ?? '--'
            ]);

            doc.autoTable({
                startY: 27,
                head: [['Datetime', 'Sensor ID', 'Min Temp', 'Max Temp', 'Avg Temp']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246] },
                styles: { fontSize: 8 }
            });

            doc.save(`temp_statistik_${SENSOR_ID || 'all'}.pdf`);
        });
    }

    // CSV Export hook update for Stat
    const btnCsv = document.getElementById('btn-export-stat-csv');
    if (btnCsv) {
        // Remove old listener by replacing clone
        const newBtn = btnCsv.cloneNode(true);
        btnCsv.parentNode.replaceChild(newBtn, btnCsv);
        newBtn.addEventListener('click', () => {
            let csv = "Waktu,Sensor ID,Min Temp,Max Temp,Avg Temp\n";
            rows.forEach(r => {
                csv += `${r.time},${r.sensor_id || ''},${r.min_temperature || ''},${r.max_temperature || ''},${r.avg_temperature || ''}\n`;
            });
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Statistik_Temp_${(typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? SENSOR_ID : 'all'}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}

// ── Full Card Capture (Statistik) ──
window.captureTempStatistik = function () {
    const target = document.getElementById("tempStatCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Statistik');
        return;
    }

    html2canvas(target, {
        useCORS: true,
        scale: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || "#ffffff"
    }).then(canvas => {
        const link = document.createElement("a");
        const dateStr = new Date().toISOString().split('T')[0];
        const sid = typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : 'Data';
        link.download = `Statistik_Temperature_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureTempStatistik error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Statistik');
    });
};
