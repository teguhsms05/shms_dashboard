// ==========================================
// Ynex Dashboard Charts Initialization
// ==========================================

let amChartsRoots = [];

function disposeAllCharts() {
    amChartsRoots.forEach(root => root.dispose());
    amChartsRoots = [];
}

function initAllCharts() {
    disposeAllCharts();

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const chartColor = isDark ? 0xffffff : 0x334155; // Adjust based on text-main
    const gridColor = isDark ? 0xffffff : 0x000000;
    const gridOpacity = 0.05;

    function createSparkline(divId, color) {
        const el = document.getElementById(divId);
        if (!el) return;
        let root = am5.Root.new(divId);
        amChartsRoots.push(root);
        root.setThemes([am5themes_Animated.new(root)]);
        let chart = root.container.children.push(am5xy.XYChart.new(root, { paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 }));
        let xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, { categoryField: "category", renderer: am5xy.AxisRendererX.new(root, { visible: false }), visible: false }));
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, { visible: false }), visible: false }));
        let series = chart.series.push(am5xy.LineSeries.new(root, { xAxis: xAxis, yAxis: yAxis, valueYField: "value", categoryXField: "category", stroke: am5.color(color) }));
        series.strokes.template.setAll({ strokeWidth: 2 });
        let data = [{ category: "1", value: 10 }, { category: "2", value: 15 }, { category: "3", value: 8 }, { category: "4", value: 12 }, { category: "5", value: 18 }, { category: "6", value: 14 }];
        series.data.setAll(data);
        series.appear(1000);
        chart.appear(1000, 100);
    }

    function createRevenueChart() {
        const el = document.getElementById("revenueChart");
        if (!el) return;
        let root = am5.Root.new("revenueChart");
        amChartsRoots.push(root);
        root.setThemes([am5themes_Animated.new(root)]);
        let chart = root.container.children.push(am5xy.XYChart.new(root, { panX: true, panY: true, wheelX: "panX", wheelY: "zoomX", layout: root.verticalLayout }));

        let xRenderer = am5xy.AxisRendererX.new(root, { minGridDistance: 30, stroke: am5.color(0xcccccc), strokeOpacity: 1 });
        xRenderer.labels.template.setAll({ fill: am5.color(chartColor), fontSize: "0.75rem" });
        xRenderer.grid.template.setAll({ strokeOpacity: gridOpacity, stroke: am5.color(gridColor) });

        let xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, { categoryField: "month", renderer: xRenderer, tooltip: am5.Tooltip.new(root, {}) }));

        let yRenderer = am5xy.AxisRendererY.new(root, { stroke: am5.color(0xcccccc), strokeOpacity: 1 });
        yRenderer.labels.template.setAll({ fill: am5.color(chartColor), fontSize: "0.75rem" });
        yRenderer.grid.template.setAll({ strokeOpacity: gridOpacity, stroke: am5.color(gridColor) });
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: yRenderer }));

        function createSeries(name, field, color, dashed) {
            let series = chart.series.push(am5xy.LineSeries.new(root, { name: name, xAxis: xAxis, yAxis: yAxis, valueYField: field, categoryXField: "month", stroke: am5.color(color), tooltip: am5.Tooltip.new(root, { labelText: "{name}: {valueY}" }) }));
            series.strokes.template.setAll({ strokeWidth: 2 });
            if (dashed) series.strokes.template.setAll({ strokeDasharray: [5, 5] });
            return series;
        }

        let series1 = createSeries("Sales", "sales", 0x8b5cf6, false);   // Purple Solid
        let series2 = createSeries("Revenue", "revenue", 0x3b82f6, true); // Blue Dashed
        let series3 = createSeries("Profit", "profit", 0x6366f1, false);  // Light Purple/Indigo Solid

        let data = [
            { month: "Jan", sales: 200, revenue: 150, profit: 100 },
            { month: "Feb", sales: 300, revenue: 220, profit: 150 },
            { month: "Mar", sales: 250, revenue: 180, profit: 120 },
            { month: "Apr", sales: 400, revenue: 310, profit: 210 },
            { month: "May", sales: 350, revenue: 250, profit: 170 },
            { month: "Jun", sales: 500, revenue: 400, profit: 300 },
            { month: "Jul", sales: 450, revenue: 320, profit: 220 },
            { month: "Aug", sales: 600, revenue: 480, profit: 350 },
            { month: "Sep", sales: 550, revenue: 420, profit: 300 },
            { month: "Oct", sales: 700, revenue: 550, profit: 400 },
            { month: "Nov", sales: 650, revenue: 500, profit: 350 },
            { month: "Dec", sales: 800, revenue: 620, profit: 450 }
        ];
        xAxis.data.setAll(data);
        series1.data.setAll(data);
        series2.data.setAll(data);
        series3.data.setAll(data);
        chart.set("cursor", am5xy.XYCursor.new(root, {}));
        series1.appear(); series2.appear(); series3.appear(); chart.appear(1000, 100);
    }

    function createLeadsDonutChart() {
        const el = document.getElementById("leadsDonutChart");
        if (!el) return;
        let root = am5.Root.new("leadsDonutChart");
        amChartsRoots.push(root);
        root.setThemes([am5themes_Animated.new(root)]);
        let chart = root.container.children.push(am5percent.PieChart.new(root, { innerRadius: am5.percent(75) }));
        let series = chart.series.push(am5percent.PieSeries.new(root, { valueField: "value", categoryField: "category", alignLabels: false }));

        // Custom colors: Purple, Sky Blue, Teal Green, Orange
        series.get("colors").set("colors", [am5.color(0x8b5cf6), am5.color(0x38bdf8), am5.color(0x10b981), am5.color(0xf59e0b)]);
        series.labels.template.set("forceHidden", true);
        series.ticks.template.set("forceHidden", true);

        // Add Center Labels
        let label1 = chart.seriesContainer.children.push(am5.Label.new(root, {
            text: "Total",
            fontSize: "0.8rem",
            fontWeight: "500",
            fill: am5.color(chartColor),
            centerX: am5.p50,
            centerY: am5.p50,
            dy: -10
        }));

        let label2 = chart.seriesContainer.children.push(am5.Label.new(root, {
            text: "4,145",
            fontSize: "1.2rem",
            fontWeight: "700",
            fill: am5.color(chartColor),
            centerX: am5.p50,
            centerY: am5.p50,
            dy: 10
        }));

        series.data.setAll([{ category: "Mobile", value: 1624 }, { category: "Desktop", value: 1267 }, { category: "Laptop", value: 1153 }, { category: "Tablet", value: 679 }]);
        series.appear(1000, 100);
        chart.appear(1000, 100);
    }

    function createProfitChart() {
        const el = document.getElementById("profitChart");
        if (!el) return;
        let root = am5.Root.new("profitChart");
        amChartsRoots.push(root);
        root.setThemes([am5themes_Animated.new(root)]);
        let chart = root.container.children.push(am5xy.XYChart.new(root, { panX: false, panY: false, wheelX: "none", wheelY: "none" }));

        let xRenderer = am5xy.AxisRendererX.new(root, { minGridDistance: 30, stroke: am5.color(0xcccccc), strokeOpacity: 1 });
        xRenderer.labels.template.setAll({ fill: am5.color(chartColor), fontSize: "0.75rem" });
        xRenderer.grid.template.setAll({ visible: false });
        let xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, { categoryField: "day", renderer: xRenderer }));

        let yRenderer = am5xy.AxisRendererY.new(root, {});
        yRenderer.labels.template.setAll({ fill: am5.color(chartColor), fontSize: "0.75rem" });
        yRenderer.grid.template.setAll({ strokeOpacity: gridOpacity, stroke: am5.color(gridColor) });
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: yRenderer }));

        let series = chart.series.push(am5xy.ColumnSeries.new(root, { xAxis: xAxis, yAxis: yAxis, valueYField: "value", categoryXField: "day", fill: am5.color(0x8b5cf6) }));
        series.columns.template.setAll({ cornerRadiusTL: 5, cornerRadiusTR: 5, strokeOpacity: 1, stroke: am5.color(0xcccccc), strokeWidth: 1 });
        let data = [{ day: "S", value: 50 }, { day: "M", value: 80 }, { day: "T", value: 60 }, { day: "W", value: 90 }, { day: "T", value: 70 }, { day: "F", value: 85 }, { day: "S", value: 100 }];
        xAxis.data.setAll(data);
        series.data.setAll(data);
        series.appear(1000);
        chart.appear(1000, 100);
    }

    // Initialize All
    const sparkContainers = ["chart-customers", "chart-revenue-spark", "chart-conversion-spark", "chart-deals-spark"];
    const sparkColors = [0x8b5cf6, 0x3b82f6, 0x10b981, 0xf59e0b];
    sparkContainers.forEach((id, i) => createSparkline(id, sparkColors[i]));

    function createPiGauge(piValue) {
        const el = document.getElementById("piGauge");
        if (!el) return;
        let root = am5.Root.new("piGauge");
        amChartsRoots.push(root);
        root.setThemes([am5themes_Animated.new(root)]);

        let chart = root.container.children.push(am5percent.PieChart.new(root, {
            innerRadius: am5.percent(85),
            startAngle: -90,
            endAngle: 270
        }));

        let series = chart.series.push(am5percent.PieSeries.new(root, {
            valueField: "value",
            categoryField: "category",
            alignLabels: false
        }));

        series.labels.template.set("forceHidden", true);
        series.ticks.template.set("forceHidden", true);

        // Colors: White for progress, semi-transparent white for background
        series.get("colors").set("colors", [
            am5.color(0xf0f2f9),
            am5.color(0xbbb4e5)
        ]);

        // Background slice opacity
        series.slices.template.setAll({
            strokeOpacity: 0
        });

        series.slices.template.adapters.add("fillOpacity", function (fillOpacity, target) {
            if (target.dataItem.get("category") === "Background") {
                return 0.2;
            }
            return 1;
        });

        // Center Label
        chart.seriesContainer.children.push(am5.Label.new(root, {
            text: piValue.toFixed(1),
            fontSize: "1rem",
            fontWeight: "700",
            fill: am5.color(0xffffff),
            centerX: am5.p50,
            centerY: am5.p50
        }));

        series.data.setAll([
            { category: "Progress", value: piValue },
            { category: "Background", value: 100 - piValue }
        ]);

        series.appear(1000, 100);
        chart.appear(1000, 100);
    }

    createRevenueChart();
    createLeadsDonutChart();
    createProfitChart();

    // ===============================
    // PI Card: Dynamic OR / TR / PI
    // ===============================
    async function loadPiStats() {
        try {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            const start = `${y}-${String(m + 1).padStart(2, '0')}-01 00:00:00`;
            const lastDay = new Date(y, m + 1, 0).getDate();
            const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;

            const res = await fetch(`/api/monitoring-summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
            const data = await res.json();

            if (!data || data.length === 0) {
                createPiGauge(0);
                return;
            }

            // Operation Rate (same logic as report_monthly.js)
            const totalChannels = data.length;
            const normalChannels = data.filter(d => d.operation_ok).length;
            const orRate = totalChannels > 0 ? (normalChannels / totalChannels * 100) : 0;

            // Threshold Setting Rate
            const thresholdOk = data.filter(d => d.threshold_ok).length;
            const trRate = totalChannels > 0 ? (thresholdOk / totalChannels * 100) : 0;

            // Service Period Score
            const shmsAgeYears = 1;
            const ssScore = 30 - (2 * shmsAgeYears);

            // Performance Index
            const orScore = orRate > 0 ? (orRate / 100 * 30) : 0;
            const trScore = trRate > 0 ? (trRate / 100 * 40) : 0;
            const pi = orScore + trScore + ssScore;

            // Update DOM
            const orEl = document.getElementById("pi-or");
            const trEl = document.getElementById("pi-tr");
            if (orEl) orEl.textContent = orRate.toFixed(0) + " %";
            if (trEl) trEl.textContent = trRate.toFixed(0) + " %";

            createPiGauge(pi);
        } catch (e) {
            console.warn("PI stats error:", e);
            if (window.SHMToast) window.SHMToast.info("Gagal memuat data PI (Performance Index)", "Info", 4000);
            createPiGauge(0);
        }
    }

    loadPiStats();

    // ===============================
    // Weather Card: Live ATRH + Temp Data
    // ===============================
    async function loadWeatherCard() {
        try {
            const [atrhRes, tempRes] = await Promise.all([
                fetch("/api/atrhs/latest"),
                fetch("/api/temp/latest/temp01")
            ]);
            const atrh = await atrhRes.json();
            const temp = await tempRes.json();

            const T = atrh.temperature ?? 0;
            const RH = atrh.humidity ?? 0;
            const ST = temp.temperature ?? 0;
            const timeStr = atrh.time || temp.time || "";

            // Dew Point (Magnus formula)
            const a = 17.27, b = 237.7;
            const alpha = (a * T) / (b + T) + Math.log(RH / 100);
            const dewPoint = (b * alpha) / (a - alpha);

            // Heat Index (simplified Steadman)
            const HI = -8.785 + 1.611 * T + 2.339 * RH
                - 0.14612 * T * RH - 0.01231 * T * T
                - 0.01642 * RH * RH + 0.002212 * T * T * RH
                + 0.0007255 * T * RH * RH - 0.000003582 * T * T * RH * RH;

            // Status
            let status = "Normal", statusNote = "All readings normal";
            if (T >= 40 || RH > 95) {
                status = "Warning";
                statusNote = "Threshold exceeded";
            } else if (T >= 35 || RH > 85) {
                status = "Caution";
                statusNote = "Approaching threshold";
            }

            // Weather description
            let desc = "Clear & Dry";
            if (RH > 85 && T > 30) desc = "Hot & Humid";
            else if (RH > 85) desc = "High Humidity";
            else if (T > 35) desc = "Very Hot";
            else if (T > 30) desc = "Warm";
            else if (T < 20) desc = "Cool";

            // Update left panel
            const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            setText("wc-temp", T.toFixed(1));
            setText("wc-desc", desc);

            // Date
            if (timeStr) {
                const d = new Date(timeStr);
                const opts = { day: '2-digit', month: 'long', year: 'numeric' };
                const dateStr = d.toLocaleDateString('en-US', opts);
                const timeDisplay = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                setText("wc-date", `${dateStr}  ${timeDisplay}`);
            }

            // Update highlights
            setText("wc-hl-temp", T.toFixed(1));
            setText("wc-hl-rh", RH.toFixed(1));
            setText("wc-hl-stemp", ST.toFixed(1));
            setText("wc-hl-dew", dewPoint.toFixed(1));
            setText("wc-hl-heat", (T < 27 ? T : HI).toFixed(1));
            setText("wc-hl-heat-note", T < 27 ? "Same as ambient" : "Feels like");
            setText("wc-hl-status", status);

            // Status color
            const statusEl = document.getElementById("wc-hl-status");
            if (statusEl) {
                statusEl.style.color = status === "Warning" ? "#ef4444"
                    : status === "Caution" ? "#f59e0b" : "#22c55e";
            }
            setText("wc-hl-status-note", statusNote);

            // Weather icon
            const iconEl = document.querySelector(".weather-main-icon");
            if (iconEl) {
                iconEl.className = "fa-solid weather-main-icon";
                if (RH > 85 && T > 30) iconEl.classList.add("fa-cloud-sun-rain");
                else if (RH > 80) iconEl.classList.add("fa-cloud-rain");
                else if (T > 35) iconEl.classList.add("fa-sun");
                else if (T > 25) iconEl.classList.add("fa-cloud-sun");
                else iconEl.classList.add("fa-cloud");
            }

        } catch (e) {
            console.warn("Weather card error:", e);
            if (window.SHMToast) window.SHMToast.warning("Gagal memuat data cuaca (ATRH/Temp)", "Cuaca", 5000);
        }
    }

    loadWeatherCard();
    // Refresh weather data every 30s
    setInterval(loadWeatherCard, 30000);

    // ===============================
    // Cable Stay Force Monitoring Chart
    // ===============================
    function createCableStressChart() {
        const container = document.getElementById("cableStressChart");
        if (!container) return;

        const cableRoot = am5.Root.new("cableStressChart");
        amChartsRoots.push(cableRoot);

        cableRoot.setThemes([am5themes_Animated.new(cableRoot)]);

        const chart = cableRoot.container.children.push(
            am5xy.XYChart.new(cableRoot, {
                panX: false,
                panY: false,
                layout: cableRoot.verticalLayout,
                paddingLeft: 10,
                paddingRight: 20,
                paddingTop: 5,
                paddingBottom: 0
            })
        );

        // Add cursor for tooltip interaction
        chart.set("cursor", am5xy.XYCursor.new(cableRoot, {
            behavior: "none"
        }));

        // Cable force data (kN) – matching bridge reference GALALA ↔ POKA
        const cableData = [
            { cable: "SS11", design: 2040.7, current: 1920.3 },
            { cable: "SS07", design: 2190.2, current: 2310.5 },
            { cable: "SS03", design: 1498.5, current: 1410.8 },
            { cable: "MS03", design: 1327.6, current: 1250.0 },
            { cable: "MS07", design: 2215.8, current: 2100.4 },
            { cable: "MS11", design: 2915.6, current: 2780.2 },
            { cable: "MN11", design: 2512.2, current: 2380.6 },
            { cable: "MN07", design: 2050.3, current: 1950.1 },
            { cable: "MN03", design: 1352.7, current: 1280.4 },
            { cable: "SN03", design: 1495.8, current: 1410.2 },
            { cable: "SN07", design: 1882.7, current: 1780.5 },
            { cable: "SN11", design: 2378.3, current: 2510.1 }
        ];

        // X Axis (Cable positions)
        const xAxis = chart.xAxes.push(
            am5xy.CategoryAxis.new(cableRoot, {
                categoryField: "cable",
                renderer: am5xy.AxisRendererX.new(cableRoot, {
                    cellStartLocation: 0.25,
                    cellEndLocation: 0.85,
                    minGridDistance: 20,
                    stroke: am5.color(0xcccccc),
                    strokeOpacity: 1
                })
            })
        );
        xAxis.get("renderer").labels.template.setAll({
            fontSize: 11,
            fill: am5.color(isDark ? "#94a3b8" : "#3b82f6"),
            fontWeight: "700",
            rotation: 0
        });
        xAxis.get("renderer").grid.template.setAll({ visible: false });
        xAxis.data.setAll(cableData);

        // Y Axis (Cable Force kN)
        const yAxis = chart.yAxes.push(
            am5xy.ValueAxis.new(cableRoot, {
                renderer: am5xy.AxisRendererY.new(cableRoot, {
                    stroke: am5.color(0xcccccc),
                    strokeOpacity: 1
                }),
                min: 0,
                max: 5000,
                strictMinMax: true,
                numberFormat: "#' kN'"
            })
        );
        yAxis.get("renderer").labels.template.setAll({
            fontSize: 11,
            fill: am5.color(isDark ? "#94a3b8" : "#64748b")
        });
        yAxis.get("renderer").grid.template.setAll({
            stroke: am5.color(isDark ? "#334155" : "#e2e8f0"),
            strokeOpacity: 0.3
        });

        // Y-axis title
        yAxis.children.unshift(am5.Label.new(cableRoot, {
            text: "Cable Force (kN)",
            rotation: -90,
            y: am5.percent(50),
            centerX: am5.percent(50),
            fontSize: 12,
            fontWeight: "600",
            fill: am5.color(isDark ? "#94a3b8" : "#64748b")
        }));

        // --- Threshold Lines ---
        // Critical: 4000 kN (red dashed)
        const criticalRange = yAxis.createAxisRange(
            yAxis.makeDataItem({ value: 4000 })
        );
        criticalRange.get("grid").setAll({
            stroke: am5.color("#dc2626"),
            strokeWidth: 1.5,
            strokeDasharray: [8, 4],
            strokeOpacity: 0.7,
            visible: true,
            above: true
        });
        criticalRange.get("label").setAll({
            text: "4000 kN",
            fill: am5.color("#dc2626"),
            fontSize: 10,
            fontWeight: "600",
            inside: true,
            centerX: 0,
            visible: true
        });

        // Warning: 3000 kN (yellow/orange dashed)
        const warningRange = yAxis.createAxisRange(
            yAxis.makeDataItem({ value: 3000 })
        );
        warningRange.get("grid").setAll({
            stroke: am5.color("#f59e0b"),
            strokeWidth: 1.5,
            strokeDasharray: [6, 4],
            strokeOpacity: 0.6,
            visible: true,
            above: true
        });
        warningRange.get("label").setAll({
            text: "3000 kN",
            fill: am5.color("#f59e0b"),
            fontSize: 10,
            fontWeight: "600",
            inside: true,
            centerX: 0,
            visible: true
        });

        // Series 1: Design Force (dark green, dashed border)
        const designTooltip = am5.Tooltip.new(cableRoot, {
            labelText: "[bold fontSize:13px]{categoryX}[/]\n─────────────\n[#15803d]■[/] Design: [bold]{valueY}[/] kN\n[#22c55e]■[/] Current: [bold]{current}[/] kN",
            getFillFromSprite: false,
            autoTextColor: false
        });
        designTooltip.get("background").setAll({
            fill: am5.color(isDark ? "#1e293b" : "#ffffff"),
            fillOpacity: 0.95,
            stroke: am5.color("#16a34a"),
            strokeWidth: 1.5,
            shadowColor: am5.color("#000000"),
            shadowBlur: 8,
            shadowOffsetY: 2,
            shadowOpacity: 0.15
        });
        designTooltip.label.setAll({
            fill: am5.color(isDark ? "#e2e8f0" : "#334155"),
            fontSize: 12
        });

        const designSeries = chart.series.push(
            am5xy.ColumnSeries.new(cableRoot, {
                name: "Design Force",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "design",
                categoryXField: "cable",
                tooltip: designTooltip
            })
        );
        designSeries.columns.template.setAll({
            cornerRadiusTL: 2,
            cornerRadiusTR: 2,
            width: am5.percent(80),
            fillOpacity: 0.65,
            fill: am5.color("#15803d"),
            stroke: am5.color("#166534"),
            strokeWidth: 1.5,
            strokeDasharray: [4, 2],
            interactive: true,
            tooltipY: 0
        });
        // Value label on top of design bars
        designSeries.bullets.push(function () {
            return am5.Bullet.new(cableRoot, {
                locationY: 1,
                sprite: am5.Label.new(cableRoot, {
                    text: "{valueY}",
                    centerX: am5.percent(50),
                    centerY: am5.percent(100),
                    dy: -4,
                    fontSize: 9,
                    fontWeight: "600",
                    fill: am5.color(isDark ? "#94a3b8" : "#64748b"),
                    populateText: true
                })
            });
        });
        designSeries.data.setAll(cableData);

        // Series 2: Current Force (bright green, solid, no tooltip - shared with design)
        const currentSeries = chart.series.push(
            am5xy.ColumnSeries.new(cableRoot, {
                name: "Current Force",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "current",
                categoryXField: "cable"
            })
        );
        currentSeries.columns.template.setAll({
            cornerRadiusTL: 2,
            cornerRadiusTR: 2,
            width: am5.percent(80),
            fillOpacity: 0.9,
            fill: am5.color("#22c55e"),
            stroke: am5.color(0xcccccc),
            strokeOpacity: 1,
            strokeWidth: 1
        });
        currentSeries.data.setAll(cableData);

        // Animate
        chart.appear(1000, 100);
    }

    function createWindCompassChart() {
        const el = document.getElementById("windCompassChart");
        if (!el) return;

        let root = am5.Root.new("windCompassChart");
        amChartsRoots.push(root);

        root.setThemes([am5themes_Animated.new(root)]);

        let chart = root.container.children.push(am5radar.RadarChart.new(root, {
            panX: false,
            panY: false,
            wheelX: "none",
            wheelY: "none",
            startAngle: -90,
            endAngle: 270,
            innerRadius: am5.percent(5)
        }));

        // Base Wind Rose Data, initially 0
        const directions16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
        const windData = directions16.map(d => ({ dir: d, v1: 0, rawDir: 0 }));

        let xRenderer = am5radar.AxisRendererCircular.new(root, {
            cellStartLocation: 0.1,
            cellEndLocation: 0.9,
            minGridDistance: 10
        });

        xRenderer.grid.template.setAll({
            stroke: am5.color(isDark ? 0x94a3b8 : 0xcbd5e1),
            strokeOpacity: 0.6
        });

        xRenderer.labels.template.setAll({
            fontSize: 12,
            fill: am5.color(isDark ? 0x94a3b8 : 0x334155),
            fontWeight: "bold",
            radius: 12
        });

        // Hide intermediate labels if we only want N, E, S, W to mimic the reference image
        xRenderer.labels.template.adapters.add("text", function (text, target) {
            const val = target.dataItem ? target.dataItem.get("category") : null;
            if (val === "N" || val === "E" || val === "S" || val === "W") {
                return text;
            }
            return "";
        });

        let xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
            categoryField: "dir",
            renderer: xRenderer
        }));
        xAxis.data.setAll(windData);

        let yRenderer = am5radar.AxisRendererRadial.new(root, {
            axisAngle: 90,
            radius: am5.percent(100)
        });

        yRenderer.grid.template.setAll({
            stroke: am5.color(isDark ? 0x94a3b8 : 0xcbd5e1),
            strokeOpacity: 0.6
        });

        yRenderer.labels.template.setAll({
            fontSize: 9,
            fill: am5.color(isDark ? 0x64748b : 0x94a3b8),
            centerX: am5.p100,
            text: "{value} m/s"
        });

        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
            renderer: yRenderer,
            min: 0,
            max: 20,
            strictMinMax: true
        }));

        // Colors matching exactly to reference image
        const colors = [
            0x00cc00
        ];

        let series;
        for (let i = 0; i < 1; i++) {
            series = chart.series.push(am5radar.RadarColumnSeries.new(root, {
                stacked: false,
                name: "Current Wind",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "v1",
                categoryXField: "dir"
            }));

            series.columns.template.setAll({
                tooltipText: "Speed: {valueY.formatNumber('#.#')} m/s\nDirection: {rawDir.formatNumber('#')}° ({categoryX})",
                width: am5.p100,
                strokeOpacity: 0.6,
                stroke: am5.color(0x000000),
                strokeWidth: 0.5,
                fill: am5.color(colors[i])
            });

            series.data.setAll(windData);
            series.appear(1000);
        }



        // Realtime indicator (Clock Hand) overlay
        let xAxisRealtime = chart.xAxes.push(am5xy.ValueAxis.new(root, {
            maxDeviation: 0,
            min: 0,
            max: 360,
            strictMinMax: true,
            renderer: am5radar.AxisRendererCircular.new(root, {
                innerRadius: -10,
                minGridDistance: 10
            })
        }));
        xAxisRealtime.get("renderer").grid.template.setAll({ forceHidden: true });
        xAxisRealtime.get("renderer").labels.template.setAll({ forceHidden: true });

        // Red needle for current direction
        let clockHand = chart.seriesContainer.children.push(am5radar.ClockHand.new(root, {
            radius: am5.percent(90),
            innerRadius: am5.percent(10),
            topWidth: 6,
            bottomWidth: 10,
            pinRadius: 6
        }));

        clockHand.hand.setAll({
            fill: am5.color(0xff0000),
            fillOpacity: 0.9,
            stroke: am5.color(0x990000),
            strokeWidth: 1
        });

        clockHand.pin.setAll({
            fill: am5.color(isDark ? 0x334155 : 0xffffff),
            stroke: am5.color(0xff0000),
            strokeWidth: 2
        });

        window.windMonitorHand = clockHand;
        window.windRadarSeries = series;
        window.windRadarXAxis = xAxis;

        chart.appear(1000, 100);
    }

    function createWind3DCompassChart(sensorId) {
        const divId = "wind3dCompassChart_" + sensorId;
        const el = document.getElementById(divId);
        if (!el) return;

        let root = am5.Root.new(divId);
        amChartsRoots.push(root);

        root.setThemes([am5themes_Animated.new(root)]);

        let chart = root.container.children.push(am5radar.RadarChart.new(root, {
            panX: false,
            panY: false,
            wheelX: "none",
            wheelY: "none",
            startAngle: -90,
            endAngle: 270,
            innerRadius: am5.percent(5)
        }));

        const directions16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
        const windData = directions16.map(d => ({ dir: d, v1: 0, elev: 0, rawDir: 0 }));

        let xRenderer = am5radar.AxisRendererCircular.new(root, {
            cellStartLocation: 0.1,
            cellEndLocation: 0.9,
            minGridDistance: 10
        });

        xRenderer.grid.template.setAll({
            stroke: am5.color(isDark ? 0x94a3b8 : 0xcbd5e1),
            strokeOpacity: 0.6
        });

        xRenderer.labels.template.setAll({
            fontSize: 12,
            fill: am5.color(isDark ? 0x94a3b8 : 0x334155),
            fontWeight: "bold",
            radius: 12
        });

        xRenderer.labels.template.adapters.add("text", function (text, target) {
            const val = target.dataItem ? target.dataItem.get("category") : null;
            if (val === "N" || val === "E" || val === "S" || val === "W") return text;
            return "";
        });

        let xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
            categoryField: "dir",
            renderer: xRenderer
        }));
        xAxis.data.setAll(windData);

        let yRenderer = am5radar.AxisRendererRadial.new(root, {
            axisAngle: 90,
            radius: am5.percent(100)
        });

        yRenderer.grid.template.setAll({
            stroke: am5.color(isDark ? 0x94a3b8 : 0xcbd5e1),
            strokeOpacity: 0.6
        });

        yRenderer.labels.template.setAll({
            fontSize: 9,
            fill: am5.color(isDark ? 0x64748b : 0x94a3b8),
            centerX: am5.p100,
            text: "{value} m/s"
        });

        // range circle wind sensor
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
            renderer: yRenderer,
            min: 0,
            max: 20,
            strictMinMax: true
        }));

        let series = chart.series.push(am5radar.RadarColumnSeries.new(root, {
            stacked: false,
            name: "Current Wind",
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: "v1",
            categoryXField: "dir"
        }));

        series.columns.template.setAll({
            tooltipText: "Speed: {valueY.formatNumber('#.#')} m/s\nDirection: {rawDir.formatNumber('#')}° ({categoryX})\nElevation: {elev.formatNumber('#.#')}°",
            width: am5.p100,
            strokeOpacity: 0.6,
            stroke: am5.color(0x000000),
            strokeWidth: 0.5,
            fill: am5.color(0x3b82f6) // Blue for 3D wind
        });

        series.data.setAll(windData);
        series.appear(1000);

        let xAxisRealtime = chart.xAxes.push(am5xy.ValueAxis.new(root, {
            maxDeviation: 0,
            min: 0,
            max: 360,
            strictMinMax: true,
            renderer: am5radar.AxisRendererCircular.new(root, {
                innerRadius: -10,
                minGridDistance: 10
            })
        }));
        xAxisRealtime.get("renderer").grid.template.setAll({ forceHidden: true });
        xAxisRealtime.get("renderer").labels.template.setAll({ forceHidden: true });

        let clockHand = chart.seriesContainer.children.push(am5radar.ClockHand.new(root, {
            radius: am5.percent(90),
            innerRadius: am5.percent(10),
            topWidth: 6,
            bottomWidth: 10,
            pinRadius: 6
        }));

        clockHand.hand.setAll({
            fill: am5.color(0xf59e0b), // Orange hand for 3D
            fillOpacity: 0.9,
            stroke: am5.color(0xd97706),
            strokeWidth: 1
        });

        clockHand.pin.setAll({
            fill: am5.color(isDark ? 0x334155 : 0xffffff),
            stroke: am5.color(0xf59e0b),
            strokeWidth: 2
        });

        // Store instances dynamically
        window["wind3dMonitorHand_" + sensorId] = clockHand;
        window["wind3dRadarSeries_" + sensorId] = series;
        window["wind3dRadarXAxis_" + sensorId] = xAxis;

        chart.appear(1000, 100);
    }

    // ===============================
    // Displacement Aligned Line Chart
    // ===============================
    const thresholdDsp = 250; // Span Length = 805m (805000 mm). Threshold L/800 = ~1006.25 mm. Override: 250mm
    const maxDisplacementY = Math.ceil((1.1 * thresholdDsp) / 50) * 50; // Round up to nearest 50

    function createDisplacementChart() {
        const container = document.getElementById("displacementLineChart");
        if (!container) return;

        const dispRoot = am5.Root.new("displacementLineChart");
        amChartsRoots.push(dispRoot);

        dispRoot.setThemes([am5themes_Animated.new(dispRoot)]);

        const chart = dispRoot.container.children.push(
            am5xy.XYChart.new(dispRoot, {
                panX: false,
                panY: false,
                paddingLeft: 30,
                paddingRight: 0,
                paddingTop: 10,
                paddingBottom: 0,
                layout: dispRoot.verticalLayout
            })
        );

        chart.set("cursor", am5xy.XYCursor.new(dispRoot, {
            behavior: "none"
        }));

        // Data (T1-T5). x corresponds precisely to the `left: X%` used in the CSS for .disp-dot
        const dispData = [
            { id: "T1", x: 28, y: 0 },
            { id: "T2", x: 38, y: 0 },
            { id: "T3", x: 50, y: 0 },
            { id: "T4", x: 62, y: 2 },
            { id: "T5", x: 72, y: 0 }
        ];

        // X Axis: 0 to 100 perfectly mirrors exactly the CSS left percentages (0-100%)
        let xAxis = chart.xAxes.push(am5xy.ValueAxis.new(dispRoot, {
            min: 0,
            max: 100,
            strictMinMax: true,
            renderer: am5xy.AxisRendererX.new(dispRoot, {})
        }));
        xAxis.get("renderer").labels.template.setAll({ visible: false });
        xAxis.get("renderer").grid.template.setAll({ visible: false });

        // Y Axis: -50mm top, Rounded threshold bottom (Inversed)
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(dispRoot, {
            min: -50,
            max: maxDisplacementY,
            strictMinMax: true,
            renderer: am5xy.AxisRendererY.new(dispRoot, {
                inversed: true
            })
        }));

        yAxis.get("renderer").labels.template.setAll({
            fontSize: 10,
            fill: am5.color(isDark ? "#94a3b8" : "#64748b")
        });

        yAxis.get("renderer").grid.template.setAll({
            stroke: am5.color(isDark ? "#334155" : "#e2e8f0"),
            strokeOpacity: 0.5
        });

        // Add '0 mm' marker axis range
        const zeroRange = yAxis.createAxisRange(yAxis.makeDataItem({ value: 0 }));
        zeroRange.get("grid").setAll({
            stroke: am5.color(isDark ? "#94a3b8" : "#94a3b8"),
            strokeWidth: 1.5,
            strokeOpacity: 0.8,
            visible: true
        });

        yAxis.children.unshift(am5.Label.new(dispRoot, {
            text: "Displacement (mm)",
            rotation: -90,
            y: am5.percent(50),
            centerX: am5.percent(50),
            fontSize: 11,
            fill: am5.color(isDark ? "#94a3b8" : "#64748b")
        }));

        // Limit range near the threshold limit
        const limitRange = yAxis.createAxisRange(yAxis.makeDataItem({ value: thresholdDsp }));
        limitRange.get("grid").setAll({
            stroke: am5.color("#ef4444"),
            strokeWidth: 1.5,
            strokeDasharray: [8, 4],
            strokeOpacity: 0.7,
            visible: true,
            above: true
        });
        limitRange.get("label").setAll({
            text: "Threshold L/800",
            fill: am5.color("#ef4444"),
            fontSize: 10,
            dy: -10,
            fontWeight: "600",
            inside: true,
            centerX: 0,
            visible: true
        });

        // Series
        let series = chart.series.push(am5xy.LineSeries.new(dispRoot, {
            name: "Displacement",
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: "y",
            valueXField: "x",
            tooltip: am5.Tooltip.new(dispRoot, {
                labelText: "[bold]Displacement[/]\n{dispId}\nDynamic: [bold]{valueY.formatNumber('#.##')}[/] mm\n{time}",
                getFillFromSprite: false
            })
        }));

        series.get("tooltip").get("background").setAll({
            fill: am5.color(isDark ? "#1e293b" : "#ffffff"),
            stroke: am5.color("#60a5fa"),
            strokeWidth: 1
        });
        series.get("tooltip").label.setAll({
            fill: am5.color(isDark ? "#e2e8f0" : "#334155"),
            fontSize: 12
        });

        series.strokes.template.setAll({
            strokeWidth: 2,
            stroke: am5.color("#60a5fa")
        });

        series.bullets.push(function () {
            return am5.Bullet.new(dispRoot, {
                sprite: am5.Circle.new(dispRoot, {
                    radius: 4,
                    fill: am5.color("#60a5fa"),
                    stroke: am5.color("#ffffff"),
                    strokeWidth: 2
                })
            });
        });

        series.bullets.push(function (root, series, dataItem) {
            return am5.Bullet.new(dispRoot, {
                locationY: 0,
                sprite: am5.Triangle.new(dispRoot, {
                    width: 10,
                    height: 10,
                    fill: am5.color("#10b981"), // Default green fallback
                    fillOpacity: 1,
                    rotation: 180,
                    dy: -5,
                    visible: true,
                    templateField: "bulletFill"
                })
            });
        });

        // Expose globally for real-time updates
        window.dispLineSeries = series;

        // Initialize with default zero data
        series.data.setAll([
            { id: "T1", x: 28, y: 0 },
            { id: "T2", x: 38, y: 0 },
            { id: "T3", x: 50, y: 0 },
            { id: "T4", x: 62, y: 0 },
            { id: "T5", x: 72, y: 0 }
        ]);
        chart.appear(1000, 100);
    }

    createWindCompassChart();
    createWind3DCompassChart("anm3d01");
    createWind3DCompassChart("anm3d02");
    createCableStressChart();
    createDisplacementChart();

    // ===============================
    // Wind Stats: Fetch Data
    // ===============================
    async function loadWindStats() {
        try {
            const res = await fetch("/api/anm2d/latest");
            const data = await res.json();

            if (!data || Object.keys(data).length === 0) return;

            const speed = data.wind_speed || 0;
            const dir = data.wind_direction || 0;

            const elAvgSpeed = document.getElementById("wind-speed");
            if (elAvgSpeed) elAvgSpeed.textContent = speed.toFixed(1);

            // Direction text: 16 points
            const dirs16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
            const dirIndex = Math.round(dir / 22.5) % 16;
            const currentDirText = dirs16[dirIndex];

            const elDirection = document.getElementById("wind-direction");
            if (elDirection) elDirection.textContent = `${dir.toFixed(0)}° ${currentDirText}`;

            if (window.windMonitorHand) {
                window.windMonitorHand.set("value", dir);
            }

            if (window.windRadarSeries && window.windRadarXAxis) {
                let newData = dirs16.map(d => ({
                    dir: d,
                    v1: d === currentDirText ? speed : 0,
                    rawDir: d === currentDirText ? dir : 0
                }));
                window.windRadarXAxis.data.setAll(newData);
                window.windRadarSeries.data.setAll(newData);
            }

        } catch (e) {
            console.warn("Wind 2D stats error:", e);
        }
    }

    async function loadWind3DStatsForSensor(sensorId) {
        try {
            const res = await fetch(`/api/anm3d/${sensorId}/latest`);
            const data = await res.json();

            if (!data || Object.keys(data).length === 0) return;

            const speed = data.wind_speed || 0;
            const elev = data.wind_elevation || 0;
            const dir = data.wind_direction || 0;

            const elSpeed = document.getElementById(`wind3d-speed-${sensorId}`);
            if (elSpeed) elSpeed.textContent = speed.toFixed(1);

            const elElev = document.getElementById(`wind3d-elevation-${sensorId}`);
            if (elElev) elElev.textContent = elev.toFixed(1);

            const dirs16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
            const dirIndex = Math.round(dir / 22.5) % 16;
            const currentDirText = dirs16[dirIndex];

            const elDirection = document.getElementById(`wind3d-direction-${sensorId}`);
            if (elDirection) elDirection.textContent = `${dir.toFixed(0)}° ${currentDirText}`;

            const hand = window[`wind3dMonitorHand_${sensorId}`];
            const series = window[`wind3dRadarSeries_${sensorId}`];
            const xAxis = window[`wind3dRadarXAxis_${sensorId}`];

            if (hand) {
                hand.set("value", dir);
            }

            if (series && xAxis) {
                let newData = dirs16.map(d => ({
                    dir: d,
                    v1: d === currentDirText ? speed : 0,
                    elev: d === currentDirText ? elev : 0,
                    rawDir: d === currentDirText ? dir : 0
                }));
                xAxis.data.setAll(newData);
                series.data.setAll(newData);
            }

        } catch (e) {
            console.warn(`Wind 3D stats error for ${sensorId}:`, e);
        }
    }

    function loadAllWindStats() {
        loadWindStats();
        loadWind3DStatsForSensor("anm3d01");
        loadWind3DStatsForSensor("anm3d02");
    }

    async function loadDisplacementStats() {
        try {
            const res = await fetch("/api/tiltmeter/displacement/latest");
            const data = await res.json();

            if (!data || data.length === 0) return;

            // Map sensor data. Default x positions matching CSS
            const mapping = {
                "TILT01": { id: "T1", dsp: "DSPT-01", x: 28 },
                "TILT02": { id: "T2", dsp: "DSPT-02", x: 38 },
                "TILT03": { id: "T3", dsp: "DSPT-03", x: 50 },
                "TILT04": { id: "T4", dsp: "DSPT-04", x: 62 },
                "TILT05": { id: "T5", dsp: "DSPT-05", x: 72 }
            };

            let updatedData = [];
            data.forEach(item => {
                if (mapping[item.sensor_id]) {
                    const m = mapping[item.sensor_id];
                    let val = parseFloat(item.deflection_mm) || 0;

                    let arrowColor = Math.abs(val) > thresholdDsp ? "#ef4444" : "#10b981"; // Red if exceeds L/800, else Green

                    updatedData.push({
                        id: m.id,
                        dispId: m.dsp,
                        x: m.x,
                        y: val,
                        time: (item.time || "").replace("T", " "),
                        threshold: thresholdDsp,
                        bulletFill: am5.color(arrowColor)
                    });

                    // Update DOM Node if exists (`disp-t1`, `disp-t2`, etc)
                    const domNode = document.querySelector(`.disp-${m.id.toLowerCase()}`);
                    if (domNode) {
                        // Max pixel movement for visual effect on diagram
                        let visualY = val * 0.15; // scalar multiplier
                        if (visualY > 40) visualY = 40;
                        domNode.style.transform = `translate(-50%, calc(-50% + ${visualY}px))`;
                        domNode.setAttribute('data-val', `${val.toFixed(2)} mm`);
                        domNode.setAttribute('title', `Displacement ${m.id}: ${val.toFixed(2)} mm`);
                    }
                }
            });

            // Sort by x to ensure line draws correctly left to right
            updatedData.sort((a, b) => a.x - b.x);

            if (window.dispLineSeries && updatedData.length > 0) {
                // If we don't have all 5, merge with existing data
                if (updatedData.length < 5) {
                    const currentData = window.dispLineSeries.data.values;
                    const mergedData = currentData.map(c => {
                        const found = updatedData.find(u => u.id === c.id);
                        return found || c;
                    });
                    window.dispLineSeries.data.setAll(mergedData);
                } else {
                    window.dispLineSeries.data.setAll(updatedData);
                }
            }

        } catch (e) {
            console.warn("Displacement stats error:", e);
        }
    }

    window.captureDisplacement = function () {
        const target = document.getElementById("displacementCardArea");
        if (!target) return;

        // Add a slight delay to ensure everything is rendered
        html2canvas(target, {
            useCORS: true,
            scale: 2, // Higher quality
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg') || "#ffffff"
        }).then(canvas => {
            const link = document.createElement("a");
            const date = new Date();
            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            const dateStr = dd + mm + yyyy;
            link.download = `Displacement_Monitoring_${dateStr}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        }).catch(err => {
            console.error("Capture captureDisplacement error:", err);
            if (typeof showToast === 'function') {
                showToast("Failed to capture image", "error");
            }
        });
    };

    loadAllWindStats();
    loadDisplacementStats();
    setInterval(loadAllWindStats, 5000);
    setInterval(loadDisplacementStats, 5000);
}

am5.ready(initAllCharts);


// Theme toggle is handled globally in base.html
