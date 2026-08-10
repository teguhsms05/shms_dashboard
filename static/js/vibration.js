// ==========================================
// Vibration Monitoring simulation (No DB)
// Realistic Impulse Response (matching reference image)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // ---- Constants & State ----
    let sensors = ["JTK_AC_S203", "JTK_AC_S204", "JTK_AC_S205"];
    let dataPoints = [];
    const MAX_POINTS = 1000; // Store 1000 points before shifting

    // Axis colors
    const colors = {
        x: 0xef4444, // Red
        y: 0x22c55e, // Green
        z: 0x3b82f6  // Blue
    };

    let activeFFTAxis = "x";
    let eventActive = false;
    let eventTick = 0;

    // New Configuration State
    let isPaused = true;
    const socket = io({ autoConnect: false });
    let windowSize = 2048;
    let currentFilterType = "bandpass";
    let screenshotCount = 0;

    const EVENT_PEAK_X = 172100;
    const EVENT_PEAK_Y = 180800;
    const EVENT_PEAK_Z = 83860;
    const DECAY_RATE = 0.05;

    // ---- amCharts 5 Root Setup ----
    const rtRoot = am5.Root.new("realtime-chart");
    rtRoot.setThemes([am5themes_Animated.new(rtRoot)]);

    const fftRoot = am5.Root.new("fft-chart");
    fftRoot.setThemes([am5themes_Animated.new(fftRoot)]);

    // ---- 1. Real-Time Chart Setup ----
    const rtChart = rtRoot.container.children.push(
        am5xy.XYChart.new(rtRoot, {
            panX: true, 
            panY: false, 
            wheelX: "panX", 
            wheelY: "zoomX", 
            pinchZoomX: true
        })
    );

    const rtXAxis = rtChart.xAxes.push(
        am5xy.ValueAxis.new(rtRoot, {
            renderer: am5xy.AxisRendererX.new(rtRoot, { minGridDistance: 50 }),
            tooltip: am5.Tooltip.new(rtRoot, {})
        })
    );

    const rtYAxis = rtChart.yAxes.push(
        am5xy.ValueAxis.new(rtRoot, {
            renderer: am5xy.AxisRendererY.new(rtRoot, {}),
            extraMax: 0.1, extraMin: 0.1
        })
    );

    function createRTSeries(name, field, color) {
        let series = rtChart.series.push(
            am5xy.LineSeries.new(rtRoot, {
                name: name, xAxis: rtXAxis, yAxis: rtYAxis, valueYField: field, valueXField: "index",
                stroke: am5.color(color),
                tooltip: am5.Tooltip.new(rtRoot, { labelText: name + ": {valueY}" })
            })
        );
        series.strokes.template.setAll({ strokeWidth: 1.5 });
        return series;
    }

    const seriesX = createRTSeries("Accel X", "x", colors.x);
    const seriesY = createRTSeries("Accel Y", "y", colors.y);
    const seriesZ = createRTSeries("Accel Z", "z", colors.z);

    // Add Cursor with dynamic behavior
    const rtCursor = rtChart.set("cursor", am5xy.XYCursor.new(rtRoot, {
        behavior: "none" // Changed dynamically
    }));
    rtCursor.lineY.set("visible", false);

    // Style the selection area
    rtCursor.selection.setAll({
        fill: am5.color(0x3b82f6),
        fillOpacity: 0.2,
        stroke: am5.color(0x3b82f6),
        strokeWidth: 1,
        strokeDasharray: [3, 3]
    });

    // ---- 2. FFT Chart Setup ----
    const fftChart = fftRoot.container.children.push(
        am5xy.XYChart.new(fftRoot, { panX: false, panY: false, wheelX: "none", wheelY: "none" })
    );

    const fftXAxis = fftChart.xAxes.push(
        am5xy.ValueAxis.new(fftRoot, {
            renderer: am5xy.AxisRendererX.new(fftRoot, { minGridDistance: 50 }),
            min: 0, max: 10, strictMinMax: true
        })
    );

    const fftYAxis = fftChart.yAxes.push(
        am5xy.ValueAxis.new(fftRoot, {
            renderer: am5xy.AxisRendererY.new(fftRoot, {}),
            min: 0,
            extraMax: 0.2
        })
    );

    // Apply theme-aware axis colors
    if (window.SHMChart) {
        SHMChart.refreshAxisColors([rtXAxis, rtYAxis, fftXAxis, fftYAxis]);
        SHMChart.watchTheme(() => {
            SHMChart.refreshAxisColors([rtXAxis, rtYAxis, fftXAxis, fftYAxis]);
        });
    }

    const fftSeries = fftChart.series.push(
        am5xy.LineSeries.new(fftRoot, {
            name: "FFT Magnitude", xAxis: fftXAxis, yAxis: fftYAxis, valueYField: "mag", valueXField: "freq",
            stroke: am5.color(colors.x), fill: am5.color(colors.x)
        })
    );
    fftSeries.strokes.template.setAll({ strokeWidth: 2 });
    fftSeries.fills.template.setAll({ visible: true, fillOpacity: 0.1 });

    // ---- 3. Simulation Logic ----
    let globalTick = 0;

    function generateSimulatedData() {
        if (isPaused) return;
        globalTick++;

        // Log simulated stream values
        console.log(`[VIB-SIM] Tick: ${globalTick} | Filter: ${currentFilterType}`);

        // Base noise level adjusted by filter type
        let noiseFactor = (currentFilterType === 'raw') ? 1.0 :
            (currentFilterType === 'bandpass') ? 0.3 :
                (currentFilterType === 'highpass') ? 0.6 : 0.4;

        let noiseX = (Math.random() - 0.5) * 500 * noiseFactor;
        let noiseY = (Math.random() - 0.5) * 500 * noiseFactor;
        let noiseZ = (Math.random() - 0.5) * 200 * noiseFactor;

        // Simulate frequency characteristics
        let jitterX = (currentFilterType === 'lowpass') ? 0 : Math.sin(globalTick * 3.5) * (currentFilterType === 'raw' ? 15000 : 2000);
        let jitterY = (currentFilterType === 'lowpass') ? 0 : Math.cos(globalTick * 3.7) * (currentFilterType === 'raw' ? 15000 : 2000);
        let jitterZ = (currentFilterType === 'lowpass') ? 0 : Math.sin(globalTick * 3.2) * (currentFilterType === 'raw' ? 8000 : 1000);

        let cleanX = noiseX * 2 + jitterX;
        let cleanY = noiseY * 2 + jitterY;
        let cleanZ = noiseZ * 2 + jitterZ;

        let rawX = noiseX * 40 + Math.sin(globalTick * 3.5) * 15000;
        let rawY = noiseY * 40 + Math.cos(globalTick * 3.7) * 15000;
        let rawZ = noiseZ * 40 + Math.sin(globalTick * 3.2) * 8000;

        let isCurrentlyEvent = false;

        // Trigger event randomly if not active
        if (!eventActive && Math.random() < 0.01) {
            eventActive = true;
            eventTick = 0;
        }

        if (eventActive) {
            eventTick++;
            isCurrentlyEvent = true;
            const envelope = Math.exp(-DECAY_RATE * eventTick);
            const freq = (currentFilterType === 'highpass') ? 1.2 : 0.8;

            const eventX = EVENT_PEAK_X * envelope * Math.sin(eventTick * freq) * (0.8 + Math.random() * 0.4);
            const eventY = EVENT_PEAK_Y * envelope * Math.sin(eventTick * (freq + 0.1)) * (0.8 + Math.random() * 0.4);
            const eventZ = EVENT_PEAK_Z * envelope * Math.sin(eventTick * (freq - 0.05)) * (0.8 + Math.random() * 0.4);

            cleanX += eventX;
            cleanY += eventY;
            cleanZ += eventZ;
            rawX += eventX;
            rawY += eventY;
            rawZ += eventZ;

            if (envelope < 0.001) eventActive = false;
        }

        const newData = {
            index: globalTick,
            cleanX: Math.round(cleanX),
            cleanY: Math.round(cleanY),
            cleanZ: Math.round(cleanZ),
            rawX: Math.round(rawX),
            rawY: Math.round(rawY),
            rawZ: Math.round(rawZ),
            // Map the chart display to current filter type
            x: Math.round(currentFilterType === "raw" ? rawX : cleanX),
            y: Math.round(currentFilterType === "raw" ? rawY : cleanY),
            z: Math.round(currentFilterType === "raw" ? rawZ : cleanZ),
            time: new Date().toLocaleTimeString(),
            isEvent: isCurrentlyEvent
        };

        dataPoints.push(newData);
        if (dataPoints.length > MAX_POINTS) dataPoints.shift();

        seriesX.data.setAll(dataPoints);
        seriesY.data.setAll(dataPoints);
        seriesZ.data.setAll(dataPoints);

        updateSnapshotTable(newData);
        updateSummary(newData);
    }

    function updateSnapshotTable(data) {
        const tbody = document.getElementById("snapshot-table-body");
        if (!tbody) return;
        const tr = document.createElement("tr");
        const statusIcon = data.isEvent ? '<span style="color:#ef4444;font-size:0.7rem;">● EVENT</span>' : '<span style="color:#22c55e;font-size:0.7rem;">● NORMAL</span>';
        tr.innerHTML = `<td>${data.time}</td><td>${data.x}</td><td>${data.y}</td><td style="font-weight:700;">${data.z}</td><td>${statusIcon}</td>`;
        tbody.insertBefore(tr, tbody.firstChild);
        if (tbody.children.length > 8) tbody.removeChild(tbody.lastChild);
    }

    // Event counter
    let totalEventCount = 0;
    let lastEventState = false;

    // Alert thresholds (m/s²)
    const THRESHOLD_WARNING = 50000;
    const THRESHOLD_CRITICAL = 150000;

    function updateSummary(data) {
        document.getElementById("card-last-update").innerText = data.time;

        // --- Peak Acceleration ---
        const peakVal = Math.max(Math.abs(data.x), Math.abs(data.y), Math.abs(data.z));
        const peakAxis = Math.abs(data.x) >= Math.abs(data.y) && Math.abs(data.x) >= Math.abs(data.z) ? 'X'
            : Math.abs(data.y) >= Math.abs(data.z) ? 'Y' : 'Z';
        const peakEl = document.getElementById("card-peak-accel");
        const peakAxisEl = document.getElementById("card-peak-axis");
        if (peakEl) peakEl.innerText = (peakVal / 1000).toFixed(2) + " g";
        if (peakAxisEl) peakAxisEl.innerText = `via ${peakAxis}-Axis`;

        // --- Alert Level ---
        const alertDot = document.getElementById("alert-dot");
        const alertText = document.getElementById("alert-text");
        const alertSub = document.getElementById("alert-sub");
        if (alertDot && alertText && alertSub) {
            if (peakVal >= THRESHOLD_CRITICAL) {
                alertDot.style.background = "#ef4444";
                alertDot.style.boxShadow = "0 0 8px #ef4444";
                alertText.style.color = "#ef4444";
                alertText.innerText = "Critical";
                alertSub.innerText = "Melebihi batas kritis!";
            } else if (peakVal >= THRESHOLD_WARNING) {
                alertDot.style.background = "#f59e0b";
                alertDot.style.boxShadow = "0 0 8px #f59e0b";
                alertText.style.color = "#f59e0b";
                alertText.innerText = "Warning";
                alertSub.innerText = "Mendekati batas aman";
            } else {
                alertDot.style.background = "#22c55e";
                alertDot.style.boxShadow = "0 0 8px #22c55e";
                alertText.style.color = "#22c55e";
                alertText.innerText = "Normal";
                alertSub.innerText = "Dalam batas aman";
            }
        }

        // --- Event Count (increment once per event trigger) ---
        if (data.isEvent && !lastEventState) totalEventCount++;
        lastEventState = data.isEvent;
        const evCountEl = document.getElementById("card-event-count");
        if (evCountEl) evCountEl.innerText = totalEventCount;
    }

    function updateConnection() {
        // Simulate Connection Latency & Status
        const connCard = document.getElementById("card-connection");
        const connText = document.getElementById("connection-text");
        const connMs = document.getElementById("connection-ms");

        if (connCard && connText && connMs) {
            // Simulation logic for latency
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
        }
    }

    function updateFFT(isEventInSelection = null) {
        const useEventPeaks = (isEventInSelection !== null) ? isEventInSelection : eventActive;

        // Intensity/Sharpness based on Window Size
        const resolutionFactor = 1024 / windowSize; // Smaller size = larger spread
        const sigma = 0.05 * resolutionFactor;

        // Helper to get peak for an axis
        function getAxisPeak(axis) {
            let baseFreq = useEventPeaks ? (axis === 'z' ? 0.74 : (axis === 'y' ? 0.58 : 0.45)) : (axis === 'z' ? 0.62 : (axis === 'y' ? 0.55 : 0.42));

            // Filter effects on FFT magnitudes
            let filterGain = (currentFilterType === 'raw') ? 1.2 :
                (currentFilterType === 'bandpass') ? 0.9 :
                    (currentFilterType === 'highpass') ? 0.7 : 0.5;

            // If lowpass and freq is high, drop it. If highpass and freq is low, drop it.
            if (currentFilterType === 'lowpass' && baseFreq > 0.8) filterGain *= 0.1;
            if (currentFilterType === 'highpass' && baseFreq < 1.0) filterGain *= 0.2;

            const peakMagBase = useEventPeaks ? (axis === 'z' ? 0.8 : (axis === 'y' ? 0.75 : 0.7)) : (axis === 'z' ? 0.05 : (axis === 'y' ? 0.04 : 0.03));

            let maxMag = -1;
            let peakFreq = 0;
            let axisData = [];

            for (let f = 0; f <= 10; f += 0.1) {
                let mag = Math.random() * (useEventPeaks ? 0.1 : 0.005) * filterGain;
                const dist = Math.abs(f - baseFreq);
                if (dist < 1.0) {
                    // Lorentzian-like peak adjusted by resolution
                    mag += (peakMagBase * filterGain) * Math.exp(-(dist * dist) / (2 * sigma * sigma));
                }

                // Extra noise if RAW
                if (currentFilterType === 'raw') {
                    mag += Math.random() * 0.02;
                }

                if (mag > maxMag) {
                    maxMag = mag;
                    peakFreq = f;
                }
                if (axis === activeFFTAxis) {
                    axisData.push({ freq: parseFloat(f.toFixed(1)), mag: parseFloat(mag.toFixed(5)), bullet: false });
                }
            }
            return { maxMag, peakFreq, data: axisData };
        }

        const peaks = {
            x: getAxisPeak('x'),
            y: getAxisPeak('y'),
            z: getAxisPeak('z')
        };

        // Update table & Summary Row
        ['x', 'y', 'z'].forEach(ax => {
            const freqVal = peaks[ax].peakFreq.toFixed(2);
            const magVal = peaks[ax].maxMag.toFixed(3);

            document.getElementById(`peak-${ax}-freq`).innerText = freqVal;
            document.getElementById(`peak-${ax}-mag`).innerText = magVal;

            // Update Top Summary Card
            const summElem = document.getElementById(`summ-peak-${ax}`);
            if (summElem) summElem.innerText = freqVal;
        });

        // Update active series data
        const activeData = peaks[activeFFTAxis].data;
        const peakIndex = activeData.findIndex(d => d.freq === parseFloat(peaks[activeFFTAxis].peakFreq.toFixed(1)));
        if (peakIndex !== -1) activeData[peakIndex].bullet = true;

        fftSeries.data.setAll(activeData);
        fftSeries.set("stroke", am5.color(colors[activeFFTAxis]));
        fftSeries.set("fill", am5.color(colors[activeFFTAxis]));

        // Re-setup bullet logic
        fftSeries.bullets.clear();
        fftSeries.bullets.push(function (root, series, dataItem) {
            if (dataItem.dataContext.bullet) {
                const container = am5.Container.new(fftRoot, { centerX: am5.p50, centerY: am5.p100 });
                container.children.push(am5.Circle.new(fftRoot, { radius: 4, fill: am5.color(colors[activeFFTAxis]), stroke: am5.color(0xffffff), strokeWidth: 2 }));
                container.children.push(am5.Label.new(fftRoot, {
                    text: dataItem.get("valueX").toFixed(2) + " Hz",
                    fill: am5.color(0xffffff), fontSize: "11px", fontWeight: "600", centerX: am5.p50, centerY: am5.p100, dy: -10,
                    background: am5.RoundedRectangle.new(fftRoot, {
                        fill: am5.color(colors[activeFFTAxis]), fillOpacity: 1, cornerRadiusTL: 4, cornerRadiusTR: 4, cornerRadiusBL: 4, cornerRadiusBR: 4
                    })
                }));
                return am5.Bullet.new(fftRoot, { sprite: container });
            }
        });
    }

    // ---- 4. UI Events ----
    // Selects
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

        // Clear history to reflect filter change immediately if stopped
        if (isPaused) {
            dataPoints.forEach(p => {
                // Update display values in buffer
                // This is a simplification; in reality we'd re-filter the raw data
                p.x = currentFilterType === "raw" ? p.rawX : p.cleanX;
                p.y = currentFilterType === "raw" ? p.rawY : p.cleanY;
                p.z = currentFilterType === "raw" ? p.rawZ : p.cleanZ;
            });
            seriesX.data.setAll(dataPoints);
            seriesY.data.setAll(dataPoints);
            seriesZ.data.setAll(dataPoints);
        }
        updateFFT();
    });

    const seriesMap = { x: seriesX, y: seriesY, z: seriesZ };

    function toggleSeries(axis) {
        const targetSeries = seriesMap[axis];
        if (!targetSeries) return;
        const isVisible = targetSeries.get("visible");
        if (isVisible) targetSeries.hide(); else targetSeries.show();
        const legendItem = document.querySelector(`.legend-item[data-axis="${axis}"]`);
        if (legendItem) isVisible ? legendItem.classList.add("hidden") : legendItem.classList.remove("hidden");
    }

    document.querySelectorAll(".legend-item").forEach(btn => {
        btn.addEventListener("click", () => {
            const axis = btn.dataset.axis;
            if (axis) toggleSeries(axis);
        });
    });

    // Filtering Mode Buttons (Sync with Select)
    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.mode;
            document.getElementById("select-filter-type").value = mode;
            document.getElementById("select-filter-type").dispatchEvent(new Event('change'));
        });
    });

    // FFT Axis Toggling
    document.querySelectorAll(".fft-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".fft-toggle").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeFFTAxis = btn.dataset.axis;
            updateFFT();
        });
    });

    // Stop / Start
    const stopStartBtn = document.getElementById("btn-stop-start");
    if (stopStartBtn) {
        stopStartBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            stopStartBtn.innerText = isPaused ? "Start" : "Stop";
            if (isPaused) {
                // STOP STATE
                socket.disconnect();
                stopStartBtn.style.background = "#22c55e"; // Green
                stopStartBtn.style.borderColor = "#22c55e";
                rtCursor.set("behavior", "selectX");
                rtChart.set("panX", false);
            } else {
                // START STATE
                socket.connect();
                stopStartBtn.style.background = "#2563eb"; // Blue
                stopStartBtn.style.borderColor = "#2563eb";
                rtCursor.set("behavior", "none");
                rtChart.set("panX", true);
                rtXAxis.set("selectionMin", undefined);
                rtXAxis.set("selectionMax", undefined);
                updateFFT();
            }
        });
    }

    // Socket Event Listeners for Connection Card
    socket.on("connect", () => {
        const dot = document.getElementById("connection-dot");
        const text = document.getElementById("connection-text");
        const ms = document.getElementById("connection-ms");
        if (dot) {
            dot.style.background = "#22c55e";
            dot.style.boxShadow = "0 0 8px #22c55e";
        }
        if (text) text.innerText = "Excellent";
        if (ms) ms.innerText = "Connected";
    });

    socket.on("disconnect", () => {
        const dot = document.getElementById("connection-dot");
        const text = document.getElementById("connection-text");
        const ms = document.getElementById("connection-ms");
        if (dot) {
            dot.style.background = "#94a3b8";
            dot.style.boxShadow = "none";
        }
        if (text) text.innerText = "Offline";
        if (ms) ms.innerText = "Disconnected";
    });

    // Selection Analysis
    rtCursor.events.on("selectended", () => {
        if (!isPaused) return;
        const start = rtXAxis.getPrivate("selectionMin");
        const end = rtXAxis.getPrivate("selectionMax");
        if (start !== undefined && end !== undefined) {
            const slice = dataPoints.filter(p => p.index >= start && p.index <= end);
            const containsEvent = slice.some(p => p.isEvent);
            updateFFT(containsEvent);
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
                link.download = `vibration-snapshot-${date}-${num}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        });
    }
    // Connection Info Popup Logic
    const btnConnInfo = document.getElementById("btn-conn-info");
    const connInfoPopup = document.getElementById("conn-info-popup");
    if (btnConnInfo && connInfoPopup) {
        btnConnInfo.addEventListener("click", (e) => {
            e.stopPropagation();
            if (connInfoPopup.style.display === "none") {
                connInfoPopup.style.display = "block";
            } else {
                connInfoPopup.style.display = "none";
            }
        });
        
        // Close popup when clicking outside
        window.addEventListener("click", (e) => {
            if (!connInfoPopup.contains(e.target)) {
                connInfoPopup.style.display = "none";
            }
        });
    }

    setInterval(generateSimulatedData, 100);
    setInterval(() => { if (!isPaused) updateFFT(); }, 1000);
    setInterval(updateConnection, 10000); // Check connection every 10 seconds

    updateConnection(); // Initial check
    updateFFT();
});
