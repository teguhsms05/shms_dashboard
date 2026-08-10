// ===============================
// Cable Tension Single Sensor Page
// ===============================
var _ctPageData = document.getElementById("ct-page-data") || {};
var SENSOR_ID = (typeof window.SENSOR_ID !== 'undefined' && window.SENSOR_ID) ? window.SENSOR_ID : ((_ctPageData.dataset && _ctPageData.dataset.sensorId) || "");
var TENSION_WARN_KN = (typeof window.TENSION_WARN_KN !== 'undefined' && window.TENSION_WARN_KN) ? window.TENSION_WARN_KN : (parseFloat(_ctPageData.dataset && _ctPageData.dataset.tensionWarnKn) || 0);
var TENSION_CRITICAL_KN = (typeof window.TENSION_CRITICAL_KN !== 'undefined' && window.TENSION_CRITICAL_KN) ? window.TENSION_CRITICAL_KN : (parseFloat(_ctPageData.dataset && _ctPageData.dataset.tensionCriticalKn) || 0);

const _ctSensorId = (SENSOR_ID) ? `sensor_id=${SENSOR_ID}` : '';
const CT_HISTORY_API = `/api/cable-tension/history?${_ctSensorId}`;

let _ctStreaming = false;
let _ctChartData = [];

function _ctParseTime(timeStr) {
    if (!timeStr) return new Date();
    if (typeof timeStr === 'number') return new Date(timeStr);
    const parts = timeStr.split(/[-T :.]/);
    return new Date(
        parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10),
        parseInt(parts[3], 10) || 0, parseInt(parts[4], 10) || 0, parseInt(parts[5], 10) || 0
    );
}

const _ctAlertColors = { normal: 0x22c55e, warning: 0xf59e0b, critical: 0xef4444 };

function _ctGetStatus(val) {
    if (val >= TENSION_CRITICAL_KN) return 'critical';
    if (val >= TENSION_WARN_KN) return 'warning';
    return 'normal';
}

// ── Summary Cards ──
function _ctUpdateSummaryCards(d) {
    const t = d.time ? _ctParseTime(d.time) : new Date();
    document.getElementById('card-last-update').textContent = t.toLocaleTimeString();
    document.getElementById('card-last-date').textContent = t.toLocaleDateString();
    document.getElementById('card-tavg').textContent = (d.tension_avg || 0).toFixed(1);
    document.getElementById('card-f1').textContent = (d.f1 || 0).toFixed(3);
    document.getElementById('card-f2').textContent = (d.f2 || 0).toFixed(3);
    document.getElementById('card-f3').textContent = (d.f3 || 0).toFixed(3);

    const st = _ctGetStatus(d.tension_avg || 0);
    const el = document.getElementById('card-status-text');
    if (el) {
        if (st === 'critical') { el.textContent = 'Critical'; el.style.color = '#ef4444'; }
        else if (st === 'warning') { el.textContent = 'Warning'; el.style.color = '#f59e0b'; }
        else { el.textContent = 'Normal'; el.style.color = '#22c55e'; }
    }
}

// ── Data Table ──
let _ctTableData = [];
let _ctSortCol = 'time';
let _ctSortDesc = true;

function _ctRenderTable() {
    const tbody = document.getElementById('ct-table-body');
    if (!tbody) return;
    const sorted = [..._ctTableData].sort((a, b) => {
        let va = a[_ctSortCol], vb = b[_ctSortCol];
        if (_ctSortCol === 'time') { va = _ctParseTime(va).getTime(); vb = _ctParseTime(vb).getTime(); }
        else { va = Number(va) || 0; vb = Number(vb) || 0; }
        return _ctSortDesc ? vb - va : va - vb;
    });
    const rows = sorted.slice(0, 100);
    tbody.innerHTML = rows.map(d => {
        const avg = d.tension_avg || 0;
        let cls = '';
        if (avg >= TENSION_CRITICAL_KN) cls = 'style="background:rgba(239,68,68,0.08)"';
        else if (avg >= TENSION_WARN_KN) cls = 'style="background:rgba(245,158,11,0.08)"';
        return `<tr ${cls}>
            <td>${_ctParseTime(d.time).toLocaleString()}</td>
            <td>${(d.f1||0).toFixed(3)}</td><td>${(d.f2||0).toFixed(3)}</td><td>${(d.f3||0).toFixed(3)}</td>
            <td>${(d.t1||0).toFixed(1)}</td><td>${(d.t2||0).toFixed(1)}</td><td>${(d.t3||0).toFixed(1)}</td>
            <td><strong>${(d.tension_avg||0).toFixed(1)}</strong></td>
        </tr>`;
    }).join('');
}

