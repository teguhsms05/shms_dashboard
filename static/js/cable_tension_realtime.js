// ===============================
// Cable Tension Realtime Monitoring (FFT-based)
// ===============================

const _ctRtData = document.getElementById("ct-realtime-data") || {};
const TENSION_WARN_KN = parseFloat(_ctRtData.dataset.tensionWarnKn) || 0;
const TENSION_CRITICAL_KN = parseFloat(_ctRtData.dataset.tensionCriticalKn) || 0;
const IS_ADMIN_CT = _ctRtData.dataset.isAdmin === "true";

let tensionChartRoot = null;
let tensionChart = null;
let tensionXAxis = null;
let tensionYAxis = null;
let tensionSeries = null;
let tensionYAxisLabel = null;
let tensionLegend = null;
let tensionSeriesA = null;
let tensionSeriesB = null;
let currentUnit = "tension_avg";

const CABLE_LOCATIONS = ["S-C7", "S-C5", "S-C3", "S-M3", "S-M5", "S-M7",
    "N-M7", "N-M5", "N-M3", "N-C3", "N-C5", "N-C7"];

const CABLE_MAPPING = {
    "CBL01": "S-C7A", "CBL02": "S-C5A", "CBL03": "S-C3A", "CBL04": "S-M3A", "CBL05": "S-M5A", "CBL06": "S-M7A",
    "CBL07": "N-M7A", "CBL08": "N-M5A", "CBL09": "N-M3A", "CBL10": "N-C3A", "CBL11": "N-C5A", "CBL12": "N-C7A",
    "CBL13": "S-C7B", "CBL14": "S-C5B", "CBL15": "S-C3B", "CBL16": "S-M3B", "CBL17": "S-M5B", "CBL18": "S-M7B",
    "CBL19": "N-M7B", "CBL20": "N-M5B", "CBL21": "N-M3B", "CBL22": "N-C3B", "CBL23": "N-C5B", "CBL24": "N-C7B"
};

const CABLE_IDS_ALL = [
    "CBL01", "CBL02", "CBL03", "CBL04", "CBL05", "CBL06",
    "CBL07", "CBL08", "CBL09", "CBL10", "CBL11", "CBL12",
    "CBL13", "CBL14", "CBL15", "CBL16", "CBL17", "CBL18",
    "CBL19", "CBL20", "CBL21", "CBL22", "CBL23", "CBL24"
];

const CABLE_IDS_TOP = ["CBL01", "CBL02", "CBL03", "CBL04", "CBL05", "CBL06",
    "CBL13", "CBL14", "CBL15", "CBL16", "CBL17", "CBL18"];
const CABLE_IDS_BOTTOM = ["CBL07", "CBL08", "CBL09", "CBL10", "CBL11", "CBL12",
    "CBL19", "CBL20", "CBL21", "CBL22", "CBL23", "CBL24"];

const socket = io();

let cablePositionsData = [];
let hasCablePosChanges = false;

document.addEventListener("DOMContentLoaded", () => {
    loadCablePositions();
    initAllCharts();
    loadTensionData();

    document.querySelectorAll(".btn-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".btn-toggle").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentUnit = btn.dataset.unit;
            loadTensionData();
        });
    });

    setInterval(loadTensionData, 10000);

    socket.on('cable_update', (d) => {
        updatePointColorFromData(d);
    });

    socket.on('disconnect', () => {
        if (window.SHMToast) window.SHMToast.warning('Connection lost, reconnecting...', 'Socket');
    });
    socket.on('reconnect', () => {
        if (window.SHMToast) window.SHMToast.success('Reconnected', 'Socket');
        loadTensionData();
    });

    window.addEventListener('resize', () => { });
});

async function loadCablePositions() {
    try {
        const res = await fetch("/api/cable-tension/positions");
        const data = await res.json();
        cablePositionsData = data;
        renderCableDots(data);
    } catch (e) {
        console.error("Failed to load cable positions:", e);
    }
}

function clearCableDots() {
    const wrapper = document.getElementById("bridgeOverlayWrapper");
    if (!wrapper) return;
    wrapper.querySelectorAll(".ct-dot, .ct-dot-label").forEach(el => el.remove());
}

