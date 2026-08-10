// ===============================
// Anemometer 2D Sensor Monitoring
// ===============================
// SENSOR_ID injected by Flask template (anm2d.html)
const _sid2d = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const ANM2D_API = `/api/anm2d/latest?dummy=1${_sid2d}`;
const ANM2D_HISTORY_API = `/api/anm2d/history?dummy=1${_sid2d}`;
const ANM2D_TS_API = `/api/anm2d?dummy=1${_sid2d}`;
const MAX_CHART_POINTS = 120;
const THRESHOLD_API = `/api/sensor-thresholds/${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`;

let isStreaming = true;
const socket = io();

// ===============================
// amCharts 5 — ANM2D Chart
// ===============================
am5.ready(function () {
    const root = am5.Root.new("anm2d-chart");
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = SHMChart.createXYChart(root);
    SHMChart.applyZoomButton(chart, root);

    const C = SHMChart.colors();

    // ── Axes ── (urutan push = urutan posisi kiri→kanan)
    const xAxis = SHMChart.createDateXAxis(chart, root, C);

    // 1. Wind Speed (kiri dalam) — auto-scale dengan 10% headroom
    const yAxisSpd = SHMChart.createValueYAxis(chart, root, C, { min: 0 });
    const spdLabel = SHMChart.addYLabel(yAxisSpd, root, 'Wind Speed (m/s)', C);
    yAxisSpd.get('renderer').grid.template.set('visible', false);

    // 2. Direction (kanan) — tetap max 360° karena derajat kompas
    const yAxisDir = SHMChart.createValueYAxis(chart, root, C, { opposite: true, min: 0, max: 360, extraMax: 0.1 });
    const dirLabel = SHMChart.addYLabel(yAxisDir, root, 'Direction (°)', C, true);
    yAxisDir.get('renderer').grid.template.set('visible', false);

    // Thresholds — dynamic from DB
    async function applyThresholds(series) {
        try {
            const res = await fetch(THRESHOLD_API);
            const th = await res.json();

            if (th.th1 != null) {
                SHMChart.addThreshold(yAxisSpd, root, th.th1, 0xf59e0b, `Warning: ${th.th1} m/s`);

                // Dynamic Coloring for Warning
                if (series) {
                    const rangeDataItem = yAxisSpd.makeDataItem({ value: th.th1, endValue: th.th2 || 100 });
                    const range = series.createAxisRange(rangeDataItem);
                    range.strokes.template.setAll({
                        stroke: am5.color(0xf59e0b),
                        strokeWidth: 2
                    });
                }
            }
            if (th.th2 != null) {
                SHMChart.addThreshold(yAxisSpd, root, th.th2, 0xef4444, `Critical: ${th.th2} m/s`);
                yAxisSpd.set("max", th.th2 * 1.1);

                // Dynamic Coloring for Critical
                if (series) {
                    const rangeDataItem = yAxisSpd.makeDataItem({ value: th.th2, endValue: 100 });
                    const range = series.createAxisRange(rangeDataItem);
                    range.strokes.template.setAll({
                        stroke: am5.color(0xef4444),
                        strokeWidth: 2
                    });
                }
            }

            // If both are null, maybe add a default or just leave it
            if (th.th1 == null && th.th2 == null) {
                console.log("No thresholds found for sensor:", SENSOR_ID);
            }
        } catch (e) {
            console.warn("Failed to fetch thresholds:", e);
        }
    }

    // ── Series ──
    function makeLineSeries(name, field, yAxis, color) {
        const s = chart.series.push(am5xy.LineSeries.new(root, {
            name,
            xAxis,
            yAxis,
            valueYField: field,
            valueXField: 'time',
            stroke: am5.color(color),
        }));
        s.strokes.template.setAll({ strokeWidth: 2 });
        // Hollow circle bullets on every data point
        s.bullets.push((root, series) => {
            const color = series.get('stroke');
            return am5.Bullet.new(root, {
                sprite: am5.Circle.new(root, {
                    radius: 4,
                    fill: root.interfaceColors.get('background'),
                    stroke: color,
                    strokeWidth: 2,
                }),
            });
        });
        return s;
    }

    const spdSeries = makeLineSeries('Wind Speed', 'wind_speed', yAxisSpd, 0x3b82f6);
    const dirSeries = makeLineSeries('Wind Direction', 'wind_direction', yAxisDir, 0x83B366);

    // ── Shared Tooltip Series ──
    const tooltipSeries = chart.series.push(am5xy.LineSeries.new(root, {
        name: "Tooltip Series",
        xAxis,
        yAxis: yAxisSpd,
        valueYField: "wind_speed",
        valueXField: "time",
        opacity: 0,
        tooltip: am5.Tooltip.new(root, {
            labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n[bold]Speed:[/] {wind_speed}m/s\n[bold]Direction:[/] {wind_direction}°",
            pointerOrientation: "horizontal"
        })
    }));
    tooltipSeries.strokes.template.set("visible", false);
    tooltipSeries.fills.template.set("visible", false);
    SHMChart.applyTooltipBg(tooltipSeries);

    // ── Pulse series (latest point) ──
    const spdPulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisSpd, 'wind_speed', 0x3b82f6);
    const dirPulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisDir, 'wind_direction', 0x83B366);


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
            const unit = field === 'wind_speed' ? " m/s" : "°";
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

    var spdLabelSeries = createLabelSeries(yAxisSpd, 0x3b82f6, 'wind_speed', "-- m/s", -18);
    var dirLabelSeries = createLabelSeries(yAxisDir, 0x83B366, 'wind_direction', "--°", -18);

    function updateLatestTooltip(point) {
        if (!point) return;
        if (point.wind_speed != null) spdLabelSeries.data.setAll([{ time: point.time, wind_speed: point.wind_speed }]);
        if (point.wind_direction != null) dirLabelSeries.data.setAll([{ time: point.time, wind_direction: point.wind_direction }]);
    }

    applyThresholds(spdSeries);

    // ── Cursor ──
    const cursor = chart.set('cursor', am5xy.XYCursor.new(root, {
        xAxis,
        behavior: 'zoomX',
        snapToSeries: [tooltipSeries]
    }));
    cursor.lineY.set('visible', false);

    // ── Data ──
    var chartData = [];

    // Sensor watchdog
    const anm3dWatcher = window.SHMToast
        ? window.SHMToast.watchSensor({ sensorName: `Anemometer 2D ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim(), timeoutMs: 120000 })
        : null;

    async function loadChartHistory() {
        try {
            const res = await fetch(ANM2D_TS_API + '&limit=10');
            const rows = await res.json();
            if (!rows.length) return;

            chartData = rows.map(d => ({
                time: new Date(d.time).getTime(),
                wind_speed: d.wind_speed,
                wind_direction: d.wind_direction,
            })).reverse();

            spdSeries.data.setAll(chartData);
            dirSeries.data.setAll(chartData);
            tooltipSeries.data.setAll(chartData);

            const latest = chartData[chartData.length - 1];
            spdPulse.data.setAll([latest]);
            dirPulse.data.setAll([latest]);
            updateLatestTooltip(latest);

            updateSummary(rows[0]);
        } catch (e) {
            console.warn('ANM2D history load error:', e);
            if (window.SHMToast) window.SHMToast.danger('Gagal memuat data riwayat Anemometer 2D', 'Anemometer 2D');
        }
    }

    // ── Socket.IO streaming ──
    socket.on('anm2d_update', (d) => {
        if (!isStreaming) return;
        if (!d.time) return;
        if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID && d.sensor_id !== SENSOR_ID) return;

        if (anm3dWatcher) anm3dWatcher.update();

        const point = {
            time: new Date(d.time).getTime(),
            wind_speed: d.wind_speed,
            wind_direction: d.wind_direction,
        };

        if (chartData.length > 0 && point.time === chartData[chartData.length - 1].time) return;

        chartData.push(point);
        if (chartData.length > MAX_CHART_POINTS) chartData.shift();

        spdSeries.data.setAll(chartData);
        dirSeries.data.setAll(chartData);
        tooltipSeries.data.setAll(chartData);

        spdPulse.data.setAll([point]);
        dirPulse.data.setAll([point]);
        updateLatestTooltip(point);

        updateSummary(d);
        prependTableRow(d);
    });

    loadChartHistory();

    // ── Legend toggles ──
    function updateTooltipText() {
        if (!tooltipSeries) return;

        let labelData = ["[bold]{valueX.formatDate('dd MMM yyyy HH:mm:ss')}[/]"];
        const sActive = !document.getElementById('legend-speed').classList.contains('inactive');
        const dActive = !document.getElementById('legend-direction').classList.contains('inactive');

        if (sActive) labelData.push("[bold]Speed:[/] {wind_speed}m/s");
        if (dActive) labelData.push("[bold]Direction:[/] {wind_direction}°");

        tooltipSeries.get("tooltip").set("labelText", labelData.join("\n"));

        if (labelData.length <= 1) {
            tooltipSeries.hide();
        } else {
            tooltipSeries.show();
        }
    }

    SHMChart.setupLegendToggle('legend-speed', spdSeries, spdPulse, yAxisSpd, updateTooltipText);
    SHMChart.setupLegendToggle('legend-direction', dirSeries, dirPulse, yAxisDir, updateTooltipText);

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

    // ── Theme change — re-apply axis colors ──
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisSpd, yAxisDir], [spdLabel, dirLabel]);
    });
});

// ── Summary bars ──
function updateSummary(d) {
    const spdEl = document.getElementById('summary-wind-speed');
    const dirEl = document.getElementById('summary-wind-direction');
    if (spdEl) spdEl.textContent = d.wind_speed != null ? d.wind_speed.toFixed(1) + ' m/s' : '--';
    if (dirEl) dirEl.textContent = d.wind_direction != null ? d.wind_direction.toFixed(1) + ' °' : '--';
}

// ── Data Table ──
const tableBody = document.getElementById('anm2d-table-body');

let realtimeTableData = [];
let currentSortCol = 'time';
let currentSortDesc = true;

function renderRealtimeTable() {
    if (!tableBody) return;

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

    // Limit to 100 rows
    if (realtimeTableData.length > 100) {
        realtimeTableData = realtimeTableData.slice(0, 100);
    }

    tableBody.innerHTML = '';
    realtimeTableData.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(d.time).toLocaleString('id-ID')}</td>
            <td>${d.wind_speed != null ? d.wind_speed.toFixed(1) + ' m/s' : '--'}</td>
            <td>${d.wind_direction != null ? d.wind_direction.toFixed(1) + '°' : '--'}</td>
            <td>${d.sensor_id || '--'}</td>
        `;
        tableBody.appendChild(tr);
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

// Attach click listeners to headers immediately for real-time table
document.querySelectorAll('.datatable-card .sortable-header').forEach(th => {
    if (th.closest('#tab-statistik')) return;
    th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (currentSortCol === col) {
            currentSortDesc = !currentSortDesc;
        } else {
            currentSortCol = col;
            currentSortDesc = currentSortCol === 'time' ? true : false;
        }
        renderRealtimeTable();
    });
});

