// ===============================
// Cable Stay Realtime Monitoring
// ===============================

let cableChartRoot = null;
let cableChart = null;
let xAxis = null;
let yAxis = null;
let seriesA = null;
let seriesB = null;
let legend = null;
let yAxisLabel = null;
let currentUnit = "force"; // or "stress"

// Mapped uniquely to match the symmetrical bridge layout (12 locations, each with A and B sides)
const CABLE_MAPPING = {
    "CS01": "S-C7A", "CS02": "S-C5A", "CS03": "S-C3A", "CS04": "S-M3A", "CS05": "S-M5A", "CS06": "S-M7A",
    "CS07": "N-M7A", "CS08": "N-M5A", "CS09": "N-M3A", "CS10": "N-C3A", "CS11": "N-C5A", "CS12": "N-C7A",
    "CS13": "S-C7B", "CS14": "S-C5B", "CS15": "S-C3B", "CS16": "S-M3B", "CS17": "S-M5B", "CS18": "S-M7B",
    "CS19": "N-M7B", "CS20": "N-M5B", "CS21": "N-M3B", "CS22": "N-C3B", "CS23": "N-C5B", "CS24": "N-C7B"
};

// Location keys for grouped chart
const LOCATIONS = [
    "S-C7", "S-C5", "S-C3", "S-M3", "S-M5", "S-M7",
    "N-M7", "N-M5", "N-M3", "N-C3", "N-C5", "N-C7"
];

const socket = io();

document.addEventListener("DOMContentLoaded", () => {
    initDeckView();
    initAllCharts();
    loadCableData();

    // Replace 5s polling with real-time Socket.IO updates
    socket.on('cable_update', (d) => {
        // Find existing data point and update it
        // Note: loadCableData fetches ALL sensors, so here we can just update the local partial state
        // or trigger a targeted update if we had a local cache.
        // For simplicity, we just trigger loadCableData more intelligently or update the specific point.

        // Update Deck View instantly
        updatePointColor(d);

        // Update Bar Chart (requires searching the chart data)
        updateBarPoint(d);
    });

    // Toggle unit buttons
    document.querySelectorAll(".btn-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".btn-toggle").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentUnit = btn.dataset.unit;
            loadCableData();
        });
    });
});

function initDeckView() {
    const topSide = document.getElementById("top-cables");
    const bottomSide = document.getElementById("bottom-cables");

    topSide.innerHTML = "";
    bottomSide.innerHTML = "";

    // A Sensors (CS01-12)
    for (let i = 1; i <= 12; i++) {
        const sid = "CS" + String(i).padStart(2, '0');
        bottomSide.appendChild(createCablePoint(sid));
    }

    // B Sensors (CS13-24)
    for (let i = 13; i <= 24; i++) {
        const sid = "CS" + String(i).padStart(2, '0');
        topSide.appendChild(createCablePoint(sid));
    }
}

function createCablePoint(sid) {
    const div = document.createElement("div");
    div.className = "cable-point";
    div.id = "point-" + sid;

    // Label for tooltip/display
    const fullTag = CABLE_MAPPING[sid] || sid;
    div.title = fullTag;

    const label = document.createElement("div");
    label.className = "cable-label";
    label.textContent = fullTag.split('-')[1] || fullTag; // Show only C7A etc.
    div.appendChild(label);

    div.addEventListener("click", () => {
        window.location.href = "/cable-stay/sensor/" + sid;
    });

    return div;
}

async function loadCableData() {
    try {
        const res = await fetch("/api/cable-stay/latest");
        const data = await res.json();

        updateDeckColors(data);
        updateBarChart(data);
    } catch (e) {
        console.error("Error loading cable data:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal memuat data realtime Cable Stay", "Cable Stay");
    }
}

function updateDeckColors(data) {
    data.forEach(d => updatePointColor(d));
}