function renderCableDots(positions) {
    clearCableDots();
    const wrapper = document.getElementById("bridgeOverlayWrapper");
    if (!wrapper || !positions || positions.length === 0) return;

    positions.forEach((p, i) => {
        const tag = CABLE_MAPPING[p.sensor_id] || p.sensor_id;
        const label = tag;
        createCableDot(wrapper, p.pos_x, p.pos_y, p.tip_x, p.tip_y, label, p.sensor_id, i);
    });
}

function createCableDot(wrapper, pctX, pctY, tipX, tipY, label, sensorId, index) {
    var directions = ["top", "bottom", "top-right", "bot-left", "left", "right", "top-left", "bot-right"];
    var dir = directions[index % 8];

    var dot = document.createElement("div");
    dot.className = "ct-dot";
    if (IS_ADMIN_CT) dot.classList.add("editable");
    dot.style.left = pctX + "%";
    dot.style.top = pctY + "%";
    dot.dataset.sensorId = sensorId;
    dot.dataset.index = index;
    dot.dataset.type = "dot";
    dot.title = label;
    if (IS_ADMIN_CT) dot.addEventListener("mousedown", onCableDotMouseDown);
    dot.addEventListener("click", function (e) {
        if (!dot.classList.contains("moved")) {
            window.location.href = "/cable-tension/sensor/" + sensorId;
        }
    });

    var dotLabel = document.createElement("div");
    dotLabel.className = "ct-dot-label";
    dotLabel.textContent = label;
    dotLabel.style.left = pctX + "%";
    var isB = label.slice(-1) === "B";
    dotLabel.style.top = (isB ? pctY + 6 : pctY - 6) + "%";
    dotLabel.style.transform = isB ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    dotLabel.dataset.sensorId = sensorId;
    dotLabel.dataset.index = index;

    wrapper.appendChild(dot);
    wrapper.appendChild(dotLabel);
}

var dragElCt = null;
var startXCt, startYCt, startLeftCt, startTopCt;

function onCableDotMouseDown(e) {
    if (!IS_ADMIN_CT) return;
    e.preventDefault();
    e.stopPropagation();
    dragElCt = e.target;
    draggingTypeCt = 'dot';
    var sid = dragElCt.dataset.sensorId;
    var labelEl = document.querySelector('.ct-dot-label[data-sensor-id="' + sid + '"]');
    var wrapper = document.getElementById("bridgeOverlayWrapper");
    var wRect = wrapper.getBoundingClientRect();

    startXCt = e.clientX;
    startYCt = e.clientY;
    startLeftCt = parseFloat(dragElCt.style.left);
    startTopCt = parseFloat(dragElCt.style.top);

    dragElCt.classList.add("dragging");
    dragElCt._ctLabel = labelEl;
    window.addEventListener("mousemove", onCableMouseMove);
    window.addEventListener("mouseup", onCableMouseUp);
}

function onCableMouseMove(e) {
    if (!dragElCt) return;
    var wrapper = document.getElementById("bridgeOverlayWrapper");
    var wRect = wrapper.getBoundingClientRect();
    var dx = e.clientX - startXCt;
    var dy = e.clientY - startYCt;
    var pctDx = (dx / wRect.width) * 100;
    var pctDy = (dy / wRect.height) * 100;

    var newLeft = Math.max(0, Math.min(100, startLeftCt + pctDx));
    var newTop = Math.max(0, Math.min(100, startTopCt + pctDy));

    dragElCt.style.left = newLeft + "%";
    dragElCt.style.top = newTop + "%";
    if (dragElCt._ctLabel) {
        dragElCt._ctLabel.style.left = newLeft + "%";
        var isB = dragElCt._ctLabel.textContent.slice(-1) === "B";
        dragElCt._ctLabel.style.top = (isB ? newTop + 6 : newTop - 6) + "%";
    }

    if (!hasCablePosChanges) {
        hasCablePosChanges = true;
        var btn = document.getElementById("btnSaveCablePositions");
        if (btn) btn.style.display = "flex";
    }
    dragElCt.classList.add("moved");
}

function onCableMouseUp() {
    window.removeEventListener("mousemove", onCableMouseMove);
    window.removeEventListener("mouseup", onCableMouseUp);
    if (dragElCt) {
        dragElCt.classList.remove("dragging");
        var idx = parseInt(dragElCt.dataset.index);
        cablePositionsData[idx].pos_x = parseFloat(dragElCt.style.left);
        cablePositionsData[idx].pos_y = parseFloat(dragElCt.style.top);
    }
    dragElCt = null;
}

