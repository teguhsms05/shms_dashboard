// ===============================
// Anemometer 2D Page - Real-Time Chart + Data Table
// ===============================
const _sid = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const ANM2D_API = `/api/anm2d/latest?dummy=1${_sid}`;
const ANM2D_HISTORY_API = `/api/anm2d/history?dummy=1${_sid}`;
const ANM2D_STATISTIK_API = `/api/anm2d/statistik?dummy=1${_sid}`;
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

            if (target === 'statistik') {
                // Keep chart empty until search is performed as per user request
                /*
                if (window.loadAnm2DStatistik) {
                    window.loadAnm2DStatistik(10);
                } else {
                    console.warn("Statistik loader not ready yet");
                }
                */
            }
        });
    });

    // --- Search Statistic Init ---
    initStatistikSearch();
});

// ===============================
// Statistik Search Control
// ===============================
async function initStatistikSearch() {
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

    // Link Calendar Buttons
    document.getElementById('btn-stat-start-cal')?.addEventListener('click', () => fpStart.open());
    document.getElementById('btn-stat-end-cal')?.addEventListener('click', () => fpEnd.open());

    // Load Years
    try {
        const res = await fetch('/api/weekly_periods/years');
        const years = await res.json();
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        });
    } catch (e) { console.error("Load years error:", e); }

    // Year -> Month cascade
    yearSelect.addEventListener('change', async () => {
        monthSelect.innerHTML = '<option value="">Pilih Bulan</option>';
        weekSelect.innerHTML = '<option value="">Pilih Minggu</option>';
        startInput.value = '';
        endInput.value = '';
        if (!yearSelect.value) return;

        try {
            const res = await fetch(`/api/weekly_periods/months?year=${yearSelect.value}`);
            const months = await res.json();

            // Sort months chronologically (Indonesian)
            const monthOrder = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

            months.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m; // Month label
                monthSelect.appendChild(opt);
            });
        } catch (e) { console.error("Load months error:", e); }
    });

    // Month -> Week cascade
    monthSelect.addEventListener('change', async () => {
        weekSelect.innerHTML = '<option value="">Pilih Minggu</option>';
        startInput.value = '';
        endInput.value = '';
        if (!monthSelect.value) return;

        try {
            const res = await fetch(`/api/weekly_periods/weeks?year=${yearSelect.value}&month=${monthSelect.value}`);
            const weeks = await res.json();
            window._statWeeks = weeks; // Store for range mapping
            weeks.forEach(w => {
                const opt = document.createElement('option');
                opt.value = w.periode_label;
                opt.textContent = w.periode_label;
                weekSelect.appendChild(opt);
            });
        } catch (e) { console.error("Load weeks error:", e); }
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

    // Execute Search
    searchBtn.addEventListener('click', () => {
        const start = startInput.value;
        const end = endInput.value;
        if (!start || !end) {
            if (window.SHMToast) window.SHMToast.warning("Silakan pilih periode mingguan terlebih dahulu", "Search");
            return;
        }
        if (window.loadStatistikByRange) {
            window.loadStatistikByRange(start, end);
        } else {
            if (window.SHMToast) window.SHMToast.danger("Chart Statistik belum siap", "Search");
        }
    });
}

// ===============================
// amCharts 5 - Anemometer 2D Real-Time Chart
// ===============================
am5.ready(function () {

    const root = am5.Root.new("anm2d-chart");
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

    const chart = root.container.children.push(
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
    const xAxis = SHMChart.createDateXAxis(chart, root, C);

    // ===============================
    // Y Axis - Wind Speed (m/s) (Left)
    // ===============================
    const yAxisSpeed = SHMChart.createValueYAxis(chart, root, C, { min: 0 });
    const lblSpeed = SHMChart.addYLabel(yAxisSpeed, root, 'Wind Speed (m/s)', C);
    yAxisSpeed.get('renderer').grid.template.set('visible', false);

    const isDark = C.isDark;
    const textColor = C.text;

    // ===============================
    // Y Axis - Direction (Right)
    // ===============================
    const yAxisDirection = SHMChart.createValueYAxis(chart, root, C, { opposite: true, min: 0, max: 360, extraMax: 0.1 });
    const lblDirection = SHMChart.addYLabel(yAxisDirection, root, 'Direction (°)', C, true);
    yAxisDirection.get('renderer').grid.template.set('visible', false);

    // ===============================
    // Threshold Lines
    // ===============================
    // Red threshold at 25 m/s
    const range50DataItem = yAxisSpeed.makeDataItem({ value: 25 });
    const range50 = yAxisSpeed.axisRanges.push(range50DataItem);
    range50.get("grid").setAll({
        stroke: am5.color(0xff0000),
        strokeOpacity: 0.6,
        strokeWidth: 2,
        strokeDasharray: [6, 4]
    });
    range50.get("label").setAll({
        text: "25 m/s",
        fill: am5.color(0xff0000),
        fontWeight: "bold",
        location: 0,
        inside: true,
        centerX: 0,
        centerY: am5.p100,
        paddingLeft: 10
    });

    // Yellow threshold at 15 m/s
    const range35DataItem = yAxisSpeed.makeDataItem({ value: 15 });
    const range35 = yAxisSpeed.axisRanges.push(range35DataItem);
    range35.get("grid").setAll({
        stroke: am5.color(0xf59e0b),
        strokeOpacity: 0.6,
        strokeWidth: 2,
        strokeDasharray: [6, 4]
    });
    range35.get("label").setAll({
        text: "15 m/s",
        fill: am5.color(0xf59e0b),
        fontWeight: "bold",
        location: 0,
        inside: true,
        centerX: 0,
        centerY: am5.p100,
        paddingLeft: 10
    });

    // ===============================
    // Series - Wind Speed
    // ===============================
    const speedSeries = chart.series.push(
        am5xy.LineSeries.new(root, {
            name: "Wind Speed",
            xAxis: xAxis,
            yAxis: yAxisSpeed,
            valueYField: "wind_speed",
            valueXField: "time",
            stroke: am5.color(0x3b82f6)
        })
    );
    speedSeries.strokes.template.setAll({ strokeWidth: 2 });

    // ===============================
    // Series - Wind Direction
    // ===============================
    const directionSeries = chart.series.push(
        am5xy.LineSeries.new(root, {
            name: "Wind Direction",
            xAxis: xAxis,
            yAxis: yAxisDirection,
            valueYField: "wind_direction",
            valueXField: "time",
            stroke: am5.color(0xf59e0b)
        })
    );
    directionSeries.strokes.template.setAll({ strokeWidth: 2 });

    // ===============================
    // Shared Tooltip Series
    // ===============================
    const tooltipSeries = chart.series.push(
        am5xy.LineSeries.new(root, {
            name: "Tooltip Series",
            xAxis: xAxis,
            yAxis: yAxisSpeed,
            valueYField: "wind_speed",
            valueXField: "time",
            opacity: 0,
            tooltip: am5.Tooltip.new(root, {
                labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n[bold]Speed:[/] {wind_speed}m/s\n[bold]Direction:[/] {wind_direction}°",
                pointerOrientation: "horizontal"
            })
        })
    );
    tooltipSeries.strokes.template.set("visible", false);
    tooltipSeries.fills.template.set("visible", false);
    SHMChart.applyTooltipBg(tooltipSeries);

    const cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
        xAxis: xAxis,
        behavior: "zoomX",
        snapToSeries: [tooltipSeries]
    }));
    cursor.lineY.set("visible", false);

    // Hide X-axis tooltip to avoid overlapping with stacked tooltips
    xAxis.get("tooltip").set("visible", false);



    // ===============================
    // Hollow - Static dot on every point
    // ===============================
    speedSeries.bullets.push(function (root, series, dataItem) {
        const container = am5.Container.new(root, {});
        const color = series.get("stroke");

        // Hollow Dot for ALL points
        container.children.push(am5.Circle.new(root, {
            radius: 4,
            fill: root.interfaceColors.get("background"),
            stroke: color,
            strokeWidth: 2
        }));

        return am5.Bullet.new(root, { sprite: container });
    });
    directionSeries.bullets.push(function (root, series, dataItem) {
        const container = am5.Container.new(root, {});
        const color = series.get("stroke");

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
    const speedPulseSeries = SHMChart.createPulseSeries(chart, root, xAxis, yAxisSpeed, 'wind_speed', 0x3b82f6);
    const directionPulseSeries = SHMChart.createPulseSeries(chart, root, xAxis, yAxisDirection, 'wind_direction', 0xf59e0b);

    // ===============================
    // Initial Data + Streaming
    // ===============================
    let chartData = [];

    // === Sensor Watchdog ===
    // Toast muncul jika tidak ada data dalam 120 detik (2x interval publisher)
    const anm2dWatcher = window.SHMToast
        ? window.SHMToast.watchSensor({ sensorName: `Anemometer ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim(), timeoutMs: 120000 })
        : null;

    async function loadChartHistory() {
        try {
            const res = await fetch(ANM2D_HISTORY_API + "&limit=10");
            const rows = await res.json();
            if (!rows || rows.length === 0) return;
            console.log(rows)

            rows.reverse();
            rows.forEach(r => {
                chartData.push({
                    time: new Date(r.time).getTime(),
                    wind_speed: r.wind_speed,
                    wind_direction: r.wind_direction
                });
            });

            speedSeries.data.setAll(chartData);
            directionSeries.data.setAll(chartData);
            tooltipSeries.data.setAll(chartData);
            const latest = chartData[chartData.length - 1];
            speedPulseSeries.data.setAll([latest]);
            directionPulseSeries.data.setAll([latest]);

            const lastRow = rows[rows.length - 1];
            document.getElementById('summary-wind-speed').textContent = lastRow.wind_speed?.toFixed(1) || '--';
            document.getElementById('summary-wind-direction').textContent = lastRow.wind_direction?.toFixed(1) || '--';

        } catch (e) {
            console.warn("History load error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal memuat data riwayat Anemometer", "Anemometer");
        }
    }

    function startStreaming() {
        socket.on('anm2d_update', (d) => {
            if (!isStreaming) return;
            if (!d.time) return;

            // Filter by SENSOR_ID if it exists
            if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID && d.sensor_id !== SENSOR_ID) {
                return;
            }

            const point = {
                time: new Date(d.time).getTime(),
                wind_speed: d.wind_speed,
                wind_direction: d.wind_direction
            };

            // Reset watchdog — data baru diterima
            if (anm2dWatcher) anm2dWatcher.update();

            if (chartData.length > 0 && point.time === chartData[chartData.length - 1].time) return;

            chartData.push(point);
            if (chartData.length > MAX_CHART_POINTS) {
                chartData.shift();
                speedSeries.data.removeIndex(0);
                directionSeries.data.removeIndex(0);
            }

            speedSeries.data.push(point);
            directionSeries.data.push(point);
            tooltipSeries.data.push(point);

            // Simply update the Pulse Series with the single newest point
            speedPulseSeries.data.setAll([point]);
            directionPulseSeries.data.setAll([point]);

            document.getElementById('summary-wind-speed').textContent = d.wind_speed?.toFixed(1) || '--';
            document.getElementById('summary-wind-direction').textContent = d.wind_direction?.toFixed(1) || '--';
            loadDataTable(10);
        });
    }

    // Sequence: Load 100 historial points first, then start 1s interval
    loadChartHistory().then(() => {
        startStreaming();
    });

    // ===============================
    // Stop/Start Toggle
    // ===============================
    const toggleBtn = document.getElementById('btn-toggle-stream');
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
            isStreaming = !isStreaming;
        });
    }

    // ===============================
    // Theme change — re-apply axis colors
    // ===============================
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisSpeed, yAxisDirection], [lblSpeed, lblDirection]);
    });

    // ===============================
    // Data Table
    // ===============================
    async function loadDataTable(limit = 10) {
        try {
            const res = await fetch(ANM2D_HISTORY_API + "&limit=" + limit);
            const rows = await res.json();
            const tbody = document.getElementById('anm2d-table-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            rows.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(r.time).toLocaleString('id-ID')}</td>
                    <td>${r.wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.wind_direction?.toFixed(1) ?? '--'}</td>
                    <td>${r.sensor_id || '--'}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.warn("History fetch error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal mengambil data Anemometer", "Anemometer");
        }
    }

    // Initial table load (10 rows as requested)
    loadDataTable(10);

    // ===============================
    // Interactive Legend Toggle
    // ===============================
    function updateTooltipText() {
        let labelData = ["[bold]{valueX.formatDate('dd MMM yyyy HH:mm:ss')}[/]"];
        const tActive = !document.getElementById('legend-speed').classList.contains('inactive');
        const rActive = !document.getElementById('legend-direction').classList.contains('inactive');

        if (tActive) labelData.push("[bold]Wind Speed:[/] {wind_speed}m/s");
        if (rActive) labelData.push("[bold]Direction:[/] {wind_direction}°");

        tooltipSeries.get("tooltip").set("labelText", labelData.join("\n"));

        if (labelData.length <= 1) {
            tooltipSeries.hide();
        } else {
            tooltipSeries.show();
        }
    }

    SHMChart.setupLegendToggle('legend-speed', speedSeries, speedPulseSeries, yAxisSpeed, updateTooltipText);
    SHMChart.setupLegendToggle('legend-direction', directionSeries, directionPulseSeries, yAxisDirection, updateTooltipText);

    // ===============================
    // amCharts 5 - Anemometer 2D Statistik Chart
    // ===============================
    const statRoot = am5.Root.new("anm2d-statistik-chart");
    statRoot.setThemes([am5themes_Animated.new(statRoot)]);

    const statChart = SHMChart.createXYChart(statRoot);
    SHMChart.applyZoomButton(statChart, statRoot);

    const statXAxis = SHMChart.createDateXAxis(statChart, statRoot, C, { timeUnit: "minute", count: 10 });
    const statYAxisSpeed = SHMChart.createValueYAxis(statChart, statRoot, C, { min: 0, max: 25 * 1.1 });
    const lblStatSpeed = SHMChart.addYLabel(statYAxisSpeed, statRoot, 'Avg Wind Speed (m/s)', C);

    const statYAxisDir = SHMChart.createValueYAxis(statChart, statRoot, C, { opposite: true, min: 0, max: 360 });
    const lblStatDir = SHMChart.addYLabel(statYAxisDir, statRoot, 'Avg Direction (°)', C, true);

    // --- WS Series ---
    function createStatSeries(name, field, axis, color, visible = true) {
        const s = statChart.series.push(am5xy.LineSeries.new(statRoot, {
            name: name,
            xAxis: statXAxis,
            yAxis: axis,
            valueYField: field,
            valueXField: "time",
            stroke: am5.color(color),
            tooltip: am5.Tooltip.new(statRoot, {
                labelText: "[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name}: {valueY.formatNumber('#.#')} " + (field.includes('direction') ? '°' : 'm/s'),
                getFillFromSprite: false,
                pointerOrientation: "horizontal"
            })
        }));

        const bg = s.get("tooltip").get("background");
        if (bg) {
            bg.setAll({
                fill: am5.color(color),
                fillOpacity: 1,
                stroke: am5.color(color)
            });
        }

        s.bullets.push(function () {
            return am5.Bullet.new(statRoot, {
                sprite: am5.Circle.new(statRoot, {
                    radius: 4,
                    fill: statRoot.interfaceColors.get("background"),
                    stroke: color,
                    strokeWidth: 2
                })
            });
        });

        s.strokes.template.setAll({ strokeWidth: visible ? 2 : 1, opacity: visible ? 1 : 0.5 });
        if (!visible) s.hide();
        return s;
    }

    // Units are added via the series name to show in tooltip labelText {name}
    const statAvgSpeedSeries = createStatSeries("Avg Wind Speed", "avg_wind_speed", statYAxisSpeed, 0x3b82f6);
    const statMaxSpeedSeries = createStatSeries("Max Wind Speed", "max_wind_speed", statYAxisSpeed, 0xef4444, false);
    const statMinSpeedSeries = createStatSeries("Min Wind Speed", "min_wind_speed", statYAxisSpeed, 0x10b981, false);

    const statAvgDirSeries = createStatSeries("Avg Wind Direction", "avg_wind_direction", statYAxisDir, 0xf59e0b);
    const statMaxDirSeries = createStatSeries("Max Wind Direction", "max_wind_direction", statYAxisDir, 0x10b981, false);
    const statMinDirSeries = createStatSeries("Min Wind Direction", "min_wind_direction", statYAxisDir, 0xec4899, false);

    const statCursor = statChart.set("cursor", am5xy.XYCursor.new(statRoot, {
        xAxis: statXAxis,
        behavior: "zoomX"
    }));
    statCursor.lineY.set("visible", false);

    // Hide X-axis tooltip to avoid overlapping with stacked tooltips
    statXAxis.get("tooltip").set("visible", false);

    SHMChart.setupLegendToggle('legend-stat-avg-speed', statAvgSpeedSeries, null, statYAxisSpeed);
    SHMChart.setupLegendToggle('legend-stat-max-speed', statMaxSpeedSeries, null, statYAxisSpeed);
    SHMChart.setupLegendToggle('legend-stat-min-speed', statMinSpeedSeries, null, statYAxisSpeed);

    SHMChart.setupLegendToggle('legend-stat-avg-dir', statAvgDirSeries, null, statYAxisDir);
    SHMChart.setupLegendToggle('legend-stat-max-dir', statMaxDirSeries, null, statYAxisDir);
    SHMChart.setupLegendToggle('legend-stat-min-dir', statMinDirSeries, null, statYAxisDir);

    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([statXAxis, statYAxisSpeed, statYAxisDir], [lblStatSpeed, lblStatDir]);
    });

    // Option Toggle
    const optionSelect = document.getElementById('select-stat-option');
    if (optionSelect) {
        optionSelect.addEventListener('change', () => {
            const val = optionSelect.value;
            if (val === 'ws') {
                statAvgSpeedSeries.show(); statMaxSpeedSeries.show(); statMinSpeedSeries.show();
                statAvgDirSeries.hide(); statMaxDirSeries.hide(); statMinDirSeries.hide();
                statYAxisSpeed.show(); statYAxisDir.hide();
            } else if (val === 'wd') {
                statAvgSpeedSeries.hide(); statMaxSpeedSeries.hide(); statMinSpeedSeries.hide();
                statAvgDirSeries.show(); statMaxDirSeries.show(); statMinDirSeries.show();
                statYAxisSpeed.hide(); statYAxisDir.show();
            } else {
                statAvgSpeedSeries.show(); statMaxSpeedSeries.show(); statMinSpeedSeries.show();
                statAvgDirSeries.show(); statMaxDirSeries.show(); statMinDirSeries.show();
                statYAxisSpeed.show(); statYAxisDir.show();
            }
        });
    }

    // ===============================
    // Export CSV
    // ===============================
    const csvBtn = document.getElementById('btn-export-csv');
    if (csvBtn) {
        csvBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(ANM2D_HISTORY_API + "&limit=500");
                const rows = await res.json();

                let csv = "Datetime,Wind Speed (m/s),Wind Direction (°),Sensor ID\n";
                rows.forEach(r => {
                    csv += `${r.time},${r.wind_speed},${r.wind_direction},${r.sensor_id}\n`;
                });

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `anm2d_data_${SENSOR_ID || 'all'}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("CSV export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export CSV Anemometer", "Export");
            }
        });
    }

    // ===============================
    // Load Statistik Table
    // ===============================
    async function loadStatistikTable(limit = 10) {
        try {
            const res = await fetch(ANM2D_STATISTIK_API + "&limit=" + limit);
            const rows = await res.json();
            const tbody = document.getElementById('anm2d-statistik-table-body');
            const legendCont = document.getElementById('anm2d-statistik-legend');
            const summaryCont = document.getElementById('anm2d-statistik-summary');
            if (!tbody) return;

            if (rows.length === 0) {
                if (legendCont) legendCont.style.display = 'none';
                if (summaryCont) summaryCont.style.display = 'none';
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">Tidak ada data ditemukan</td></tr>';
                return;
            }

            if (legendCont) legendCont.style.display = 'flex';
            if (summaryCont) summaryCont.style.display = 'flex';

            tbody.innerHTML = '';
            let chartDataStats = [];
            rows.forEach((r, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(r.time).toLocaleString('id-ID')}</td>
                    <td>${r.sensor_id || '--'}</td>
                    <td>${r.min_wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.max_wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.avg_wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.min_wind_direction?.toFixed(1) ?? '--'}</td>
                    <td>${r.max_wind_direction?.toFixed(1) ?? '--'}</td>
                    <td>${r.avg_wind_direction?.toFixed(1) ?? '--'}</td>
                `;
                tbody.appendChild(tr);

                chartDataStats.push({
                    time: new Date(r.time).getTime(),
                    avg_wind_speed: r.avg_wind_speed,
                    max_wind_speed: r.max_wind_speed,
                    min_wind_speed: r.min_wind_speed,
                    avg_wind_direction: r.avg_wind_direction,
                    max_wind_direction: r.max_wind_direction,
                    min_wind_direction: r.min_wind_direction
                });

                if (idx === 0) {
                    document.getElementById('stat-summary-avg-speed').textContent = r.avg_wind_speed?.toFixed(1) || '--';
                    document.getElementById('stat-summary-max-speed').textContent = r.max_wind_speed?.toFixed(1) || '--';
                    document.getElementById('stat-summary-min-speed').textContent = r.min_wind_speed?.toFixed(1) || '--';

                    document.getElementById('stat-summary-avg-direction').textContent = r.avg_wind_direction?.toFixed(1) || '--';
                    document.getElementById('stat-summary-max-direction').textContent = r.max_wind_direction?.toFixed(1) || '--';
                    document.getElementById('stat-summary-min-direction').textContent = r.min_wind_direction?.toFixed(1) || '--';
                }
            });

            // Update chart - display in chronological order
            chartDataStats.reverse();
            statAvgSpeedSeries.data.setAll(chartDataStats);
            statMaxSpeedSeries.data.setAll(chartDataStats);
            statMinSpeedSeries.data.setAll(chartDataStats);
            statAvgDirSeries.data.setAll(chartDataStats);
            statMaxDirSeries.data.setAll(chartDataStats);
            statMinDirSeries.data.setAll(chartDataStats);

            if (optionSelect) optionSelect.dispatchEvent(new Event('change'));

        } catch (e) {
            console.warn("Statistik fetch error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal mengambil data Statistik", "Anemometer");
        }
    }

    async function loadStatistikByRange(start, end) {
        try {
            if (window.SHMToast) window.SHMToast.info(`Mencari data ${start} s/d ${end}...`, "Search");
            const res = await fetch(`/api/anm2d/statistik/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${_sid}`);
            const rows = await res.json();
            const tbody = document.getElementById('anm2d-statistik-table-body');
            const legendCont = document.getElementById('anm2d-statistik-legend');
            const summaryCont = document.getElementById('anm2d-statistik-summary');
            if (!tbody) return;

            tbody.innerHTML = '';
            if (rows.length === 0) {
                if (legendCont) legendCont.style.display = 'none';
                if (summaryCont) summaryCont.style.display = 'none';
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">Tidak ada data ditemukan</td></tr>';
                statAvgSpeedSeries.data.setAll([]);
                statMaxSpeedSeries.data.setAll([]);
                statMinSpeedSeries.data.setAll([]);
                statAvgDirSeries.data.setAll([]);
                statMaxDirSeries.data.setAll([]);
                statMinDirSeries.data.setAll([]);
                return;
            }

            if (legendCont) legendCont.style.display = 'flex';
            if (summaryCont) summaryCont.style.display = 'flex';

            let chartDataStats = [];
            rows.forEach((r, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(r.time).toLocaleString('id-ID')}</td>
                    <td>${r.sensor_id || '--'}</td>
                    <td>${r.min_wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.max_wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.avg_wind_speed?.toFixed(1) ?? '--'}</td>
                    <td>${r.min_wind_direction?.toFixed(1) ?? '--'}</td>
                    <td>${r.max_wind_direction?.toFixed(1) ?? '--'}</td>
                    <td>${r.avg_wind_direction?.toFixed(1) ?? '--'}</td>
                `;
                tbody.appendChild(tr);

                chartDataStats.push({
                    time: new Date(r.time).getTime(),
                    avg_wind_speed: r.avg_wind_speed,
                    max_wind_speed: r.max_wind_speed,
                    min_wind_speed: r.min_wind_speed,
                    avg_wind_direction: r.avg_wind_direction,
                    max_wind_direction: r.max_wind_direction,
                    min_wind_direction: r.min_wind_direction
                });

                if (idx === 0) {
                    document.getElementById('stat-summary-avg-speed').textContent = r.avg_wind_speed?.toFixed(1) || '--';
                    document.getElementById('stat-summary-max-speed').textContent = r.max_wind_speed?.toFixed(1) || '--';
                    document.getElementById('stat-summary-min-speed').textContent = r.min_wind_speed?.toFixed(1) || '--';

                    document.getElementById('stat-summary-avg-direction').textContent = r.avg_wind_direction?.toFixed(1) || '--';
                    document.getElementById('stat-summary-max-direction').textContent = r.max_wind_direction?.toFixed(1) || '--';
                    document.getElementById('stat-summary-min-direction').textContent = r.min_wind_direction?.toFixed(1) || '--';
                }
            });

            // Update chart - search result usually chronological
            statAvgSpeedSeries.data.setAll(chartDataStats);
            statMaxSpeedSeries.data.setAll(chartDataStats);
            statMinSpeedSeries.data.setAll(chartDataStats);
            statAvgDirSeries.data.setAll(chartDataStats);
            statMaxDirSeries.data.setAll(chartDataStats);
            statMinDirSeries.data.setAll(chartDataStats);

            if (optionSelect) optionSelect.dispatchEvent(new Event('change'));

            if (window.SHMToast) window.SHMToast.success(`${rows.length} data ditemukan`, "Search");
        } catch (e) {
            console.error("Range Search Error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal mencari data statistik", "Search");
        }
    }

    // ===============================
    // Export Statistik CSV
    // ===============================
    const statCsvBtn = document.getElementById('btn-export-statistik-csv');
    if (statCsvBtn) {
        statCsvBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(ANM2D_STATISTIK_API + "&limit=500");
                const rows = await res.json();

                let csv = "Datetime,Sensor ID,Min Wind Speed,Max Wind Speed,Avg Wind Speed,Min Wind Direction,Max Wind Direction,Avg Wind Direction\n";
                rows.forEach(r => {
                    csv += `${r.time},${r.sensor_id},${r.min_wind_speed},${r.max_wind_speed},${r.avg_wind_speed},${r.min_wind_direction},${r.max_wind_direction},${r.avg_wind_direction}\n`;
                });

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `anm2d_statistik_${SENSOR_ID || 'all'}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("Statistik CSV export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export CSV Statistik", "Export");
            }
        });
    }

    // Expose to window for tab switcher and search button
    window.loadAnm2DStatistik = loadStatistikTable;
    window.loadStatistikByRange = loadStatistikByRange;

});

// ── Full Card Capture ──
window.captureAnm2D = function () {
    const target = document.getElementById("anm2dCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Anemometer 2D');
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
        link.download = `Anemometer_2D_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureAnm2D error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Anemometer 2D');
    });
};

// ── Statistik Card Capture ──
window.captureAnm2DStatistik = function () {
    const target = document.getElementById("anm2dStatistikCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Statistik 2D');
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
        link.download = `Anemometer_Statistik_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureAnm2DStatistik error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Statistik 2D');
    });
};
