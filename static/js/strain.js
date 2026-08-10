am5.ready(function () {
    // ---- 1. Initialization and States ----
    const E_MODULUS = 200000; // MPa (Steel)
    let isPaused = false;
    let dataPoints = [];
    let trendPoints = [];
    const MAX_POINTS = 500;
    let screenshotCount = 0;
    let peakStrain = 0;

    // ---- 2. root elements ----
    const strainRoot = am5.Root.new("strain-chart");
    const gaugeRoot  = am5.Root.new("stress-gauge");
    const trendRoot  = am5.Root.new("trend-chart");

    strainRoot.setThemes([am5themes_Animated.new(strainRoot)]);
    gaugeRoot.setThemes([am5themes_Animated.new(gaugeRoot)]);
    trendRoot.setThemes([am5themes_Animated.new(trendRoot)]);

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
            maxDeviation: 0.1,
            groupData: false,
            renderer: am5xy.AxisRendererX.new(strainRoot, { minGridDistance: 50 })
        })
    );

    const sYAxis = strainChart.yAxes.push(
        am5xy.ValueAxis.new(strainRoot, {
            renderer: am5xy.AxisRendererY.new(strainRoot, {}),
            min: -50,
            max: 50
        })
    );
    sYAxis.children.unshift(am5.Label.new(strainRoot, {
        text: "Strain (με)",
        textAlign: "center",
        y: am5.p50,
        rotation: -90,
        fontWeight: "bold",
        fill: am5.color(0x94a3b8)
    }));
    // Right Y-Axis for Temperature
    const sYAxisTemp = strainChart.yAxes.push(
        am5xy.ValueAxis.new(strainRoot, {
            renderer: am5xy.AxisRendererY.new(strainRoot, { opposite: true }),
            extraMax: 0.1,
            extraMin: 0.1
        })
    );
    sYAxisTemp.children.push(am5.Label.new(strainRoot, {
        text: "Temperature (°C)",
        textAlign: "center",
        y: am5.p50,
        rotation: 90,
        fontWeight: "bold",
        fill: am5.color(0x94a3b8)
    }));

    const sSeries = strainChart.series.push(
        am5xy.LineSeries.new(strainRoot, {
            name: "Strain",
            xAxis: sXAxis,
            yAxis: sYAxis,
            valueYField: "value",
            valueXField: "index",
            stroke: am5.color(0x22c55e),
            tooltip: am5.Tooltip.new(strainRoot, {
                labelText: "Strain: {valueY} με"
            })
        })
    );
    sSeries.fills.template.setAll({ visible: true, fillOpacity: 0.1 });

    sSeries.bullets.push(function (root, series, dataItem) {
        var container = am5.Container.new(root, {});
        var color = series.get("stroke");
        container.children.push(am5.Circle.new(root, {
            radius: 3,
            fill: root.interfaceColors.get("background"),
            stroke: color,
            strokeWidth: 2
        }));
        return am5.Bullet.new(root, { sprite: container });
    });

    const sSeriesTemp = strainChart.series.push(
        am5xy.LineSeries.new(strainRoot, {
            name: "Temperature",
            xAxis: sXAxis,
            yAxis: sYAxisTemp,
            valueYField: "temp",
            valueXField: "index",
            stroke: am5.color(0x3b82f6),
            tooltip: am5.Tooltip.new(strainRoot, {
                labelText: "Temp: {valueY} °C"
            })
        })
    );

    sSeriesTemp.bullets.push(function (root, series, dataItem) {
        var container = am5.Container.new(root, {});
        var color = series.get("stroke");
        container.children.push(am5.Circle.new(root, {
            radius: 3,
            fill: root.interfaceColors.get("background"),
            stroke: color,
            strokeWidth: 2
        }));
        return am5.Bullet.new(root, { sprite: container });
    });

    // ===============================
    // Shared Tooltip Series
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
            labelText: "[#ffffff]{index}[/]\n[#ffffff][bold]Strain:[/] {value} με\n[#ffffff][bold]Temp:[/] {temp} °C",
            pointerOrientation: "horizontal"
        })
    }));
    tooltipSeries.get("tooltip").get("background").setAll({
        fill: am5.color(0x818cf8), // Indigo background
        fillOpacity: 0.9,
        stroke: am5.color(0x818cf8),
        cornerRadius: 6
    });
    tooltipSeries.strokes.template.set("visible", false);
    tooltipSeries.fills.template.set("visible", false);

    // Cursor for Snapping
    const cursorXy = strainChart.set("cursor", am5xy.XYCursor.new(strainRoot, {
        xAxis: sXAxis,
        behavior: "zoomX",
        snapToSeries: [tooltipSeries]
    }));
    cursorXy.lineY.set("visible", false);

    // ===============================
    // Persistent Label on Latest Point
    // ===============================
    function createLabelSeries(yAxis, color, field, unit, dy) {
        var ls = strainChart.series.push(am5xy.LineSeries.new(strainRoot, {
            xAxis: sXAxis,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "index"
        }));
        ls.strokes.template.setAll({ strokeWidth: 0, strokeOpacity: 0 });
        ls.bullets.push(function (root, series, dataItem) {
            const val = dataItem.get("valueY");
            const text = (val != null) ? val.toFixed(2) + unit : "--" + unit;

            var lbl = am5.Label.new(root, {
                text: text,
                fill: am5.color(0xffffff),
                fontSize: 10,
                fontWeight: "600",
                centerX: am5.p50,
                centerY: am5.p100,
                dy: dy,
                paddingTop: 2, paddingBottom: 2,
                paddingLeft: 6, paddingRight: 6,
                background: am5.RoundedRectangle.new(root, {
                    fill: am5.color(color),
                    fillOpacity: 0.9,
                    cornerRadiusTL: 4, cornerRadiusTR: 4,
                    cornerRadiusBL: 4, cornerRadiusBR: 4,
                    strokeOpacity: 0
                })
            });
            return am5.Bullet.new(root, { locationY: 1, sprite: lbl });
        });
        return ls;
    }

    var xLabelSeries = createLabelSeries(sYAxis, 0x22c55e, 'value', " με", -15);
    var yLabelSeries = createLabelSeries(sYAxisTemp, 0x3b82f6, 'temp', " °C", -15);

    function updateLatestTooltip(point) {
        if (!point) return;
        if (point.value != null) xLabelSeries.data.setAll([{ index: point.index, value: point.value }]);
        if (point.temp != null) yLabelSeries.data.setAll([{ index: point.index, temp: point.temp }]);
    }

    function updateTooltipText() {
        let labelData = ["[bold]Step: {index}[/]"];
        const strainActive = !document.getElementById('toggle-strain').classList.contains('hidden');
        const tempActive = !document.getElementById('toggle-temp').classList.contains('hidden');

        if (strainActive) {
            labelData.push("[bold]Strain:[/] {value} με");
            sYAxis.show();
        } else {
            sYAxis.hide();
        }

        if (tempActive) {
            labelData.push("[bold]Temp:[/] {temp} °C");
            sYAxisTemp.show();
        } else {
            sYAxisTemp.hide();
        }

        tooltipSeries.get("tooltip").set("labelText", labelData.join("\n"));
        
        if (!strainActive && !tempActive) {
            tooltipSeries.hide();
        } else {
            tooltipSeries.show();
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
            min: -15, // Max Compression MPa
            max: 15,  // Max Tension MPa
            strictMinMax: true,
            renderer: gAxisRenderer
        })
    );

    // Range colors
    function createRange(start, end, color) {
        let rangeDataItem = gAxis.makeDataItem({ value: start, endValue: end });
        gAxis.createAxisRange(rangeDataItem);
        rangeDataItem.get("axisFill").setAll({ visible: true, fill: am5.color(color), fillOpacity: 0.5 });
    }
    createRange(-15, -10, 0xef4444); // High Comp
    createRange(-10, 10, 0x22c55e);  // Safe
    createRange(10, 15, 0xef4444);   // High Tension

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

    // ---- 5. Trend Chart Setup ----
    const trendChart = trendRoot.container.children.push(
        am5xy.XYChart.new(trendRoot, {
            panX: true,
            wheelX: "panX",
            layout: trendRoot.verticalLayout
        })
    );
    const tXAxis = trendChart.xAxes.push(am5xy.DateAxis.new(trendRoot, {
        baseInterval: { timeUnit: "minute", count: 1 },
        renderer: am5xy.AxisRendererX.new(trendRoot, {})
    }));
    const tYAxis = trendChart.yAxes.push(am5xy.ValueAxis.new(trendRoot, {
        renderer: am5xy.AxisRendererY.new(trendRoot, {})
    }));
    const tSeries = trendChart.series.push(am5xy.LineSeries.new(trendRoot, {
        xAxis: tXAxis,
        yAxis: tYAxis,
        valueYField: "value",
        valueXField: "date",
        stroke: am5.color(0x3b82f6)
    }));

    const MAX_TOTAL_RECORDS = 500;
    const ROWS_PER_PAGE = 50;
    let tableCurrentPage = 1;
    const snapshotHistory = [];

    const tableBody = document.getElementById("snapshot-table-body");
    const tableInfo = document.getElementById("table-entries-info");
    const tablePagination = document.getElementById("table-pagination");

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
                <td>${d.temp.toFixed(1)}</td>
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

    function addToSnapshotTable(time, strain, stress, temp) {
        // Add to history
        snapshotHistory.unshift({ time, strain, stress, temp });

        // Limit history
        if (snapshotHistory.length > MAX_TOTAL_RECORDS) {
            snapshotHistory.pop();
        }

        // Only auto-render if on page 1
        if (tableCurrentPage === 1) {
            renderSnapshotTable();
        }
    }

    // ---- 6. Socket.IO & Streaming Logic ----
    const socket = io();
    console.log("Socket.IO initialized, waiting for connection...");

    let tick = 0;

    socket.on("connect", () => {
        console.log("Connected to SHMS server via Socket.IO");
    });

    socket.on("connect_error", (err) => {
        console.error("Socket.IO connection error:", err);
    });

    socket.on("strain_update", (payload) => {
        console.log("Data received from server:", payload);
        if (isPaused) return;
        tick++;

        const strain_ue = payload.strain_ue;
        const temp_c = payload.temp_c;
        const time_str = payload.time || new Date().toLocaleTimeString();
        const currentStress = (strain_ue * 1e-6 * E_MODULUS);

        // Update cards
        document.getElementById("card-last-update").innerText = time_str;
        
        const strainEl = document.getElementById("card-strain");
        strainEl.innerText = strain_ue.toFixed(2);
        
        // Color strain based on value
        if (Math.abs(strain_ue) > 40) strainEl.style.color = "#ef4444";
        else if (Math.abs(strain_ue) > 25) strainEl.style.color = "#f59e0b";
        else strainEl.style.color = "#22c55e";

        document.getElementById("card-stress").innerText = currentStress.toFixed(3);
        document.getElementById("card-temp").innerText = temp_c.toFixed(1);
        
        if (Math.abs(strain_ue) > peakStrain) {
            peakStrain = Math.abs(strain_ue);
            document.getElementById("card-peak-strain").innerText = peakStrain.toFixed(2);
        }

        // Update Gauge
        gDataItem.animate({
            key: "value",
            to: currentStress,
            duration: 1000, // Smooth transition over 1s
            easing: am5.ease.out(am5.ease.cubic)
        });
        document.getElementById("gauge-label").innerText = currentStress > 0 ? "TENSION" : "COMPRESSION";

        // Push to Real-time Chart (Both Strain and Temp)
        const pointXy = { index: tick, value: strain_ue, temp: temp_c };
        dataPoints.push(pointXy);
        if (dataPoints.length > MAX_POINTS) dataPoints.shift();
        
        sSeries.data.setAll(dataPoints);
        sSeriesTemp.data.setAll(dataPoints);
        tooltipSeries.data.setAll(dataPoints);

        updateLatestTooltip(pointXy);

        // Update Snapshot Table
        addToSnapshotTable(time_str, strain_ue, currentStress, temp_c);
    });

    // Static trend simulation
    function initTrend() {
        let startTime = new Date().getTime() - (24 * 3600 * 1000);
        for(let i=0; i<1440; i++) {
            trendPoints.push({
                date: startTime + (i * 60 * 1000),
                value: 10 * Math.sin(i * 0.05) + (Math.random() * 2) // Simulating 24h thermal cycle
            });
        }
        tSeries.data.setAll(trendPoints);
    }

    // ---- 7. Controls ----
    const stopBtn = document.getElementById("btn-stop-start");
    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            stopBtn.innerText = isPaused ? "Resume" : "Stop";
            stopBtn.className = isPaused ? "strain-btn strain-btn-green" : "strain-btn strain-btn-blue";
        });
    }

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
                const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
                screenshotCount++;
                const num = String(screenshotCount).padStart(2, '0');
                link.download = `strain-snapshot-${ds}-${num}.png`;
                link.href = canvas.toDataURL();
                link.click();
            });
        });
    }

    // ---- 8. Legend Toggling ----
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
    setupLegendToggle("toggle-temp", sSeriesTemp, sYAxisTemp);

    initTrend();
});
