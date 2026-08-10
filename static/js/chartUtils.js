/**
 * SHM Bridge — Chart Utilities (chartUtils.js)
 * ============================================================
 * Shared helper functions for amCharts 5 chart setup.
 * Eliminates repetitive boilerplate across sensor chart pages.
 *
 * Usage (all functions live on the global SHMChart object):
 *
 *   const C = SHMChart.colors();            // theme-aware colors
 *   const chart = SHMChart.createXYChart(root);
 *   SHMChart.applyZoomButton(chart, root);
 *   const xAxis = SHMChart.createDateXAxis(chart, root, C);
 *   const yAxis = SHMChart.createValueYAxis(chart, root, C, { min: 0, max: 100 });
 *   SHMChart.addYLabel(yAxis, root, 'Temperature (°C)', C);
 *   SHMChart.addThreshold(yAxis, root, 40, 0xef4444, '40°C');
 *   const pulse = SHMChart.createPulseSeries(chart, root, xAxis, yAxis, 'temperature', 0x3b82f6);
 *   SHMChart.setupLegendToggle('legend-temp', mainSeries, pulse, yAxis);
 *   SHMChart.watchTheme(() => { ... }); // re-run on dark/light toggle
 */

window.SHMChart = (() => {

    // ─────────────────────────────────────────────────────────
    // 1. Theme-aware color tokens
    // ─────────────────────────────────────────────────────────
    function colors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            isDark,
            text: isDark ? 0xffffff : 0x64748b,
            grid: isDark ? 0xffffff : 0x000000,
            stroke: 0xcccccc,
            tooltipBg: 0x6366f1,
        };
    }

    // ─────────────────────────────────────────────────────────
    // 2. Standard XYChart
    // ─────────────────────────────────────────────────────────
    /**
     * @param {am5.Root} root
     * @param {object} [opts]
     *   opts.wheelX  – default "panX"
     *   opts.wheelY  – default "zoomX"
     *   opts.layout  – pass root.verticalLayout for vertical charts
     */
    function createXYChart(root, opts = {}) {
        const cfg = {
            panX: false,
            panY: false,
            wheelX: opts.wheelX ?? 'panX',
            wheelY: opts.wheelY ?? 'zoomX',
            pinchZoomX: true,
        };
        if (opts.layout) cfg.layout = opts.layout;
        return root.container.children.push(am5xy.XYChart.new(root, cfg));
    }

    // ─────────────────────────────────────────────────────────
    // 3. Zoom-out button (branded)
    // ─────────────────────────────────────────────────────────
    function applyZoomButton(chart, root) {
        chart.set('zoomOutButton', am5.Button.new(root, {
            visible: true,
            paddingTop: 10, paddingBottom: 10,
            paddingLeft: 10, paddingRight: 10,
            centerX: am5.p100,
            x: am5.p100,
            y: 10,
        }));
        chart.get('zoomOutButton').get('background').setAll({
            fill: am5.color(0x3b82f6),
            fillOpacity: 0.8,
        });
    }

    // ─────────────────────────────────────────────────────────
    // 4. Date X-Axis (time-series, second resolution)
    // ─────────────────────────────────────────────────────────
    /**
     * @param {am5xy.XYChart} chart
     * @param {am5.Root} root
     * @param {object} C - colors object from SHMChart.colors()
     * @param {object} [opts]
     *   opts.minGridDistance – default 70
     */
    function createDateXAxis(chart, root, C, opts = {}) {
        const xAxis = chart.xAxes.push(
            am5xy.DateAxis.new(root, {
                maxDeviation: 0.5,
                extraMax: 0.02,
                baseInterval: { timeUnit: opts.timeUnit || 'second', count: opts.count || 1 },
                renderer: am5xy.AxisRendererX.new(root, {
                    minGridDistance: opts.minGridDistance ?? 70,
                    minorGridEnabled: true,
                    minorLabelsEnabled: false,
                    stroke: am5.color(C.stroke),
                    strokeOpacity: 1,
                }),
                minorDateFormats: {
                    second: 'ss',
                    minute: 'mm:ss',
                    hour: 'HH:mm',
                    day: 'MMM dd',
                    week: 'MMM dd',
                    month: 'MMM',
                    year: 'yyyy',
                },
                tooltip: am5.Tooltip.new(root, {}),
            })
        );
        xAxis.get('renderer').labels.template.setAll({ fill: am5.color(C.text) });

        return xAxis;
    }

    // ─────────────────────────────────────────────────────────
    // 5. Value Y-Axis
    // ─────────────────────────────────────────────────────────
    /**
     * @param {am5xy.XYChart} chart
     * @param {am5.Root} root
     * @param {object} C - colors()
     * @param {object} [opts]
     *   opts.opposite – boolean, right-side axis
     *   opts.min, opts.max – axis range
     *   opts.extraMax – default 0.1
     *   opts.strictMinMax – boolean
     */
    function createValueYAxis(chart, root, C, opts = {}) {
        const rendererCfg = {
            stroke: am5.color(C.stroke),
            strokeOpacity: 1,
        };
        if (opts.opposite) rendererCfg.opposite = true;

        const axisCfg = {
            renderer: am5xy.AxisRendererY.new(root, rendererCfg),
            extraMax: opts.extraMax ?? 0.1,
        };
        if (opts.min !== undefined) axisCfg.min = opts.min;
        if (opts.max !== undefined) axisCfg.max = opts.max;
        if (opts.strictMinMax !== undefined) axisCfg.strictMinMax = opts.strictMinMax;
        if (opts.extraMin !== undefined) axisCfg.extraMin = opts.extraMin;

        const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, axisCfg));
        yAxis.get('renderer').labels.template.setAll({ fill: am5.color(C.text) });
        yAxis.get('renderer').grid.template.setAll({ stroke: am5.color(C.grid), strokeOpacity: 0.12 });
        return yAxis;
    }

    // ─────────────────────────────────────────────────────────
    // 6. Axis title label
    // ─────────────────────────────────────────────────────────
    /**
     * Add a rotated title label to a Y-axis.
     * @param {am5xy.ValueAxis} yAxis
     * @param {am5.Root} root
     * @param {string} text
     * @param {object} C - colors()
     * @param {boolean} [push=false] - use push() instead of moveValue() (right/opposite axis)
     */
    function addYLabel(yAxis, root, text, C, push = false) {
        const label = am5.Label.new(root, {
            text,
            rotation: push ? 90 : -90,
            y: am5.p50,
            centerX: am5.p50,
            fill: am5.color(C.text),
            fontWeight: 'bold',
        });
        if (push) {
            yAxis.children.push(label);
        } else {
            yAxis.children.moveValue(label, 0);
        }
        return label;
    }

    // ─────────────────────────────────────────────────────────
    // 7. Tooltip background (branded purple)
    // ─────────────────────────────────────────────────────────
    /**
     * Apply the standard SHM purple tooltip background to a series tooltip.
     * @param {am5xy.LineSeries} series
     */
    function applyTooltipBg(series) {
        const C = colors();
        const bg = series.get('tooltip')?.get('background');
        if (bg) {
            bg.setAll({ fill: am5.color(C.tooltipBg), fillOpacity: 0.8 });
        }
    }

    // ─────────────────────────────────────────────────────────
    // 8. Pulse series (latest data point animation)
    // ─────────────────────────────────────────────────────────
    /**
     * Create an invisible series that shows only a pulsing ring on its last point.
     * @param {am5xy.XYChart} chart
     * @param {am5.Root} root
     * @param {*} xAxis
     * @param {*} yAxis
     * @param {string} valueField - Y field name
     * @param {number} color - hex color e.g. 0x3b82f6
     * @param {string} [timeField='time']
     */
    function createPulseSeries(chart, root, xAxis, yAxis, valueField, color, timeField = 'time') {
        const s = chart.series.push(am5xy.LineSeries.new(root, {
            xAxis,
            yAxis,
            valueYField: valueField,
            valueXField: timeField,
            opacity: 0,
        }));
        s.strokes.template.set('visible', false);

        s.bullets.push(() => {
            const container = am5.Container.new(root, {});

            // Static inner dot
            container.children.push(am5.Circle.new(root, {
                radius: 4,
                fill: am5.color(color),
                stroke: root.interfaceColors.get('background'),
                strokeWidth: 2,
            }));

            // Expanding ring
            const ring = container.children.push(am5.Circle.new(root, {
                radius: 4,
                fill: am5.color(color),
                fillOpacity: 0.5,
            }));
            ring.animate({ key: 'radius', to: 15, duration: 1000, easing: am5.ease.out(am5.ease.cubic), loops: Infinity });
            ring.animate({ key: 'fillOpacity', to: 0, duration: 1000, easing: am5.ease.out(am5.ease.cubic), loops: Infinity });

            return am5.Bullet.new(root, { sprite: container });
        });

        return s;
    }

    // ─────────────────────────────────────────────────────────
    // 9. Threshold line + label on a Y-axis
    // ─────────────────────────────────────────────────────────
    /**
     * @param {am5xy.ValueAxis} axis
     * @param {am5.Root} root
     * @param {number} value
     * @param {number} color  - hex e.g. 0xef4444
     * @param {string} label  - displayed text e.g. "600 kN"
     */
    function addThreshold(axis, root, value, color, label) {
        const dataItem = axis.makeDataItem({ value });
        const range = axis.axisRanges.push(dataItem);
        range.get('grid').setAll({
            visible: true,
            stroke: am5.color(color),
            strokeOpacity: 0.6,
            strokeWidth: 2,
            strokeDasharray: [6, 4],
        });
        range.get('label').setAll({
            text: label,
            fill: am5.color(color),
            fontWeight: 'bold',
            location: 0,
            inside: true,
            centerX: 0,
            centerY: am5.p100,
            paddingLeft: 10,
        });
        return range;
    }

    // ─────────────────────────────────────────────────────────
    // 10. Legend toggle (show/hide series + axis)
    // ─────────────────────────────────────────────────────────
    /**
     * Wire a DOM element's click to toggle a chart series (and optional axis).
     * @param {string}   elementId    - DOM id of the legend button
     * @param {object}   mainSeries   - amCharts series to toggle
     * @param {object}   pulseSeries  - pulse series to toggle (can be null)
     * @param {object}   [axis]       - Y-axis to show/hide alongside
     * @param {Function} [onToggle]   - optional callback(isVisible)
     */
    function setupLegendToggle(elementId, mainSeries, pulseSeries, axis, onToggle) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.addEventListener('click', () => {
            const isVisible = !el.classList.contains('inactive');
            if (isVisible) {
                mainSeries.hide();
                if (pulseSeries) pulseSeries.hide();
                if (axis) {
                    axis.hide();
                    // axis.hide() hides labels/ticks but NOT grid lines — toggle explicitly
                    axis.get('renderer').grid.template.set('visible', false);
                }
                el.classList.add('inactive');
            } else {
                mainSeries.show();
                if (pulseSeries) pulseSeries.show();
                if (axis) {
                    axis.show();
                    axis.get('renderer').grid.template.set('visible', true);
                }
                el.classList.remove('inactive');
            }
            if (onToggle) onToggle(!isVisible);
        });
    }


    // ─────────────────────────────────────────────────────────
    // 11. Theme change observer
    // ─────────────────────────────────────────────────────────
    /**
     * Register a callback to run whenever the data-theme attribute changes.
     * The callback receives fresh colors() as its argument.
     * Returns the MutationObserver (call .disconnect() to clean up).
     *
     * @param {Function} callback - fn(colors)
     */
    function watchTheme(callback) {
        const observer = new MutationObserver(() => callback(colors()));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
        return observer;
    }


    // ─────────────────────────────────────────────────────────
    // 12. Refresh axis + label colors after theme change
    // ─────────────────────────────────────────────────────────
    /**
     * Re-apply theme-correct colors to axes and Y-axis text labels.
     * Call this inside a watchTheme() callback.
     *
     * @param {Array}  axes   - array of amCharts axis instances (X and Y)
     * @param {Array}  [labels] - array of am5.Label instances (from addYLabel)
     * @returns {object} fresh colors() token object
     */
    function refreshAxisColors(axes, labels) {
        const C = colors();
        (axes || []).forEach(axis => {
            const r = axis.get('renderer');
            r.labels.template.setAll({ fill: am5.color(C.text) });
            // Only update grid color on axes whose grid is visible
            if (r.grid.template.get('visible') !== false) {
                r.grid.template.setAll({ stroke: am5.color(C.grid), strokeOpacity: 0.12 });
            }
        });
        (labels || []).forEach(lbl => {
            if (lbl) lbl.set('fill', am5.color(C.text));
        });
        return C;
    }

    // ─────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────
    return {
        colors,
        createXYChart,
        applyZoomButton,
        createDateXAxis,
        createValueYAxis,
        addYLabel,
        applyTooltipBg,
        createPulseSeries,
        addThreshold,
        setupLegendToggle,
        watchTheme,
        refreshAxisColors,
    };
})();