document.querySelectorAll('#tab-realtime .sortable-header').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (_ctSortCol === col) _ctSortDesc = !_ctSortDesc;
        else { _ctSortCol = col; _ctSortDesc = true; }
        document.querySelectorAll('#tab-realtime .sortable-header .sort-icon').forEach(s => s.textContent = '');
        th.querySelector('.sort-icon').textContent = _ctSortDesc ? '▼' : '▲';
        _ctRenderTable();
    });
});

// ── Load Data ──
async function _ctLoadHistory() {
    try {
        const res = await fetch(CT_HISTORY_API + '&limit=120');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.length) return;
        _ctChartData = data.map(d => ({
            time: _ctParseTime(d.time).getTime(),
            tension_avg: d.tension_avg, f1: d.f1, f2: d.f2, f3: d.f3,
            t1: d.t1, t2: d.t2, t3: d.t3,
        })).reverse();

        if (_ctSeriesMap.tavg) _ctSeriesMap.tavg.data.setAll(_ctChartData.map(d => ({ time: d.time, tension_avg: d.tension_avg })));
        if (_ctSeriesMap.f1) _ctSeriesMap.f1.data.setAll(_ctChartData.map(d => ({ time: d.time, f1: d.f1 })));
        if (_ctSeriesMap.f2) _ctSeriesMap.f2.data.setAll(_ctChartData.map(d => ({ time: d.time, f2: d.f2 })));
        if (_ctSeriesMap.f3) _ctSeriesMap.f3.data.setAll(_ctChartData.map(d => ({ time: d.time, f3: d.f3 })));
        if (_ctTooltipSeries) _ctTooltipSeries.data.setAll(_ctChartData);

        if (_ctChartData.length) {
            const last = _ctChartData[_ctChartData.length - 1];
            _ctUpdateSummaryCards({ ...last, time: new Date(last.time).toISOString() });
            _ctUpdateLatestLabels(last);
            _ctUpdatePulseSeries(last);
        }
    } catch (e) { console.error('_ctLoadHistory:', e); }
}

function _ctUpdatePulseSeries(point) {
    if (!point) return;
    if (_ctPulseSeries.tavg) _ctPulseSeries.tavg.data.setAll([{ time: point.time, tension_avg: point.tension_avg }]);
    if (_ctPulseSeries.f1) _ctPulseSeries.f1.data.setAll([{ time: point.time, f1: point.f1 }]);
    if (_ctPulseSeries.f2) _ctPulseSeries.f2.data.setAll([{ time: point.time, f2: point.f2 }]);
    if (_ctPulseSeries.f3) _ctPulseSeries.f3.data.setAll([{ time: point.time, f3: point.f3 }]);
}

function _ctUpdateLatestLabels(point) {
    if (!point) return;
    if (_ctLabelSeries.tavg) _ctLabelSeries.tavg.data.setAll([{ time: point.time, tension_avg: point.tension_avg }]);
    if (_ctLabelSeries.f1) _ctLabelSeries.f1.data.setAll([{ time: point.time, f1: point.f1 }]);
    if (_ctLabelSeries.f2) _ctLabelSeries.f2.data.setAll([{ time: point.time, f2: point.f2 }]);
    if (_ctLabelSeries.f3) _ctLabelSeries.f3.data.setAll([{ time: point.time, f3: point.f3 }]);
}

async function _ctLoadTableHistory() {
    try {
        const res = await fetch(CT_HISTORY_API + '&limit=100');
        if (!res.ok) return;
        _ctTableData = await res.json();
        _ctRenderTable();
    } catch (e) { console.error(e); }
}

// ── Chart (amCharts 5 + SHMChart) ──
let _ctSeriesMap = {};
let _ctAxisRefs = {};
let _ctPulseSeries = {};
let _ctLabelSeries = {};
let _ctTooltipSeries = null;