function prependTableRow(d) {
    if (!tableBody) return;
    realtimeTableData.push(d);
    renderRealtimeTable();
}

async function loadTableHistory() {
    try {
        const res = await fetch(ANM2D_HISTORY_API + '&limit=100');
        const rows = await res.json();
        if (!tableBody) return;
        realtimeTableData = rows;
        renderRealtimeTable();
    } catch (e) {
        console.warn('ANM2D history table error:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadTableHistory();
    setupTableSorting();

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => {
                tc.classList.toggle('active', tc.id === `tab-${target}`);
            });
            if (target === 'statistik') {
                initStatistikSearch();
            }
        });
    });
});

// ===============================
// Statistik Search & Chart (10-min)
// ===============================
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

    // Option change -> show/hide series
    const optionSelect = document.getElementById('select-stat-option');
    if (optionSelect) {
        optionSelect.addEventListener('change', () => {
            if (!statRoot) return;
            const val = optionSelect.value;
            const chart = statRoot.container.children.getIndex(0);
            if (!chart) return;

            const yAxisSpd = chart.yAxes.getIndex(0);
            const yAxisDir = chart.yAxes.getIndex(1);

            const lblSpd = yAxisSpd?.get("customLabel");
            const lblDir = yAxisDir?.get("customLabel");

            // Re-query elements from DOM to ensure we have current references
            const spdLegends = [
                document.getElementById('legend-stat-avg-speed'),
                document.getElementById('legend-stat-max-speed'),
                document.getElementById('legend-stat-min-speed')
            ];
            const dirLegends = [
                document.getElementById('legend-stat-avg-dir'),
                document.getElementById('legend-stat-max-dir'),
                document.getElementById('legend-stat-min-dir')
            ];

            const toggleDisplay = (arr, displayValue) => {
                arr.forEach(el => {
                    if (el) el.style.display = displayValue;
                });
            };

            if (val === 'semua') {
                anm2dSeriesRefs.speedSeries.forEach(s => s.show());
                anm2dSeriesRefs.dirSeries.forEach(s => s.show());

                if (yAxisSpd) {
                    yAxisSpd.show();
                    yAxisSpd.set("visible", true);
                    if (lblSpd) { lblSpd.show(); lblSpd.set("visible", true); }
                    const r = yAxisSpd.get("renderer");
                    if (r) {
                        r.set("visible", true);
                        if (r?.gridContainer) r.gridContainer.set("visible", true);
                        if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                    }
                }
                if (yAxisDir) {
                    yAxisDir.show();
                    yAxisDir.set("visible", true);
                    if (lblDir) { lblDir.show(); lblDir.set("visible", true); }
                    const r = yAxisDir.get("renderer");
                    if (r) {
                        r.set("visible", true);
                        if (r?.gridContainer) r.gridContainer.set("visible", true);
                        if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                    }
                }
                toggleDisplay(spdLegends, '');
                toggleDisplay(dirLegends, '');
                [...spdLegends, ...dirLegends].forEach(el => {
                    if (el) el.classList.remove('inactive-legend');
                });
            } else if (val === 'ws') {
                anm2dSeriesRefs.speedSeries.forEach(s => s.show());
                anm2dSeriesRefs.dirSeries.forEach(s => s.hide());

                if (yAxisSpd) {
                    yAxisSpd.show();
                    yAxisSpd.set("visible", true);
                    if (lblSpd) { lblSpd.show(); lblSpd.set("visible", true); }
                    const r = yAxisSpd.get("renderer");
                    if (r) {
                        r.set("visible", true);
                        if (r?.gridContainer) r.gridContainer.set("visible", true);
                        if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                    }
                }
                if (yAxisDir) {
                    yAxisDir.hide();
                    yAxisDir.setAll({
                        visible: false,
                        opacity: 0,
                        disabled: true
                    });
                    if (lblDir) {
                        lblDir.hide();
                        lblDir.set("visible", false);
                        lblDir.set("opacity", 0);
                    }
                    const r = yAxisDir.get("renderer");
                    if (r) {
                        r.setAll({
                            visible: false,
                            opacity: 0,
                            disabled: true
                        });
                        if (r?.gridContainer) r.gridContainer.setAll({ visible: false, opacity: 0 });
                        if (r?.labelsContainer) r.labelsContainer.setAll({ visible: false, opacity: 0 });
                    }
                }
                toggleDisplay(spdLegends, '');
                toggleDisplay(dirLegends, 'none');
                spdLegends.forEach(el => { if (el) el.classList.remove('inactive-legend'); });
                dirLegends.forEach(el => { if (el) el.classList.add('inactive-legend'); });
            } else if (val === 'wd') {
                anm2dSeriesRefs.speedSeries.forEach(s => s.hide());
                anm2dSeriesRefs.dirSeries.forEach(s => s.show());

                if (yAxisSpd) {
                    yAxisSpd.hide();
                    yAxisSpd.setAll({
                        visible: false,
                        opacity: 0,
                        disabled: true
                    });
                    if (lblSpd) {
                        lblSpd.hide();
                        lblSpd.set("visible", false);
                        lblSpd.set("opacity", 0);
                    }
                    const r = yAxisSpd.get("renderer");
                    if (r) {
                        r.setAll({
                            visible: false,
                            opacity: 0,
                            disabled: true
                        });
                        if (r?.gridContainer) r.gridContainer.setAll({ visible: false, opacity: 0 });
                        if (r?.labelsContainer) r.labelsContainer.setAll({ visible: false, opacity: 0 });
                    }
                }
                if (yAxisDir) {
                    yAxisDir.show();
                    yAxisDir.set("visible", true);
                    if (lblDir) { lblDir.show(); lblDir.set("visible", true); }
                    const r = yAxisDir.get("renderer");
                    if (r) {
                        r.set("visible", true);
                        if (r?.gridContainer) r.gridContainer.set("visible", true);
                        if (r?.labelsContainer) r.labelsContainer.set("visible", true);
                    }
                }
                toggleDisplay(spdLegends, 'none');
                toggleDisplay(dirLegends, '');
                spdLegends.forEach(el => { if (el) el.classList.add('inactive-legend'); });
                dirLegends.forEach(el => { if (el) el.classList.remove('inactive-legend'); });
            }
        });
    }
}

