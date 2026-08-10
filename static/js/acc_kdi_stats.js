/**
 * Acc KDI Statistics & Historical Analysis
 * Handles Tab switching, Filters, and Trend Charts
 */

document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    initStatsChart();
    initHistory();
});

// --- Tab Logic ---
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');

            // Toggle buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle contents
            tabContents.forEach(p => {
                p.classList.remove('active');
                if (p.id === 'tab-' + target) {
                    p.classList.add('active');
                }
            });

            // Special handling if switching to statistics
            if (target === 'statistik') {
                // Trigger chart resize or initial load if needed
                if (window.statsChartRoot) {
                    // Force refresh layout
                }
            }
        });
    });
}


// --- Chart Logic (amCharts 5) ---
let statsChartRoot = null;
let statsSeries = {};

function initStatsChart() {
    const chartDiv = document.getElementById('stats-chart');
    if (!chartDiv) return;

    // Create root element
    const root = am5.Root.new("stats-chart");
    statsChartRoot = root;

    // Set themes
    root.setThemes([am5themes_Animated.new(root)]);

    // Create chart
    const chart = root.container.children.push(am5xy.XYChart.new(root, {
        panX: true,
        panY: true,
        wheelX: "panX",
        wheelY: "zoomX",
        pinchZoomX: true
    }));

    // Add cursor
    const cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
        behavior: "zoomX"
    }));
    cursor.lineY.set("visible", false);

    // Create axes
    const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
        maxDeviation: 0.2,
        baseInterval: { timeUnit: "minute", count: 2 },
        renderer: am5xy.AxisRendererX.new(root, {
            minorGridEnabled: true
        }),
        tooltip: am5.Tooltip.new(root, {}) // X-axis date tooltip (black one at bottom)
    }));

    const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        extraMax: 0.1, // 1.1x headroom
        renderer: am5xy.AxisRendererY.new(root, {
            pan: "zoom"
        })
    }));

    yAxis.children.unshift(am5.Label.new(root, {
        text: "Frequency (Hz)",
        textAlign: 'center',
        y: am5.p50,
        rotation: -90,
        fontWeight: "bold",
        fill: am5.color(0x64748b)
    }));

    // Create Series helper
    function createSeries(name, field, color) {
        const series = chart.series.push(am5xy.LineSeries.new(root, {
            name: name,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "time",
            stroke: color,
            tooltip: am5.Tooltip.new(root, {
                labelText: "Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n{name}: [bold]{valueY}[/] Hz",
                pointerOrientation: "horizontal",
                getFillFromSprite: false,
                autoTextColor: false
            })
        }));

        series.get("tooltip").get("background").setAll({
            fill: color,
            fillOpacity: 0.9,
            strokeOpacity: 0
        });

        series.get("tooltip").label.setAll({
            fill: am5.color(0xffffff)
        });

        series.fills.template.setAll({
            fillOpacity: 0,
            visible: false
        });

        series.strokes.template.setAll({
            strokeWidth: 2
        });

        // Add hollow bullets (rings)
        series.bullets.push(function () {
            return am5.Bullet.new(root, {
                sprite: am5.Circle.new(root, {
                    radius: 4,
                    fill: root.interfaceColors.get("background"),
                    stroke: series.get("stroke"),
                    strokeWidth: 2
                })
            });
        });

        series.data.setAll([]);
        statsSeries[field] = series;

        // Custom legend marker: Murni Garis (Line) tanpa Bullet
        series.set("legendMarker", am5.RoundedRectangle.new(root, {
            width: 24,
            height: 3,
            centerY: am5.p50,
            fill: color
        }));

        return series;
    }

    createSeries("X-Axis Peak", "x_f1", am5.color(0xef4444));
    createSeries("Y-Axis Peak", "y_f1", am5.color(0x3b82f6));
    createSeries("Z-Axis Peak", "z_f1", am5.color(0x22c55e));

    // Update cursor to show all tooltips simultaneously
    chart.set("cursor", am5xy.XYCursor.new(root, {
        behavior: "zoomX",
        xAxis: xAxis
    }));

    // Toggle logic for custom HTML legend
    const legendX = document.getElementById('legend-stat-x');
    const legendY = document.getElementById('legend-stat-y');
    const legendZ = document.getElementById('legend-stat-z');

    function bindLegend(el, series) {
        if (!el) return;
        el.addEventListener('click', () => {
            if (series.isHidden()) {
                series.show();
                el.style.opacity = '1';
            } else {
                series.hide();
                el.style.opacity = '0.5';
            }
        });
    }

    bindLegend(legendX, statsSeries['x_f1']);
    bindLegend(legendY, statsSeries['y_f1']);
    bindLegend(legendZ, statsSeries['z_f1']);


    // Initial load
    const yearSelect = document.getElementById('select-stat-year');
    const monthSelect = document.getElementById('select-stat-month');
    const weekSelect = document.getElementById('select-stat-week');
    const fromInput = document.getElementById('input-stat-start');
    const toInput = document.getElementById('input-stat-end');
    const searchBtn = document.getElementById('btn-stat-search');
    const optionSelect = document.getElementById('select-stat-option');

    if (!searchBtn) return;

    // Initialize Flatpickr
    const fpStart = flatpickr(fromInput, {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        allowInput: true
    });
    const fpEnd = flatpickr(toInput, {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        allowInput: true
    });

    // Link Calendar Buttons
    document.getElementById('btn-stat-start-cal')?.addEventListener('click', () => fpStart.open());
    document.getElementById('btn-stat-end-cal')?.addEventListener('click', () => fpEnd.open());

    // Load default data on init (Last 24 Hours)
    const defaultNow = new Date();
    const defaultPast = new Date(defaultNow.getTime() - 24 * 60 * 60 * 1000);

    // Set the inputs
    fromInput.value = defaultPast.toLocaleString('sv').replace(' ', 'T').slice(0, 19).replace('T', ' ');
    toInput.value = defaultNow.toLocaleString('sv').replace(' ', 'T').slice(0, 19).replace('T', ' ');

    setTimeout(() => {
        if (searchBtn) searchBtn.click();
    }, 500);

    // --- Dynamic Dropdowns from weekly_periods ---
    // Remove hide logic to keep them always visible like ANM3D
    const monthParent = monthSelect.closest('.col-md-4');
    const weekParent = weekSelect.closest('.col-md-4');

    // Load Years
    fetch('/api/weekly_periods/years')
        .then(res => res.json())
        .then(years => {
            yearSelect.innerHTML = '<option value="" disabled selected>Pilih Tahun</option>'; // Mencegah duplikasi dari HTML hardcode
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
        
        // Reset and disable children if no year selected
        if (!yearSelect.value) {
            monthSelect.disabled = true;
            weekSelect.disabled = true;
            return;
        }

        const res = await fetch(`/api/weekly_periods/months?year=${yearSelect.value}`);
        const months = await res.json();
        const monthOrder = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

        months.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = m;
            monthSelect.appendChild(opt);
        });
        
        // Enable month dropdown after population
        monthSelect.disabled = false;
        weekSelect.disabled = true; // Week remains disabled until month is chosen
    });

    // Month -> Week cascade
    monthSelect.addEventListener('change', async () => {
        weekSelect.innerHTML = '<option value="">Pilih Minggu</option>';
        
        // Disable week dropdown if no month selected
        if (!monthSelect.value) {
            weekSelect.disabled = true;
            return;
        }

        const res = await fetch(`/api/weekly_periods/weeks?year=${yearSelect.value}&month=${monthSelect.value}`);
        const weeks = await res.json();
        window._statWeeks = weeks;

        weeks.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.periode_label;
            opt.textContent = w.periode_label; // Mengacu pada periode_label
            weekSelect.appendChild(opt);
        });
        
        // Enable week dropdown after population
        weekSelect.disabled = false;
    });

    // Week selection -> Auto fill range
    weekSelect.addEventListener('change', () => {
        if (!weekSelect.value || !window._statWeeks) return;
        const selected = window._statWeeks.find(w => w.periode_label === weekSelect.value);
        if (selected) {
            const startStr = selected.start_date.replace('T', ' ').split('.')[0];
            const endStr = selected.end_date.replace('T', ' ').split('.')[0];
            fromInput.value = startStr;
            toInput.value = endStr;
            fpStart.setDate(startStr);
            fpEnd.setDate(endStr);
        }
    });

    // Set default date range (last 7 days)
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    fpStart.setDate(lastWeek);
    fpEnd.setDate(now);

    searchBtn.addEventListener('click', () => {
        const sensorId = window.ACC_ID;
        const fromDate = fromInput.value;
        const toDate = toInput.value;

        if (!fromDate || !toDate) {
            alert("Please select date range");
            return;
        }

        loadStatisticsData(sensorId, fromDate, toDate);
    });

    loadStatisticsData();
}