(function _ctInitChart() {
    var el = document.getElementById("ct-chart");
    if (!el) { setTimeout(_ctInitChart, 100); return; }
    if (typeof am5 === "undefined" || typeof SHMChart === "undefined") { setTimeout(_ctInitChart, 200); return; }

    try {
        const root = am5.Root.new(el);
        root.setThemes([am5themes_Animated.new(root)]);

        const chart = SHMChart.createXYChart(root);
        SHMChart.applyZoomButton(chart, root);
        const C = SHMChart.colors();
        const xAxis = SHMChart.createDateXAxis(chart, root, C);

        const yTension = SHMChart.createValueYAxis(chart, root, C, { opposite: false, min: 0 });
        const lblTension = SHMChart.addYLabel(yTension, root, 'Tension (kN)', C);
        _ctAxisRefs.yTension = yTension;
        _ctAxisRefs.lblTension = lblTension;

        const yFreq = SHMChart.createValueYAxis(chart, root, C, { opposite: true });
        const lblFreq = SHMChart.addYLabel(yFreq, root, 'Frequency (Hz)', C, true);
        yFreq.get('renderer').grid.template.set('visible', false);
        _ctAxisRefs.yFreq = yFreq;
        _ctAxisRefs.lblFreq = lblFreq;

        function makeSeries(name, field, yAxis, color) {
            const s = chart.series.push(am5xy.LineSeries.new(root, {
                name, xAxis, yAxis, valueYField: field, valueXField: 'time',
                stroke: am5.color(color)
            }));
            s.strokes.template.setAll({ strokeWidth: 2 });
            s.fills.template.setAll({ visible: false });

            s.bullets.push(function () {
                return am5.Bullet.new(root, {
                    sprite: am5.Circle.new(root, {
                        radius: 4,
                        fill: root.interfaceColors.get('background'),
                        stroke: am5.color(color),
                        strokeWidth: 2,
                        opacity: 0
                    })
                });
            });
            return s;
        }

        _ctSeriesMap.tavg = makeSeries('T_avg (kN)', 'tension_avg', yTension, 0x3b82f6);
        _ctSeriesMap.f1 = makeSeries('f₁ (Hz)', 'f1', yFreq, 0x22c55e);
        _ctSeriesMap.f2 = makeSeries('f₂ (Hz)', 'f2', yFreq, 0xf59e0b);
        _ctSeriesMap.f3 = makeSeries('f₃ (Hz)', 'f3', yFreq, 0x8b5cf6);

        // Soft area fill under primary T_avg line (like ATRH temperature fill)
        _ctSeriesMap.tavg.fills.template.set("visible", true);
        _ctSeriesMap.tavg.fills.template.set("fillOpacity", 0.08);
        _ctSeriesMap.tavg.fills.template.set("fill", am5.color(0x3b82f6));

        // ── Shared Tooltip Series (agar tooltip jelas terbaca) ──
        const tooltip = am5.Tooltip.new(root, {
            labelText: "{valueX.formatDate('dd MMM yyyy HH:mm:ss')}\n[bold]T_avg:[/] {tension_avg} kN\n[bold]f₁:[/] {f1} Hz\n[bold]f₂:[/] {f2} Hz\n[bold]f₃:[/] {f3} Hz",
            pointerOrientation: "horizontal"
        });
        tooltip.label.setAll({ fill: am5.color(0xffffff) });
        tooltip.label.adapters.add("fill", () => am5.color(0xffffff));

        const tooltipBg = tooltip.get("background");
        if (tooltipBg) {
            tooltipBg.setAll({
                fill: am5.color(0x3b82f6),
                fillOpacity: 0.92,
                strokeOpacity: 0,
                cornerRadiusTL: 6,
                cornerRadiusTR: 6,
                cornerRadiusBL: 6,
                cornerRadiusBR: 6
            });
            tooltipBg.adapters.add("fill", () => am5.color(0x3b82f6));
        }

        const tooltipSeries = chart.series.push(am5xy.LineSeries.new(root, {
            name: "Tooltip Series",
            xAxis,
            yAxis: yTension,
            valueYField: "tension_avg",
            valueXField: "time",
            opacity: 0,
            tooltip: tooltip
        }));
        tooltipSeries.strokes.template.set("visible", false);
        tooltipSeries.fills.template.set("visible", false);
        _ctTooltipSeries = tooltipSeries;

        // Hover bullets (tetap ada untuk semua series)
        Object.entries(_ctSeriesMap).forEach(([key, series]) => {
            let prevDI = null;
            series.on("tooltipDataItem", function (tooltipDataItem) {
                if (prevDI && prevDI.bullets) {
                    prevDI.bullets.forEach(function (b) { if (b.get("sprite")) b.get("sprite").set("opacity", 0); });
                }
                if (tooltipDataItem && tooltipDataItem.bullets) {
                    tooltipDataItem.bullets.forEach(function (b) { if (b.get("sprite")) b.get("sprite").set("opacity", 1); });
                }
                prevDI = tooltipDataItem;
            });
        });

        // Pulse series (circle blipper on latest data point)
        _ctPulseSeries.tavg = SHMChart.createPulseSeries(chart, root, xAxis, yTension, 'tension_avg', 0x3b82f6);
        _ctPulseSeries.f1 = SHMChart.createPulseSeries(chart, root, xAxis, yFreq, 'f1', 0x22c55e);
        _ctPulseSeries.f2 = SHMChart.createPulseSeries(chart, root, xAxis, yFreq, 'f2', 0xf59e0b);
        _ctPulseSeries.f3 = SHMChart.createPulseSeries(chart, root, xAxis, yFreq, 'f3', 0x8b5cf6);

        // ── Label on latest point (pill badge attached to last point) ──
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
                return am5.Bullet.new(root, { sprite: lbl });
            });
            return ls;
        }

        _ctLabelSeries.tavg = createLabelSeries(yTension, 0x3b82f6, 'tension_avg', ' kN', -18);
        _ctLabelSeries.f1 = createLabelSeries(yFreq, 0x22c55e, 'f1', ' Hz', -18);
        _ctLabelSeries.f2 = createLabelSeries(yFreq, 0xf59e0b, 'f2', ' Hz', -18);
        _ctLabelSeries.f3 = createLabelSeries(yFreq, 0x8b5cf6, 'f3', ' Hz', -18);



        // Thresholds on tension axis + zone background fills (like ATRH)
        SHMChart.addThreshold(yTension, root, TENSION_WARN_KN, 0xf59e0b, 'Warning: ' + TENSION_WARN_KN + ' kN');
        SHMChart.addThreshold(yTension, root, TENSION_CRITICAL_KN, 0xef4444, 'Critical: ' + TENSION_CRITICAL_KN + ' kN');
        yTension.set('max', TENSION_CRITICAL_KN * 1.15);

        if (Number.isFinite(TENSION_CRITICAL_KN) && TENSION_CRITICAL_KN > 0) {
            const critRange = yTension.createAxisRange(yTension.makeDataItem({
                value: TENSION_CRITICAL_KN,
                endValue: TENSION_CRITICAL_KN * 1.15
            }));
            critRange.get("grid").setAll({
                above: true,
                fill: am5.color(0xef4444),
                fillOpacity: 0.08,
                strokeOpacity: 0
            });
        }
        if (Number.isFinite(TENSION_WARN_KN) && TENSION_WARN_KN > 0) {
            const warnEnd = (Number.isFinite(TENSION_CRITICAL_KN) && TENSION_CRITICAL_KN > 0) ? TENSION_CRITICAL_KN : TENSION_WARN_KN * 1.15;
            const warnRange = yTension.createAxisRange(yTension.makeDataItem({
                value: TENSION_WARN_KN,
                endValue: warnEnd
            }));
            warnRange.get("grid").setAll({
                above: true,
                fill: am5.color(0xf59e0b),
                fillOpacity: 0.06,
                strokeOpacity: 0
            });
        }

        const cursor = chart.set('cursor', am5xy.XYCursor.new(root, { xAxis, behavior: 'zoomX', snapToSeries: [tooltipSeries] }));
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

        // ── Dynamic Tooltip Text & Legend Sync ──
        function updateTooltipText() {
            if (!tooltipSeries) return;
            let parts = ["{valueX.formatDate('dd MMM yyyy HH:mm:ss')}"];
            const tavgActive = !document.getElementById('legend-tavg')?.classList.contains('inactive');
            const f1Active = !document.getElementById('legend-f1')?.classList.contains('inactive');
            const f2Active = !document.getElementById('legend-f2')?.classList.contains('inactive');
            const f3Active = !document.getElementById('legend-f3')?.classList.contains('inactive');

            if (tavgActive) parts.push("[bold]T_avg:[/] {tension_avg} kN");
            if (f1Active) parts.push("[bold]f₁:[/] {f1} Hz");
            if (f2Active) parts.push("[bold]f₂:[/] {f2} Hz");
            if (f3Active) parts.push("[bold]f₃:[/] {f3} Hz");

            const tt = tooltipSeries.get("tooltip");
            if (tt) {
                tt.set("labelText", parts.join("\n"));
                if (tt.label) {
                    tt.label.setAll({ fill: am5.color(0xffffff) });
                    tt.label.adapters.add("fill", () => am5.color(0xffffff));
                }
                const bg = tt.get("background");
                if (bg) {
                    bg.setAll({
                        fill: am5.color(0x3b82f6),
                        fillOpacity: 0.92,
                        strokeOpacity: 0,
                        cornerRadiusTL: 6,
                        cornerRadiusTR: 6,
                        cornerRadiusBL: 6,
                        cornerRadiusBR: 6
                    });
                    bg.adapters.add("fill", () => am5.color(0x3b82f6));
                }
            }
            if (!tavgActive && !f1Active && !f2Active && !f3Active) {
                tooltipSeries.hide();
            } else {
                tooltipSeries.show();
            }

            if (tavgActive) _ctLabelSeries.tavg?.show(); else _ctLabelSeries.tavg?.hide();
            if (f1Active) _ctLabelSeries.f1?.show(); else _ctLabelSeries.f1?.hide();
            if (f2Active) _ctLabelSeries.f2?.show(); else _ctLabelSeries.f2?.hide();
            if (f3Active) _ctLabelSeries.f3?.show(); else _ctLabelSeries.f3?.hide();
        }

        function hideAxis(axis, label) {
            if (!axis) return;
            axis.hide();
            axis.set('visible', false);
            if (label) { label.hide(); label.set('visible', false); }
            const r = axis.get('renderer');
            if (r) {
                r.set('visible', false);
                if (r.gridContainer) r.gridContainer.set('visible', false);
                if (r.labelsContainer) r.labelsContainer.set('visible', false);
            }
        }
        function showAxis(axis, label) {
            if (!axis) return;
            axis.show();
            axis.set('visible', true);
            if (label) { label.show(); label.set('visible', true); }
            const r = axis.get('renderer');
            if (r) {
                r.set('visible', true);
                if (r.gridContainer) r.gridContainer.set('visible', true);
                if (r.labelsContainer) r.labelsContainer.set('visible', true);
            }
        }

        function syncLegendState() {
            const tavgActive = !document.getElementById('legend-tavg')?.classList.contains('inactive');
            const f1Active = !document.getElementById('legend-f1')?.classList.contains('inactive');
            const f2Active = !document.getElementById('legend-f2')?.classList.contains('inactive');
            const f3Active = !document.getElementById('legend-f3')?.classList.contains('inactive');

            if (!tavgActive) {
                hideAxis(yTension, lblTension);
            } else {
                showAxis(yTension, lblTension);
            }

            if (!f1Active && !f2Active && !f3Active) {
                hideAxis(yFreq, lblFreq);
            } else {
                showAxis(yFreq, lblFreq);
            }

            if (!tavgActive && (f1Active || f2Active || f3Active)) {
                const activeField = f1Active ? 'f1' : (f2Active ? 'f2' : 'f3');
                tooltipSeries.set("yAxis", yFreq);
                tooltipSeries.set("valueYField", activeField);
                tooltipSeries.data.setAll(_ctChartData);
                tooltipSeries.show();
                cursor.set("snapToSeries", [tooltipSeries]);
            } else if (tavgActive) {
                tooltipSeries.set("yAxis", yTension);
                tooltipSeries.set("valueYField", "tension_avg");
                tooltipSeries.data.setAll(_ctChartData);
                tooltipSeries.show();
                cursor.set("snapToSeries", [tooltipSeries]);
            } else {
                tooltipSeries.hide();
            }

            updateTooltipText();
        }

        function setupLegendToggle(elId, seriesKey, axis, label, pulseKey) {
            const el = document.getElementById(elId);
            if (!el) return;
            el.addEventListener('click', () => {
                const hide = !el.classList.contains('inactive');
                if (hide) {
                    el.classList.add('inactive');
                    _ctSeriesMap[seriesKey].hide();
                    if (_ctPulseSeries[pulseKey]) _ctPulseSeries[pulseKey].hide();
                } else {
                    el.classList.remove('inactive');
                    _ctSeriesMap[seriesKey].show();
                    if (_ctPulseSeries[pulseKey]) _ctPulseSeries[pulseKey].show();
                }
                syncLegendState();
            });
        }

        setupLegendToggle('legend-tavg', 'tavg', yTension, lblTension, 'tavg');
        setupLegendToggle('legend-f1', 'f1', yFreq, lblFreq, 'f1');
        setupLegendToggle('legend-f2', 'f2', yFreq, lblFreq, 'f2');
        setupLegendToggle('legend-f3', 'f3', yFreq, lblFreq, 'f3');

        // Streaming: polling fallback
        setInterval(async () => {
            if (!_ctStreaming) return;
            try {
                const res = await fetch(CT_HISTORY_API + '&limit=1');
                if (!res.ok) return;
                const data = await res.json();
                if (!data.length) return;
                const d = data[0];
                const t = _ctParseTime(d.time).getTime();
                const last = _ctChartData[_ctChartData.length - 1];
                if (last && t <= last.time) return;

                const pt = { time: t, tension_avg: d.tension_avg, f1: d.f1, f2: d.f2, f3: d.f3, t1: d.t1, t2: d.t2, t3: d.t3 };
                _ctChartData.push(pt);
                if (_ctChartData.length > 120) _ctChartData.shift();

                _ctSeriesMap.tavg.data.setAll(_ctChartData.map(p => ({ time: p.time, tension_avg: p.tension_avg })));
                _ctSeriesMap.f1.data.setAll(_ctChartData.map(p => ({ time: p.time, f1: p.f1 })));
                _ctSeriesMap.f2.data.setAll(_ctChartData.map(p => ({ time: p.time, f2: p.f2 })));
                _ctSeriesMap.f3.data.setAll(_ctChartData.map(p => ({ time: p.time, f3: p.f3 })));
                if (_ctTooltipSeries) _ctTooltipSeries.data.setAll(_ctChartData);

                _ctUpdatePulseSeries(pt);
                _ctUpdateLatestLabels(pt);

                _ctUpdateSummaryCards(d);
            } catch (e) { /* silently skip */ }
        }, 10000);

        SHMChart.watchTheme(() => {
            SHMChart.refreshAxisColors([xAxis, yTension, yFreq], [lblTension, lblFreq]);
            styleCursorLine();
        });

        _ctLoadHistory();
        _ctLoadTableHistory();
    } catch (e) { console.error('CT chart init failed:', e); }
})();