window.saveCablePositions = function () {
    var btn = document.getElementById("btnSaveCablePositions");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    var movedDots = document.querySelectorAll(".ct-dot.moved");
    if (movedDots.length === 0) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Positions';
        window.SHMToast.info('No positions changed.', 'Info', 3000);
        return;
    }

    var batch = [];
    var seen = {};
    movedDots.forEach(function (dot) {
        var idx = parseInt(dot.dataset.index);
        var s = cablePositionsData[idx];
        if (!s || s.pos_x == null || s.pos_y == null || isNaN(s.pos_x) || isNaN(s.pos_y)) return;
        if (seen[s.sensor_id]) return;
        seen[s.sensor_id] = true;
        batch.push({ sensor_id: s.sensor_id, pos_x: Number(s.pos_x), pos_y: Number(s.pos_y) });
    });

    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var csrfToken = csrfMeta ? csrfMeta.content || '' : '';
    fetch("/api/cable-tension/positions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify(batch)
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Positions';
            if (!data.ok) {
                window.SHMToast.danger("Save failed: " + (data.error || "Unknown error"), "Error", 6000);
            } else {
                hasCablePosChanges = false;
                btn.style.display = "none";
                document.querySelectorAll(".ct-dot.moved").forEach(function (d) { d.classList.remove("moved"); });
                window.SHMToast.success("Saved " + data.count + " position(s).", "Berhasil", 6000);
            }
        })
        .catch(function (e) {
            console.error("Save error:", e);
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Positions';
            window.SHMToast.danger("Save failed: " + e.message, "Error", 6000);
        });
};

async function loadTensionData() {
    try {
        const res = await fetch("/api/cable-tension/latest");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        updateDeckColors(data);
        updateBarChart(data);
        updateDataTable(data);
    } catch (e) {
        console.error("Error loading tension data:", e);
    }
}

function getMetric(d, unit) {
    var keyMap = {
        "tension_avg": "tension_avg",
        "f1": "f1",
        "f2": "f2",
        "f3": "f3",
        "t1": "t1",
        "t2": "t2",
        "t3": "t3",
    };
    return d[keyMap[unit]] || 0;
}

function updateDeckColors(data) {
    data.forEach(function (d) { updatePointColorFromData(d); });
}

function updatePointColorFromData(d) {
    var dot = document.querySelector('.ct-dot[data-sensor-id="' + d.sensor_id + '"]');

    var val = d.tension_avg || 0;
    var color;
    if (val >= TENSION_CRITICAL_KN) {
        color = "#ef4444";
    } else if (val >= TENSION_WARN_KN) {
        color = "#f59e0b";
    } else if (val > 0) {
        color = "#22c55e";
    } else {
        color = "#94a3b8";
    }

    if (dot && !dot.classList.contains("moved") && !dot.classList.contains("dragging")) {
        dot.style.background = color;
    }

    var timeStr = d.time ? new Date(d.time).toLocaleString() : null;
}

var UNIT_LABELS = {
    "tension_avg": "T_avg (kN)",
    "f1": "f1 (Hz)",
    "f2": "f2 (Hz)",
    "f3": "f3 (Hz)",
    "t1": "T1 (kN)",
    "t2": "T2 (kN)",
    "t3": "T3 (kN)",
};

function initAllCharts() {
    initBarChart();
}

function createGroupedSeries(name, field, color) {
    var s = tensionChart.series.push(
        am5xy.ColumnSeries.new(tensionChartRoot, {
            name: name,
            xAxis: tensionXAxis,
            yAxis: tensionYAxis,
            valueYField: field,
            categoryXField: "location",
            tooltip: am5.Tooltip.new(tensionChartRoot, {
                labelText: "{name} @ {categoryX}: {valueY}"
            })
        })
    );
    s.columns.template.setAll({
        width: am5.percent(90),
        tooltipY: 0,
        fillOpacity: 0.85,
        strokeOpacity: 1,
        stroke: am5.color(0xcccccc),
        strokeWidth: 1
    });
    s.set("fill", am5.color(color));
    s.set("stroke", am5.color(color));
    tensionLegend.data.push(s);
    return s;
}

