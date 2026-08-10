// ==========================================
// Acc KDI Monitoring
// Aligned with strain_trigger.js concepts
// Version: 1.2.1 (Fixed Chart Display)
// ==========================================

am5.ready(function () {
    // ---- 0. Theme Helpers ----
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

    // ---- Constants & State ----
    let dataPoints = [];
    const MAX_POINTS = 2048;

    const colors = {
        x: 0xef4444, // Red
        y: 0x3b82f6, // Blue
        z: 0x22c55e  // Green
    };

    let activeFFTAxis = "x";
    let isPaused = true;
    let windowSize = 2048;
    let currentFilterType = "bandpass";
    let screenshotCount = 0;
    const SAMPLING_RATE = 100; // Hz

    // ---- DSP: Biquad Filter Class ----
    class BiquadFilter {
        constructor() {
            this.x1 = 0; this.x2 = 0;
            this.y1 = 0; this.y2 = 0;
            this.b0 = 1; this.b1 = 0; this.b2 = 0;
            this.a1 = 0; this.a2 = 0;
        }

        process(x) {
            let y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
            this.x2 = this.x1; this.x1 = x;
            this.y2 = this.y1; this.y1 = y;
            return y;
        }

        reset() {
            this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
        }

        setLowpass(f0, fs) {
            let w0 = 2 * Math.PI * f0 / fs;
            let alpha = Math.sin(w0) / Math.sqrt(2);
            let cosW0 = Math.cos(w0);
            let a0 = 1 + alpha;
            this.b0 = (1 - cosW0) / 2 / a0;
            this.b1 = (1 - cosW0) / a0;
            this.b2 = (1 - cosW0) / 2 / a0;
            this.a1 = -2 * cosW0 / a0;
            this.a2 = (1 - alpha) / a0;
        }

        setHighpass(f0, fs) {
            let w0 = 2 * Math.PI * f0 / fs;
            let alpha = Math.sin(w0) / Math.sqrt(2);
            let cosW0 = Math.cos(w0);
            let a0 = 1 + alpha;
            this.b0 = (1 + cosW0) / 2 / a0;
            this.b1 = -(1 + cosW0) / a0;
            this.b2 = (1 + cosW0) / 2 / a0;
            this.a1 = -2 * cosW0 / a0;
            this.a2 = (1 - alpha) / a0;
        }

        setBandpass(f_min, f_max, fs) {
            let f0 = Math.sqrt(f_min * f_max);
            let bw = f_max - f_min;
            let Q = f0 / bw;
            let w0 = 2 * Math.PI * f0 / fs;
            let alpha = Math.sin(w0) / (2 * Q);
            let cosW0 = Math.cos(w0);
            let a0 = 1 + alpha;
            this.b0 = alpha / a0;
            this.b1 = 0;
            this.b2 = -alpha / a0;
            this.a1 = -2 * cosW0 / a0;
            this.a2 = (1 - alpha) / a0;
        }
    }

    const filters = {
        x: new BiquadFilter(),
        y: new BiquadFilter(),
        z: new BiquadFilter()
    };

    function updateFilters(fs = SAMPLING_RATE) {
        ["x", "y", "z"].forEach(ax => {
            filters[ax].reset();
            if (currentFilterType === 'lowpass') filters[ax].setLowpass(5.0, fs);
            if (currentFilterType === 'highpass') filters[ax].setHighpass(0.5, fs);
            if (currentFilterType === 'bandpass') filters[ax].setBandpass(0.1, 10.0, fs);
        });
    }
    updateFilters();
    if (document.getElementById("monitor-sampling")) {
        document.getElementById("monitor-sampling").innerText = SAMPLING_RATE + " Hz";
    }

    // ---- amCharts 5 Root Setup ----
    const rtEl = document.getElementById("realtime-chart");
    const fftEl = document.getElementById("fft-chart");
    if (!rtEl || !fftEl) return;

    const rtRoot = am5.Root.new("realtime-chart");
    rtRoot.numberFormatter.setAll({ numberFormat: "#.0000", precision: 4 });
    rtRoot.setThemes([am5themes_Animated.new(rtRoot)]);

    const fftRoot = am5.Root.new("fft-chart");
    fftRoot.numberFormatter.setAll({ numberFormat: "#.00000", precision: 5 });
    fftRoot.setThemes([am5themes_Animated.new(fftRoot)]);

    // ---- 1. Real-Time Chart Setup ----
    const rtChart = rtRoot.container.children.push(
        am5xy.XYChart.new(rtRoot, {
            panX: true,
            panY: false,
            wheelX: "panX",
            wheelY: "zoomX",
            pinchZoomX: true, layout: rtRoot.verticalLayout
        })
    );

    const rtXAxis = rtChart.xAxes.push(
        am5xy.ValueAxis.new(rtRoot, {
            renderer: am5xy.AxisRendererX.new(rtRoot, { minGridDistance: 50 }),
            tooltip: am5.Tooltip.new(rtRoot, {}),
            extraMax: 0
        })
    );
    applyGridStyle(rtXAxis.get("renderer"));
    rtXAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });

    const rtYAxis = rtChart.yAxes.push(
        am5xy.ValueAxis.new(rtRoot, {
            renderer: am5xy.AxisRendererY.new(rtRoot, {}),
            extraMax: 0.1, extraMin: 0.1
        })
    );
    applyGridStyle(rtYAxis.get("renderer"));
    rtYAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });

    function createRTSeries(name, field, color) {
        let series = rtChart.series.push(
            am5xy.LineSeries.new(rtRoot, {
                name: name, xAxis: rtXAxis, yAxis: rtYAxis,
                valueYField: field, valueXField: "index",
                stroke: am5.color(color), strokeWidth: 1.5,
                tooltip: am5.Tooltip.new(rtRoot, {
                    pointerOrientation: "horizontal",
                    labelText: "{name}: [bold]{valueY}[/]"
                })
            })
        );
        return series;
    }

    const seriesX = createRTSeries("Accel X", "x", colors.x);
    const seriesY = createRTSeries("Accel Y", "y", colors.y);
    const seriesZ = createRTSeries("Accel Z", "z", colors.z);

    const rtCursor = rtChart.set("cursor", am5xy.XYCursor.new(rtRoot, {
        behavior: "none",
        xAxis: rtXAxis
    }));
    rtCursor.lineY.set("visible", false);

    // Selection Styling
    rtCursor.selection.setAll({
        fill: am5.color(0x3b82f6),
        fillOpacity: 0.2,
        stroke: am5.color(0x3b82f6),
        strokeWidth: 1,
        strokeDasharray: [3, 3]
    });

    // ---- 2. FFT Chart Setup ----
    const fftChart = fftRoot.container.children.push(
        am5xy.XYChart.new(fftRoot, { panX: false, panY: false, wheelX: "zoomX", wheelY: "zoomX" })
    );

    const fftXAxis = fftChart.xAxes.push(
        am5xy.ValueAxis.new(fftRoot, {
            renderer: am5xy.AxisRendererX.new(fftRoot, { minGridDistance: 50 }),
            min: 0,
            strictMinMax: true,
            groupData: false,
            tooltip: am5.Tooltip.new(fftRoot, {
                themeTags: ["axis"],
                animationDuration: 200
            })
        })
    );
    applyGridStyle(fftXAxis.get("renderer"));
    fftXAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });
    fftXAxis.children.push(am5.Label.new(fftRoot, { text: "Frequency (Hz)", fill: axisLabelColor(), fontWeight: "500", x: am5.p50, centerX: am5.p50 }));

    const fftYAxis = fftChart.yAxes.push(
        am5xy.ValueAxis.new(fftRoot, {
            renderer: am5xy.AxisRendererY.new(fftRoot, {}),
            min: 0,
            strictMinMax: true,
            extraMax: 0.15
        })
    );
    applyGridStyle(fftYAxis.get("renderer"));

    // Hide the "0" label on FFT Y-axis to clean up the chart
    fftYAxis.get("renderer").labels.template.adapters.add("text", (text, target) => {
        if (target.dataItem && target.dataItem.get("value") === 0) return "";
        return text;
    });
    fftYAxis.get("renderer").labels.template.setAll({ fill: axisLabelColor() });
    fftYAxis.children.unshift(am5.Label.new(fftRoot, { text: "Magnitude", rotation: -90, y: am5.p50, centerX: am5.p50, fill: axisLabelColor(), fontWeight: "500" }));

    function createFFTSeries(name, colorKey) {
        let series = fftChart.series.push(
            am5xy.LineSeries.new(fftRoot, {
                name: name, xAxis: fftXAxis, yAxis: fftYAxis,
                valueYField: "mag", valueXField: "freq",
                stroke: am5.color(colors[colorKey]), strokeWidth: 1.5,
                tooltip: am5.Tooltip.new(fftRoot, {
                    pointerOrientation: "horizontal",
                    labelText: "{name}: [bold]{valueY}[/]"
                })
            })
        );
        // Add bullets for top peaks with styled labels
        series.bullets.push(function () {
            let container = am5.Container.new(fftRoot, {
                centerX: am5.p50,
                centerY: am5.p100
            });

            let label = container.children.push(am5.Label.new(fftRoot, {
                fontSize: 10,
                fill: am5.color(0xffffff),
                fontWeight: "700",
                centerX: am5.p50,
                centerY: am5.p100,
                dy: -10,
                background: am5.RoundedRectangle.new(fftRoot, {
                    fill: series.get("stroke"),
                    cornerRadius: 4
                }),
                paddingLeft: 6,
                paddingRight: 6,
                paddingTop: 3,
                paddingBottom: 3
            }));

            label.adapters.add("text", function (text, target) {
                if (target.dataItem && target.dataItem.get("valueX") !== undefined) {
                    return target.dataItem.get("valueX").toFixed(2) + " Hz";
                }
                return text;
            });

            let circle = container.children.push(am5.Circle.new(fftRoot, {
                radius: 4,
                fill: series.get("stroke"),
                stroke: am5.color(0xffffff),
                strokeWidth: 2,
                centerX: am5.p50,
                centerY: am5.p50
            }));

            container.adapters.add("visible", function (visible, target) {
                return target.dataItem.dataContext.bullet ? true : false;
            });

            return am5.Bullet.new(fftRoot, { sprite: container });
        });
        return series;
    }

    const fftSeriesX = createFFTSeries("FFT X", "x");
    const fftSeriesY = createFFTSeries("FFT Y", "y");
    const fftSeriesZ = createFFTSeries("FFT Z", "z");

    fftChart.set("cursor", am5xy.XYCursor.new(fftRoot, {
        behavior: "zoomX",
        xAxis: fftXAxis,
        snapToSeries: [fftSeriesX, fftSeriesY, fftSeriesZ]
    }));

    // ---- Theme Change Observer ----
    const _themeObserver = new MutationObserver(() => {
        const c = axisLabelColor();
        [rtXAxis, rtYAxis, fftXAxis, fftYAxis].forEach(axis => {
            axis.get("renderer").labels.template.setAll({ fill: c });
            applyGridStyle(axis.get("renderer"));
        });
    });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // ---- 3. Socket.IO & Data Logic ----
    let globalTick = 0;
    let offsetX = null, offsetY = null, offsetZ = null;
    let dataBuffer = []; // Buffer for incoming packets
    const socket = io({ autoConnect: false });

    socket.on("connect", () => {
        console.log("Connected to SHMS server");
        updateConnectionStatus(true);
    });

    socket.on("connect_error", (err) => {
        console.error("Socket.IO connection error:", err);
        updateConnectionStatus(false);
    });

    socket.on("disconnect", () => {
        console.log("Disconnected from SHMS server");
        updateConnectionStatus(false);
    });

    // Optimized Socket Handler: Only push to buffer
    socket.on("acc_stream_update", data => {
        const packets = Array.isArray(data) ? data : [data];
        const targetSensor = window.CURRENT_SENSOR_ID || "20231001052";

        // Debug log to check if data is arriving at all
        console.log(`[ACC-DEBUG] Received ${packets.length} packets. Target SN: ${targetSensor}. Paused: ${isPaused}`);

        if (isPaused) return;

        packets.forEach(payload => {
            // Log raw payload for debugging
            console.log(`[ACC-STREAM] SN: ${payload.sensor_id} | X: ${payload.x} | Y: ${payload.y} | Z: ${payload.z}`);

            if (payload.sensor_id !== targetSensor) return;

            let rawX = Number(payload.x);
            let rawY = Number(payload.y);
            let rawZ = Number(payload.z);

            if (offsetX === null) { offsetX = rawX; offsetY = rawY; offsetZ = rawZ; }

            let xVal = rawX - offsetX;
            let yVal = rawY - offsetY;
            let zVal = rawZ - offsetZ;

            let cleanX = xVal, cleanY = yVal, cleanZ = zVal;
            if (currentFilterType !== "raw") {
                cleanX = filters.x.process(xVal);
                cleanY = filters.y.process(yVal);
                cleanZ = filters.z.process(zVal);
            }

            const newData = {
                index: ++globalTick,
                x: cleanX, y: cleanY, z: cleanZ,
                rawX: xVal, rawY: yVal, rawZ: zVal,
                time: payload.time || new Date().toLocaleTimeString(),
                isEvent: false
            };

            dataBuffer.push(newData);
        });
    });

    // Throttled UI Processing (runs at ~25 FPS)
    function processDataBuffer() {
        if (dataBuffer.length === 0 || isPaused) return;

        const batch = [...dataBuffer];
        dataBuffer = []; // Clear buffer

        // 1. Update dataPoints history
        batch.forEach(p => {
            dataPoints.push(p);
            if (dataPoints.length > MAX_POINTS) dataPoints.shift();
        });

        // 2. Batch push to amCharts series (MUCH faster)
        seriesX.data.pushAll(batch);
        seriesY.data.pushAll(batch);
        seriesZ.data.pushAll(batch);

        // Manage series history
        if (seriesX.data.length > MAX_POINTS) {
            const overflow = seriesX.data.length - MAX_POINTS;
            for (let i = 0; i < overflow; i++) {
                seriesX.data.shift();
                seriesY.data.shift();
                seriesZ.data.shift();
            }
        }

        // 3. Update X-Axis range once per batch
        if (dataPoints.length > 0) {
            rtXAxis.set("min", dataPoints[0].index);
            rtXAxis.set("max", dataPoints[dataPoints.length - 1].index);
        }

        // 4. Update dynamic Y-axis range
        updateYAxisRange();

        // 5. Update DOM elements (Throttled further if batch is large)
        const lastPacket = batch[batch.length - 1];
        updateSummary(lastPacket);
    }

    // Process buffer every 40ms (25 Hz)
    setInterval(processDataBuffer, 40);

    function updateConnection() {
        if (!socket || !socket.connected) return;

        const connCard = document.getElementById("card-connection");
        const connText = document.getElementById("connection-text");
        const connMs = document.getElementById("connection-ms");

        if (connCard && connText && connMs) {
            // Simulation logic for latency (matching vibration.js)
            let ms = Math.floor(Math.random() * 15) + 5; // Base 5-20ms

            // Occasionally simulate lag
            const lagCheck = Math.random();
            if (lagCheck < 0.05) ms += 300; // Bad
            else if (lagCheck < 0.1) ms += 150; // Poor
            else if (lagCheck < 0.2) ms += 80; // Fair

            let status = "excellent";
            let label = "Excellent";

            if (ms < 20) { status = "excellent"; label = "Excellent"; }
            else if (ms < 50) { status = "verygood"; label = "Very Good"; }
            else if (ms < 100) { status = "good"; label = "Good"; }
            else if (ms < 150) { status = "fair"; label = "Fair"; }
            else if (ms < 300) { status = "poor"; label = "Poor"; }
            else { status = "bad"; label = "Bad"; }

            connCard.className = `status-${status}`;
            connText.innerText = label;
            connMs.innerText = `${Math.round(ms)} ms`;

            // Update dot directly for consistency with socket connect
            const dot = document.getElementById("connection-dot");
            if (dot) {
                const colors = {
                    excellent: "#22c55e",
                    verygood: "#84cc16",
                    good: "#0ea5e9",
                    fair: "#f59e0b",
                    poor: "#f97316",
                    bad: "#ef4444"
                };
                dot.style.background = colors[status] || "#22c55e";
                dot.style.boxShadow = (status === "excellent") ? "0 0 8px #22c55e" : "none";
            }
        }
    }

    function updateConnectionStatus(isConnected) {
        const dot = document.getElementById("connection-dot");
        const text = document.getElementById("connection-text");
        const ms = document.getElementById("connection-ms");
        const connCard = document.getElementById("card-connection");

        if (dot) {
            dot.style.background = isConnected ? "#22c55e" : "#94a3b8";
            dot.style.boxShadow = isConnected ? "0 0 8px #22c55e" : "none";
        }
        if (text) text.innerText = isConnected ? "Excellent" : "Offline";
        if (ms) ms.innerText = isConnected ? "Connected" : "Disconnected";
        if (connCard && !isConnected) {
            connCard.className = "status-offline";
        }
    }

    function updateYAxisRange() {
        if (!dataPoints || dataPoints.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;

        const isXVis = seriesX.get("visible");
        const isYVis = seriesY.get("visible");
        const isZVis = seriesZ.get("visible");

        dataPoints.forEach(p => {
            if (isXVis) { yMin = Math.min(yMin, p.x); yMax = Math.max(yMax, p.x); }
            if (isYVis) { yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
            if (isZVis) { yMin = Math.min(yMin, p.z); yMax = Math.max(yMax, p.z); }
        });

        if (yMin !== Infinity && yMax !== -Infinity) {
            let range = yMax - yMin;
            if (range === 0) range = 0.001;
            rtYAxis.set("min", yMin - (range * 0.15));
            rtYAxis.set("max", yMax + (range * 0.15));
        }
    }


    function updateSummary(data) {
        if (document.getElementById("card-last-update")) document.getElementById("card-last-update").innerText = data.time;
        const peakVal = Math.max(Math.abs(data.x), Math.abs(data.y), Math.abs(data.z));
    }

    // ---- 4. UI Events ----
    const stopStartBtn = document.getElementById("btn-stop-start");
    if (stopStartBtn) {
        stopStartBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            stopStartBtn.innerText = isPaused ? "Start" : "Stop";
            const sensorId = window.ACC_ID || "acc-kdi-01";

            if (isPaused) {
                socket.emit('unsubscribe_sensor', { sensor_id: sensorId, type: 'acc' });
                socket.disconnect();
                stopStartBtn.style.background = "#22c55e";
                rtCursor.set("behavior", "selectX");
                rtChart.set("panX", false);
            } else {
                socket.connect();
                socket.emit('subscribe_sensor', { sensor_id: sensorId, type: 'acc' });
                stopStartBtn.style.background = "#2563eb";
                rtCursor.set("behavior", "none");
                rtChart.set("panX", true);

                // Reset selection
                rtXAxis.set("selectionMin", undefined);
                rtXAxis.set("selectionMax", undefined);
                updateFFT();
            }
        });
    }

    // Ensure we unsubscribe when the page is closed/refreshed
    window.addEventListener("beforeunload", () => {
        if (!isPaused) {
            socket.emit('unsubscribe_sensor', { sensor_id: window.ACC_ID || "acc-kdi-01", type: 'acc' });
            socket.disconnect();
        }
    });

    document.getElementById("select-data-window").addEventListener("change", (e) => {
        windowSize = parseInt(e.target.value);
        updateFFT();
    });

    document.getElementById("select-filter-type").addEventListener("change", (e) => {
        currentFilterType = e.target.value;

        // Sync buttons
        document.querySelectorAll(".mode-btn").forEach(b => {
            b.classList.remove("active");
            if (b.dataset.mode === currentFilterType) b.classList.add("active");
        });

        updateFilters(100);

        // Immediate effect if paused
        if (isPaused && dataPoints.length > 0) {
            dataPoints.forEach(p => {
                if (currentFilterType === "raw") {
                    p.x = p.rawX; p.y = p.rawY; p.z = p.rawZ;
                } else {
                    p.x = filters.x.process(p.rawX);
                    p.y = filters.y.process(p.rawY);
                    p.z = filters.z.process(p.rawZ);
                }
            });
            seriesX.data.setAll(dataPoints);
            seriesY.data.setAll(dataPoints);
            seriesZ.data.setAll(dataPoints);
            updateYAxisRange();
        }

        updateFFT();
    });

    // Filtering Mode Buttons (Sync with Select)
    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.mode;
            document.getElementById("select-filter-type").value = mode;
            document.getElementById("select-filter-type").dispatchEvent(new Event('change'));
        });
    });

    // Selection Analysis for FFT
    rtCursor.events.on("selectended", () => {
        if (!isPaused) return;
        const start = rtXAxis.getPrivate("selectionMin");
        const end = rtXAxis.getPrivate("selectionMax");
        if (start !== undefined && end !== undefined) {
            const slice = dataPoints.filter(p => p.index >= start && p.index <= end);
            if (slice.length >= 32) {
                updateFFT(slice);
            }
        }
    });

    // Screenshot
    const screenshotBtn = document.getElementById("btn-screenshot");
    if (screenshotBtn) {
        screenshotBtn.addEventListener("click", () => {
            const captureArea = document.getElementById("capture-zone");
            if (!captureArea) return;

            // Flash feedback
            screenshotBtn.style.color = "#22c55e";
            setTimeout(() => screenshotBtn.style.color = "", 600);

            // Resolve CSS variable for background
            const bgColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--bg-body').trim() || "#f0f2f9";

            html2canvas(captureArea, {
                backgroundColor: bgColor,
                scale: 2,           // High-res output
                useCORS: true,
                scrollY: -window.scrollY,
                windowWidth: document.documentElement.scrollWidth
            }).then(canvas => {
                const link = document.createElement('a');
                const now = new Date();
                const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                screenshotCount++;
                const num = String(screenshotCount).padStart(2, '0');
                link.download = `acc-kdi-snapshot-${date}-${num}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        });
    }

    // FFT Logic
    function computeFFT(real, imag) {
        let n = real.length;
        for (let i = 0; i < n; i++) {
            let j = 0, tempN = n, tempI = i;
            while (tempN > 1) {
                j = (j << 1) | (tempI & 1);
                tempI >>= 1;
                tempN >>= 1;
            }
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }
        for (let size = 2; size <= n; size <<= 1) {
            let half = size >> 1, step = -2 * Math.PI / size;
            for (let i = 0; i < n; i += size) {
                for (let j = i; j < i + half; j++) {
                    let k = j - i;
                    let wRe = Math.cos(k * step), wIm = Math.sin(k * step);
                    let idx1 = j, idx2 = j + half;
                    let tRe = real[idx2] * wRe - imag[idx2] * wIm;
                    let tIm = real[idx2] * wIm + imag[idx2] * wRe;
                    real[idx2] = real[idx1] - tRe;
                    imag[idx2] = imag[idx1] - tIm;
                    real[idx1] += tRe;
                    imag[idx1] += tIm;
                }
            }
        }
    }

    function findTopPeaks(data, count = 5, minDistance = 0.5) {
        let candidates = [];
        for (let i = 1; i < data.length - 1; i++) {
            if (data[i].mag > data[i - 1].mag && data[i].mag > data[i + 1].mag) candidates.push(data[i]);
        }
        candidates.sort((a, b) => b.mag - a.mag);
        let result = [];
        for (let cand of candidates) {
            if (result.length >= count) break;
            if (!result.some(p => Math.abs(p.freq - cand.freq) < minDistance)) result.push(cand);
        }
        return result.sort((a, b) => a.freq - b.freq);
    }

    function updateFFT(manualSlice = null) {
        if (!dataPoints || dataPoints.length < 32) return;

        let slice;
        let n = 1;

        if (manualSlice && manualSlice.length >= 32) {
            while (n * 2 <= manualSlice.length) n *= 2;
            slice = manualSlice.slice(-n);
        } else {
            while (n * 2 <= Math.min(windowSize, dataPoints.length)) n *= 2;
            slice = dataPoints.slice(-n);
        }

        const Fs = SAMPLING_RATE;
        fftXAxis.set("max", Fs / 2);

        let realX = new Float32Array(n), imagX = new Float32Array(n);
        let realY = new Float32Array(n), imagY = new Float32Array(n);
        let realZ = new Float32Array(n), imagZ = new Float32Array(n);

        for (let i = 0; i < n; i++) {
            let multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
            realX[i] = slice[i].x * multiplier;
            realY[i] = slice[i].y * multiplier;
            realZ[i] = slice[i].z * multiplier;
        }

        computeFFT(realX, imagX); computeFFT(realY, imagY); computeFFT(realZ, imagZ);

        let dataX = [], dataY = [], dataZ = [];
        const N_half = n / 2;
        for (let i = 0; i < N_half; i++) {
            let freq = (i * Fs) / n;
            let magX = Math.sqrt(realX[i] ** 2 + imagX[i] ** 2) / N_half;
            let magY = Math.sqrt(realY[i] ** 2 + imagY[i] ** 2) / N_half;
            let magZ = Math.sqrt(realZ[i] ** 2 + imagZ[i] ** 2) / N_half;
            let formattedFreq = freq.toFixed(2);
            if (freq >= 0.1) {
                dataX.push({ freq, formattedFreq, DSP_FREQ_FINAL: formattedFreq + " Hz", mag: magX, bullet: false });
                dataY.push({ freq, formattedFreq, DSP_FREQ_FINAL: formattedFreq + " Hz", mag: magY, bullet: false });
                dataZ.push({ freq, formattedFreq, DSP_FREQ_FINAL: formattedFreq + " Hz", mag: magZ, bullet: false });
            }
        }

        const peaksX = findTopPeaks(dataX), peaksY = findTopPeaks(dataY), peaksZ = findTopPeaks(dataZ);
        peaksX.forEach(p => { const d = dataX.find(x => Math.abs(x.freq - p.freq) < 0.001); if (d) d.bullet = true; });
        peaksY.forEach(p => { const d = dataY.find(x => Math.abs(x.freq - p.freq) < 0.001); if (d) d.bullet = true; });
        peaksZ.forEach(p => { const d = dataZ.find(x => Math.abs(x.freq - p.freq) < 0.001); if (d) d.bullet = true; });

        fftSeriesX.data.setAll(dataX); fftSeriesY.data.setAll(dataY); fftSeriesZ.data.setAll(dataZ);

        // Update Y-Axis Range based on visible series
        const isXVis = fftSeriesX.get("visible");
        const isYVis = fftSeriesY.get("visible");
        const isZVis = fftSeriesZ.get("visible");

        let maxMag = 0;
        if (isXVis) dataX.forEach(p => { if (p.mag > maxMag) maxMag = p.mag; });
        if (isYVis) dataY.forEach(p => { if (p.mag > maxMag) maxMag = p.mag; });
        if (isZVis) dataZ.forEach(p => { if (p.mag > maxMag) maxMag = p.mag; });

        if (maxMag > 0) {
            fftYAxis.set("max", maxMag * 1.15);
        } else {
            fftYAxis.set("max", undefined);
        }

        // Update Dominant Frequency Summary Cards
        const getDomInfo = (peaks, series) => {
            if (!series || !series.get("visible") || !peaks || peaks.length === 0) return "--";
            const top = [...peaks].sort((a, b) => b.mag - a.mag)[0];
            return `${top.freq.toFixed(2)} Hz (${top.mag.toFixed(5)})`;
        };

        if (document.getElementById("summ-peak-x")) document.getElementById("summ-peak-x").innerText = getDomInfo(peaksX, fftSeriesX);
        if (document.getElementById("summ-peak-y")) document.getElementById("summ-peak-y").innerText = getDomInfo(peaksY, fftSeriesY);
        if (document.getElementById("summ-peak-z")) document.getElementById("summ-peak-z").innerText = getDomInfo(peaksZ, fftSeriesZ);

        // Update Peak Summary Table
        updatePeakSummaryTable(peaksX, peaksY, peaksZ);

        // Update subtitle with dominant info
        const subtitle = document.getElementById("fft-subtitle");
        if (subtitle) {
            subtitle.innerText = `N - ${n} | Dominant: X - ${getDomInfo(peaksX)}, Y - ${getDomInfo(peaksY)}, Z - ${getDomInfo(peaksZ)}`;
        }
    }

    function updatePeakSummaryTable(px, py, pz) {
        const tbody = document.getElementById("peak-summary-body");
        if (!tbody) return;

        const hexX = '#' + colors.x.toString(16).padStart(6, '0');
        const hexY = '#' + colors.y.toString(16).padStart(6, '0');
        const hexZ = '#' + colors.z.toString(16).padStart(6, '0');

        const renderAxisGroup = (axisLabel, peaks, color, series) => {
            // Hide group if series is not visible
            if (series && !series.get("visible")) return "";

            if (!peaks || peaks.length === 0) return "";
            // 1. Get top 5 peaks by magnitude first
            let top5 = [...peaks].sort((a, b) => b.mag - a.mag).slice(0, 5);
            // 2. Sort those 5 selected peaks by frequency (ascending)
            top5.sort((a, b) => a.freq - b.freq);

            const bg = color + "12"; // ~7% opacity for subtle grouping
            return top5.map((p, idx) => `
                <tr style="background-color: ${bg}; ${idx === 0 ? + color : ""}">
                    <td style="font-weight: 800; color: ${color}; padding-left: 10px;">${idx === 0 ? axisLabel : ""}</td>
                    <td style="color: var(--text-muted); font-size: 0.75rem;">f${idx + 1}</td>
                    <td style="font-weight: 600;">${p.freq.toFixed(2)}</td>
                    <td style="font-family: monospace; padding-right: 10px;">${p.mag.toFixed(5)}</td>
                </tr>
            `).join("");
        };

        tbody.innerHTML =
            renderAxisGroup("X", px, hexX, fftSeriesX) +
            renderAxisGroup("Y", py, hexY, fftSeriesY) +
            renderAxisGroup("Z", pz, hexZ, fftSeriesZ);
    }

    setInterval(() => { if (!isPaused) updateFFT(); }, 1000);
    setInterval(updateConnection, 5000); // Check connection every 5 seconds

    // ---- Connection Info Popup ----
    const btnConnInfo = document.getElementById("btn-conn-info");
    const connInfoPopup = document.getElementById("conn-info-popup");
    if (btnConnInfo && connInfoPopup) {
        btnConnInfo.addEventListener("click", (e) => {
            e.stopPropagation();
            connInfoPopup.style.display = (connInfoPopup.style.display === "none") ? "block" : "none";
        });

        window.addEventListener("click", (e) => {
            if (!connInfoPopup.contains(e.target)) {
                connInfoPopup.style.display = "none";
            }
        });
    }

    // ---- 5. Legend Toggling ----
    // Real-time Chart Legend (Only items that are NOT fft-legend-btn)
    document.querySelectorAll(".vib-legend .legend-item:not(.fft-legend-btn)").forEach(item => {
        item.addEventListener("click", () => {
            const axis = item.getAttribute("data-axis");
            if (!axis) return;
            let series = axis === "x" ? seriesX : (axis === "y" ? seriesY : seriesZ);
            if (series) {
                if (series.get("visible")) { series.hide(); item.classList.add("inactive"); }
                else { series.show(); item.classList.remove("inactive"); }
                updateYAxisRange();
            }
        });
    });

    document.querySelectorAll(".fft-legend-btn").forEach(item => {
        item.addEventListener("click", () => {
            const axis = item.getAttribute("data-axis");
            if (!axis) return;
            let series = axis === "x" ? fftSeriesX : (axis === "y" ? fftSeriesY : fftSeriesZ);
            if (series) {
                if (series.get("visible")) { series.hide(); item.classList.add("inactive"); }
                else { series.show(); item.classList.remove("inactive"); }
                // Trigger immediate Y-axis update
                updateFFT();
            }
        });
    });
});