// ── Tab Switching ──
(function _ctInitTabs() {
    var btns = document.querySelectorAll('.tab-btn');
    if (!btns.length) { setTimeout(_ctInitTabs, 100); return; }
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            var tab = document.getElementById('tab-' + btn.dataset.tab);
            if (tab) tab.classList.add('active');
        });
    });
})();

// ── Start/Stop Button ──
(function _ctInitButton() {
    var btn = document.getElementById('btn-toggle-stream');
    if (!btn) { setTimeout(_ctInitButton, 100); return; }
    btn.addEventListener('click', async () => {
        _ctStreaming = !_ctStreaming;
        btn.textContent = _ctStreaming ? 'Stop' : 'Start';
        btn.classList.toggle('btn-stop', _ctStreaming);
        btn.classList.toggle('btn-start', !_ctStreaming);
        if (_ctStreaming) { await _ctLoadHistory(); await _ctLoadTableHistory(); }
    });
})();

// ── Capture ──
window.captureCableTension = function () {
    const target = document.getElementById('cableTensionCardArea');
    if (!target || typeof html2canvas === 'undefined') return;
    html2canvas(target, {
        useCORS: true, scale: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || '#ffffff'
    }).then(canvas => {
        const a = document.createElement('a');
        const d = new Date();
        a.download = `Cable_Tension_${SENSOR_ID}_${d.getDate()}${d.getMonth()+1}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    });
};

// ── Export PDF ──
document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    if (typeof jspdf === 'undefined') return;
    const res = await fetch(CT_HISTORY_API + '&limit=500');
    const data = await res.json();
    const { jsPDF } = jspdf;
    const doc = new jsPDF('landscape');
    doc.text('Cable Tension - ' + SENSOR_ID, 14, 15);
    doc.autoTable({
        head: [['Datetime', 'f1 (Hz)', 'f2 (Hz)', 'f3 (Hz)', 'T1 (kN)', 'T2 (kN)', 'T3 (kN)', 'T_avg (kN)']],
        body: data.map(d => [_ctParseTime(d.time).toLocaleString(), d.f1, d.f2, d.f3, d.t1, d.t2, d.t3, d.tension_avg]),
        startY: 20, styles: { fontSize: 7 },
        headStyles: { fillColor: [124, 58, 237] }
    });
    doc.save('cable_tension_' + SENSOR_ID + '.pdf');
});

// ── Export CSV ──
document.getElementById('btn-export-csv').addEventListener('click', async () => {
    const res = await fetch(CT_HISTORY_API + '&limit=500');
    const data = await res.json();
    let csv = 'Datetime,f1 (Hz),f2 (Hz),f3 (Hz),T1 (kN),T2 (kN),T3 (kN),T_avg (kN)\n';
    data.forEach(d => csv += `${_ctParseTime(d.time).toISOString()},${d.f1},${d.f2},${d.f3},${d.t1},${d.t2},${d.t3},${d.tension_avg}\n`);
    const a = document.createElement('a');
    a.download = 'cable_tension_' + SENSOR_ID + '.csv';
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.click();
});

// ═══════════════════════════════════════════════════════════════════════
//  DATA NORMALISATION & THERMAL COMPENSATION MODULE
//  Based on Chapter 12 - Farrar & Worden (2013)
// ═══════════════════════════════════════════════════════════════════════

let _normResidualRoot = null;
let _normScatterRoot = null;

document.getElementById('btn-load-normalisation')?.addEventListener('click', async () => {
    const target = document.getElementById('norm-target-select')?.value || 'tension_avg';
    const btn = document.getElementById('btn-load-normalisation');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

    try {
        const url = `/api/cable-tension/normalized?sensor_id=${SENSOR_ID}&target=${target}&limit=500`;
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            alert('Error: ' + (err.error || 'Unknown error'));
            return;
        }
        const result = await res.json();
        _renderNormCards(result);
        _renderResidualChart(result);
        _renderScatterChart(result);
    } catch (e) {
        console.error('Normalisation error:', e);
        alert('Failed to load normalisation data.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-chart-line"></i> Analyze';
    }
});

function _renderNormCards(result) {
    document.getElementById('norm-model-cards').style.display = 'grid';
    document.getElementById('norm-slope').textContent = result.model.slope;
    document.getElementById('norm-intercept').textContent = result.model.intercept;
    document.getElementById('norm-r2').textContent = result.model.r2_score;
    document.getElementById('norm-std').textContent = result.spc.std_residual;
    document.getElementById('norm-outliers').textContent = result.spc.outliers_count;
}

function _renderResidualChart(result) {
    document.getElementById('normResidualCardArea').style.display = 'block';

    // Dispose previous chart
    if (_normResidualRoot) { _normResidualRoot.dispose(); }
    _normResidualRoot = am5.Root.new('norm-residual-chart');
    const root = _normResidualRoot;
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(am5xy.XYChart.new(root, {
        panX: true, panY: false, wheelX: 'panX', wheelY: 'zoomX',
        layout: root.verticalLayout
    }));

    const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: 'minute', count: 1 },
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 60 }),
        tooltip: am5.Tooltip.new(root, {})
    }));

    const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {})
    }));
    yAxis.children.unshift(am5.Label.new(root, {
        text: 'Residual', rotation: -90, y: am5.p50,
        centerX: am5.p50, fontSize: 11, fill: am5.color(0x94a3b8)
    }));

    // UCL line
    const uclRange = yAxis.createAxisRange(yAxis.makeDataItem({ value: result.spc.ucl_3sigma }));
    uclRange.get('grid').setAll({ stroke: am5.color(0x22c55e), strokeDasharray: [6, 4], strokeOpacity: 0.8, strokeWidth: 1.5 });
    uclRange.get('label').setAll({ text: 'UCL ' + result.spc.ucl_3sigma.toFixed(2), fill: am5.color(0x22c55e), fontSize: 10 });

    // LCL line
    const lclRange = yAxis.createAxisRange(yAxis.makeDataItem({ value: result.spc.lcl_3sigma }));
    lclRange.get('grid').setAll({ stroke: am5.color(0x22c55e), strokeDasharray: [6, 4], strokeOpacity: 0.8, strokeWidth: 1.5 });
    lclRange.get('label').setAll({ text: 'LCL ' + result.spc.lcl_3sigma.toFixed(2), fill: am5.color(0x22c55e), fontSize: 10 });

    // Mean line
    const meanRange = yAxis.createAxisRange(yAxis.makeDataItem({ value: result.spc.mean_residual }));
    meanRange.get('grid').setAll({ stroke: am5.color(0x94a3b8), strokeDasharray: [3, 3], strokeOpacity: 0.5, strokeWidth: 1 });

    // Residual series
    const series = chart.series.push(am5xy.LineSeries.new(root, {
        name: 'Residual',
        xAxis, yAxis,
        valueXField: 'time',
        valueYField: 'residual',
        stroke: am5.color(0x3b82f6),
        tooltip: am5.Tooltip.new(root, {
            labelText: "{valueX.formatDate('dd MMM yyyy HH:mm')}\nResidual: {valueY.formatNumber('#.###')}"
        })
    }));
    series.strokes.template.setAll({ strokeWidth: 1.5 });

    // Tooltip styling
    const sttBg = series.get('tooltip')?.get('background');
    if (sttBg) {
        sttBg.setAll({ fill: am5.color(0x3b82f6), fillOpacity: 0.92, strokeOpacity: 0, cornerRadiusTL: 6, cornerRadiusTR: 6, cornerRadiusBL: 6, cornerRadiusBR: 6 });
    }
    if (series.get('tooltip')?.label) {
        series.get('tooltip').label.setAll({ fill: am5.color(0xffffff) });
    }

    // Bullets: red for outliers, blue for normal
    const ucl = result.spc.ucl_3sigma;
    const lcl = result.spc.lcl_3sigma;
    series.bullets.push(() => {
        const circle = am5.Circle.new(root, {
            radius: 3,
            fill: am5.color(0x3b82f6),
            strokeOpacity: 0
        });
        circle.adapters.add('fill', (fill, target) => {
            const dataItem = target.dataItem;
            if (dataItem) {
                const r = dataItem.get('valueY');
                if (r > ucl || r < lcl) return am5.color(0xef4444);
            }
            return fill;
        });
        circle.adapters.add('radius', (radius, target) => {
            const dataItem = target.dataItem;
            if (dataItem) {
                const r = dataItem.get('valueY');
                if (r > ucl || r < lcl) return 5;
            }
            return radius;
        });
        return am5.Bullet.new(root, { sprite: circle });
    });

    // Data
    const chartData = result.data.map(d => ({
        time: new Date(d.time).getTime(),
        residual: d.residual
    }));
    series.data.setAll(chartData);

    // Cursor
    const cursor = chart.set('cursor', am5xy.XYCursor.new(root, { xAxis, behavior: 'zoomX' }));
    cursor.lineY.set('visible', false);

    chart.appear(1000, 100);
}

function _renderScatterChart(result) {
    document.getElementById('normScatterCardArea').style.display = 'block';

    // Dispose previous chart
    if (_normScatterRoot) { _normScatterRoot.dispose(); }
    _normScatterRoot = am5.Root.new('norm-scatter-chart');
    const root = _normScatterRoot;
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(am5xy.XYChart.new(root, {
        panX: true, panY: true, wheelY: 'zoomXY',
        layout: root.verticalLayout
    }));

    const xAxis = chart.xAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 50 }),
        tooltip: am5.Tooltip.new(root, {})
    }));
    xAxis.children.push(am5.Label.new(root, {
        text: 'Temperature (°C)', x: am5.p50, centerX: am5.p50,
        fontSize: 11, fill: am5.color(0x94a3b8)
    }));

    const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {})
    }));
    yAxis.children.unshift(am5.Label.new(root, {
        text: result.target_field, rotation: -90, y: am5.p50,
        centerX: am5.p50, fontSize: 11, fill: am5.color(0x94a3b8)
    }));

    // Scatter series (data points)
    const scatter = chart.series.push(am5xy.LineSeries.new(root, {
        name: 'Data Points',
        xAxis, yAxis,
        valueXField: 'temperature',
        valueYField: 'raw_value',
        tooltip: am5.Tooltip.new(root, {
            labelText: "Temp: {valueX}°C\nValue: {valueY.formatNumber('#.###')}"
        })
    }));
    scatter.strokes.template.set('visible', false);
    scatter.bullets.push(() => {
        return am5.Bullet.new(root, {
            sprite: am5.Circle.new(root, {
                radius: 4, fill: am5.color(0xf59e0b),
                fillOpacity: 0.7, strokeOpacity: 0
            })
        });
    });

    // Scatter tooltip styling
    const scttBg = scatter.get('tooltip')?.get('background');
    if (scttBg) {
        scttBg.setAll({ fill: am5.color(0x3b82f6), fillOpacity: 0.92, strokeOpacity: 0, cornerRadiusTL: 6, cornerRadiusTR: 6, cornerRadiusBL: 6, cornerRadiusBR: 6 });
    }
    if (scatter.get('tooltip')?.label) {
        scatter.get('tooltip').label.setAll({ fill: am5.color(0xffffff) });
    }

    // Regression line series
    const a = result.model.slope;
    const b = result.model.intercept;
    const temps = result.data.map(d => d.temperature);
    const tMin = Math.min(...temps);
    const tMax = Math.max(...temps);

    const regLine = chart.series.push(am5xy.LineSeries.new(root, {
        name: 'Regression',
        xAxis, yAxis,
        valueXField: 'temperature',
        valueYField: 'predicted',
        stroke: am5.color(0xef4444)
    }));
    regLine.strokes.template.setAll({ strokeWidth: 2, strokeDasharray: [6, 3] });

    // Set data
    scatter.data.setAll(result.data.map(d => ({
        temperature: d.temperature,
        raw_value: d.raw_value
    })));

    regLine.data.setAll([
        { temperature: tMin, predicted: a * tMin + b },
        { temperature: tMax, predicted: a * tMax + b }
    ]);

    // Cursor
    chart.set('cursor', am5xy.XYCursor.new(root, { behavior: 'zoomXY' }));

    chart.appear(1000, 100);
}