function initBarChart() {
    var el = document.getElementById("cable-tension-bar-chart");
    if (!el) return;

    if (tensionChartRoot) {
        tensionChartRoot.dispose();
    }

    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    var textColor = isDark ? 0xffffff : 0x64748b;
    var gridColor = isDark ? 0xffffff : 0x000000;

    tensionChartRoot = am5.Root.new("cable-tension-bar-chart");
    tensionChartRoot.setThemes([am5themes_Animated.new(tensionChartRoot)]);

    tensionChart = tensionChartRoot.container.children.push(
        am5xy.XYChart.new(tensionChartRoot, {
            panX: false, panY: false, wheelX: "none", wheelY: "none",
            layout: tensionChartRoot.verticalLayout
        })
    );

    tensionLegend = tensionChart.children.push(am5.Legend.new(tensionChartRoot, {
        centerX: am5.p50, x: am5.p50
    }));
    tensionLegend.labels.template.setAll({
        fill: am5.color(textColor), fontSize: 12, fontWeight: "500"
    });

    tensionXAxis = tensionChart.xAxes.push(
        am5xy.CategoryAxis.new(tensionChartRoot, {
            categoryField: "location",
            renderer: am5xy.AxisRendererX.new(tensionChartRoot, {
                minGridDistance: 40,
                cellStartLocation: 0.1,
                cellEndLocation: 0.9,
                stroke: am5.color(0xcccccc),
                strokeOpacity: 1
            })
        })
    );

    tensionXAxis.get("renderer").labels.template.setAll({
        fill: am5.color(textColor), fontSize: 11
    });
    tensionXAxis.get("renderer").grid.template.setAll({
        strokeOpacity: 0.05, stroke: am5.color(gridColor)
    });

    tensionYAxis = tensionChart.yAxes.push(
        am5xy.ValueAxis.new(tensionChartRoot, {
            renderer: am5xy.AxisRendererY.new(tensionChartRoot, {
                stroke: am5.color(0xcccccc), strokeOpacity: 1
            })
        })
    );
    tensionYAxis.get("renderer").labels.template.setAll({
        fill: am5.color(textColor), fontSize: 12
    });
    tensionYAxis.get("renderer").grid.template.setAll({
        strokeOpacity: 0.05, stroke: am5.color(gridColor)
    });

    tensionYAxisLabel = am5.Label.new(tensionChartRoot, {
        rotation: -90, text: UNIT_LABELS[currentUnit],
        y: am5.p50, centerX: am5.p50,
        fontWeight: "bold", fill: am5.color(textColor)
    });
    tensionYAxis.children.unshift(tensionYAxisLabel);

    tensionSeriesA = createGroupedSeries("Side A (South)", "valueA", 0x6ca67d);
    tensionSeriesB = createGroupedSeries("Side B (North)", "valueB", 0x22c55e);

    tensionChart.set("cursor", am5xy.XYCursor.new(tensionChartRoot, {}));
}

function updateBarChart(data) {
    if (!tensionXAxis || !tensionSeriesA || !tensionSeriesB) return;

    var chartData = CABLE_LOCATIONS.map(function (loc) {
        var obj = { location: loc };
        var sensorA = data.find(function (d) { return CABLE_MAPPING[d.sensor_id] === loc + "A"; });
        var sensorB = data.find(function (d) { return CABLE_MAPPING[d.sensor_id] === loc + "B"; });
        if (sensorA) obj.valueA = getMetric(sensorA, currentUnit);
        if (sensorB) obj.valueB = getMetric(sensorB, currentUnit);
        return obj;
    });

    tensionXAxis.data.setAll(chartData);
    tensionSeriesA.data.setAll(chartData);
    tensionSeriesB.data.setAll(chartData);

    var unitLabel = UNIT_LABELS[currentUnit] || currentUnit;
    tensionSeriesA.get("tooltip").set("labelText", "{name} @ {categoryX}: {valueY} " + unitLabel);
    tensionSeriesB.get("tooltip").set("labelText", "{name} @ {categoryX}: {valueY} " + unitLabel);

    if (tensionYAxisLabel) {
        tensionYAxisLabel.set("text", unitLabel);
    }

    tensionYAxis.axisRanges.clear();

    if (currentUnit === "tension_avg" || currentUnit === "t1" || currentUnit === "t2" || currentUnit === "t3") {
        var thresholds = [TENSION_WARN_KN, TENSION_CRITICAL_KN];
        var colors = [0xf59e0b, 0xef4444];
        var labels = [TENSION_WARN_KN + " kN", TENSION_CRITICAL_KN + " kN"];
        var maxT = Math.max.apply(null, thresholds);
        tensionYAxis.set("max", maxT * 1.1);

        thresholds.forEach(function (tv, idx) {
            var rangeDataItem = tensionYAxis.makeDataItem({ value: tv });
            tensionYAxis.createAxisRange(rangeDataItem);
            rangeDataItem.get("grid").setAll({
                stroke: am5.color(colors[idx]),
                strokeOpacity: 0.8,
                strokeDasharray: [3, 3]
            });
            rangeDataItem.get("label").setAll({
                text: labels[idx],
                fill: am5.color(colors[idx]),
                fontWeight: "bold",
                location: 0,
                inside: true,
                centerX: 0,
                centerY: am5.p100,
                paddingLeft: 15
            });
        });
    } else {
        tensionYAxis.set("max", undefined);
    }
}