function updatePointColor(d) {
    const el = document.getElementById("point-" + d.sensor_id);
    if (!el) return;

    const val = currentUnit === "force" ? d.force : d.stress;
    const thresholds = currentUnit === "force" ? [400, 600] : [500, 700];

    if (val >= thresholds[1]) {
        el.style.backgroundColor = "#ef4444";
    } else if (val >= thresholds[0]) {
        el.style.backgroundColor = "#f59e0b";
    } else {
        el.style.backgroundColor = "#22c55e";
    }
}

function initAllCharts() {
    initBarChart();
    loadCableData();
}

function initBarChart() {
    const el = document.getElementById("cable-bar-chart");
    if (!el) return;

    if (cableChartRoot) {
        cableChartRoot.dispose();
    }

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? 0xffffff : 0x64748b;
    const gridColor = isDark ? 0xffffff : 0x000000;

    cableChartRoot = am5.Root.new("cable-bar-chart");
    cableChartRoot.setThemes([am5themes_Animated.new(cableChartRoot)]);

    cableChart = cableChartRoot.container.children.push(
        am5xy.XYChart.new(cableChartRoot, {
            panX: false, panY: false, wheelX: "none", wheelY: "none",
            layout: cableChartRoot.verticalLayout
        })
    );

    // Add Legend
    legend = cableChart.children.push(am5.Legend.new(cableChartRoot, {
        centerX: am5.p50,
        x: am5.p50
    }));

    legend.labels.template.setAll({
        fill: am5.color(textColor),
        fontSize: 12,
        fontWeight: "500"
    });

    xAxis = cableChart.xAxes.push(
        am5xy.CategoryAxis.new(cableChartRoot, {
            categoryField: "location",
            renderer: am5xy.AxisRendererX.new(cableChartRoot, {
                minGridDistance: 30,
                cellStartLocation: 0.1,
                cellEndLocation: 0.9,
                stroke: am5.color(0xcccccc),
                strokeOpacity: 1
            })
        })
    );

    xAxis.get("renderer").labels.template.setAll({
        fill: am5.color(textColor),
        fontSize: 12
    });

    xAxis.get("renderer").grid.template.setAll({
        strokeOpacity: 0.05,
        stroke: am5.color(gridColor)
    });

    yAxis = cableChart.yAxes.push(
        am5xy.ValueAxis.new(cableChartRoot, {
            renderer: am5xy.AxisRendererY.new(cableChartRoot, {
                stroke: am5.color(0xcccccc),
                strokeOpacity: 1
            })
        })
    );

    yAxis.get("renderer").labels.template.setAll({
        fill: am5.color(textColor),
        fontSize: 12
    });

    yAxis.get("renderer").grid.template.setAll({
        strokeOpacity: 0.05,
        stroke: am5.color(gridColor)
    });

    yAxisLabel = am5.Label.new(cableChartRoot, {
        rotation: -90,
        text: "Cable Force (KN)",
        y: am5.p50,
        centerX: am5.p50,
        fontWeight: "bold",
        fill: am5.color(textColor)
    });

    yAxis.children.unshift(yAxisLabel);

    // Side A Series (Design Style)
    seriesA = createGroupedSeries("Teluk Dalam (Side A)", "valueA", 0x6ca67d, true);
    // Side B Series (Current Style)
    seriesB = createGroupedSeries("Teluk Luar (Side B)", "valueB", 0x22c55e, false);

    cableChart.set("cursor", am5xy.XYCursor.new(cableChartRoot, {}));
}

function createGroupedSeries(name, field, color) {
    const series = cableChart.series.push(
        am5xy.ColumnSeries.new(cableChartRoot, {
            name: name,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: field,
            categoryXField: "location",
            tooltip: am5.Tooltip.new(cableChartRoot, {
                labelText: "{name} at {categoryX}: {valueY} " + (currentUnit === "force" ? "kN" : "MPa")
            })
        })
    );

    series.set("fill", am5.color(color));
    series.set("stroke", am5.color(color));

    series.columns.template.setAll({
        width: am5.percent(90),
        tooltipY: 0,
        fillOpacity: 0.8,
        strokeOpacity: 1,
        stroke: am5.color(0xcccccc),
        strokeWidth: 1
    });

    // Dynamic fill based on value (matching the status colors)
    series.columns.template.adapters.add("fill", (fill, target) => {
        const val = target.dataItem.get("valueY");
        const thresholds = currentUnit === "force" ? [400, 600] : [500, 700];
        if (val >= thresholds[1]) return am5.color(0xef4444);
        if (val >= thresholds[0]) return am5.color(0xf59e0b);
        return am5.color(color);
    });

    legend.data.push(series);
    return series;
}

