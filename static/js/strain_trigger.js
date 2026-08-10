/**
 * Main initialization function for the Strain Trigger Monitoring page.
 * Sets up amCharts 5 elements, Socket.IO listeners, and UI controls.
 */
am5.ready(function () {
    // ---- 0. Theme Helpers ----
    /**
     * Returns true if the current page theme is dark.
     */
    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    /**
     * Returns the appropriate axis label/title color based on current theme.
     * White (#ffffff) for dark, slate (#64748b) for light.
     */
    function axisLabelColor() {
        return isDarkTheme() ? am5.color(0xffffff) : am5.color(0x64748b);
    }

    /**
     * Returns the appropriate grid line color based on current theme.
     * Subtle white for dark, subtle gray for light.
     */
    function gridColor() {
        return isDarkTheme() ? am5.color(0xffffff) : am5.color(0x000000);
    }

    /**
     * Applies grid line styling to an axis renderer.
     * @param {object} renderer - amCharts axis renderer
     */
    function applyGridStyle(renderer) {
        renderer.grid.template.setAll({
            stroke: gridColor(),
            strokeOpacity: 0.15,
            strokeDasharray: [2, 3]
        });
    }
    // ---- 1. Initialization and States ----
    const E_MODULUS = 200000; // MPa (Steel)
    let isPaused = true;
    let dataPoints = [];
    const MAX_POINTS = 3000;
    let globalTick = 0;
    let screenshotCount = 0;
    let peakStrain = 0;

    // ---- 2. root elements ----
    const strainRoot = am5.Root.new("strain-chart");
    const gaugeRoot = am5.Root.new("stress-gauge");

    strainRoot.setThemes([am5themes_Animated.new(strainRoot)]);
    gaugeRoot.setThemes([am5themes_Animated.new(gaugeRoot)]);

    // ---- 3. Real-Time Strain Chart Setup ----
    const strainChart = strainRoot.container.children.push(
        am5xy.XYChart.new(strainRoot, {
            panX: true,
            wheelX: "panX",
            layout: strainRoot.verticalLayout
        })
    );

    const sXAxis = strainChart.xAxes.push(
        am5xy.ValueAxis.new(strainRoot, {
            renderer: am5xy.AxisRendererX.new(strainRoot, { minGridDistance: 50 }),
            tooltip: am5.Tooltip.new(strainRoot, {}),
            strictMinMax: true,
            extraMin: 0,
            extraMax: 0
        })
    );
    applyGridStyle(sXAxis.get("renderer"));

    const sYAxis = strainChart.yAxes.push(
        am5xy.ValueAxis.new(strainRoot, {
            renderer: am5xy.AxisRendererY.new(strainRoot, {}),
            extraMin: 0.1,
            extraMax: 0.1
        })
    );
    applyGridStyle(sYAxis.get("renderer"));
    const sYAxisLabel = sYAxis.children.unshift(am5.Label.new(strainRoot, {
        text: "Strain (με)",
        textAlign: "center",
        y: am5.p50,
        rotation: -90,
        fontWeight: "bold",
        fill: axisLabelColor()
    }));

    // Apply theme color to sXAxis renderer labels
    sXAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });
    // Apply theme color to sYAxis renderer labels
    sYAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });


    const sSeries = strainChart.series.push(
        am5xy.LineSeries.new(strainRoot, {
            name: "Strain",
            xAxis: sXAxis,
            yAxis: sYAxis,
            valueYField: "value",
            valueXField: "index",
            stroke: am5.color(0x22c55e)
        })
    );
    sSeries.strokes.template.setAll({ strokeWidth: 2 });
    sSeries.fills.template.setAll({ visible: true, fillOpacity: 0.1 });

    // ===============================
    // Shared Tooltip Series (Restored & Styled)
    // ===============================
    var tooltipSeries = strainChart.series.push(am5xy.LineSeries.new(strainRoot, {
        name: "Tooltip Series",
        xAxis: sXAxis,
        yAxis: sYAxis,
        valueYField: "value",
        valueXField: "index",
        opacity: 0,
        tooltip: am5.Tooltip.new(strainRoot, {
            getFillFromSprite: false,
            labelText: "[#ffffff]{time}[/]\n[bold#ffffff]Strain:[/] [#ffffff]{value} με[/]",
            pointerOrientation: "horizontal"
        })
    }));

    tooltipSeries.get("tooltip").get("background").setAll({
        fill: am5.color(0x818cf8), // Indigo background from screenshot
        fillOpacity: 0.9,
        stroke: am5.color(0x818cf8),
        cornerRadius: 6
    });

    tooltipSeries.strokes.template.set("visible", false);
    tooltipSeries.fills.template.set("visible", false);

    // X-Axis Tooltip (Black Label at bottom)
    sXAxis.set("tooltip", am5.Tooltip.new(strainRoot, {
        themeTags: ["axis"],
        animationDuration: 200
    }));

    sXAxis.get("tooltip").get("background").setAll({
        fill: am5.color(0x1e293b), // Dark background for X-axis
        fillOpacity: 1,
        cornerRadius: 4
    });


    // Cursor for Snapping
    const cursorXy = strainChart.set("cursor", am5xy.XYCursor.new(strainRoot, {
        xAxis: sXAxis,
        behavior: "zoomX",
        snapToSeries: [tooltipSeries]
    }));
    cursorXy.lineY.set("visible", false);

    // updateLatestTooltip removed
    function updateTooltipText() {
        const strainActive = !document.getElementById('toggle-strain').classList.contains('hidden');

        let labelRows = ["{time}"];
        if (strainActive) labelRows.push("[bold]Strain:[/] {value} με");

        tooltipSeries.get("tooltip").set("labelText", labelRows.join("\n"));

        if (!strainActive) {
            tooltipSeries.hide();
            sYAxis.hide();
        } else {
            tooltipSeries.show();
            if (strainActive) sYAxis.show(); else sYAxis.hide();
        }
    }

    // ---- 4. Radial Stress Gauge Setup ----
    const gaugeChart = gaugeRoot.container.children.push(
        am5radar.RadarChart.new(gaugeRoot, {
            panX: false,
            panY: false,
            startAngle: -180,
            endAngle: 0,
            innerRadius: -20
        })
    );

    const gAxisRenderer = am5radar.AxisRendererCircular.new(gaugeRoot, {
        strokeOpacity: 0.1,
        minGridDistance: 30
    });

    gAxisRenderer.labels.template.setAll({ fontSize: "0.7rem", fill: am5.color(0x94a3b8) });

    const gAxis = gaugeChart.xAxes.push(
        am5xy.ValueAxis.new(gaugeRoot, {
            min: -100, // Max Compression MPa
            max: 100,  // Max Tension MPa
            strictMinMax: true,
            renderer: gAxisRenderer
        })
    );

    // Range colors
    /**
     * Helper to create color ranges on the radial stress gauge.
     * @param {number} start - Start value of the range
     * @param {number} end - End value of the range
     * @param {number} color - Hex color code
     */
    function createRange(start, end, color) {
        let rangeDataItem = gAxis.makeDataItem({ value: start, endValue: end });
        gAxis.createAxisRange(rangeDataItem);
        rangeDataItem.get("axisFill").setAll({ visible: true, fill: am5.color(color), fillOpacity: 0.5 });
    }
    createRange(-100, -60, 0xef4444); // High Comp
    createRange(-60, 60, 0x22c55e);  // Safe
    createRange(60, 100, 0xef4444);   // High Tension

    const gDataItem = gAxis.makeDataItem({ value: 0 });
    const clockHand = am5radar.ClockHand.new(gaugeRoot, {
        pinRadius: 10,
        radius: am5.percent(90),
        bottomWidth: 10
    });
    gDataItem.set("bullet", am5.Bullet.new(gaugeRoot, {
        sprite: clockHand
    }));
    gAxis.createAxisRange(gDataItem);

    // ---- Theme Change Observer ----
    // Watch for data-theme attribute changes on <html> and update axis label + grid colors
    const _themeObserver = new MutationObserver(() => {
        const c = axisLabelColor();
        sXAxis.get("renderer").labels.template.setAll({ fill: c });
        sYAxis.get("renderer").labels.template.setAll({ fill: c });
        sYAxisLabel.set("fill", c);
        // Refresh grid colors
        applyGridStyle(sXAxis.get("renderer"));
        applyGridStyle(sYAxis.get("renderer"));
    });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const MAX_TOTAL_RECORDS = 1000;
    const ROWS_PER_PAGE = 50;
    let tableCurrentPage = 1;
    const snapshotHistory = [];

    const tableBody = document.getElementById("snapshot-table-body");
    const tableInfo = document.getElementById("table-entries-info");
    const tablePagination = document.getElementById("table-pagination");

    /**
     * Renders the real-time snapshot table with current session data.
     * Handles pagination and status coloring.
     */
    function renderSnapshotTable() {
        if (!tableBody) return;

        // Calculate paging
        const total = snapshotHistory.length;
        const totalPages = Math.ceil(total / ROWS_PER_PAGE) || 1;

        // Ensure current page is valid
        if (tableCurrentPage > totalPages) tableCurrentPage = totalPages;
        if (tableCurrentPage < 1) tableCurrentPage = 1;

        const start = (tableCurrentPage - 1) * ROWS_PER_PAGE;
        const end = Math.min(start + ROWS_PER_PAGE, total);
        const pagedData = snapshotHistory.slice(start, end);

        // Render Table Body
        tableBody.innerHTML = pagedData.map(d => {
            let statusText = "NORMAL";
            let statusClass = "status-normal";
            const absStrain = Math.abs(d.strain);
            if (absStrain > 40) { statusText = "CRITICAL"; statusClass = "status-critical"; }
            else if (absStrain > 25) { statusText = "WARNING"; statusClass = "status-warning"; }

            return `<tr>
                <td>${d.time}</td>
                <td style="font-weight: 700;">${d.strain.toFixed(2)}</td>
                <td>${d.stress.toFixed(3)}</td>
                <td><span class="table-status ${statusClass}">${statusText}</span></td>
            </tr>`;
        }).join('');

        // Update Info
        if (total > 0) {
            tableInfo.innerText = `Showing ${start + 1} to ${end} of ${total} entries`;
        } else {
            tableInfo.innerText = `Showing 0 to 0 of 0 entries`;
        }

        // Render Pagination
        renderPaginationUI(totalPages);
    }

    /**
     * Generates pagination buttons for the snapshot table.
     * @param {number} totalPages - Total number of calculated pages
     */
    function renderPaginationUI(totalPages) {
        if (!tablePagination) return;
        tablePagination.innerHTML = '';

        // Prev Button
        const prevBtn = document.createElement("button");
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prevBtn.disabled = tableCurrentPage === 1;
        prevBtn.onclick = () => { tableCurrentPage--; renderSnapshotTable(); };
        tablePagination.appendChild(prevBtn);

        // Page Numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= tableCurrentPage - 1 && i <= tableCurrentPage + 1)) {
                const pBtn = document.createElement("button");
                pBtn.innerText = i;
                if (i === tableCurrentPage) pBtn.className = "active";
                pBtn.onclick = () => { tableCurrentPage = i; renderSnapshotTable(); };
                tablePagination.appendChild(pBtn);
            } else if (i === tableCurrentPage - 2 || i === tableCurrentPage + 2) {
                const dots = document.createElement("span");
                dots.innerText = "...";
                dots.style.margin = "0 5px";
                dots.style.color = "var(--text-muted)";
                tablePagination.appendChild(dots);
            }
        }

        // Next Button
        const nextBtn = document.createElement("button");
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        nextBtn.disabled = tableCurrentPage === totalPages || snapshotHistory.length === 0;
        nextBtn.onclick = () => { tableCurrentPage++; renderSnapshotTable(); };
        tablePagination.appendChild(nextBtn);
    }

    /**
     * Adds a new data record to the snapshot history and manages size limits.
     * @param {string} time - Formatted time string
     * @param {number} strain - Strain value in microstrain
     * @param {number} stress - Calculated stress in MPa
     */
    /**
     * Adds a new data record to the snapshot table using efficient DOM manipulation.
     * Keeps only the latest 10 rows to ensure performance.
     */
    function addToSnapshotTableEfficient(time, strain, stress) {
        if (!tableBody) return;

        // Add to history buffer for stats if needed
        snapshotHistory.unshift({ time, strain, stress });
        if (snapshotHistory.length > MAX_TOTAL_RECORDS) snapshotHistory.pop();

        // Real-time table throttling (only update DOM if absolutely necessary or at intervals)
        // Here we use the insertBefore + removeChild pattern similar to Acc KDI

        let statusText = "NORMAL";
        let statusClass = "status-normal";
        const absStrain = Math.abs(strain);
        if (absStrain > 250) { statusText = "CRITICAL"; statusClass = "status-critical"; }
        else if (absStrain > 150) { statusText = "WARNING"; statusClass = "status-warning"; }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${time}</td>
            <td style="font-weight: 700;">${strain.toFixed(2)}</td>
            <td>${stress.toFixed(3)}</td>
            <td><span class="table-status ${statusClass}">${statusText}</span></td>
        `;

        tableBody.insertBefore(tr, tableBody.firstChild);

        // Keep only top 10 for performance
        if (tableBody.children.length > 10) {
            tableBody.removeChild(tableBody.lastChild);
        }

        // Update Total Info occasionally (not every packet)
        if (globalTick % 50 === 0) {
            tableInfo.innerText = `Showing 1 to ${tableBody.children.length} of ${snapshotHistory.length} total entries`;
        }
    }

    // Original addToSnapshotTable kept for backward compatibility if needed, 
    // but replaced by addToSnapshotTableEfficient in the main loop.
    function addToSnapshotTable(time, strain, stress) {
        addToSnapshotTableEfficient(time, strain, stress);
    }

    // ---- 6. Socket.IO & Streaming Logic ----
    const socket = io();
    console.log("Socket.IO initialized, waiting for connection...");

    socket.on("connect", () => {
        console.log("Connected to SHMS server via Socket.IO");
    });

    socket.on("connect_error", (err) => {
        console.error("Socket.IO connection error:", err);
    });

    /**
     * Listens for real-time updates from the server via Socket.IO.
     * Updates charts, gauges, cards, and the snapshot table.
     */
    socket.on("strain_trigger_update", (payload) => {
        console.log("Data received from server:", payload);
        // Hanya proses sensor tertentu jika diperlukan
        const targetSensor = window.CURRENT_SENSOR_ID || "STRAIN_05";
        if (payload.sensor_id !== targetSensor) return;
        if (isPaused) return;
        globalTick++;
        const mv = payload.mv || 0;
        const co = payload.co || 1;
        const strain_ue = payload.strain_ue;
        const time_str = payload.time || new Date().toLocaleTimeString();
        const currentStress = (strain_ue * 1e-6 * E_MODULUS);

        // Update cards
        document.getElementById("card-last-update").innerText = time_str;

        const strainEl = document.getElementById("card-strain");
        strainEl.innerText = strain_ue.toFixed(2);

        // Color strain based on value
        if (Math.abs(strain_ue) > 250) strainEl.style.color = "#ef4444";
        else if (Math.abs(strain_ue) > 150) strainEl.style.color = "#f59e0b";
        else strainEl.style.color = "#22c55e";

        document.getElementById("card-stress").innerText = currentStress.toFixed(3);

        if (Math.abs(strain_ue) > peakStrain) {
            peakStrain = Math.abs(strain_ue);
            document.getElementById("card-peak-strain").innerText = peakStrain.toFixed(2);
        }

        // Update Gauge
        gDataItem.animate({
            key: "value",
            to: currentStress,
            duration: 100, // Very fast for 100 Hz
            easing: am5.ease.out(am5.ease.linear)
        });
        document.getElementById("gauge-label").innerText = currentStress > 0 ? "TENSION" : "COMPRESSION";

        // Push to Real-time Chart (Both Strain )
        const pointXy = {
            index: globalTick,
            date: payload.timestamp,
            time: time_str,
            value: strain_ue
        };
        dataPoints.push(pointXy);

        sSeries.data.push(pointXy);
        tooltipSeries.data.push(pointXy);

        if (dataPoints.length > MAX_POINTS) {
            dataPoints.shift();
            sSeries.data.shift();
            tooltipSeries.data.shift();
        }

        // Manual Axis Range Management
        if (dataPoints.length > 0) {
            sXAxis.set("min", dataPoints[0].index);
            sXAxis.set("max", dataPoints[dataPoints.length - 1].index);
        }

        // Update Snapshot Table (Efficient approach)
        addToSnapshotTableEfficient(time_str, strain_ue, currentStress);
    });

    // ---- 7. Controls ----
    const stopBtn = document.getElementById("btn-stop-start");
    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            stopBtn.innerText = isPaused ? "Start" : "Stop";
            stopBtn.className = isPaused ? "strain-btn strain-btn-green" : "strain-btn strain-btn-blue";
            
            const sensorId = window.CURRENT_SENSOR_ID || "STRAIN_05";
            if (isPaused) {
                socket.emit('unsubscribe_sensor', { sensor_id: sensorId, type: 'strain' });
            } else {
                socket.emit('subscribe_sensor', { sensor_id: sensorId, type: 'strain' });
            }
        });
    }

    // Ensure we unsubscribe when the page is closed/refreshed
    window.addEventListener("beforeunload", () => {
        if (!isPaused) {
            socket.emit('unsubscribe_sensor', { sensor_id: window.CURRENT_SENSOR_ID || "STRAIN_05", type: 'strain' });
        }
    });

    const screenshotBtn = document.getElementById("btn-screenshot");
    if (screenshotBtn) {
        screenshotBtn.addEventListener("click", () => {
            const captureArea = document.getElementById("capture-zone");
            if (!captureArea) return;

            screenshotBtn.style.color = "#22c55e";
            setTimeout(() => screenshotBtn.style.color = "", 600);

            const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-body').trim() || "#f0f2f9";

            html2canvas(captureArea, {
                backgroundColor: bgColor,
                scale: 2,
                useCORS: true,
                scrollY: -window.scrollY
            }).then(canvas => {
                const link = document.createElement('a');
                const now = new Date();
                const ds = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                screenshotCount++;
                const num = String(screenshotCount).padStart(2, '0');
                link.download = `strain-snapshot-${ds}-${num}.png`;
                link.href = canvas.toDataURL();
                link.click();
            });
        });
    }

    // ---- 8. Legend Toggling ----
    /**
     * Sets up interactive legend toggling for chart series.
     * @param {string} id - HTML element ID of the legend item
     * @param {object} series - amCharts series to show/hide
     * @param {object} axis - Optional Y-axis to show/hide
     */
    function setupLegendToggle(id, series, axis) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", () => {
            if (series.get("visible")) {
                series.hide();
                if (axis) axis.hide();
                el.classList.add("hidden");
            } else {
                series.show();
                if (axis) axis.show();
                el.classList.remove("hidden");
            }
            updateTooltipText();
        });
    }

    setupLegendToggle("toggle-strain", sSeries, sYAxis);
});
