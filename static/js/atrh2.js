// ===============================
// ATRH Page – Real-Time Chart + Data Table
// ===============================
// SENSOR_ID injected by Flask template (atrhs.html)
const _sid = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? `&sensor_id=${SENSOR_ID}` : '';
const ATRH_TS_API = `/api/atrhs/latest?dummy=1${_sid}`;
const ATRH_HISTORY_API = `/api/atrhs/history?dummy=1${_sid}`;
const ATRH_THRESHOLD_API = `/api/sensor-thresholds/${typeof SENSOR_ID !== 'undefined' && SENSOR_ID ? SENSOR_ID : ''}`;
const MAX_CHART_POINTS = 120;

let isStreaming = false;
let chartData = [];
let lastAtrhRender = 0;
const socket = io();

let atrhThresholdWarn = 35;
let atrhThresholdCrit = 40;

// ===============================
// amCharts 5 — ATRH Real-Time Chart
// ===============================
am5.ready(function () {
    console.log('[atrh] am5.ready started');
    try {
        // ── Root & Theme ──
        const root = am5.Root.new("atrh-chart");
        root.setThemes([am5themes_Animated.new(root)]);

        const chart = SHMChart.createXYChart(root);
        SHMChart.applyZoomButton(chart, root);

        const C = SHMChart.colors();

        // ── Axes ──
        const xAxis = SHMChart.createDateXAxis(chart, root, C);

        // 1. Temperature Y-Axis (left)
        const yAxisTemp = SHMChart.createValueYAxis(chart, root, C, { extraMin: 0.1, max: atrhThresholdCrit * 1.2 });
        const tempLabel = SHMChart.addYLabel(yAxisTemp, root, 'Temperature (°C)', C);
        yAxisTemp.get('renderer').grid.template.set('visible', false);

        // 2. Humidity Y-Axis (right)
        const yAxisRH = SHMChart.createValueYAxis(chart, root, C, { opposite: true, extraMax: 0, min: 0, max: 100 });
        const rhLabel = SHMChart.addYLabel(yAxisRH, root, 'Humidity (%)', C, true);
        yAxisRH.get('renderer').grid.template.set('visible', false);

        // ── Thresholds ──
        async function loadThresholds() {
            if (typeof SENSOR_ID === 'undefined' || !SENSOR_ID) return;
            try {
                const res = await fetch(ATRH_THRESHOLD_API);
                const th = await res.json();
                if (th.th2 != null) atrhThresholdCrit = parseFloat(th.th2);
                if (th.th1 != null) atrhThresholdWarn = parseFloat(th.th1);

                if (atrhThresholdCrit > 0) {
                    SHMChart.addThreshold(yAxisTemp, root, atrhThresholdCrit, 0xef4444, `Critical: ${atrhThresholdCrit}°C`);
                    yAxisTemp.set("max", atrhThresholdCrit * 1.2);
                }
                if (atrhThresholdWarn > 0) {
                    SHMChart.addThreshold(yAxisTemp, root, atrhThresholdWarn, 0xf59e0b, `Warning: ${atrhThresholdWarn}°C`);
                }

                // ── Threshold zone fills (axis ranges) ──
                if (atrhThresholdCrit > 0) {
                    const critRange = yAxisTemp.createAxisRange(yAxisTemp.makeDataItem({
                        value: atrhThresholdCrit,
                        endValue: atrhThresholdCrit * 1.2
                    }));
                    critRange.get("grid").setAll({
                        above: true,
                        fill: am5.color(0xef4444),
                        fillOpacity: 0.08,
                        strokeOpacity: 0
                    });
                }
                if (atrhThresholdWarn > 0) {
                    const warnEnd = atrhThresholdCrit > 0 ? atrhThresholdCrit : atrhThresholdWarn * 1.2;
                    const warnRange = yAxisTemp.createAxisRange(yAxisTemp.makeDataItem({
                        value: atrhThresholdWarn,
                        endValue: warnEnd
                    }));
                    warnRange.get("grid").setAll({
                        above: true,
                        fill: am5.color(0xf59e0b),
                        fillOpacity: 0.06,
                        strokeOpacity: 0
                    });
                }
            } catch (e) { console.warn('Failed to fetch ATRH thresholds:', e); }
        }

        const TEMP_COLORS = { normal: 0x3b82f6, warning: 0xf59e0b, critical: 0xef4444 };

        function getTempColor(value) {
            if (!Number.isFinite(value)) return TEMP_COLORS.normal;
            if (atrhThresholdCrit > 0 && value >= atrhThresholdCrit) return TEMP_COLORS.critical;
            if (atrhThresholdWarn > 0 && value >= atrhThresholdWarn) return TEMP_COLORS.warning;
            return TEMP_COLORS.normal;
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
            s.bullets.push((root, series, dataItem) =>
                am5.Bullet.new(root, {
                    sprite: am5.Circle.new(root, {
                        radius: 4,
                        fill: root.interfaceColors.get('background'),
                        stroke: series.get('stroke'),
                        strokeWidth: 2,
                        opacity: 0
                    }),
                })
            );
            return s;
        }

        const tempSeries = makeLineSeries('Temperature', 'temperature', yAxisTemp, TEMP_COLORS.normal);
        const rhSeries = makeLineSeries('Humidity', 'humidity', yAxisRH, 0xf59e0b);

        // ── Hover bullets (show on cursor hover only) ──
        let prevTempDI = null;
        tempSeries.on("tooltipDataItem", function (tooltipDataItem) {
            if (prevTempDI && prevTempDI.bullets) {
                prevTempDI.bullets.forEach(function (b) { if (b.get("sprite")) b.get("sprite").set("opacity", 0); });
            }
            if (tooltipDataItem && tooltipDataItem.bullets) {
                tooltipDataItem.bullets.forEach(function (b) { if (b.get("sprite")) b.get("sprite").set("opacity", 1); });
            }
            prevTempDI = tooltipDataItem;
        });

        let prevRhDI = null;
        rhSeries.on("tooltipDataItem", function (tooltipDataItem) {
            if (prevRhDI && prevRhDI.bullets) {
                prevRhDI.bullets.forEach(function (b) { if (b.get("sprite")) b.get("sprite").set("opacity", 0); });
            }
            if (tooltipDataItem && tooltipDataItem.bullets) {
                tooltipDataItem.bullets.forEach(function (b) { if (b.get("sprite")) b.get("sprite").set("opacity", 1); });
            }
            prevRhDI = tooltipDataItem;
        });

        // ── Dynamic temperature line color (based on threshold state) ──
        tempSeries.strokes.template.adapters.add('stroke', (stroke, target) => {
            const dataItem = target.dataItem;
            if (!dataItem) return stroke;
            const value = Number(dataItem.get('valueY'));
            return am5.color(getTempColor(value));
        });

        // ── Gradient fill under temperature line ──
        tempSeries.fills.template.set("visible", true);
        tempSeries.fills.template.set("fillOpacity", 0.1);
        tempSeries.fills.template.set("fill", am5.color(TEMP_COLORS.normal));
        tempSeries.set("fill", am5.color(TEMP_COLORS.normal));
        tempSeries.fills.template.adapters.add('fill', (fill, target) => {
            const dataItem = target.dataItem;
            if (!dataItem) return fill;
            const value = Number(dataItem.get('valueY'));
            return am5.color(getTempColor(value));
        });

        // ── Shared Tooltip Series ──
        const tooltipSeries = chart.series.push(am5xy.LineSeries.new(root, {
            name: "Tooltip Series",
            xAxis,
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

        // ── Pulse series (latest point) ──
        const tempPulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisTemp, 'temperature', 0x3b82f6);
        const rhPulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxisRH, 'humidity', 0xf59e0b);

        // ── Label on latest point ──
        function createLabelSeries(yAxis, color, field, unit, dy) {
            const ls = chart.series.push(am5xy.LineSeries.new(root, {
                xAxis,
                yAxis,
                valueYField: field,
                valueXField: "time"
            }));
            ls.strokes.template.setAll({ strokeWidth: 0, strokeOpacity: 0 });
            ls.bullets.push(function (root, series, dataItem) {
                const val = dataItem.get("valueY");
                const text = (val != null) ? val.toFixed(1) + unit : "--" + unit;
                const lbl = am5.Label.new(root, {
                    text,
                    fill: am5.color(0xffffff),
                    fontSize: 11,
                    fontWeight: "600",
                    centerX: am5.p50,
                    centerY: am5.p100,
                    dy,
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

        const tempLabelSeries = createLabelSeries(yAxisTemp, 0x3b82f6, 'temperature', ' °C', -18);
        const rhLabelSeries = createLabelSeries(yAxisRH, 0xf59e0b, 'humidity', ' %', -18);

        function updateLatestLabel(point) {
            if (!point) return;
            if (point.temperature != null) tempLabelSeries.data.setAll([{ time: point.time, temperature: point.temperature }]);
            if (point.humidity != null) rhLabelSeries.data.setAll([{ time: point.time, humidity: point.humidity }]);
        }

        // ── Dynamic color sync for pulse, label, and bullets ──
        let lastTempColor = TEMP_COLORS.normal;
        function applyTempColor(amColor) {
            lastTempColor = amColor;
            // Update pulse color
            if (tempPulse && tempPulse.dataItems && typeof tempPulse.dataItems.each === 'function') {
                tempPulse.dataItems.each(di => {
                    if (di.bullets && typeof di.bullets.each === 'function') {
                        di.bullets.each(bullet => {
                            const sprite = bullet.get('sprite');
                            if (sprite && sprite.set) sprite.set('fill', amColor);
                        });
                    }
                });
            }
            // Update label background
            try {
                const di = tempLabelSeries.dataItems ? tempLabelSeries.dataItems[0] : null;
                if (di && di.bullets && di.bullets.length) {
                    const bg = di.bullets[0].get('sprite').get('background');
                    if (bg) bg.set('fill', amColor);
                }
            } catch (e) { }
        }

        // ── Cursor ──
        const cursor = chart.set('cursor', am5xy.XYCursor.new(root, {
            xAxis,
            behavior: 'zoomX',
            snapToSeries: [tooltipSeries]
        }));
        cursor.lineY.set('visible', false);
        function styleCursorLine() {
            const c = SHMChart.colors();
            cursor.lineX.setAll({
                visible: true,
                stroke: am5.color(c.isDark ? 0xffffff : 0x1e293b),
                strokeOpacity: c.isDark ? 0.32 : 0.24,
                strokeWidth: 1,
                shadowColor: am5.color(0x000000),
                shadowBlur: 4,
                shadowOpacity: c.isDark ? 0.45 : 0.18
            });
        }
        styleCursorLine();

        // ── Sensor watchdog ──
        const atrhWatcher = window.SHMToast
            ? window.SHMToast.watchSensor({
                sensorName: `ATRH ${typeof SENSOR_ID !== 'undefined' ? SENSOR_ID : ''}`.trim(),
                timeoutMs: 120000,
                checkMs: 1000
            })
            : null;

        // ── Load history ──
        async function loadChartHistory() {
            try {
                const res = await fetch(ATRH_HISTORY_API + '&limit=120');
                const rows = await res.json();
                if (!rows || !rows.length) return;

                chartData = rows.map(d => ({
                    time: new Date(d.time).getTime(),
                    temperature: d.temperature,
                    humidity: d.humidity,
                })).reverse(); // API returns DESC, we need ASC for chart

                tempSeries.data.setAll(chartData);
                rhSeries.data.setAll(chartData);
                tooltipSeries.data.setAll(chartData);

                const latest = chartData[chartData.length - 1];
                tempPulse.data.setAll([latest]);
                rhPulse.data.setAll([latest]);
                updateLatestLabel(latest);

                // Sync temperature color
                const newColor = getTempColor(latest.temperature);
                if (newColor !== lastTempColor) applyTempColor(am5.color(newColor));

                // Update summary cards from latest
                updateSummaryCards(rows[0]); // rows[0] = most recent (DESC)

            } catch (e) {
                console.warn('ATRH history load error:', e);
                if (window.SHMToast) window.SHMToast.danger('Gagal memuat data riwayat ATRH', 'ATRH');
            }
        }

        // ── Socket.IO streaming ──
        socket.on('atrh_update', (d) => {
            if (!isStreaming) return;
            if (!d.time) return;
            if (typeof SENSOR_ID !== 'undefined' && SENSOR_ID &&
                (d.sensor_id || '').toUpperCase() !== SENSOR_ID.toUpperCase()) return;

            if (atrhWatcher) atrhWatcher.update();

            // Always update summary cards
            updateSummaryCards(d);

            const now = Date.now();
            if (now - lastAtrhRender < 500) return;
            lastAtrhRender = now;

            const point = {
                time: new Date(d.time).getTime(),
                temperature: d.temperature,
                humidity: d.humidity,
            };

            // Deduplicate
            if (chartData.length > 0 && point.time <= chartData[chartData.length - 1].time) return;

            chartData.push(point);
            tempSeries.data.push(point);
            rhSeries.data.push(point);
            tooltipSeries.data.push(point);

            if (chartData.length > MAX_CHART_POINTS) {
                chartData.shift();
                tempSeries.data.removeIndex(0);
                rhSeries.data.removeIndex(0);
                tooltipSeries.data.removeIndex(0);
            }

            tempPulse.data.setAll([point]);
            rhPulse.data.setAll([point]);
            updateLatestLabel(point);

            // Sync temperature color
            const newColor = getTempColor(point.temperature);
            if (newColor !== lastTempColor) applyTempColor(am5.color(newColor));

            prependTableRow(d);
        });

        socket.on('disconnect', () => {
            if (window.SHMToast) window.SHMToast.warning('Connection lost — reconnecting...', 'Socket');
        });
        socket.on('reconnect', () => {
            if (window.SHMToast) window.SHMToast.success('Reconnected', 'Socket');
            loadChartHistory();
            loadTableHistory();
        });

        async function initData() {
            await loadChartHistory();
            await loadTableHistory();
        }

        loadThresholds().catch(e => console.warn('Thresholds init failed:', e));
        initData().catch(e => console.warn('Data init failed:', e));

        // ── Legend toggles (custom — switch tooltipSeries axis when temp hidden) ──
        function hideFullAxis(axis, label) {
            if (!axis) return;
            axis.hide();
            axis.set("visible", false);
            if (label) { label.hide(); label.set("visible", false); }
            const r = axis.get("renderer");
            if (r) {
                r.set("visible", false);
                if (r.gridContainer) r.gridContainer.set("visible", false);
                if (r.labelsContainer) r.labelsContainer.set("visible", false);
            }
        }
        function showFullAxis(axis, label) {
            if (!axis) return;
            axis.show();
            axis.set("visible", true);
            if (label) { label.show(); label.set("visible", true); }
            const r = axis.get("renderer");
            if (r) {
                r.set("visible", true);
                if (r.gridContainer) r.gridContainer.set("visible", true);
                if (r.labelsContainer) r.labelsContainer.set("visible", true);
            }
        }

        function updateTooltipText() {
            if (!tooltipSeries) return;
            let parts = ["{valueX.formatDate('dd MMM yyyy HH:mm:ss')}"];
            const tActive = !document.getElementById('legend-temp')?.classList.contains('inactive');
            const rActive = !document.getElementById('legend-rh')?.classList.contains('inactive');
            if (tActive) parts.push("[bold]Temp:[/] {temperature}°C");
            if (rActive) parts.push("[bold]RH:[/] {humidity}%");
            tooltipSeries.get("tooltip").set("labelText", parts.join("\n"));
            if (!tActive && !rActive) tooltipSeries.hide(); else tooltipSeries.show();

            if (tActive) tempLabelSeries.show(); else tempLabelSeries.hide();
            if (rActive) rhLabelSeries.show(); else rhLabelSeries.hide();
        }

        function syncLegendState() {
            const tHidden = document.getElementById('legend-temp')?.classList.contains('inactive');
            const rHidden = document.getElementById('legend-rh')?.classList.contains('inactive');

            if (tHidden && rHidden) {
                hideFullAxis(yAxisTemp, tempLabel);
                hideFullAxis(yAxisRH, rhLabel);
                tooltipSeries.hide();
            } else if (tHidden) {
                hideFullAxis(yAxisTemp, tempLabel);
                showFullAxis(yAxisRH, rhLabel);
                tooltipSeries.set("yAxis", yAxisRH);
                tooltipSeries.set("valueYField", "humidity");
                tooltipSeries.data.setAll(chartData);
                tooltipSeries.show();
                cursor.set("snapToSeries", [tooltipSeries]);
            } else if (rHidden) {
                showFullAxis(yAxisTemp, tempLabel);
                hideFullAxis(yAxisRH, rhLabel);
                tooltipSeries.set("yAxis", yAxisTemp);
                tooltipSeries.set("valueYField", "temperature");
                tooltipSeries.data.setAll(chartData);
                tooltipSeries.show();
                cursor.set("snapToSeries", [tooltipSeries]);
            } else {
                showFullAxis(yAxisTemp, tempLabel);
                showFullAxis(yAxisRH, rhLabel);
                tooltipSeries.set("yAxis", yAxisTemp);
                tooltipSeries.set("valueYField", "temperature");
                tooltipSeries.data.setAll(chartData);
                tooltipSeries.show();
                cursor.set("snapToSeries", [tooltipSeries]);
            }
            updateTooltipText();
        }

        function setupCustomToggle(elementId, mainSeries, pulseSeries, labelSeries) {
            const el = document.getElementById(elementId);
            if (!el) return;
            el.addEventListener('click', () => {
                const isVisible = !el.classList.contains('inactive');
                if (isVisible) {
                    mainSeries.hide();
                    if (pulseSeries) pulseSeries.hide();
                    if (labelSeries) labelSeries.hide();
                    el.classList.add('inactive');
                } else {
                    mainSeries.show();
                    if (pulseSeries) pulseSeries.show();
                    if (labelSeries) labelSeries.show();
                    el.classList.remove('inactive');
                }
                syncLegendState();
            });
        }

        setupCustomToggle('legend-temp', tempSeries, tempPulse, tempLabelSeries);
        setupCustomToggle('legend-rh', rhSeries, rhPulse, rhLabelSeries);

        // ── Stop/Start Toggle ──
        const toggleBtn = document.getElementById('btn-toggle-stream');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', async () => {
                isStreaming = !isStreaming;
                toggleBtn.textContent = isStreaming ? 'Stop' : 'Start';
                toggleBtn.classList.toggle('btn-stop', isStreaming);
                toggleBtn.classList.toggle('btn-start', !isStreaming);
                if (isStreaming) {
                    await loadChartHistory();
                    await loadTableHistory();
                }
            });
            toggleBtn.textContent = 'Start';
            toggleBtn.classList.add('btn-start');
        }

        // ── Theme change ──
        SHMChart.watchTheme(() => {
            SHMChart.refreshAxisColors([xAxis, yAxisTemp, yAxisRH], [tempLabel, rhLabel]);
            styleCursorLine();
        });
        console.log('[atrh] Chart initialized successfully');
    } catch (e) { console.error('atrh chart init failed:', e); }
});

// ── Summary Cards ──
function updateSummaryCards(d) {
    if (!d) return;
    const temp = d.temperature;
    const rh = d.humidity;

    // Time
    const timeEl = document.getElementById("card-last-update");
    if (timeEl) {
        try { timeEl.innerText = d.time ? new Date(d.time).toLocaleTimeString('id-ID') : '--'; }
        catch (e) { timeEl.innerText = d.time || '--'; }
    }
    // Date
    const dateEl = document.getElementById("card-last-date");
    if (dateEl) {
        try {
            dateEl.innerText = d.time
                ? new Date(d.time).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
                : '--';
        }
        catch (e) { dateEl.innerText = d.time || '--'; }
    }

    // Temperature
    const tempEl = document.getElementById("card-temp");
    if (tempEl) {
        tempEl.innerText = temp != null ? temp.toFixed(1) : '--';
        if (temp != null) {
            if (temp >= atrhThresholdCrit) tempEl.style.color = "#ef4444";
            else if (temp >= atrhThresholdWarn) tempEl.style.color = "#f59e0b";
            else tempEl.style.color = "#3b82f6";
        }
    }

    // Humidity
    const rhEl = document.getElementById("card-rh");
    if (rhEl) {
        rhEl.innerText = rh != null ? rh.toFixed(1) : '--';
    }
}

// ── Data Table (Real-time) ──
const tableBody = document.getElementById("atrh-table-body");

let realtimeTableData = [];
let currentSortCol = 'time';
let currentSortDesc = true;

function renderRealtimeTable() {
    if (!tableBody) return;

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

    if (realtimeTableData.length > 10) {
        realtimeTableData = realtimeTableData.slice(0, 10);
    }

    tableBody.innerHTML = '';
    realtimeTableData.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(d.time).toLocaleString('id-ID')}</td>
            <td>${d.temperature != null ? d.temperature.toFixed(1) + ' °C' : '--'}</td>
            <td>${d.humidity != null ? d.humidity.toFixed(1) + ' %' : '--'}</td>
            <td>${d.sensor_id || '--'}</td>
        `;
        tableBody.appendChild(tr);
    });

    document.querySelectorAll('.datatable-card .sortable-header').forEach(th => {
        if (th.closest('#tab-statistik')) return;
        const col = th.getAttribute('data-sort');
        const icon = th.querySelector('.sort-icon');
        if (col === currentSortCol) {
            icon.textContent = currentSortDesc ? '\u25bc' : '\u25b2';
        } else {
            icon.textContent = '';
        }
    });
}

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

    const row = `<tr>
        <td>${new Date(d.time).toLocaleString('id-ID')}</td>
        <td>${d.temperature != null ? d.temperature.toFixed(1) + ' °C' : '--'}</td>
        <td>${d.humidity != null ? d.humidity.toFixed(1) + ' %' : '--'}</td>
        <td>${d.sensor_id || '--'}</td>
    </tr>`;
    tableBody.insertAdjacentHTML('afterbegin', row);

    if (realtimeTableData.length > 100) {
        realtimeTableData.shift();
        if (tableBody.lastElementChild) tableBody.lastElementChild.remove();
    }
}

async function loadTableHistory() {
    try {
        const res = await fetch(ATRH_HISTORY_API + '&limit=10');
        const rows = await res.json();
        if (!tableBody) return;
        realtimeTableData = rows;
        renderRealtimeTable();
    } catch (e) {
        console.warn('ATRH table history error:', e);
    }
}

// ── Tab Switching ──
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => {
                tc.classList.toggle('active', tc.id === `tab-${target}`);
            });
            if (target === 'statistik') {
                setTimeout(() => initStatistikSearch(), 100);
            }
        });
    });
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
        console.error("captureATRH error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'ATRH');
    });
};

// Export PDF Realtime
document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    try {
        const res = await fetch(ATRH_HISTORY_API + "&limit=500");
        const rows = await res.json();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        const sensorLabel = (typeof SENSOR_ID !== 'undefined' && SENSOR_ID) ? SENSOR_ID.toUpperCase() : 'All Sensors';
        doc.setFontSize(14);
        doc.text(`ATRH Real-Time Data \u2013 ${sensorLabel}`, 14, 15);
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

// Export CSV Realtime
document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    try {
        const res = await fetch(ATRH_HISTORY_API + "&limit=500");
        const rows = await res.json();
        let csv = "Datetime,Temperature (°C),Humidity (%),Sensor ID\n";
        rows.forEach(r => {
            csv += `${r.time},${r.temperature},${r.humidity},${r.sensor_id}\n`;
        });
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `atrh_data_${SENSOR_ID || 'all'}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (e) {
        console.warn("CSV export error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal export CSV ATRH", "Export");
    }
});

// ===============================
// Statistik Search & Chart (10-min)
// ===============================
let statRoot = null;
let statSeriesRefs = {
    tempSeries: [],
    rhSeries: []
};

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
        const monthOpt = document.createElement('option');
        monthOpt.value = '1_bulan';
        monthOpt.textContent = '1 Bulan (Full Month)';
        weekSelect.appendChild(monthOpt);
    });

    weekSelect.addEventListener('change', () => {
        if (weekSelect.value === '1_bulan') {
            if (!window._statWeeks || window._statWeeks.length === 0) {
                if (window.SHMToast) window.SHMToast.warning("Tidak ada data minggu untuk bulan ini", "Search");
                return;
            }
            const firstWeek = window._statWeeks[0];
            const lastWeek = window._statWeeks[window._statWeeks.length - 1];
            const startStr = firstWeek.start_date.replace('T', ' ').split('.')[0];
            const endStr = lastWeek.end_date.replace('T', ' ').split('.')[0];
            startInput.value = startStr;
            endInput.value = endStr;
            fpStart.setDate(startStr);
            fpEnd.setDate(endStr);
            return;
        }
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
                arr.forEach(el => { if (el) el.style.display = displayValue; });
            };

            if (val === 'semua') {
                statSeriesRefs.tempSeries.forEach(s => s.show());
                statSeriesRefs.rhSeries.forEach(s => s.show());
                showAxis(yAxisTemp, lblTemp);
                showAxis(yAxisRH, lblRH);
                toggleDisplay(tempLegends, '');
                toggleDisplay(rhLegends, '');
                [...tempLegends, ...rhLegends].forEach(el => {
                    if (el) el.classList.remove('inactive-legend');
                });
            } else if (val === 'temp') {
                statSeriesRefs.tempSeries.forEach(s => s.show());
                statSeriesRefs.rhSeries.forEach(s => s.hide());
                showAxis(yAxisTemp, lblTemp);
                hideAxis(yAxisRH, lblRH);
                toggleDisplay(tempLegends, '');
                toggleDisplay(rhLegends, 'none');
                tempLegends.forEach(el => { if (el) el.classList.remove('inactive-legend'); });
            } else if (val === 'rh') {
                statSeriesRefs.tempSeries.forEach(s => s.hide());
                statSeriesRefs.rhSeries.forEach(s => s.show());
                hideAxis(yAxisTemp, lblTemp);
                showAxis(yAxisRH, lblRH);
                toggleDisplay(tempLegends, 'none');
                toggleDisplay(rhLegends, '');
                rhLegends.forEach(el => { if (el) el.classList.remove('inactive-legend'); });
            }
        });
    }
}