function updateBarChart(data) {
    if (!xAxis || !seriesA || !seriesB) return;

    // Process data for grouped display
    const chartData = LOCATIONS.map(loc => {
        const obj = { location: loc };

        // Find Side A (CS01-12)
        const sensorA = data.find(d => CABLE_MAPPING[d.sensor_id] === loc + "A");
        if (sensorA) {
            obj.valueA = currentUnit === "force" ? sensorA.force : sensorA.stress;
        }

        // Find Side B (CS13-24)
        const sensorB = data.find(d => CABLE_MAPPING[d.sensor_id] === loc + "B");
        if (sensorB) {
            obj.valueB = currentUnit === "force" ? sensorB.force : sensorB.stress;
        }

        return obj;
    });

    xAxis.data.setAll(chartData);
    seriesA.data.setAll(chartData);
    seriesB.data.setAll(chartData);

    // Update tooltip unit dynamically
    const unitLabel = currentUnit === "force" ? "kN" : "MPa";
    seriesA.get("tooltip").set("labelText", "{name} at {categoryX}: {valueY} " + unitLabel);
    seriesB.get("tooltip").set("labelText", "{name} at {categoryX}: {valueY} " + unitLabel);

    // Update Y-axis label dynamically
    if (yAxisLabel) {
        yAxisLabel.set("text", currentUnit === "force" ? "Cable Force (KN)" : "Cable Stress (MPa)");
    }

    // Add thresholds lines
    yAxis.axisRanges.clear();
    const tValues = currentUnit === "force" ? [400, 600] : [500, 700];
    const tColors = [0xf59e0b, 0xef4444];
    const tLabels = currentUnit === "force" ? ["400 kN", "600 kN"] : ["500 MPa", "700 MPa"];

    // Set axis max to 130% of the highest threshold
    const maxThreshold = Math.max(...tValues);
    yAxis.set("max", maxThreshold * 1.1);

    tValues.forEach((tv, idx) => {
        const rangeDataItem = yAxis.makeDataItem({ value: tv });
        yAxis.createAxisRange(rangeDataItem);
        rangeDataItem.get("grid").setAll({
            stroke: am5.color(tColors[idx]),
            strokeOpacity: 0.8,
            strokeDasharray: [3, 3]
        });
        rangeDataItem.get("label").setAll({
            text: tLabels[idx],
            fill: am5.color(tColors[idx]),
            fontWeight: "bold",
            location: 0, // Left side
            inside: true,
            centerX: 0,
            centerY: am5.p100, // Above the line
            paddingLeft: 15 // Increased padding to avoid overlap
        });
    });
}

function updateBarPoint(d) {
    if (!xAxis || !seriesA || !seriesB) return;

    const loc = CABLE_MAPPING[d.sensor_id];
    if (!loc) return;

    const locationName = loc.slice(0, -1); // "S-C7" from "S-C7A"
    const side = loc.slice(-1); // "A" or "B"

    // Find the item in the category axis
    const dataA = seriesA.data.values;
    const item = dataA.find(i => i.location === locationName);
    if (!item) return;

    const val = currentUnit === "force" ? d.force : d.stress;
    if (side === 'A') {
        item.valueA = val;
    } else {
        item.valueB = val;
    }

    // Refresh data in both series
    seriesA.data.setAll(dataA);
    seriesB.data.setAll(dataA);
}

// ── Full Card Capture ──
window.captureCableRealtime = function () {
    const target = document.getElementById("cableRealtimeCardArea");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Cable Monitor');
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
        link.download = `Cable_Monitor_Realtime_${dateStr}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }).catch(err => {
        console.error("Capture captureCableRealtime error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar', 'Cable Monitor');
    });
};