function updateDataTable(data) {
    var tbody = document.querySelector("#tension-data-table tbody");
    if (!tbody) return;

    var allSensors = CABLE_IDS_TOP.concat(CABLE_IDS_BOTTOM);
    var rows = allSensors.map(function (sid) {
        var sensor = data.find(function (d) { return d.sensor_id === sid; }) || {};
        return { sid: sid, tag: CABLE_MAPPING[sid] || sid };
    }).map(function (r) {
        var sensor = data.find(function (d) { return d.sensor_id === r.sid; }) || {};
        var avgVal = sensor.tension_avg || 0;
        var rowClass = "";
        if (avgVal >= TENSION_CRITICAL_KN) rowClass = 'style="background: rgba(239,68,68,0.08)"';
        else if (avgVal >= TENSION_WARN_KN) rowClass = 'style="background: rgba(245,158,11,0.08)"';

        return '<tr ' + rowClass + '>' +
            '<td><strong>' + r.tag + '</strong> <small>(' + r.sid + ')</small></td>' +
            '<td>' + ((sensor.f1 || 0).toFixed(3)) + '</td>' +
            '<td>' + ((sensor.f2 || 0).toFixed(3)) + '</td>' +
            '<td>' + ((sensor.f3 || 0).toFixed(3)) + '</td>' +
            '<td>' + ((sensor.t1 || 0).toFixed(1)) + '</td>' +
            '<td>' + ((sensor.t2 || 0).toFixed(1)) + '</td>' +
            '<td>' + ((sensor.t3 || 0).toFixed(1)) + '</td>' +
            '<td><strong>' + (avgVal.toFixed(1)) + '</strong></td>' +
            '<td>' + (sensor.time ? new Date(sensor.time).toLocaleTimeString() : '-') + '</td>' +
            '</tr>';
    });
    tbody.innerHTML = rows.join("");
}

window.captureCableTensionRealtime = function () {
    var target = document.getElementById("cableTensionRealtimeCard");
    if (!target) return;

    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: Library tidak ditemukan', 'Cable Tension');
        return;
    }

    html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff"
    }).then(function (canvas) {
        try {
            var dataUrl = canvas.toDataURL("image/png");
            if (!dataUrl || dataUrl === "data:,") {
                throw new Error("Canvas kosong");
            }
            var link = document.createElement("a");
            var date = new Date();
            var dd = String(date.getDate()).padStart(2, '0');
            var mm = String(date.getMonth() + 1).padStart(2, '0');
            var yyyy = date.getFullYear();
            link.download = 'Cable_Tension_Realtime_' + dd + mm + yyyy + '.png';
            link.href = dataUrl;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (window.SHMToast) window.SHMToast.success('Gambar berhasil diunduh', 'Capture', 4000);
        } catch(e) {
            console.error("Download error:", e);
            if (window.SHMToast) window.SHMToast.danger('Gagal mengunduh: ' + e.message, 'Capture');
        }
    }).catch(function (err) {
        console.error("Capture error:", err);
        if (window.SHMToast) window.SHMToast.danger('Gagal menangkap gambar: ' + err.message, 'Cable Tension');
    });
};