function showAxis(axis, label) {
    if (!axis) return;
    axis.show();
    axis.set("visible", true);
    if (label) { label.show(); label.set("visible", true); }
    const r = axis.get("renderer");
    if (r) {
        r.set("visible", true);
        if (r?.gridContainer) r.gridContainer.set("visible", true);
        if (r?.labelsContainer) r.labelsContainer.set("visible", true);
    }
}

function hideAxis(axis, label) {
    if (!axis) return;
    axis.hide();
    axis.set("visible", false);
    if (label) { label.hide(); label.set("visible", false); }
    const r = axis.get("renderer");
    if (r) {
        r.set("visible", false);
        if (r?.gridContainer) r.gridContainer.set("visible", false);
        if (r?.labelsContainer) r.labelsContainer.set("visible", false);
    }
}

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

            const sumIds = ['stat-summary-min-temp', 'stat-summary-max-temp', 'stat-summary-avg-temp',
                'stat-summary-min-rh', 'stat-summary-max-rh', 'stat-summary-avg-rh'];
            sumIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '--';
            });

            const tbody = document.getElementById('atrh-statistik-table-body');
            if (tbody) tbody.innerHTML = '';

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

        // Update Summary Area
        const first = data[0];
        document.getElementById('stat-summary-min-temp').textContent = first.min_temperature?.toFixed(1) || '--';
        document.getElementById('stat-summary-max-temp').textContent = first.max_temperature?.toFixed(1) || '--';
        document.getElementById('stat-summary-avg-temp').textContent = first.avg_temperature?.toFixed(1) || '--';
        document.getElementById('stat-summary-min-rh').textContent = first.min_humidity?.toFixed(1) || '--';
        document.getElementById('stat-summary-max-rh').textContent = first.max_humidity?.toFixed(1) || '--';
        document.getElementById('stat-summary-avg-rh').textContent = first.avg_humidity?.toFixed(1) || '--';

        renderStatistikChart(data);
        populateStatistikTable(data);

        const optionSelect = document.getElementById('select-stat-option');
        if (optionSelect) {
            optionSelect.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        console.error("Load atrh statistik error:", e);
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

    // 1. Temperature Y-Axis (left)
    const yAxisTemp = SHMChart.createValueYAxis(chart, statRoot, C, { min: 20, max: atrhThresholdCrit * 1.2 });
    const lblTemp = SHMChart.addYLabel(yAxisTemp, statRoot, 'Temperature (°C)', C);
    yAxisTemp.set("customLabel", lblTemp);

    // 2. Humidity Y-Axis (right) — grid hidden
    const yAxisRH = SHMChart.createValueYAxis(chart, statRoot, C, { opposite: true, min: 0, max: 100 });
    const lblRH = SHMChart.addYLabel(yAxisRH, statRoot, 'Humidity (%)', C, true);
    yAxisRH.set("customLabel", lblRH);
    yAxisRH.get('renderer').grid.template.set('visible', false);

    // Add thresholds to statistik chart
    if (data.length > 0) {
        const first = data[0];
        if (first.th1 != null && parseFloat(first.th1) !== 0) {
            SHMChart.addThreshold(yAxisTemp, statRoot, first.th1, 0xf59e0b, `Warning: ${first.th1}°C`);
        }
        if (first.th2 != null && parseFloat(first.th2) !== 0) {
            SHMChart.addThreshold(yAxisTemp, statRoot, first.th2, 0xef4444, `Critical: ${first.th2}°C`);
            yAxisTemp.set("max", parseFloat(first.th2) * 1.2);
        }
    }

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
        let unit = ' °C';
        if (field.includes('rh')) unit = ' %';
        const series = chart.series.push(am5xy.LineSeries.new(statRoot, {
            name: name,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "time",
            stroke: am5.color(color),
            tooltip: am5.Tooltip.new(statRoot, {
                labelText: "[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name}: {valueY.formatNumber('#.#')}" + unit,
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

    // Temperature Series
    const s1 = addSeries("Avg Temp", "avg_temp", yAxisTemp, 0x3b82f6);
    const s2 = addSeries("Max Temp", "max_temp", yAxisTemp, 0xef4444);
    const s3 = addSeries("Min Temp", "min_temp", yAxisTemp, 0x10b981);

    // Humidity Series
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

        if (s.get("visible") === false) el.classList.add('inactive-legend');
        else el.classList.remove('inactive-legend');

        el.replaceWith(el.cloneNode(true));
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
                    showAxis(axis, label);
                } else {
                    hideAxis(axis, label);
                }
            }
        });
    };

    const tmpSeries = [s1, s2, s3];
    const rhSeriesArr = [s4, s5, s6];

    toggle('legend-stat-avg-temp', s1, tmpSeries, yAxisTemp, lblTemp);
    toggle('legend-stat-max-temp', s2, tmpSeries, yAxisTemp, lblTemp);
    toggle('legend-stat-min-temp', s3, tmpSeries, yAxisTemp, lblTemp);

    toggle('legend-stat-avg-rh', s4, rhSeriesArr, yAxisRH, lblRH);
    toggle('legend-stat-max-rh', s5, rhSeriesArr, yAxisRH, lblRH);
    toggle('legend-stat-min-rh', s6, rhSeriesArr, yAxisRH, lblRH);

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
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: html2canvas tidak ditemukan', 'Statistik');
        return;
    }
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const bg = theme === 'dark' ? '#1e293b' : '#ffffff';
    html2canvas(target, { useCORS: true, scale: 2, backgroundColor: bg }).then(canvas => {
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
        head: [['Datetime', 'Sensor ID', 'Min Temp', 'Max Temp', 'Avg Temp', 'Min RH', 'Max RH', 'Avg RH']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 }
    });
    doc.save(`atrh_statistik_${SENSOR_ID || 'all'}.pdf`);
});

// Export CSV Statistik
document.getElementById('btn-export-csv-stat')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#atrh-statistik-table-body tr')];
    let csv = "Datetime,Sensor ID,Min Temp (°C),Max Temp (°C),Avg Temp (°C),Min RH (%),Max RH (%),Avg RH (%)\n";
    rows.forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        csv += cells.join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atrh_statistik_${SENSOR_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
});