let statRoot = null;
let anm2dSeriesRefs = {
    speedSeries: [],
    dirSeries: []
};
async function loadStatistikByRange(start, end) {
    try {
        if (window.SHMToast) window.SHMToast.info(`Mencari data ${start} s/d ${end}...`, "Search");
        const sidUrl = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
        const res = await fetch(`/api/anm2d/statistik/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${sidUrl}`);
        const data = await res.json();

        const legendCont = document.getElementById('anm2d-statistik-legend');
        const summaryCont = document.getElementById('anm2d-statistik-summary');

        if (!data.length) {
            if (window.SHMToast) window.SHMToast.warning("Data statistik tidak ditemukan untuk periode ini", "Statistik");
            
            // Clear summary
            const sumIds = ['stat-summary-min-speed', 'stat-summary-max-speed', 'stat-summary-avg-speed', 'stat-summary-min-direction', 'stat-summary-max-direction', 'stat-summary-avg-direction'];
            sumIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '--';
            });

            // Clear table
            const tbody = document.getElementById('anm2d-statistik-table-body');
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


        // Update Summary Area (taking first row for summary)
        const first = data[0];
        document.getElementById('stat-summary-min-speed').textContent = first.min_wind_speed?.toFixed(1) || '--';
        document.getElementById('stat-summary-max-speed').textContent = first.max_wind_speed?.toFixed(1) || '--';
        document.getElementById('stat-summary-avg-speed').textContent = first.avg_wind_speed?.toFixed(1) || '--';
        document.getElementById('stat-summary-min-direction').textContent = first.min_wind_direction?.toFixed(1) || '--';
        document.getElementById('stat-summary-max-direction').textContent = first.max_wind_direction?.toFixed(1) || '--';
        document.getElementById('stat-summary-avg-direction').textContent = first.avg_wind_direction?.toFixed(1) || '--';

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
    const tbody = document.getElementById('anm2d-statistik-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Create a copy and reverse it to show newest data first (Descending)
    const reversedData = [...data].reverse();

    reversedData.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(d.time).toLocaleString('id-ID')}</td>
            <td>${d.sensor_id || '--'}</td>
            <td>${d.min_wind_speed != null ? d.min_wind_speed.toFixed(2) : '--'}</td>
            <td>${d.max_wind_speed != null ? d.max_wind_speed.toFixed(2) : '--'}</td>
            <td>${d.avg_wind_speed != null ? d.avg_wind_speed.toFixed(2) : '--'}</td>
            <td>${d.min_wind_direction != null ? d.min_wind_direction.toFixed(2) : '--'}</td>
            <td>${d.max_wind_direction != null ? d.max_wind_direction.toFixed(2) : '--'}</td>
            <td>${d.avg_wind_direction != null ? d.avg_wind_direction.toFixed(2) : '--'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStatistikChart(data) {
    if (statRoot) {
        statRoot.dispose();
    }
    statRoot = am5.Root.new("anm2d-stat-chart");
    statRoot.setThemes([am5themes_Animated.new(statRoot)]);

    const chart = SHMChart.createXYChart(statRoot);
    const C = SHMChart.colors();
    const xAxis = SHMChart.createDateXAxis(chart, statRoot, C, { timeUnit: "minute", count: 10 });

    // 1. Speed Axis (kiri dalam)
    const yAxisSpd = SHMChart.createValueYAxis(chart, statRoot, C, { min: 0 });
    const lblSpd = SHMChart.addYLabel(yAxisSpd, statRoot, 'Wind Speed (m/s)', C);
    yAxisSpd.set("customLabel", lblSpd);
    yAxisSpd.get('renderer').grid.template.set('visible', false);

    // Add Thresholds to Statistik Chart
    if (data.length > 0) {
        const first = data[0];
        if (first.th1 != null) {
            SHMChart.addThreshold(yAxisSpd, statRoot, first.th1, 0xf59e0b, `Warning: ${first.th1} m/s`);
        }
        if (first.th2 != null) {
            SHMChart.addThreshold(yAxisSpd, statRoot, first.th2, 0xef4444, `Critical: ${first.th2} m/s`);
            yAxisSpd.set("max", first.th2 * 1.1);
        }
    }

    // 2. Direction Axis (Kanan)
    const yAxisDir = SHMChart.createValueYAxis(chart, statRoot, C, { opposite: true, min: 0, max: 360 });
    const lblDir = SHMChart.addYLabel(yAxisDir, statRoot, 'Wind Direction (°)', C, true);
    yAxisDir.set("customLabel", lblDir);
    yAxisDir.get('renderer').grid.template.set('visible', false);

    const chartData = data.map(d => ({
        time: new Date(d.time).getTime(),
        min_ws: d.min_wind_speed,
        max_ws: d.max_wind_speed,
        avg_ws: d.avg_wind_speed,
        min_wd: d.min_wind_direction,
        max_wd: d.max_wind_direction,
        avg_wd: d.avg_wind_direction,
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
                labelText: "[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name}: {valueY.formatNumber('#.#')} " + (field.includes('spd') || field.includes('ws') ? 'm/s' : '°'),
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

    // Add Series
    // Speed (0x3b82f6 blue, 0xef4444 red, 0x10b981 green)
    const s1 = addSeries("Avg Wind Speed", "avg_ws", yAxisSpd, 0x3b82f6);
    const s2 = addSeries("Max Wind Speed", "max_ws", yAxisSpd, 0xef4444);
    const s3 = addSeries("Min Wind Speed", "min_ws", yAxisSpd, 0x10b981);

    // Direction (0x83B366 purple, 0x10b981 green, 0xec4899 pink)
    const s4 = addSeries("Avg Wind Direction", "avg_wd", yAxisDir, 0x83B366);
    const s5 = addSeries("Max Wind Direction", "max_wd", yAxisDir, 0x10b981);
    const s6 = addSeries("Min Wind Direction", "min_wd", yAxisDir, 0xec4899);

    // Store series references for filtering
    anm2dSeriesRefs.speedSeries = [s1, s2, s3];
    anm2dSeriesRefs.dirSeries = [s4, s5, s6];

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
                    if (label) { label.show(); label.set("visible", true); }
                    axis.get("renderer").gridContainer.set("visible", true);
                    axis.get("renderer").labelsContainer.set("visible", true);
                } else {
                    axis.hide();
                    axis.set("visible", false);
                    if (label) { label.hide(); label.set("visible", false); }
                    axis.get("renderer").gridContainer.set("visible", false);
                    axis.get("renderer").labelsContainer.set("visible", false);
                }
            }
        });
    };

    const spdSeries = [s1, s2, s3];
    const dirSeries = [s4, s5, s6];

    toggle('legend-stat-avg-speed', s1, spdSeries, yAxisSpd, lblSpd);
    toggle('legend-stat-max-speed', s2, spdSeries, yAxisSpd, lblSpd);
    toggle('legend-stat-min-speed', s3, spdSeries, yAxisSpd, lblSpd);

    toggle('legend-stat-avg-dir', s4, dirSeries, yAxisDir, lblDir);
    toggle('legend-stat-max-dir', s5, dirSeries, yAxisDir, lblDir);
    toggle('legend-stat-min-dir', s6, dirSeries, yAxisDir, lblDir);

    const cursor = chart.set("cursor", am5xy.XYCursor.new(statRoot, {
        xAxis: xAxis,
        behavior: "zoomX"
    }));
    cursor.lineY.set("visible", false);

    xAxis.set("tooltip", am5.Tooltip.new(statRoot, { themeTags: ["axis"] }));
    xAxis.get("tooltip").set("visible", false);

    xAxis.data.setAll(chartData);

    // Refresh axis colors for dark mode context
    SHMChart.watchTheme(() => {
        SHMChart.refreshAxisColors([xAxis, yAxisSpd, yAxisDir], [lblSpd, lblDir]);
    });

    // Auto-trigger filtering based on current dropdown value
    const optionSelect = document.getElementById('select-stat-option');
    if (optionSelect) optionSelect.dispatchEvent(new Event('change'));
}

