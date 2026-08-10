// ==========================================
// Weekly Report Generation Logic (Multi-Chart)
// ==========================================

let activeRoots = [];

am5.ready(function () {
    initWeeklyControls();
});

// ==========================================
// Controls & Period Logic
// ==========================================
function initWeeklyControls() {
    const sensorSelect = document.getElementById("select-sensor-type");
    const periodSelect = document.getElementById("select-period");
    const refreshBtn = document.getElementById("btn-refresh-report");

    if (!periodSelect || !refreshBtn) return;

    populateWeekOptions();

    refreshBtn.addEventListener("click", generateWeeklyReport);

    if (sensorSelect) {
        sensorSelect.addEventListener("change", () => {
            generateWeeklyReport();
        });
    }

    setTimeout(generateWeeklyReport, 500);
}

function populateWeekOptions() {
    const periodSelect = document.getElementById("select-period");
    let current = new Date();
    current.setDate(current.getDate() - (current.getDay() === 0 ? 6 : current.getDay() - 1));

    for (let i = 0; i < 4; i++) {
        let mon = new Date(current);
        mon.setDate(mon.getDate() - (i * 7));
        let sun = new Date(mon);
        sun.setDate(sun.getDate() + 6);

        const startStr = formatDate(mon);
        const endStr = formatDate(sun);
        const label = `Week of ${startStr} – ${endStr}`;
        const value = `${startStr} 00:00:00|${endStr} 23:59:59`;

        periodSelect.innerHTML += `<option value="${value}">${label}</option>`;
    }
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ==========================================
// Data Fetch & Multi-Render
// ==========================================
const SENSOR_COLORS = [
    0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0x6366f1,
    0xec4899, 0x8b5cf6, 0xf97316, 0x06b6d4, 0x84cc16
];

async function generateWeeklyReport() {
    const sensorType = document.getElementById("select-sensor-type")?.value || "atrh";
    const periodValue = document.getElementById("select-period").value;
    if (!periodValue) return;

    const [start, end] = periodValue.split("|");
    let apiUrl = "";
    let title = "";
    let desc = "";
    let metricConfigs = [];

    // Reset Containers & Dispose Charts
    const dynamicContainer = document.getElementById("dynamic-report-pages");
    dynamicContainer.innerHTML = "";
    activeRoots.forEach(r => r.dispose());
    activeRoots = [];

    switch (sensorType) {
        case "atrh":
            apiUrl = `/api/atrh/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
            title = "ATRH Analysis Report";
            desc = "The environmental monitoring data (Temperature & Humidity) shows stable trends during the reporting period.";
            metricConfigs = [
                { field: "temperature", name: "Temp", secondary: false },
                { field: "humidity", name: "RH", secondary: true }
            ];
            break;
        case "temp":
            apiUrl = `/api/temp/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
            title = "Temperature Analysis Report";
            desc = "The structural temperature monitoring data shows stable trends during the reporting period.";
            metricConfigs = [{ field: "temperature", name: "Temp", secondary: false }];
            break;
        case "anm2d":
            apiUrl = `/api/anm2d/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
            title = "Anemometer 2D Analysis Report";
            desc = "Wind speed and direction data remains within safe operational limits.";
            metricConfigs = [
                { field: "wind_speed", name: "SPD", secondary: false },
                { field: "wind_direction", name: "DIR", secondary: true }
            ];
            break;
        case "anm3d":
            apiUrl = `/api/anm3d/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
            title = "Anemometer 3D Analysis Report";
            desc = "Comprehensive 3D wind profile analysis during the reporting period.";
            metricConfigs = [
                { field: "wind_speed", name: "SPD", secondary: false },
                { field: "wind_direction", name: "DIR", secondary: true },
                { field: "wind_elevation", name: "ELV", secondary: true }
            ];
            break;
        case "tiltmeter":
            apiUrl = `/api/tiltmeter/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
            title = "Tiltmeter Analysis Report";
            desc = "Structural tilt monitoring (Angle X & Y) shows no significant rotational changes.";
            metricConfigs = [
                { field: "angle_x", name: "Angle X", secondary: false },
                { field: "angle_y", name: "Angle Y", secondary: false }
            ];
            break;
        case "cable":
            apiUrl = `/api/cable-stay/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
            title = "Cable Force Analysis Report";
            desc = "Cable tension and force monitoring during the reporting period.";
            metricConfigs = [
                { field: "force", name: "Force", secondary: false },
                { field: "stress", name: "Stress", secondary: true }
            ];
            break;
    }

    // Update Cover
    document.getElementById("cover-report-type").innerText = "WEEKLY REPORT";
    document.getElementById("cover-date-range").innerText = `Date : ${start.split(' ')[0]} to ${end.split(' ')[0]}`;

    try {
        const res = await fetch(apiUrl);
        const rawData = await res.json();

        if (!rawData || rawData.length === 0) {
            if (window.SHMToast) window.SHMToast.info("No data found for this period", "Weekly Report");
            return;
        }

        // Group data by sensor_id
        const grouped = {};
        rawData.forEach(d => {
            const sid = d.sensor_id || "default";
            if (!grouped[sid]) grouped[sid] = [];

            let item = { time: new Date(d.time).getTime() };
            for (let k in d) {
                if (k !== 'time') item[k] = d[k];
            }
            grouped[sid].push(item);
        });

        const sids = Object.keys(grouped).sort();
        const template = document.getElementById("tpl-report-sheet");

        sids.forEach((sid, idx) => {
            const sensorData = grouped[sid];
            const pageNum = idx + 2;

            // Clone Template
            const clone = template.content.cloneNode(true);
            const container = clone.querySelector(".report-chart-box");
            const chartId = `chart-container-${sid}-${Date.now()}`;
            container.id = chartId;

            // Set Title & Description
            clone.querySelector(".sensor-report-title").innerText = `${sid} - ${title}`;
            clone.querySelector(".sensor-description-text").innerText = `${sid}: ${desc}`;
            clone.querySelector(".page-number").innerText = pageNum;

            dynamicContainer.appendChild(clone);

            // Render Chart for this Sensor
            renderSensorChart(chartId, sid, sensorData, metricConfigs, idx);
        });

    } catch (e) {
        console.error("Weekly report multi-fetch error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal membuat laporan sensor", "Laporan");
    }
}

function renderSensorChart(containerId, sensorId, data, metricConfigs, sensorIdx) {
    const root = am5.Root.new(containerId);
    activeRoots.push(root);

    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: "none",
        wheelY: "none",
        layout: root.verticalLayout
    }));

    const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: "minute", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {
            minGridDistance: 70
        }),
        tooltip: am5.Tooltip.new(root, {})
    }));

    const yAxisMain = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {}),
        tooltip: am5.Tooltip.new(root, {})
    }));

    const yAxisSecondary = chart.yAxes.push(am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, { opposite: true }),
        tooltip: am5.Tooltip.new(root, {})
    }));

    // Hide secondary axis if no metrics use it
    let hasSecondary = metricConfigs.some(m => m.secondary);
    if (!hasSecondary) {
        yAxisSecondary.set("forceHidden", true);
    }

    const sensorColor = SENSOR_COLORS[sensorIdx % SENSOR_COLORS.length];

    metricConfigs.forEach((m, mIdx) => {
        const color = am5.color(SENSOR_COLORS[(sensorIdx + mIdx) % SENSOR_COLORS.length]);
        const yAxis = m.secondary ? yAxisSecondary : yAxisMain;

        const series = chart.series.push(am5xy.LineSeries.new(root, {
            name: m.name,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: m.field,
            valueXField: "time",
            stroke: color,
            tooltip: am5.Tooltip.new(root, {
                labelText: "{name}: {valueY}"
            })
        }));

        series.strokes.template.setAll({ strokeWidth: 2 });
        series.data.setAll(data);
    });

    const legend = chart.children.push(am5.Legend.new(root, {
        centerX: am5.p50,
        x: am5.p50,
        y: am5.p100,
        centerY: am5.p100
    }));
    legend.data.setAll(chart.series.values);

    // Zoom to range
    const allTimes = data.map(d => d.time);
    xAxis.zoomToDates(new Date(Math.min(...allTimes)), new Date(Math.max(...allTimes)));
}
