// =====================================
// Cross-Correlation Dashboard Logic
// =====================================

document.addEventListener("DOMContentLoaded", () => {
    // ---- 1. Initialize Date Pickers ----
    const startInput = document.getElementById("input-start-date");
    const endInput = document.getElementById("input-end-date");
    
    // Default to last 7 days
    const defaultEnd = new Date();
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 7);

    const formatDT = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    startInput.value = formatDT(defaultStart);
    endInput.value = formatDT(defaultEnd);

    flatpickr(startInput, { enableTime: true, dateFormat: "Y-m-d H:i:S", time_24hr: true });
    flatpickr(endInput, { enableTime: true, dateFormat: "Y-m-d H:i:S", time_24hr: true });

    // ---- 2. Configuration ----
    const SENSOR_CONFIG = {
        anm2d: {
            apiUrl: '/api/anm2d/statistik/range',
            label: 'Anemometer 2D',
            params: [
                { id: 'avg_wind_speed', label: 'Wind Speed', unit: 'm/s' },
                { id: 'avg_wind_direction', label: 'Wind Direction', unit: '°' }
            ]
        },
        anm3d: {
            apiUrl: '/api/anm3d/statistik/range',
            label: 'Anemometer 3D',
            params: [
                { id: 'avg_wind_speed', label: 'Wind Speed', unit: 'm/s' },
                { id: 'avg_wind_direction', label: 'Wind Direction', unit: '°' },
                { id: 'avg_wind_elevation', label: 'Wind Elevation', unit: '°' }
            ]
        },
        atrh: {
            apiUrl: '/api/atrhs/statistik/range',
            label: 'ATRH',
            params: [
                { id: 'avg_temperature', label: 'Temperature', unit: '°C' },
                { id: 'avg_humidity', label: 'Humidity', unit: '%' }
            ]
        },
        temp: {
            apiUrl: '/api/temp/statistik/range',
            label: 'Temperature',
            params: [
                { id: 'avg_temperature', label: 'Temperature', unit: '°C' }
            ]
        },
        tiltmeter: {
            apiUrl: '/api/tiltmeter/statistik/range',
            label: 'Tiltmeter',
            params: [
                { id: 'avg_angle_x', label: 'Angle X', unit: '°' },
                { id: 'avg_angle_y', label: 'Angle Y', unit: '°' }
            ]
        }
    };

    // Series colors
    const SERIES_COLORS = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0x8b5cf6];

    // ---- 3. Dynamic Source Blocks ----
    const sourcesContainer = document.getElementById("sources-container");
    const btnAddSource = document.getElementById("btn-add-source");
    
    let sourceCount = 0;
    const MIN_SOURCES = 2;
    const MAX_SOURCES = 5;

    function createSourceBlock() {
        sourceCount++;
        const id = `source-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const block = document.createElement("div");
        block.className = "source-item";
        block.id = id;
        block.style.display = "flex";
        block.style.gap = "15px";
        block.style.alignItems = "flex-end";
        block.style.padding = "15px";
        block.style.border = "1px solid var(--border-color)";
        block.style.borderRadius = "6px";
        block.style.background = "var(--bg-body)";
        block.style.position = "relative";

        const typeOptions = Object.keys(SENSOR_CONFIG).map(k => `<option value="${k}">${SENSOR_CONFIG[k].label}</option>`).join("");

        block.innerHTML = `
            <div style="flex: 1;">
                <label style="display:block; font-size: 0.75rem; font-weight:600; color:var(--text-muted); margin-bottom:5px;">Sensor Type</label>
                <select class="form-select src-type" style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main);">
                    <option value="">-- Select Type --</option>
                    ${typeOptions}
                </select>
            </div>
            <div style="flex: 1;">
                <label style="display:block; font-size: 0.75rem; font-weight:600; color:var(--text-muted); margin-bottom:5px;">Sensor Node</label>
                <select class="form-select src-node" disabled style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main);">
                    <option value="">-- Select Node --</option>
                </select>
            </div>
            <div style="flex: 1;">
                <label style="display:block; font-size: 0.75rem; font-weight:600; color:var(--text-muted); margin-bottom:5px;">Parameter</label>
                <select class="form-select src-param" disabled style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main);">
                    <option value="">-- Select Parameter --</option>
                </select>
            </div>
            <button class="btn-remove-source" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" title="Remove this sensor">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        sourcesContainer.appendChild(block);

        // Events
        const selType = block.querySelector(".src-type");
        const selNode = block.querySelector(".src-node");
        const selParam = block.querySelector(".src-param");
        const btnRemove = block.querySelector(".btn-remove-source");

        selType.addEventListener("change", () => {
            const type = selType.value;
            selNode.innerHTML = `<option value="">-- Select Node --</option>`;
            selParam.innerHTML = `<option value="">-- Select Parameter --</option>`;
            
            if (!type) {
                selNode.disabled = true;
                selParam.disabled = true;
                return;
            }

            // Populate Nodes
            const nodes = window.appSensors[type] || [];
            nodes.forEach(n => {
                const opt = document.createElement("option");
                opt.value = n;
                opt.textContent = n;
                selNode.appendChild(opt);
            });
            selNode.disabled = nodes.length === 0;

            // Populate Params
            const params = SENSOR_CONFIG[type].params;
            params.forEach(p => {
                const opt = document.createElement("option");
                opt.value = p.id;
                opt.textContent = `${p.label} (${p.unit})`;
                // Store unit in custom attribute for chart building
                opt.dataset.unit = p.unit;
                opt.dataset.label = p.label;
                selParam.appendChild(opt);
            });
            selParam.disabled = params.length === 0;
        });

        btnRemove.addEventListener("click", () => {
            if (sourcesContainer.children.length <= MIN_SOURCES) {
                if(window.SHMToast) window.SHMToast.warning("Minimal 2 sensor harus dipilih.");
                else alert("Minimal 2 sensor harus dipilih.");
                return;
            }
            block.remove();
            sourceCount--;
            updateAddButton();
        });

        updateAddButton();
    }

    function updateAddButton() {
        if (sourcesContainer.children.length >= MAX_SOURCES) {
            btnAddSource.disabled = true;
            btnAddSource.style.opacity = "0.5";
            btnAddSource.style.cursor = "not-allowed";
        } else {
            btnAddSource.disabled = false;
            btnAddSource.style.opacity = "1";
            btnAddSource.style.cursor = "pointer";
        }
    }

    btnAddSource.addEventListener("click", () => {
        if (sourcesContainer.children.length < MAX_SOURCES) {
            createSourceBlock();
        }
    });

    // Initialize minimum blocks
    for(let i=0; i<MIN_SOURCES; i++) {
        createSourceBlock();
    }

    // ---- 4. Charting Logic ----
    let root = null;
    let chart = null;

    async function generateChart() {
        const start = startInput.value;
        const end = endInput.value;

        if (!start || !end) {
            if (window.SHMToast) window.SHMToast.warning("Pilih Start Date dan End Date.");
            return;
        }

        // Collect configurations
        const blocks = document.querySelectorAll(".source-item");
        const queries = [];
        
        let isValid = true;
        blocks.forEach((block, idx) => {
            const type = block.querySelector(".src-type").value;
            const node = block.querySelector(".src-node").value;
            const paramOpt = block.querySelector(".src-param").selectedOptions[0];
            const param = paramOpt ? paramOpt.value : "";
            
            if (!type || !node || !param) {
                isValid = false;
                return;
            }

            queries.push({
                type,
                node,
                paramId: param,
                unit: paramOpt.dataset.unit,
                paramLabel: paramOpt.dataset.label,
                color: SERIES_COLORS[idx % SERIES_COLORS.length]
            });
        });

        if (!isValid) {
            if (window.SHMToast) window.SHMToast.warning("Pastikan semua sumber data (Sensor Type, Node, Parameter) telah dipilih.");
            return;
        }

        document.getElementById("loading-overlay").style.display = "flex";

        try {
            // Fetch all data concurrently
            const fetchPromises = queries.map(q => {
                const url = `${SENSOR_CONFIG[q.type].apiUrl}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&sensor_id=${encodeURIComponent(q.node)}`;
                return fetch(url).then(r => r.json());
            });

            const results = await Promise.all(fetchPromises);
            
            renderChart(queries, results);

        } catch (e) {
            console.error(e);
            if(window.SHMToast) window.SHMToast.danger("Gagal mengambil data dari server.");
        } finally {
            document.getElementById("loading-overlay").style.display = "none";
        }
    }

    document.getElementById("btn-generate-chart").addEventListener("click", generateChart);

    function renderChart(queries, results) {
        // Dispose old chart
        if (root) {
            root.dispose();
        }

        root = am5.Root.new("correlation-chart");
        root.setThemes([am5themes_Animated.new(root)]);

        chart = root.container.children.push(am5xy.XYChart.new(root, {
            panX: true,
            panY: false,
            wheelX: "zoomX",
            wheelY: "zoomX",
            pinchZoomX: true
        }));

        SHMChart.applyZoomButton(chart, root);

        const C = window.SHMChart ? window.SHMChart.colors() : { text: 0x64748b, grid: 0x000000, stroke: 0xcccccc };

        // Process each result set individually for its own series
        const timelines = results.map((rows, idx) => {
            if (!rows) return [];
            return rows.map(r => ({
                time: new Date(r.time).getTime(),
                value: r[queries[idx].paramId]
            })).filter(d => d.value != null).sort((a, b) => a.time - b.time);
        });

        // X-Axis
        const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
            maxDeviation: 0.2,
            baseInterval: { timeUnit: "minute", count: 1 },
            renderer: am5xy.AxisRendererX.new(root, {
                minGridDistance: 80,
                stroke: am5.color(C.stroke)
            }),
            tooltip: am5.Tooltip.new(root, {})
        }));
        xAxis.get("renderer").labels.template.setAll({ fill: am5.color(C.text) });

        const yAxesMap = {};
        let isOpposite = false;

        // Process each series
        queries.forEach((q, index) => {
            let yAxis = yAxesMap[q.unit];
            if (!yAxis) {
                yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
                    renderer: am5xy.AxisRendererY.new(root, {
                        opposite: isOpposite,
                        stroke: am5.color(C.stroke)
                    }),
                    extraMax: 0.1,
                    extraMin: 0.1
                }));
                yAxis.get("renderer").labels.template.setAll({ fill: am5.color(C.text) });
                if (Object.keys(yAxesMap).length > 0) {
                    yAxis.get("renderer").grid.template.set("visible", false);
                } else {
                    yAxis.get("renderer").grid.template.setAll({ stroke: am5.color(C.grid), strokeOpacity: 0.12 });
                }

                SHMChart.addYLabel(yAxis, root, `${q.paramLabel} (${q.unit})`, C, isOpposite);

                yAxesMap[q.unit] = yAxis;
                isOpposite = !isOpposite;
            }

            const series = chart.series.push(am5xy.LineSeries.new(root, {
                name: `${q.node}`,
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "value",
                valueXField: "time",
                stroke: am5.color(q.color),
                tooltip: am5.Tooltip.new(root, {
                    labelText: "[#ffffff]Date: {valueX.formatDate('yyyy-MM-dd HH:mm:ss')}\n[#ffffff]{name} " + q.paramLabel + ": {valueY.formatNumber('#.##')} " + (q.unit || ""),
                    getFillFromSprite: false,
                    pointerOrientation: "horizontal"
                })
            }));

            // Style individual tooltip background
            const bg = series.get("tooltip").get("background");
            if (bg) {
                bg.setAll({
                    fill: am5.color(q.color),
                    fillOpacity: 1,
                    stroke: am5.color(q.color)
                });
            }

            // Hollow Circle Bullets
            series.bullets.push(function() {
                return am5.Bullet.new(root, {
                    sprite: am5.Circle.new(root, {
                        radius: 4,
                        fill: root.interfaceColors.get("background"),
                        stroke: am5.color(q.color),
                        strokeWidth: 2
                    })
                });
            });

            series.strokes.template.setAll({ strokeWidth: 2 });
            series.data.setAll(timelines[index]);
            
            // Handle Y-axis toggle
            series.on("visible", (visible) => {
                const axis = yAxis;
                const anyVisible = chart.series.values.some(s => s.get("yAxis") === axis && s.get("visible"));
                if (anyVisible) {
                    axis.show();
                    axis.get("renderer").grid.template.set("visible", true);
                } else {
                    axis.hide();
                    axis.get("renderer").grid.template.set("visible", false);
                }
            });
        });

        // Use a standard cursor that triggers all series tooltips at once
        const cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
            xAxis: xAxis,
            behavior: "zoomX"
        }));
        cursor.lineY.set("visible", false);

        // 3. HTML Legend (ATRH/ANM3D style)
        const legendContainer = document.getElementById("correlation-legend");
        if (legendContainer) {
            legendContainer.innerHTML = ""; // Clear old legend
            queries.forEach((q, idx) => {
                const s = chart.series.getIndex(idx);
                const item = document.createElement("span");
                item.className = "legend-item";
                item.id = `legend-item-${idx}`;
                item.style.cursor = "pointer";
                item.innerHTML = `
                    <span class="legend-line" style="background: ${am5.color(q.color).toCSS()}"></span>
                    ${q.node}: ${q.paramLabel}
                `;
                legendContainer.appendChild(item);

                // Use SHMChart helper to wire visibility
                // We pass axis = null because we have our own collective axis logic in series.on("visible")
                if (window.SHMChart && window.SHMChart.setupLegendToggle) {
                    window.SHMChart.setupLegendToggle(item.id, s, null, null);
                }
            });
        }

        SHMChart.watchTheme(() => {
            SHMChart.refreshAxisColors([xAxis, ...chart.yAxes.values()]);
        });
    }

});
