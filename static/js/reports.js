// ==========================================
// Report Generation Logic
// ==========================================

let root;
let chart;
let tempSeries;
let rhSeries;
let xAxis;
let yAxisTemp;
let yAxisRH;

am5.ready(function () {
    // Initialize amCharts if the container exists
    const chartDiv = document.getElementById("report-atrh-chart");
    if (chartDiv) {
        initChart();
    }

    // Initialize Selection Logic
    initControls();
});

// ==========================================
// Chart Initialization
// ==========================================
function initChart() {
    root = am5.Root.new("report-atrh-chart");
    root.setThemes([am5themes_Animated.new(root)]);

    chart = root.container.children.push(am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: "none",
        wheelY: "none",
        layout: root.verticalLayout
    }));

    xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: "minute", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {
            minGridDistance: 70
        }),
        tooltip: am5.Tooltip.new(root, {})
    }));

    yAxisTemp = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {}),
        tooltip: am5.Tooltip.new(root, {})
    }));

    yAxisRH = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, { opposite: true }),
        tooltip: am5.Tooltip.new(root, {})
    }));

    tempSeries = createSeries("Temperature", "temperature", 0x3b82f6, yAxisTemp);
    rhSeries = createSeries("Humidity", "humidity", 0xf59e0b, yAxisRH);

    // Add legend
    let legend = chart.children.push(am5.Legend.new(root, {
        centerX: am5.p50,
        x: am5.p50
    }));
    legend.data.setAll(chart.series.values);
}

function createSeries(name, field, color, yAxis) {
    let series = chart.series.push(am5xy.LineSeries.new(root, {
        name: name,
        xAxis: xAxis,
        yAxis: yAxis,
        valueYField: field,
        valueXField: "time",
        stroke: am5.color(color),
        tooltip: am5.Tooltip.new(root, {
            labelText: "{name}: {valueY}"
        })
    }));
    series.strokes.template.setAll({ strokeWidth: 2 });
    return series;
}

// ==========================================
// Controls & Period Logic
// ==========================================
function initControls() {
    const sensorSelect = document.getElementById("select-sensor-type");
    const reportTypeSelect = document.getElementById("select-report-type");
    const periodSelect = document.getElementById("select-period");
    const refreshBtn = document.getElementById("btn-refresh-report");

    if (!sensorSelect || !reportTypeSelect || !periodSelect || !refreshBtn) return;

    // Populate initial periods
    updatePeriodOptions();

    // Event Listeners
    reportTypeSelect.addEventListener("change", updatePeriodOptions);
    refreshBtn.addEventListener("click", generateReport);

    // Initial state handling
    sensorSelect.addEventListener("change", () => {
        handleSensorChange();
        generateReport(); // Trigger re-gen on sensor change
    });

    // Auto-generate on load
    setTimeout(generateReport, 500);
}

function handleSensorChange() {
    const sensorSelect = document.getElementById("select-sensor-type");
    const isTemp = sensorSelect.value === "temp";
    if (rhSeries && yAxisRH) {
        if (isTemp) {
            rhSeries.hide();
            yAxisRH.hide();
        } else {
            rhSeries.show();
            yAxisRH.show();
        }
    }
}

