/**
 * Strain Dywidag Monitoring JS (Dynamic)
 * Handles real-time updates for any number of sensors from HiveMQ.
 */
am5.ready(function () {
    // ---- Theme Helpers ----
    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }
    function axisLabelColor() {
        return isDarkTheme() ? am5.color(0xffffff) : am5.color(0x64748b);
    }
    function gridColor() {
        return isDarkTheme() ? am5.color(0xffffff) : am5.color(0x000000);
    }
    function applyGridStyle(renderer) {
        renderer.grid.template.setAll({
            stroke: gridColor(),
            strokeOpacity: 0.15,
            strokeDasharray: [2, 3]
        });
    }

    // ---- Initialization and States ----
    let isPaused = false;
    let globalTick = 0;
    const MAX_POINTS = 100;
    const DYWIDAG_THRESHOLDS = {
        tension_warn:       1.0,
        tension_crit:       1.5,
        compression_warn:   1.0,
        compression_crit:   1.5
    };
    const sensorRegistry = {}; // Store series, cards, and peaks
    const colors = [0x22c55e, 0x818cf8, 0xf59e0b, 0xef4444, 0x06b6d4, 0xec4899, 0x8b5cf6, 0x10b981];
    let colorIndex = 0;

    // ---- root elements ----
    const root = am5.Root.new("strain-chart");
    root.setThemes([am5themes_Animated.new(root)]);

    // ---- Chart Setup ----
    const chart = root.container.children.push(
        am5xy.XYChart.new(root, {
            panX: true,
            wheelX: "panX",
            layout: root.verticalLayout
        })
    );

    const xAxis = chart.xAxes.push(
        am5xy.ValueAxis.new(root, {
            renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 50 }),
            tooltip: am5.Tooltip.new(root, {}),
            strictMinMax: true
        })
    );
    applyGridStyle(xAxis.get("renderer"));

    const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
            renderer: am5xy.AxisRendererY.new(root, {}),
            extraMin: 0.1,
            extraMax: 0.1
        })
    );
    applyGridStyle(yAxis.get("renderer"));

    xAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });
    yAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });

    // Cursor
    chart.set("cursor", am5xy.XYCursor.new(root, {
        xAxis: xAxis,
        behavior: "zoomX"
    }));

    // ---- Dynamic Components ----
    const summaryRow = document.getElementById("dynamic-summary-row");
    const legendContainer = document.getElementById("dynamic-legend");

    function getOrCreateSensor(name) {
        if (sensorRegistry[name]) return sensorRegistry[name];

        const color = colors[colorIndex % colors.length];
        colorIndex++;

        // 1. Create Series
        const series = chart.series.push(
            am5xy.LineSeries.new(root, {
                name: name,
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "value",
                valueXField: "index",
                stroke: am5.color(color),
                tooltip: am5.Tooltip.new(root, {
                    getFillFromSprite: false,
                    labelText: "{name}\n[bold]{valueY}[/] με"
                })
            })
        );

        // Styling the tooltip to match the bubble look
        series.get("tooltip").get("background").setAll({
            fill: am5.color(color),
            fillOpacity: 0.9,
            strokeOpacity: 0
        });

        series.strokes.template.setAll({ strokeWidth: 2 });

        // Add bubbles (bullets) to every data point
        series.bullets.push(function () {
            return am5.Bullet.new(root, {
                sprite: am5.Circle.new(root, {
                    radius: 5,
                    fill: root.interfaceColors.get("background"),
                    stroke: am5.color(color),
                    strokeWidth: 2
                })
            });
        });

        // Initial visibility
        if (window.CURRENT_SENSOR_ID && window.CURRENT_SENSOR_ID !== "All Sensors" && name !== window.CURRENT_SENSOR_ID) {
            series.hide();
        }

        // 2. Create Summary Card
        const cardHtml = `
            <div class="strain-summary-card" id="card-${name}">
                <div class="strain-card-icon" style="background: ${am5.color(color).toCSS()}; opacity: 0.8;"><i class="fa-solid fa-microchip"></i></div>
                <span class="label">${name}</span>
                <div style="display: flex; gap: 8px; align-items: baseline;">
                    <span class="value sensor-value" style="color: ${am5.color(color).toCSS()};">0.00</span>
                    <small style="color: var(--text-muted); font-size: 0.8rem;">με</small>
                </div>
                <span style="font-size:0.65rem; color:var(--text-muted); font-weight:600;" class="sensor-status">STATUS: NORMAL</span>
            </div>
            <div class="strain-summary-card" id="peak-${name}">
                <div class="strain-card-icon" style="background: ${am5.color(color).toCSS()}; opacity: 0.4;"><i class="fa-solid fa-arrow-up-right-dots"></i></div>
                <span class="label">Peak (${name})</span>
                <div style="display: flex; gap: 8px; align-items: baseline;">
                    <span class="value peak-value">0.00</span>
                    <small style="color: var(--text-muted); font-size: 0.8rem;">με</small>
                </div>
            </div>
        `;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHtml;
        while (tempDiv.firstChild) summaryRow.appendChild(tempDiv.firstChild);

        // 3. Create Legend Item
        const legendItem = document.createElement("div");
        legendItem.className = "legend-item" + (series.get("visible") ? "" : " hidden");
        legendItem.innerHTML = `<span class="dot" style="background: ${am5.color(color).toCSS()};"></span> ${name}`;
        legendItem.onclick = () => {
            if (series.get("visible")) {
                series.hide();
                legendItem.classList.add("hidden");
            } else {
                series.show();
                legendItem.classList.remove("hidden");
            }
        };
        legendContainer.appendChild(legendItem);

        sensorRegistry[name] = {
            series: series,
            peak: 0,
            valueEl: document.querySelector(`#card-${name} .sensor-value`),
            statusEl: document.querySelector(`#card-${name} .sensor-status`),
            peakEl: document.querySelector(`#peak-${name} .peak-value`),
            legendEl: legendItem
        };

        return sensorRegistry[name];
    }

    // ---- Table Logic ----
    const tableBody = document.getElementById("snapshot-table-body");
    const snapshotHistory = [];

    function addToTable(time, name, value) {
        if (!tableBody) return;
        snapshotHistory.unshift({ time, name, value });
        if (snapshotHistory.length > 100) snapshotHistory.pop();

        // Sort by value ascending
        const sorted = [...snapshotHistory].sort((a, b) => a.value - b.value);

        tableBody.innerHTML = "";
        sorted.slice(0, 15).forEach(item => {
            const tr = document.createElement("tr");
            const abs = Math.abs(item.value);
            const t = DYWIDAG_THRESHOLDS;
            const crit = item.value >= 0 ? t.tension_crit : t.compression_crit;
            const warn = item.value >= 0 ? t.tension_warn : t.compression_warn;
            let status = "NORMAL", statusClass = "status-normal";
            if (crit && abs >= crit) { status = "CRITICAL"; statusClass = "status-critical"; }
            else if (warn && abs >= warn) { status = "WARNING"; statusClass = "status-warning"; }

            tr.innerHTML = `
                <td>${item.time}</td>
                <td>${item.name}</td>
                <td style="font-weight:700;">${item.value.toFixed(4)}</td>
                <td><span class="table-status ${statusClass}">${status}</span></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // ---- Socket.IO ----
    const socket = io();
    socket.on("dywidag_update", (payload) => {
        console.log("[DYWIDAG JS DEBUG] Received:", payload);
        if (isPaused) return;

        const { name, value, time } = payload;
        const sensor = getOrCreateSensor(name);
        
        globalTick++;
        document.getElementById("card-last-update").innerText = time;

        // Update Cards
        sensor.valueEl.innerText = value.toFixed(4);
        if (Math.abs(value) > sensor.peak) {
            sensor.peak = Math.abs(value);
            sensor.peakEl.innerText = sensor.peak.toFixed(4);
        }

        // Update Series
        sensor.series.data.push({ index: globalTick, value: value });
        if (sensor.series.data.length > MAX_POINTS) sensor.series.data.shift();

        xAxis.set("min", globalTick - MAX_POINTS > 0 ? globalTick - MAX_POINTS : 0);
        xAxis.set("max", globalTick);

        addToTable(time, name, value);
    });

    // ---- Controls ----
    const stopBtn = document.getElementById("btn-stop-start");
    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            stopBtn.innerText = isPaused ? "Start" : "Stop";
            stopBtn.className = isPaused ? "strain-btn strain-btn-green" : "strain-btn strain-btn-blue";
        });
    }

    const screenshotBtn = document.getElementById("btn-screenshot");
    if (screenshotBtn) {
        screenshotBtn.addEventListener("click", () => {
            const captureArea = document.getElementById("capture-zone");
            html2canvas(captureArea).then(canvas => {
                const link = document.createElement('a');
                link.download = `dywidag-snapshot-${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
            });
        });
    }

    // Theme observer
    const _themeObserver = new MutationObserver(() => {
        const c = axisLabelColor();
        xAxis.get("renderer").labels.template.setAll({ fill: c });
        yAxis.get("renderer").labels.template.setAll({ fill: c });
        applyGridStyle(xAxis.get("renderer"));
        applyGridStyle(yAxis.get("renderer"));
    });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});