async function loadStatisticsData(sensorId, fromDate, toDate) {
    if (!sensorId) sensorId = window.ACC_ID;
    if (!fromDate) fromDate = document.getElementById('input-stat-start').value;
    if (!toDate) toDate = document.getElementById('input-stat-end').value;

    if (!sensorId) return;

    try {
        const url = `/api/acc_kdi/statistics?sensor_id=${sensorId}&start_date=${encodeURIComponent(fromDate)}&end_date=${encodeURIComponent(toDate)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        // Process data for amCharts (convert ISO strings to timestamps)
        const processed = data.map(d => ({
            ...d,
            time: new Date(d.time).getTime()
        }));

        // Update series
        Object.values(statsSeries).forEach(s => {
            s.data.setAll(processed);
        });

        // Calculate and update footer stats
        updateFooterStats(data);

        console.log(`[STATS] Loaded ${data.length} records for ${sensorId}`);
    } catch (err) {
        console.error("[STATS] Error loading data:", err);
    }
}

function updateFooterStats(data) {
    if (!data || data.length === 0) return;

    const axes = ['x', 'y', 'z'];
    axes.forEach(axis => {
        const field = `${axis}_f1`;
        const vals = data.map(d => d[field]).filter(v => v !== null && v !== undefined);

        if (vals.length > 0) {
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const sum = vals.reduce((a, b) => a + b, 0);
            const avg = sum / vals.length;

            document.getElementById(`stat-summary-min-${axis}`).innerText = min.toFixed(2);
            document.getElementById(`stat-summary-max-${axis}`).innerText = max.toFixed(2);
            document.getElementById(`stat-summary-avg-${axis}`).innerText = avg.toFixed(2);
        } else {
            document.getElementById(`stat-summary-min-${axis}`).innerText = "--";
            document.getElementById(`stat-summary-max-${axis}`).innerText = "--";
            document.getElementById(`stat-summary-avg-${axis}`).innerText = "--";
        }
    });
}

// ============================================================
// --- History Data Tab ---
// ============================================================
function initHistory() {
    const startInput = document.getElementById('input-history-start');
    const endInput   = document.getElementById('input-history-end');
    const searchBtn  = document.getElementById('btn-history-search');
    const exportBtn  = document.getElementById('btn-history-export-csv');
    const tableBody  = document.getElementById('history-table-body');
    const recordCount = document.getElementById('history-record-count');
    const yearSel    = document.getElementById('select-hist-year');
    const monthSel   = document.getElementById('select-hist-month');
    const weekSel    = document.getElementById('select-hist-week');
    const optionSel  = document.getElementById('select-hist-option');

    if (!startInput || !searchBtn) return;

    // ── Flatpickr ──────────────────────────────────────────────
    const fpStart = flatpickr(startInput, { enableTime: true, dateFormat: "Y-m-d H:i:S", time_24hr: true, allowInput: true });
    const fpEnd   = flatpickr(endInput,   { enableTime: true, dateFormat: "Y-m-d H:i:S", time_24hr: true, allowInput: true });
    document.getElementById('btn-history-start-cal')?.addEventListener('click', () => fpStart.open());
    document.getElementById('btn-history-end-cal')?.addEventListener('click',   () => fpEnd.open());

    // Default: 24h terakhir
    const hNow  = new Date();
    const hPast = new Date(hNow.getTime() - 24 * 60 * 60 * 1000);
    startInput.value = hPast.toLocaleString('sv').replace('T', ' ').slice(0, 19);
    endInput.value   = hNow.toLocaleString('sv').replace('T', ' ').slice(0, 19);

    // ── Cascading Dropdowns ─────────────────────────────────────
    fetch('/api/weekly_periods/years')
        .then(r => r.json())
        .then(years => {
            yearSel.innerHTML = '<option value="" disabled selected>Pilih Tahun</option>';
            years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; yearSel.appendChild(o); });
        });

    yearSel.addEventListener('change', async () => {
        monthSel.innerHTML = '<option value="" disabled selected>Pilih Bulan</option>';
        weekSel.innerHTML  = '<option value="" disabled selected>Pilih Periode</option>';
        monthSel.disabled = true; weekSel.disabled = true;
        if (!yearSel.value) return;
        const months = await (await fetch(`/api/weekly_periods/months?year=${yearSel.value}`)).json();
        const order  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
        months.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        months.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; monthSel.appendChild(o); });
        monthSel.disabled = false;
    });

    monthSel.addEventListener('change', async () => {
        weekSel.innerHTML = '<option value="" disabled selected>Pilih Periode</option>';
        weekSel.disabled = true;
        if (!monthSel.value) return;
        const weeks = await (await fetch(`/api/weekly_periods/weeks?year=${yearSel.value}&month=${monthSel.value}`)).json();
        window._histWeeks = weeks;
        weeks.forEach(w => { const o = document.createElement('option'); o.value = w.periode_label; o.textContent = w.periode_label; weekSel.appendChild(o); });
        weekSel.disabled = false;
    });

    weekSel.addEventListener('change', () => {
        if (!weekSel.value || !window._histWeeks) return;
        const sel = window._histWeeks.find(w => w.periode_label === weekSel.value);
        if (sel) {
            startInput.value = sel.start_date.replace('T',' ').split('.')[0];
            endInput.value   = sel.end_date.replace('T',' ').split('.')[0];
        }
    });

    // ── amCharts History Chart (9 series: f1/f2/f3 × X/Y/Z) ────
    let histRoot = null, histChart = null, histSeries = {};

    // Series definitions: [key, valueField, color, legendId]
    const SERIES_DEF = [
        { key: 'x1', field: 'x_f1', color: 0xef4444, legId: 'legend-hist-x1', freq: 'f1' },
        { key: 'x2', field: 'x_f2', color: 0xfb923c, legId: 'legend-hist-x2', freq: 'f2' },
        { key: 'x3', field: 'x_f3', color: 0xfbbf24, legId: 'legend-hist-x3', freq: 'f3' },
        { key: 'y1', field: 'y_f1', color: 0x6b8ef5, legId: 'legend-hist-y1', freq: 'f1' },
        { key: 'y2', field: 'y_f2', color: 0x93c5fd, legId: 'legend-hist-y2', freq: 'f2' },
        { key: 'y3', field: 'y_f3', color: 0xbfdbfe, legId: 'legend-hist-y3', freq: 'f3' },
        { key: 'z1', field: 'z_f1', color: 0x22c55e, legId: 'legend-hist-z1', freq: 'f1' },
        { key: 'z2', field: 'z_f2', color: 0x4ade80, legId: 'legend-hist-z2', freq: 'f2' },
        { key: 'z3', field: 'z_f3', color: 0x86efac, legId: 'legend-hist-z3', freq: 'f3' },
    ];

    function buildHistChart() {
        if (histRoot) histRoot.dispose();
        histRoot = am5.Root.new("history-chart");
        histRoot.setThemes([am5themes_Animated.new(histRoot)]);

        histChart = histRoot.container.children.push(am5xy.XYChart.new(histRoot, {
            panX: false,
            panY: false,
            wheelX: "panX",
            wheelY: "zoomX",
            pinchZoomX: true
        }));

        // Add standard SHM Zoom Out button (like anm3d)
        if (typeof SHMChart !== 'undefined') {
            SHMChart.applyZoomButton(histChart, histRoot);
        }

        // Cursor — vertical line only (like reference)
        const cursor = histChart.set("cursor", am5xy.XYCursor.new(histRoot, {
            behavior: "zoomX"
        }));
        cursor.lineY.set("visible", false);

        // X-Axis (DateTime) — with pill tooltip at bottom
        const xAxis = histChart.xAxes.push(am5xy.DateAxis.new(histRoot, {
            maxDeviation: 0.2,
            baseInterval: { timeUnit: "minute", count: 2 },
            renderer: am5xy.AxisRendererX.new(histRoot, { minorGridEnabled: true }),
            tooltip: am5.Tooltip.new(histRoot, {})   // dark date pill at bottom
        }));

        // Y-Axis — with slight headroom
        const yAxis = histChart.yAxes.push(am5xy.ValueAxis.new(histRoot, {
            extraMax: 0.1,
            renderer: am5xy.AxisRendererY.new(histRoot, { pan: "zoom" })
        }));
        yAxis.children.unshift(am5.Label.new(histRoot, {
            text: "Frequency (Hz)",
            textAlign: "center",
            y: am5.p50,
            rotation: -90,
            fontWeight: "bold",
            fill: am5.color(0x64748b)
        }));

        // Helper: create one series — same as Statistik createSeries
        function mkSeries(name, field, colorHex) {
            const color = am5.color(colorHex);
            const s = histChart.series.push(am5xy.LineSeries.new(histRoot, {
                name,
                xAxis,
                yAxis,
                valueYField: field,
                valueXField: "time",
                stroke: color,
                tooltip: am5.Tooltip.new(histRoot, {
                    labelText: "Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n{name}: [bold]{valueY.formatNumber('#.####')}[/] Hz",
                    pointerOrientation: "horizontal",
                    getFillFromSprite: false,
                    autoTextColor: false
                })
            }));

            // Tooltip background matches series color
            s.get("tooltip").get("background").setAll({ fill: color, fillOpacity: 0.9, strokeOpacity: 0 });
            s.get("tooltip").label.setAll({ fill: am5.color(0xffffff) });

            // No fill under the line
            s.fills.template.setAll({ fillOpacity: 0, visible: false });
            s.strokes.template.setAll({ strokeWidth: 2 });

            // Hollow ring bullets — identical to Statistik chart
            s.bullets.push(function () {
                return am5.Bullet.new(histRoot, {
                    sprite: am5.Circle.new(histRoot, {
                        radius: 4,
                        fill: histRoot.interfaceColors.get("background"),  // white ring center
                        stroke: s.get("stroke"),
                        strokeWidth: 2
                    })
                });
            });

            s.data.setAll([]);
            return s;
        }

        // Create all 9 series
        SERIES_DEF.forEach(def => {
            histSeries[def.key] = mkSeries(def.key.replace('1','f1').replace('2','f2').replace('3','f3').toUpperCase(), def.field, def.color);

            // Legend click-toggle
            const leg = document.getElementById(def.legId);
            if (leg) {
                const s = histSeries[def.key];
                leg.addEventListener('click', () => {
                    if (s.isHidden()) { s.show(); leg.style.opacity = '1'; }
                    else { s.hide(); leg.style.opacity = '0.5'; }
                });
            }
        });

        // ── Cursor: zoom area (kiri→kanan = zoom, kanan→kiri = reset) ──
        const finalCursor = histChart.set("cursor", am5xy.XYCursor.new(histRoot, {
            behavior: "zoomX",
            xAxis: xAxis
        }));
        finalCursor.lineY.set("visible", false);

        let _zoomStartX = null;
        finalCursor.events.on("selectstarted", function () {
            _zoomStartX = finalCursor.getPrivate("positionX");
        });

        finalCursor.events.on("selectended", function () {
            const endX = finalCursor.getPrivate("positionX");
            const startX = _zoomStartX;
            
            if (startX !== null && endX < startX - 0.02) {
                // Drag Kanan ke Kiri -> Reset ke Full Range
                // Pakai setTimeout agar tidak konflik dengan internal zoom amCharts
                setTimeout(() => {
                    xAxis.zoomToValues(
                        xAxis.getPrivate("min"),
                        xAxis.getPrivate("max"),
                        500
                    );
                }, 100);
            }
            _zoomStartX = null;
        });

    }


    // ── Filter series by Option selection ────────────────────────
    function filterByOption(val) {
        SERIES_DEF.forEach(def => {
            const s   = histSeries[def.key];
            const leg = document.getElementById(def.legId);
            if (!s) return;
            const visible = (val === 'all') || (val === def.freq);
            if (visible) { s.show(); if (leg) leg.style.display = ''; }
            else         { s.hide(); if (leg) leg.style.display = 'none'; }
        });
    }

    // React to Option change without re-fetching
    optionSel?.addEventListener('change', () => filterByOption(optionSel.value));


    buildHistChart();

    // ── Render Table & Chart ─────────────────────────────────────
    let historyData = [];

    function renderAll(data) {
        historyData = data;

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="21" style="text-align:center;padding:40px;color:#94a3b8;">Tidak ada data untuk rentang waktu ini.</td></tr>';
            recordCount.textContent = '— 0 records —';
            Object.values(histSeries).forEach(s => s.data.setAll([]));
            return;
        }

        recordCount.textContent = `✓ ${data.length} records`;

        // Push data to all 9 chart series
        const processed = data.map(d => ({ ...d, time: new Date(d.time).getTime() }));
        Object.values(histSeries).forEach(s => s.data.setAll(processed));

        // Apply current option filter
        filterByOption(optionSel?.value || 'f1');

        // Render table (always show all f1/f2/f3 columns)
        const fmt = v => (v !== null && v !== undefined) ? parseFloat(v).toFixed(4) : '—';
        tableBody.innerHTML = data.map(row => {
            const dt    = new Date(row.time);
            const dtStr = dt.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
            return `<tr>
                <td style="white-space:nowrap;font-size:12px;">${dtStr}</td>
                <td style="font-size:12px;">${row.sensor_id||'—'}</td>
                <td style="color:#ef4444;">${fmt(row.x_f1)}</td><td>${fmt(row.x_m1)}</td>
                <td style="color:#fb923c;">${fmt(row.x_f2)}</td><td>${fmt(row.x_m2)}</td>
                <td style="color:#fbbf24;">${fmt(row.x_f3)}</td><td>${fmt(row.x_m3)}</td>
                <td style="color:#6b8ef5;">${fmt(row.y_f1)}</td><td>${fmt(row.y_m1)}</td>
                <td style="color:#93c5fd;">${fmt(row.y_f2)}</td><td>${fmt(row.y_m2)}</td>
                <td style="color:#bfdbfe;">${fmt(row.y_f3)}</td><td>${fmt(row.y_m3)}</td>
                <td style="color:#22c55e;">${fmt(row.z_f1)}</td><td>${fmt(row.z_m1)}</td>
                <td style="color:#4ade80;">${fmt(row.z_f2)}</td><td>${fmt(row.z_m2)}</td>
                <td style="color:#86efac;">${fmt(row.z_f3)}</td><td>${fmt(row.z_m3)}</td>
                <td style="font-size:11px;color:#94a3b8;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;" title="${row.filename||''}">${row.filename||'—'}</td>
            </tr>`;
        }).join('');
    }


    // ── Fetch ───────────────────────────────────────────────────
    async function loadHistory() {
        const sensorId = window.ACC_ID;
        const fromDate = startInput.value;
        const toDate   = endInput.value;
        if (!sensorId) return;
        if (!fromDate || !toDate) { alert("Pilih rentang tanggal."); return; }

        tableBody.innerHTML = '<tr><td colspan="21" style="text-align:center;padding:40px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</td></tr>';
        recordCount.textContent = '— Memuat... —';

        try {
            const url = `/api/acc_kdi/statistics?sensor_id=${sensorId}&start_date=${encodeURIComponent(fromDate)}&end_date=${encodeURIComponent(toDate)}`;
            const data = await (await fetch(url)).json();
            renderAll(data);
        } catch(e) {
            console.error('[HISTORY]', e);
            tableBody.innerHTML = '<tr><td colspan="21" style="text-align:center;padding:40px;color:#ef4444;">Gagal memuat data.</td></tr>';
            recordCount.textContent = '— Error —';
        }
    }

    searchBtn.addEventListener('click', loadHistory);

    // ── CSV Export ──────────────────────────────────────────────
    exportBtn?.addEventListener('click', () => {
        if (!historyData.length) { alert("Tidak ada data."); return; }
        const hdr  = ['Datetime','Sensor ID','x_f1','x_m1','x_f2','x_m2','x_f3','x_m3','y_f1','y_m1','y_f2','y_m2','y_f3','y_m3','z_f1','z_m1','z_f2','z_m2','z_f3','z_m3','filename'];
        const rows = historyData.map(r => [r.time,r.sensor_id,r.x_f1,r.x_m1,r.x_f2,r.x_m2,r.x_f3,r.x_m3,r.y_f1,r.y_m1,r.y_f2,r.y_m2,r.y_f3,r.y_m3,r.z_f1,r.z_m1,r.z_f2,r.z_m2,r.z_f3,r.z_m3,r.filename||''].map(v=>v??''));
        const csv  = [hdr,...rows].map(r=>r.join(',')).join('\n');
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
        a.download = `acc_fft_history_${window.ACC_ID}_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    });

    // Auto-load when tab opened
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === 'history') {
            btn.addEventListener('click', () => { if (!historyData.length) loadHistory(); });
        }
    });
}

// Capture helper for History chart
function captureAccKdiHistory() {
    const el = document.getElementById('history-chart');
    if (!el) return;
    import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js').catch(() => {});
    if (window.html2canvas) {
        html2canvas(el).then(c => { const a=document.createElement('a'); a.download='history_chart.png'; a.href=c.toDataURL(); a.click(); });
    }
}