function updatePeriodOptions() {
    const type = document.getElementById("select-report-type").value;
    const periodSelect = document.getElementById("select-period");
    periodSelect.innerHTML = "";

    const today = new Date();

    if (type === "weekly") {
        // Last 4 Mondays
        let current = new Date();
        // Go back to the most recent Monday
        current.setDate(current.getDate() - (current.getDay() === 0 ? 6 : current.getDay() - 1));

        for (let i = 0; i < 4; i++) {
            let mon = new Date(current);
            mon.setDate(mon.getDate() - (i * 7));
            let sun = new Date(mon);
            sun.setDate(sun.getDate() + 6);

            const startStr = formatDate(mon);
            const endStr = formatDate(sun);
            const label = `Week of ${startStr} - ${endStr}`;
            // Add time to make it inclusive
            const value = `${startStr} 00:00:00|${endStr} 23:59:59`;

            periodSelect.innerHTML += `<option value="${value}">${label}</option>`;
        }
    } else {
        // Monthly - 4 weeks block (Starting from first Monday)
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        for (let i = 0; i < 3; i++) {
            let mDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            let firstMon = new Date(mDate);
            while (firstMon.getDay() !== 1) {
                firstMon.setDate(firstMon.getDate() + 1);
            }

            let lastSun = new Date(firstMon);
            lastSun.setDate(lastSun.getDate() + 27); // 4 weeks later

            const startStr = formatDate(firstMon);
            const endStr = formatDate(lastSun);
            const label = `${months[mDate.getMonth()]} ${mDate.getFullYear()} (4 Weeks)`;
            const value = `${startStr} 00:00:00|${endStr} 23:59:59`;

            periodSelect.innerHTML += `<option value="${value}">${label}</option>`;
        }
    }
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ==========================================
// Data Fetch & Render
// ==========================================
async function generateReport() {
    const sensorType = document.getElementById("select-sensor-type").value;
    const periodValue = document.getElementById("select-period").value;
    if (!periodValue) return;

    const [start, end] = periodValue.split("|");
    const apiUrl = sensorType === "atrh"
        ? `/api/atrh/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
        : `/api/temp/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

    console.log("Generating report:", sensorType, start, end);

    // Update UI Titles
    document.getElementById("cover-report-type").innerText = document.getElementById("select-report-type").value.toUpperCase() + " REPORT";
    document.getElementById("cover-date-range").innerText = `Date : ${start.split(' ')[0]} to ${end.split(' ')[0]}`;
    document.getElementById("report-page-title").innerText = `${sensorType === "atrh" ? "ATRH" : "Temperature"} Analysis Report`;

    // Update Description
    const descText = sensorType === "atrh"
        ? "The environmental monitoring data shows stable trends during the reporting period. Temperature fluctuations remain within expected seasonal ranges, with humidity levels correlating positively with precipitation events."
        : "The temperature monitoring data shows stable trends during the reporting period. Fluctuations remain within expected operational limits for the structure.";
    document.getElementById("report-description-text").innerText = descText;

    // Ensure chart visibility matches
    handleSensorChange();

    try {
        const res = await fetch(apiUrl);
        const rawData = await res.json();

        console.log(`Fetched ${rawData.length} points`);

        const formatted = rawData.map(d => ({
            time: new Date(d.time).getTime(),
            temperature: d.temperature,
            humidity: d.humidity || null
        }));

        tempSeries.data.setAll(formatted);
        if (rhSeries) {
            rhSeries.data.setAll(formatted);
        }

        // Adjust chart bounds
        if (formatted.length > 0) {
            xAxis.zoomToDates(new Date(formatted[0].time), new Date(formatted[formatted.length - 1].time));
        } else {
            // Clear chart if no data
            tempSeries.data.setAll([]);
            if (rhSeries) rhSeries.data.setAll([]);
        }

    } catch (e) {
        console.error("Report fetch error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat data laporan sensor", "Laporan");
    }

    // ==========================================
    // Monitoring Summary Table
    // ==========================================
    try {
        const monRes = await fetch(`/api/monitoring-summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        const monData = await monRes.json();
        renderMonitoringTable(monData, start, end);
    } catch (e) {
        console.error("Monitoring summary fetch error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat ringkasan monitoring", "Laporan");
    }
}

// ==========================================
// Monitoring Table Renderer
// ==========================================
function renderMonitoringTable(data, start, end) {
    const tbody = document.getElementById("monitoring-table-body");
    const title = document.getElementById("monitoring-table-title");
    if (!tbody) return;

    // Update title with period
    if (title) {
        const startDate = start.split(" ")[0];
        const endDate = end.split(" ")[0];
        title.innerText = `[Laporan Monitoring Bulanan] ${startDate} – ${endDate}`;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#999; padding:20px;">No monitoring data found for this period</td></tr>`;
        return;
    }

    const CHECK = `<span class="icon-ok">✅</span>`;
    const CROSS = `<span class="icon-fail">❌</span>`;

    let html = "";
    let prevGroup = "";
    let prevType = "";
    let groupCount = {};
    let typeCount = {};

    // Pre-calculate row spans
    data.forEach(d => {
        groupCount[d.group] = (groupCount[d.group] || 0) + 1;
        const typeKey = d.group + "|" + d.sensor_type;
        typeCount[typeKey] = (typeCount[typeKey] || 0) + 1;
    });

    let groupRendered = {};
    let typeRendered = {};
    let channelCounter = {};

    data.forEach((d, idx) => {
        const total = d.abnormal_count + d.system_error;
        const typeKey = d.group + "|" + d.sensor_type;

        // Per-type channel numbering
        channelCounter[typeKey] = (channelCounter[typeKey] || 0) + 1;

        html += `<tr>`;

        // Group cell (rowspan)
        if (!groupRendered[d.group]) {
            html += `<td rowspan="${groupCount[d.group]}" class="cell-center">${d.group}</td>`;
            groupRendered[d.group] = true;
        }

        // Type cell (rowspan)
        if (!typeRendered[typeKey]) {
            html += `<td rowspan="${typeCount[typeKey]}" class="cell-center">${d.sensor_type}</td>`;
            typeRendered[typeKey] = true;
        }

        html += `<td>${channelCounter[typeKey]}</td>`;
        html += `<td class="cell-center">${d.operation_ok ? CHECK : CROSS}</td>`;
        html += `<td class="cell-right">${d.abnormal_count > 0 ? d.abnormal_count : "-"}</td>`;
        html += `<td class="cell-right">${d.system_error > 0 ? d.system_error : "-"}</td>`;
        html += `<td class="cell-right">${total > 0 ? total : "-"}</td>`;
        html += `<td class="cell-center">${d.threshold_ok ? CHECK : CROSS}</td>`;
        html += `<td>${d.remark || ""}</td>`;
        html += `</tr>`;
    });

    tbody.innerHTML = html;
}