window.captureAnm2DStatistik = function () {
    const target = document.getElementById("anm2dStatistikCardArea");
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
        link.download = `Anm2D_Statistik_${sid}_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

// Export PDF Realtime
document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#anm2d-table-body tr')];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(14);
    doc.text(`Anemometer 2D Real-Time Data – ${SENSOR_ID || 'All Sensors'}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exported at: ${new Date().toLocaleString('id-ID')}`, 14, 22);

    const tableData = rows.map(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        return [cells[0], cells[1], cells[2], cells[3]];
    });

    doc.autoTable({
        startY: 27,
        head: [['Datetime', 'Wind Speed (m/s)', 'Wind Direction (°)', 'Sensor ID']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 }
    });

    doc.save(`anm2d_${SENSOR_ID || 'all'}.pdf`);
});

// Export CSV Realtime
document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#anm2d-table-body tr')];
    const csv = ['Datetime,Wind Speed (m/s),Wind Direction (°),Sensor ID'];
    rows.forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        csv.push(cells.join(','));
    });
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anm2d_${SENSOR_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
});

// Export PDF Statistik
document.getElementById('btn-export-statistik-pdf')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#anm2d-statistik-table-body tr')];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(14);
    doc.text(`Anemometer 2D Statistik Data – ${SENSOR_ID || 'All Sensors'}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exported at: ${new Date().toLocaleString('id-ID')}`, 14, 22);

    const tableData = rows.map(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        return cells;
    });

    doc.autoTable({
        startY: 27,
        head: [['Datetime', 'Sensor ID', 'Min WS', 'Max WS', 'Avg WS', 'Min WD', 'Max WD', 'Avg WD']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 }
    });

    doc.save(`anm2d_statistik_${SENSOR_ID || 'all'}.pdf`);
});

// Export CSV Statistik
document.getElementById('btn-export-statistik-csv')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#anm2d-statistik-table-body tr')];
    const csv = ['Datetime,Sensor ID,Min WS (m/s),Max WS (m/s),Avg WS (m/s),Min WD (°),Max WD (°),Avg WD (°)'];
    rows.forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        csv.push(cells.join(','));
    });
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anm2d_statistik_${SENSOR_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
});


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
        console.error("Capture captureANM2D error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Anemometer 3D');
    });
};

// ===============================
// Table Sorting Logic
// ===============================
function setupTableSorting() {
    document.querySelectorAll('.data-table').forEach(table => {
        const headers = table.querySelectorAll('th.sortable');
        const tbody = table.querySelector('tbody');

        headers.forEach(header => {
            header.style.cursor = 'pointer';
            header.title = 'Click to sort';

            header.addEventListener('click', () => {
                const colIdx = parseInt(header.getAttribute('data-col'));
                const type = header.getAttribute('data-type');
                const isAsc = header.classList.contains('asc');

                // Reset all headers
                headers.forEach(h => {
                    h.classList.remove('asc', 'desc');
                    const icon = h.querySelector('.sort-icon');
                    if (icon) icon.textContent = '';
                });

                // Set new direction
                header.classList.add(isAsc ? 'desc' : 'asc');
                const sortIcon = header.querySelector('.sort-icon');
                if (sortIcon) sortIcon.textContent = isAsc ? ' ▼' : ' ▲';

                // Sort rows
                const rows = Array.from(tbody.querySelectorAll('tr'));
                rows.sort((a, b) => {
                    let valA = a.children[colIdx].textContent.trim();
                    let valB = b.children[colIdx].textContent.trim();

                    if (valA === '--') valA = '';
                    if (valB === '--') valB = '';

                    let cmp = 0;
                    if (type === 'number') {
                        valA = parseFloat(valA) || 0;
                        valB = parseFloat(valB) || 0;
                        cmp = valA - valB;
                    } else if (type === 'date') {
                        // expects dd/mm/yyyy hh:mm:ss format
                        const dateA = parseIndonesianDate(valA);
                        const dateB = parseIndonesianDate(valB);
                        cmp = dateA - dateB;
                    } else {
                        cmp = valA.localeCompare(valB);
                    }

                    return isAsc ? -cmp : cmp; // Reverse because we flipped direction
                });

                // Re-append sorted rows
                tbody.innerHTML = '';
                rows.forEach(row => tbody.appendChild(row));
            });
        });
    });
}

function parseIndonesianDate(str) {
    if (!str) return 0;
    // Format: DD/MM/YYYY, HH.mm.ss or similar depending on browser
    // Let's normalize it to parseable format
    const parts = str.match(/(\d+)/g);
    if (parts && parts.length >= 6) {
        // parts = [DD, MM, YYYY, HH, mm, ss]
        return new Date(parts[2], parts[1] - 1, parts[0], parts[3], parts[4], parts[5]).getTime();
    }
    return new Date(str).getTime() || 0;
}
