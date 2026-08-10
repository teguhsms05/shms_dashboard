// ===============================
// TILTMETER Page - Real-Time Chart + Data Table
// ===============================
// SENSOR_ID is injected by the Flask template (tiltmeter.html)
const _sid = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const TILT_API = `/api/tiltmeter/latest?dummy=1${_sid}`;
const TILT_HISTORY_API = `/api/tiltmeter/history?dummy=1${_sid}`;
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
// amCharts 5 - Tilt Angle (X & Y) Chart
// ===============================
am5.ready(function () {

    const rootXy = am5.Root.new("tilt-angle-chart");
    rootXy.setThemes([
        am5themes_Animated.new(rootXy)
    ]);

    const chartXy = rootXy.container.children.push(
        am5xy.XYChart.new(rootXy, {
            panX: false,
            panY: false,
            wheelX: "panX",
            wheelY: "zoomX",
            pinchZoomX: true
        })
    );

    SHMChart.applyZoomButton(chartXy, rootXy);

    const C = SHMChart.colors();
    const xAxisXy = SHMChart.createDateXAxis(chartXy, rootXy, C, { timeUnit: 'minute', count: 1 });

    // Left Y Axis
    const yAxisXy = SHMChart.createValueYAxis(chartXy, rootXy, C, { strictMinMax: false, extraMin: 0.2 });
    const lblXy = SHMChart.addYLabel(yAxisXy, rootXy, 'Angle (°)', C);

    const seriesX = chartXy.series.push(
        am5xy.LineSeries.new(rootXy, {
            name: "Angle X",
            xAxis: xAxisXy,
            yAxis: yAxisXy,
            valueYField: "angleX",
            valueXField: "time",
            stroke: am5.color(0x3b82f6)
        })
    );
    seriesX.strokes.template.setAll({ strokeWidth: 2 });

    const seriesY = chartXy.series.push(
        am5xy.LineSeries.new(rootXy, {
            name: "Angle Y",
            xAxis: xAxisXy,
            yAxis: yAxisXy,
            valueYField: "angleY",
            valueXField: "time",
            stroke: am5.color(0x10b981) // Green
        })
    );
    seriesY.strokes.template.setAll({ strokeWidth: 2 });

    // ===============================
    // Invisible Series for Shared Tooltip
    // ===============================
    var tooltipSeries = chartXy.series.push(am5xy.LineSeries.new(rootXy, {
        name: "Tooltip Series",
        xAxis: xAxisXy,
        yAxis: yAxisXy,
        valueYField: "angleX",
        valueXField: "time",
        opacity: 0,
        tooltip: am5.Tooltip.new(rootXy, {
            labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n[bold]Angle X:[/] {angleX}°\n[bold]Angle Y:[/] {angleY}°",
            pointerOrientation: "horizontal"
        })
    }));
    tooltipSeries.strokes.template.set("visible", false);
    tooltipSeries.fills.template.set("visible", false);
    SHMChart.applyTooltipBg(tooltipSeries);

    // Cursors & Snap
    const cursorXy = chartXy.set("cursor", am5xy.XYCursor.new(rootXy, {
        xAxis: xAxisXy,
        behavior: "zoomX",
        snapToSeries: [tooltipSeries]
    }));
    cursorXy.lineY.set("visible", false);

    // ===============================
    // Threshold Lines for Tiltmeter Angle
    // ===============================
    // Red threshold at 0.3 Degrees (Warning levels)
    var range03DataItem = yAxisXy.makeDataItem({ value: 0.3 });
    var range03 = yAxisXy.axisRanges.push(range03DataItem);
    range03.get("grid").setAll({
        stroke: am5.color(0xff0000),
        strokeOpacity: 0.6,
        strokeWidth: 2,
        strokeDasharray: [6, 4]
    });
    range03.get("label").setAll({
        text: "0.3°",
        fill: am5.color(0xff0000),
        fontWeight: "bold",
        location: 0,
        inside: true,
        centerX: 0,
        centerY: am5.p100,
        paddingLeft: 10
    });

    // Yellow threshold at 0.15 Degrees (Caution levels)
    var range015DataItem = yAxisXy.makeDataItem({ value: 0.15 });
    var range015 = yAxisXy.axisRanges.push(range015DataItem);
    range015.get("grid").setAll({
        stroke: am5.color(0xf59e0b),
        strokeOpacity: 0.6,
        strokeWidth: 2,
        strokeDasharray: [6, 4]
    });
    range015.get("label").setAll({
        text: "0.15°",
        fill: am5.color(0xf59e0b),
        fontWeight: "bold",
        location: 0,
        inside: true,
        centerX: 0,
        centerY: am5.p100,
        paddingLeft: 10
    });

    async function applyThresholds(seriesX, seriesY) {
        if (typeof SENSOR_ID === 'undefined' || !SENSOR_ID) return;
        try {
            const res = await fetch(`/api/sensor-thresholds/?sensor_id=${SENSOR_ID}`);
            const th = await res.json();
            if (!th || th.error) return;

            // Remove existing static ranges (if any)
            yAxisXy.axisRanges.clear();

            if (th.th1 != null) {
                SHMChart.addThreshold(yAxisXy, rootXy, th.th1, 0xf59e0b, `Warning: ${th.th1}°`);

                if (seriesX) {
                    const rangeX = yAxisXy.makeDataItem({ value: th.th1, endValue: th.th2 || 100 });
                    seriesX.createAxisRange(rangeX);
                    rangeX.get("axisFill").setAll({ fill: am5.color(0xf59e0b), fillOpacity: 1, visible: true });
                    rangeX.get("stroke").setAll({ stroke: am5.color(0xf59e0b), strokeWidth: 2, visible: true });
                }
                if (seriesY) {
                    const rangeY = yAxisXy.makeDataItem({ value: th.th1, endValue: th.th2 || 100 });
                    seriesY.createAxisRange(rangeY);
                    rangeY.get("axisFill").setAll({ fill: am5.color(0xf59e0b), fillOpacity: 1, visible: true });
                    rangeY.get("stroke").setAll({ stroke: am5.color(0xf59e0b), strokeWidth: 2, visible: true });
                }
            }

            if (th.th2 != null) {
                SHMChart.addThreshold(yAxisXy, rootXy, th.th2, 0xef4444, `Critical: ${th.th2}°`);

                if (seriesX) {
                    const rangeX2 = yAxisXy.makeDataItem({ value: th.th2, endValue: 100 });
                    seriesX.createAxisRange(rangeX2);
                    rangeX2.get("axisFill").setAll({ fill: am5.color(0xef4444), fillOpacity: 1, visible: true });
                    rangeX2.get("stroke").setAll({ stroke: am5.color(0xef4444), strokeWidth: 2, visible: true });
                }
                if (seriesY) {
                    const rangeY2 = yAxisXy.makeDataItem({ value: th.th2, endValue: 100 });
                    seriesY.createAxisRange(rangeY2);
                    rangeY2.get("axisFill").setAll({ fill: am5.color(0xef4444), fillOpacity: 1, visible: true });
                    rangeY2.get("stroke").setAll({ stroke: am5.color(0xef4444), strokeWidth: 2, visible: true });
                }
            }
        } catch (e) {
            console.warn("Failed to fetch thresholds:", e);
        }
    }

    applyThresholds(seriesX, seriesY);

    // ===============================
    // Hollow - Static dot on every point
    // ===============================
    seriesX.bullets.push(function (root, series, dataItem) {
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

    seriesY.bullets.push(function (root, series, dataItem) {
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

    // Pulses
    const pulseX = SHMChart.createPulseSeries(chartXy, rootXy, xAxisXy, yAxisXy, 'angleX', 0x3b82f6);
    const pulseY = SHMChart.createPulseSeries(chartXy, rootXy, xAxisXy, yAxisXy, 'angleY', 0x10b981);

    // ===============================
    // Persistent Label on Latest Point
    // ===============================
    function createLabelSeries(yAxis, color, field, initialText, dy) {
        var ls = chartXy.series.push(am5xy.LineSeries.new(rootXy, {
            xAxis: xAxisXy,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "time"
        }));
        ls.strokes.template.setAll({ strokeWidth: 0, strokeOpacity: 0 });
        ls.bullets.push(function (root, series, dataItem) {
            const val = dataItem.get("valueY");
            const text = (val != null) ? val.toFixed(4) + "°" : "--°";

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

    var xLabelSeries = createLabelSeries(yAxisXy, 0x3b82f6, 'angleX', "--°", -18);
    var yLabelSeries = createLabelSeries(yAxisXy, 0x10b981, 'angleY', "--°", -15);

    function updateLatestTooltip(point) {
        if (!point) return;
        if (point.angleX != null) xLabelSeries.data.setAll([{ time: point.time, angleX: point.angleX }]);
        if (point.angleY != null) yLabelSeries.data.setAll([{ time: point.time, angleY: point.angleY }]);
    }

    function updateTooltipText() {
        let labelData = ["[bold]{valueX.formatDate('dd MMM yyyy HH:mm:ss')}[/]"];
        const xActive = !document.getElementById('legend-anglex').classList.contains('inactive');
        const yActive = !document.getElementById('legend-angley').classList.contains('inactive');

        if (xActive) labelData.push("[bold]Angle X:[/] {angleX}°");
        if (yActive) labelData.push("[bold]Angle Y:[/] {angleY}°");

        tooltipSeries.get("tooltip").set("labelText", labelData.join("\n"));

        // Hide tooltip if no data is active
        if (labelData.length <= 1) {
            tooltipSeries.hide();
        } else {
            tooltipSeries.show();
        }

        // --- Axis Sync ---
        // Hide Y-axis and its label only if BOTH X and Y are inactive
        if (!xActive && !yActive) {
            yAxisXy.hide();
            yAxisXy.get("renderer").grid.template.set("visible", false);
            if (lblXy) lblXy.set("visible", false);
        } else {
            yAxisXy.show();
            yAxisXy.get("renderer").grid.template.set("visible", true);
            if (lblXy) lblXy.set("visible", true);
        }
    }

    SHMChart.setupLegendToggle('legend-anglex', seriesX, pulseX, null, updateTooltipText);
    SHMChart.setupLegendToggle('legend-angley', seriesY, pulseY, null, updateTooltipText);

    // Data structures
    let chartDataXy = [];

    // === Sensor Watchdog ===
    const titleSensor = `Tiltmeter ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim();
    const tiltWatcher = window.SHMToast ? window.SHMToast.watchSensor({ sensorName: titleSensor, timeoutMs: 120000 }) : null;

    async function loadChartHistory() {
        try {
            const res = await fetch(TILT_HISTORY_API + "&limit=100");
            const rows = await res.json();
            if (!rows || rows.length === 0) return;

            rows.reverse();
            rows.forEach(r => {
                chartDataXy.push({
                    time: new Date(r.time).getTime(),
                    angleX: r.angle_x,
                    angleY: r.angle_y
                });
            });

            seriesX.data.setAll(chartDataXy);
            seriesY.data.setAll(chartDataXy);
            tooltipSeries.data.setAll(chartDataXy);

            const latest = chartDataXy[chartDataXy.length - 1];
            pulseX.data.setAll([latest]);
            pulseY.data.setAll([latest]);
            updateLatestTooltip(latest);

            const lastRow = rows[rows.length - 1];
            updateKPI(lastRow);

        } catch (e) {
            console.warn("History load error:", e);
            if (window.SHMToast) window.SHMToast.danger("Gagal memuat data riwayat Tiltmeter", "Tiltmeter");
        }
    }

    function updateKPI(data) {
        const xEl = document.getElementById('summary-anglex');
        const yEl = document.getElementById('summary-angley');
        if (xEl) xEl.textContent = (data.angleX ?? data.angle_x)?.toFixed(4) + '°' || '--';
        if (yEl) yEl.textContent = (data.angleY ?? data.angle_y)?.toFixed(4) + '°' || '--';
    }

    function startStreaming() {
        socket.on('tiltmeter_update', (d) => {
            if (!isStreaming) return;
            if (!d.time) return;

            if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID && d.sensor_id !== SENSOR_ID) {
                return;
            }

            const pointXy = {
                time: new Date(d.time).getTime(),
                categoryX: new Date(d.time).toLocaleString('id-ID'),
                angleX: d.angle_x,
                angleY: d.angle_y
            };

            if (tiltWatcher) tiltWatcher.update();

            if (chartDataXy.length > 0 && pointXy.time === chartDataXy[chartDataXy.length - 1].time) return;

            chartDataXy.push(pointXy);
            if (chartDataXy.length > MAX_CHART_POINTS) {
                chartDataXy.shift();
                seriesX.data.removeIndex(0);
                seriesY.data.removeIndex(0);
                tooltipSeries.data.removeIndex(0);
            }

            seriesX.data.push(pointXy);
            seriesY.data.push(pointXy);
            tooltipSeries.data.push(pointXy);

            pulseX.data.setAll([pointXy]);
            pulseY.data.setAll([pointXy]);
            updateLatestTooltip(pointXy);

            updateKPI(pointXy);
            prependTableRow({ time: d.time, angleX: d.angle_x, angleY: d.angle_y, sensor_id: d.sensor_id || '--' });
        });
    }

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
                toggleBtn.classList.replace('btn-stop', 'btn-start');
            } else {
                isStreaming = true;
                toggleBtn.textContent = 'Stop';
                toggleBtn.classList.replace('btn-start', 'btn-stop');
            }
        });
    }

    // ===============================
    // Data Table Table Implementation
    // ===============================
    let realtimeTableData = [];
    let currentSortCol = 'time';
    let currentSortDesc = true;

    function renderRealtimeTable() {
        const tbody = document.getElementById('tilt-table-body');
        if (!tbody) return;

        // Sort
        realtimeTableData.sort((a, b) => {
            let valA = a[currentSortCol];
            let valB = b[currentSortCol];
            if (currentSortCol === 'time') {
                valA = new Date(a.time).getTime();
                valB = new Date(b.time).getTime();
            }
            if (valA < valB) return currentSortDesc ? 1 : -1;
            if (valA > valB) return currentSortDesc ? -1 : 1;
            return 0;
        });

        // Limit to 50 rows
        if (realtimeTableData.length > 50) {
            realtimeTableData = realtimeTableData.slice(0, 50);
        }

        tbody.innerHTML = '';
        realtimeTableData.forEach(d => {
            const dateStr = new Date(d.time).toLocaleString('id-ID');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${d.angleX !== undefined ? d.angleX.toFixed(4) + '°' : '--'}</td>
                <td>${d.angleY !== undefined ? d.angleY.toFixed(4) + '°' : '--'}</td>
                <td>${d.sensor_id}</td>
            `;
            tbody.appendChild(tr);
        });

        // Update headers UI (if icons exist)
        document.querySelectorAll('.datatable-card .sortable-header').forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (!icon) return;
            const col = th.getAttribute('data-sort');
            if (col === currentSortCol) {
                icon.textContent = currentSortDesc ? '▼' : '▲';
            } else {
                icon.textContent = '';
            }
        });
    }

    async function loadDataTable(limit = 50) {
        try {
            const res = await fetch(TILT_HISTORY_API + "&limit=" + limit);
            const rows = await res.json();
            realtimeTableData = rows.map(r => ({
                time: r.time,
                angleX: r.angle_x,
                angleY: r.angle_y,
                sensor_id: r.sensor_id || '--'
            }));
            renderRealtimeTable();
        } catch (e) {
            console.warn("Table history load error:", e);
        }
    }

    function prependTableRow(data) {
        realtimeTableData.push(data);
        renderRealtimeTable();
    }

    loadDataTable(50);

    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxisXy, yAxisXy], [lblXy]);
    });

    // ===============================
    // Statistik Tab Implementation
    // ===============================
    let statChartRoot = null;
    let statSeries = {};

    function initStatistikFilters() {
        const yearSelect = document.getElementById('select-stat-year');
        const monthSelect = document.getElementById('select-stat-month');
        const weekSelect = document.getElementById('select-stat-week');
        const startInput = document.getElementById('input-stat-start');
        const endInput = document.getElementById('input-stat-end');

        if (!yearSelect) return;
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

        // Load Years from API
        fetch('/api/weekly_periods/years')
            .then(res => res.json())
            .then(years => {
                yearSelect.innerHTML = '<option value="" disabled selected>Pilih Tahun</option>';
                years.forEach(y => {
                    yearSelect.add(new Option(y, y));
                });
            });

        yearSelect.addEventListener('change', async () => {
            monthSelect.innerHTML = '<option value="" disabled selected>Pilih Bulan</option>';
            weekSelect.innerHTML = '<option value="" disabled selected>Pilih Minggu</option>';
            if (!yearSelect.value) return;

            const res = await fetch(`/api/weekly_periods/months?year=${yearSelect.value}`);
            const months = await res.json();
            const monthOrder = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
            months.forEach(m => {
                monthSelect.add(new Option(m, m));
            });
        });

        monthSelect.addEventListener('change', async () => {
            weekSelect.innerHTML = '<option value="" disabled selected>Pilih Minggu</option>';
            if (!monthSelect.value) return;

            const res = await fetch(`/api/weekly_periods/weeks?year=${yearSelect.value}&month=${monthSelect.value}`);
            const weeks = await res.json();
            window._statWeeks = weeks;
            weeks.forEach(w => {
                weekSelect.add(new Option(w.periode_label, w.periode_label));
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
    }

    function renderStatistikChart(data) {
        if (statChartRoot) statChartRoot.dispose();
        statChartRoot = am5.Root.new("tilt-stat-chart");
        statChartRoot.setThemes([am5themes_Animated.new(statChartRoot)]);

        const chart = statChartRoot.container.children.push(am5xy.XYChart.new(statChartRoot, {
            panX: true, panY: false, wheelX: "panX", wheelY: "zoomX", pinchZoomX: true
        }));

        SHMChart.applyZoomButton(chart, statChartRoot);
        const C = SHMChart.colors();
        const xAxis = SHMChart.createDateXAxis(chart, statChartRoot, C, { timeUnit: "minute", count: 10 });

        // 1. Angle X Axis (Left)
        const yAxisX = SHMChart.createValueYAxis(chart, statChartRoot, C);
        const lblX = SHMChart.addYLabel(yAxisX, statChartRoot, "Angle X (°)", C);

        // 2. Angle Y Axis (Right)
        const yAxisY = SHMChart.createValueYAxis(chart, statChartRoot, C, { opposite: true });
        const lblY = SHMChart.addYLabel(yAxisY, statChartRoot, "Angle Y (°)", C, true);
        yAxisY.get("renderer").grid.template.set("visible", false);

        const option = document.getElementById('select-stat-option').value;

        // Series Helper
        function addSeries(id, name, field, yAxis, color) {
            const series = chart.series.push(am5xy.LineSeries.new(statChartRoot, {
                name: name,
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: field,
                valueXField: "time",
                stroke: am5.color(color),
                tooltip: am5.Tooltip.new(statChartRoot, {
                    labelText: `[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name}: {valueY.formatNumber('#.####')}°`,
                    getFillFromSprite: false,
                    pointerOrientation: "horizontal"
                })
            }));

            const bg = series.get("tooltip").get("background");
            if (bg) {
                bg.setAll({ fill: am5.color(color), fillOpacity: 1, stroke: am5.color(color) });
            }

            series.strokes.template.setAll({ strokeWidth: 2 });

            series.bullets.push(function () {
                return am5.Bullet.new(statChartRoot, {
                    sprite: am5.Circle.new(statChartRoot, {
                        radius: 4,
                        fill: statChartRoot.interfaceColors.get("background"),
                        stroke: am5.color(color),
                        strokeWidth: 2
                    })
                });
            });

            series.data.setAll(data);
            return series;
        }

        const sAvgX = addSeries('avg_x', 'Avg X', 'avg_angle_x', yAxisX, 0x3b82f6);
        const sMaxX = addSeries('max_x', 'Max X', 'max_angle_x', yAxisX, 0xef4444);
        const sMinX = addSeries('min_x', 'Min X', 'min_angle_x', yAxisX, 0x10b981);

        const sAvgY = addSeries('avg_y', 'Avg Y', 'avg_angle_y', yAxisY, 0x10b981);
        const sMaxY = addSeries('max_y', 'Max Y', 'max_angle_y', yAxisY, 0xf59e0b);
        const sMinY = addSeries('min_y', 'Min Y', 'min_angle_y', yAxisY, 0xec4899);

        // Add Thresholds
        if (data.length > 0) {
            const th1 = data[0].th1;
            const th2 = data[0].th2;
            if (th1 != null) {
                SHMChart.addThreshold(yAxisX, statChartRoot, th1, 0xf59e0b, `Warning: ${th1}°`);
                SHMChart.addThreshold(yAxisY, statChartRoot, th1, 0xf59e0b, `Warning: ${th1}°`);
            }
            if (th2 != null) {
                SHMChart.addThreshold(yAxisX, statChartRoot, th2, 0xef4444, `Critical: ${th2}°`);
                SHMChart.addThreshold(yAxisY, statChartRoot, th2, 0xef4444, `Critical: ${th2}°`);
            }
        }

        // Legend Toggle Logic
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
                        if (label) label.show();
                    } else {
                        axis.hide();
                        if (label) label.hide();
                    }
                }
            });
        };

        const xSeries = [sAvgX, sMaxX, sMinX];
        const ySeries = [sAvgY, sMaxY, sMinY];

        toggle('legend-stat-avg-anglex', sAvgX, xSeries, yAxisX, lblX);
        toggle('legend-stat-max-anglex', sMaxX, xSeries, yAxisX, lblX);
        toggle('legend-stat-min-anglex', sMinX, xSeries, yAxisX, lblX);
        toggle('legend-stat-avg-angley', sAvgY, ySeries, yAxisY, lblY);
        toggle('legend-stat-max-angley', sMaxY, ySeries, yAxisY, lblY);
        toggle('legend-stat-min-angley', sMinY, ySeries, yAxisY, lblY);

        // Initial Option Handling
        if (option === 'anglex') {
            ySeries.forEach(s => s.hide());
            yAxisY.hide();
            if (lblY) lblY.hide();
            document.querySelectorAll('#legend-stat-avg-angley, #legend-stat-max-angley, #legend-stat-min-angley')
                .forEach(el => el.classList.add('inactive-legend'));
        } else if (option === 'angley') {
            xSeries.forEach(s => s.hide());
            yAxisX.hide();
            if (lblX) lblX.hide();
            document.querySelectorAll('#legend-stat-avg-anglex, #legend-stat-max-anglex, #legend-stat-min-anglex')
                .forEach(el => el.classList.add('inactive-legend'));
        }

        chart.set("cursor", am5xy.XYCursor.new(statChartRoot, { xAxis: xAxis, behavior: "zoomX" }));
        document.getElementById('tilt-statistik-legend').style.display = 'flex';
        document.getElementById('tilt-statistik-summary').style.display = 'flex';

        SHMChart.watchTheme(() => {
            SHMChart.refreshAxisColors([xAxis, yAxisX, yAxisY]);
        });
    }

    // Capture Function
    window.captureTiltStatistik = function () {
        const target = document.getElementById("tiltStatistikCardArea");
        if (!target) return;
        if (typeof html2canvas === 'undefined') return;
        html2canvas(target, { useCORS: true, scale: 2 }).then(canvas => {
            const link = document.createElement("a");
            link.download = `Tilt_Statistik_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    };

    // Option change listener for chart refresh
    const optionSelect = document.getElementById('select-stat-option');
    if (optionSelect) {
        optionSelect.addEventListener('change', () => {
            const start = document.getElementById('input-stat-start').value;
            const end = document.getElementById('input-stat-end').value;
            if (start && end) doStatistikSearch();
        });
    }

    function populateStatistikTable(data) {
        const tbody = document.getElementById('tilt-statistik-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No statistics data found for this range.</td></tr>';
            return;
        }

        data.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(d.time).toLocaleString('id-ID')}</td>
                <td>${d.sensor_id}</td>
                <td>${d.min_angle_x != null ? d.min_angle_x.toFixed(4) + '°' : '--'}</td>
                <td>${d.max_angle_x != null ? d.max_angle_x.toFixed(4) + '°' : '--'}</td>
                <td>${d.avg_angle_x != null ? d.avg_angle_x.toFixed(4) + '°' : '--'}</td>
                <td>${d.min_angle_y != null ? d.min_angle_y.toFixed(4) + '°' : '--'}</td>
                <td>${d.max_angle_y != null ? d.max_angle_y.toFixed(4) + '°' : '--'}</td>
                <td>${d.avg_angle_y != null ? d.avg_angle_y.toFixed(4) + '°' : '--'}</td>
            `;
            tbody.appendChild(tr);
        });

        // Update Summary Area
        const minX = Math.min(...data.map(d => d.min_angle_x || 0));
        const maxX = Math.max(...data.map(d => d.max_angle_x || 0));
        const avgX = data.reduce((a, b) => a + (b.avg_angle_x || 0), 0) / data.length;
        const minY = Math.min(...data.map(d => d.min_angle_y || 0));
        const maxY = Math.max(...data.map(d => d.max_angle_y || 0));
        const avgY = data.reduce((a, b) => a + (b.avg_angle_y || 0), 0) / data.length;

        document.getElementById('stat-summary-min-anglex').textContent = minX.toFixed(4) + '°';
        document.getElementById('stat-summary-max-anglex').textContent = maxX.toFixed(4) + '°';
        document.getElementById('stat-summary-avg-anglex').textContent = avgX.toFixed(4) + '°';
        document.getElementById('stat-summary-min-angley').textContent = minY.toFixed(4) + '°';
        document.getElementById('stat-summary-max-angley').textContent = maxY.toFixed(4) + '°';
        document.getElementById('stat-summary-avg-angley').textContent = avgY.toFixed(4) + '°';
    }

    async function doStatistikSearch() {
        const start = document.getElementById('input-stat-start').value;
        const end = document.getElementById('input-stat-end').value;
        if (!start || !end) {
            if (window.SHMToast) window.SHMToast.warning("Pilih rentang waktu terlebih dahulu", "Statistik");
            return;
        }

        const sid_query = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
        try {
            const res = await fetch(`/api/tiltmeter/statistik/range?start=${start}&end=${end}${sid_query}`);
            const data = await res.json();

            const legendCont = document.getElementById('tilt-statistik-legend');
            const summaryCont = document.getElementById('tilt-statistik-summary');

            if (!data.length) {
                if (window.SHMToast) window.SHMToast.warning("Data statistik tidak ditemukan untuk periode ini", "Statistik");
                
                // Clear summary
                const sumIds = ['stat-summary-min-anglex', 'stat-summary-max-anglex', 'stat-summary-avg-anglex', 'stat-summary-min-angley', 'stat-summary-max-angley', 'stat-summary-avg-angley'];
                sumIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '--';
                });

                // Clear table & chart
                populateStatistikTable([]);
                if (statChartRoot) {
                    statChartRoot.dispose();
                    statChartRoot = null;
                }
                
                if (legendCont) legendCont.style.display = 'none';
                if (summaryCont) summaryCont.style.display = 'none';
                return;
            }

            if (window.SHMToast) window.SHMToast.success("Data Statistik ditemukan untuk periode ini", "Statistik");

            const chartData = data.map(d => ({
                ...d,
                time: new Date(d.time).getTime()
            }));

            renderStatistikChart(chartData);
            populateStatistikTable(data);


        } catch (e) {
            console.warn("Statistik search error:", e);
        }
    }

    document.getElementById('btn-stat-search')?.addEventListener('click', doStatistikSearch);
    initStatistikFilters();

    // Export PDF Statistik
    document.getElementById('btn-export-pdf-stat')?.addEventListener('click', async () => {
        const start = document.getElementById('input-stat-start').value;
        const end = document.getElementById('input-stat-end').value;
        if (!start || !end) return;

        const sid_query = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
        const res = await fetch(`/api/tiltmeter/statistik/range?start=${start}&end=${end}${sid_query}`);
        const rows = await res.json();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(14);
        doc.text(`Tiltmeter Statistik – ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : 'All Sensors'}`, 14, 15);
        doc.setFontSize(9);
        doc.text(`Periode: ${start} s/d ${end}`, 14, 22);

        const tableData = rows.map(r => [
            new Date(r.time).toLocaleString('id-ID'), r.sensor_id,
            r.min_angle_x?.toFixed(4), r.max_angle_x?.toFixed(4), r.avg_angle_x?.toFixed(4),
            r.min_angle_y?.toFixed(4), r.max_angle_y?.toFixed(4), r.avg_angle_y?.toFixed(4)
        ]);

        doc.autoTable({
            startY: 27,
            head: [['Datetime', 'Sensor ID', 'Min X', 'Max X', 'Avg X', 'Min Y', 'Max Y', 'Avg Y']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 8 }
        });
        doc.save(`tilt_statistik_${SENSOR_ID || 'all'}.pdf`);
    });

    // Export CSV Statistik
    document.getElementById('btn-export-csv-stat')?.addEventListener('click', async () => {
        const start = document.getElementById('input-stat-start').value;
        const end = document.getElementById('input-stat-end').value;
        if (!start || !end) return;

        const sid_query = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
        const res = await fetch(`/api/tiltmeter/statistik/range?start=${start}&end=${end}${sid_query}`);
        const rows = await res.json();

        let csv = "Datetime,Sensor ID,Min X,Max X,Avg X,Min Y,Max Y,Avg Y\n";
        rows.forEach(r => {
            csv += `${r.time},${r.sensor_id},${r.min_angle_x},${r.max_angle_x},${r.avg_angle_x},${r.min_angle_y},${r.max_angle_y},${r.avg_angle_y}\n`;
        });

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tilt_statistik_${SENSOR_ID || 'all'}.csv`;
        a.click();
    });

    // ===============================
    // Export PDF Real-Time
    // ===============================
    const pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', async () => {
            try {
                const res = await fetch(TILT_HISTORY_API + "&limit=500");
                const rows = await res.json();

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });

                const sensorLabel = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? SENSOR_ID.toUpperCase() : 'All Sensors';
                doc.setFontSize(14);
                doc.text(`Tiltmeter Real-Time Data – ${sensorLabel}`, 14, 15);
                doc.setFontSize(9);
                doc.setTextColor(100);
                doc.text(`Exported at: ${new Date().toLocaleString('id-ID')}`, 14, 22);

                const tableData = rows.map(r => [
                    new Date(r.time).toLocaleString('id-ID'),
                    r.angle_x?.toFixed(4) ?? '--',
                    r.angle_y?.toFixed(4) ?? '--',
                    r.sensor_id || '--'
                ]);

                doc.autoTable({
                    startY: 27,
                    head: [['Datetime', 'Angle X (deg)', 'Angle Y (deg)', 'Sensor ID']],
                    body: tableData,
                    theme: 'striped',
                    headStyles: { fillColor: [59, 130, 246] },
                    styles: { fontSize: 8 }
                });

                doc.save(`tiltmeter_data_${SENSOR_ID || 'all'}.pdf`);
            } catch (e) {
                console.warn("PDF export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export PDF Tiltmeter", "Export");
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
                const res = await fetch(TILT_HISTORY_API + "&limit=1000");
                const rows = await res.json();

                let csv = "Datetime,Angle X (deg),Angle Y (deg),Sensor ID\n";
                rows.forEach(r => {
                    csv += `${r.time},${r.angle_x},${r.angle_y},${r.sensor_id}\n`;
                });

                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tiltmeter_data_${SENSOR_ID || 'all'}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("CSV export error:", e);
                if (window.SHMToast) window.SHMToast.danger("Gagal export CSV Tiltmeter", "Export");
            }
        });
    }
});

// ── Full Card Capture ──
window.captureTilt = function () {
    const target = document.getElementById("tiltmeterCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Tiltmeter');
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
        link.download = `Tiltmeter_${sid}_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureTilt error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Tiltmeter');
    });
};
