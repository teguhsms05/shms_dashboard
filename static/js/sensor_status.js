document.addEventListener('DOMContentLoaded', () => {
    let sensorDataStore = [];
    let modalChartRoot = null;
    const expandedSubcats = new Set(); // Tracks user-expanded accordions across auto-refreshes

    // Elements
    const categoriesContainer = document.getElementById('sensorCategoriesContainer');
    const filterCategory = document.getElementById('filterCategory');
    const filterSubcategory = document.getElementById('filterSubcategory');
    const filterLogger = document.getElementById('filterLogger');
    const btnRefresh = document.getElementById('btnRefresh');

    const queryModal = document.getElementById('queryModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const modalSensorTitle = document.getElementById('modalSensorTitle');
    const queryTableBody = document.getElementById('queryTableBody');

    // Initialize Data & Set 5-Second Auto-Refresh
    loadSensorStatusData();
    setInterval(() => {
        loadSensorStatusData(true);
    }, 5000);

    // Event Listeners
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.disabled = true;
            btnRefresh.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
            loadSensorStatusData().then(() => {
                btnRefresh.disabled = false;
                btnRefresh.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
            });
        });
    }

    if (filterCategory) filterCategory.addEventListener('change', filterData);
    if (filterSubcategory) filterSubcategory.addEventListener('change', filterData);
    if (filterLogger) filterLogger.addEventListener('change', filterData);

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            queryModal.classList.remove('active');
        });
    }

    if (queryModal) {
        queryModal.addEventListener('click', (e) => {
            if (e.target === queryModal) {
                queryModal.classList.remove('active');
            }
        });
    }

    // Fetch Status Data from API
    async function loadSensorStatusData(isBackground = false) {
        try {
            const resp = await fetch('/api/sensor-status');
            const data = await resp.json();
            sensorDataStore = data.categories || [];
            
            // Populate Logger Dropdown
            populateLoggers(data.loggers || []);

            // Render Accordions inside Category Cards
            renderCategories(sensorDataStore);

            // Re-apply filters if active
            filterData();
        } catch (err) {
            console.error('Error fetching sensor status:', err);
            if (!isBackground) {
                categoriesContainer.innerHTML = '<div style="color: #ef4444; padding: 20px;">Failed to load sensor status data.</div>';
            }
        }
    }

    function populateLoggers(loggers) {
        if (!filterLogger) return;
        const currentVal = filterLogger.value;
        filterLogger.innerHTML = '<option value="ALL">All Loggers</option>';
        loggers.forEach(log => {
            const opt = document.createElement('option');
            opt.value = log;
            opt.textContent = log;
            filterLogger.appendChild(opt);
        });
        if (loggers.includes(currentVal)) {
            filterLogger.value = currentVal;
        }
    }

    function renderCategories(categories) {
        categoriesContainer.innerHTML = '';

        if (!categories || categories.length === 0) {
            categoriesContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">No sensor status data found.</div>';
            return;
        }

        categories.forEach((cat) => {
            const catBlock = document.createElement('div');
            catBlock.className = 'ss-category-block';
            catBlock.dataset.category = cat.category;

            // Category Title Header
            const catTitle = document.createElement('div');
            catTitle.className = 'ss-category-title';
            catTitle.textContent = cat.category;
            catBlock.appendChild(catTitle);

            // Subcategories Accordions
            (cat.subcategories || []).forEach((subcat) => {
                const item = document.createElement('div');
                item.className = 'ss-accordion-item';
                item.dataset.subcategory = subcat.name;

                // Expand ONLY if tracked in expandedSubcats (all collapsed initially)
                if (expandedSubcats.has(subcat.name)) {
                    item.classList.add('expanded');
                }

                // Accordion Header
                const header = document.createElement('div');
                header.className = 'ss-accordion-header';
                header.innerHTML = `
                    <div class="ss-subcat-name">${subcat.name}</div>
                    <div class="ss-status-summary">
                        <span class="ss-badge"><span class="ss-dot normal"></span> Normal : <strong class="val-normal">${subcat.normal}</strong></span>
                        <span class="ss-badge"><span class="ss-dot abnormal"></span> Abnormal : <strong class="val-abnormal">${subcat.abnormal}</strong></span>
                        <span class="ss-badge"><span class="ss-dot disconnected"></span> Disconnected : <strong class="val-disconnected">${subcat.disconnected}</strong></span>
                        <span style="color: #cbd5e1;">|</span>
                        <span class="ss-badge">Total : <strong class="val-total">${subcat.total}</strong></span>
                        <i class="fa-solid fa-chevron-down ss-chevron"></i>
                    </div>
                `;

                header.addEventListener('click', () => {
                    item.classList.toggle('expanded');
                    if (item.classList.contains('expanded')) {
                        expandedSubcats.add(subcat.name);
                    } else {
                        expandedSubcats.delete(subcat.name);
                    }
                });

                item.appendChild(header);

                // Accordion Body Table (8 Columns - Measure & Realtime removed)
                const body = document.createElement('div');
                body.className = 'ss-accordion-body';

                const table = document.createElement('table');
                table.className = 'ss-table';
                table.innerHTML = `
                    <colgroup>
                        <col style="width: 15%;">
                        <col style="width: 7%;">
                        <col style="width: 8%;">
                        <col style="width: 26%;">
                        <col style="width: 10%;">
                        <col style="width: 16%;">
                        <col style="width: 9%;">
                        <col style="width: 9%;">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>SensorCode</th>
                            <th>Direction</th>
                            <th>Logger</th>
                            <th>Location</th>
                            <th>Operation</th>
                            <th>Last Connection</th>
                            <th>Last 5sec value</th>
                            <th>Last 10min value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderTableRows(subcat.sensors || [])}
                    </tbody>
                `;

                body.appendChild(table);
                item.appendChild(body);
                catBlock.appendChild(item);
            });

            categoriesContainer.appendChild(catBlock);
        });
    }

    function renderTableRows(sensors) {
        if (!sensors || sensors.length === 0) {
            return `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 15px;">No sensors in this category.</td></tr>`;
        }

        return sensors.map(s => `
            <tr data-logger="${s.logger}">
                <td style="font-weight: 600;" title="${s.sensor_code}">${s.sensor_code}</td>
                <td>${s.direction || '-'}</td>
                <td>${s.logger || '-'}</td>
                <td title="${s.location || ''}">${s.location || '-'}</td>
                <td><span class="ss-op-tag ${s.operation}">${s.operation}</span></td>
                <td>${s.last_connection || '-'}</td>
                <td>${s.last_5s_val || '-'}</td>
                <td>${s.last_10m_val || '-'}</td>
            </tr>
        `).join('');
    }

    // Filter Logic
    function filterData() {
        const selCat = filterCategory ? filterCategory.value : 'ALL';
        const selSubcat = filterSubcategory ? filterSubcategory.value : 'ALL';
        const selLogger = filterLogger ? filterLogger.value : 'ALL';

        const catBlocks = document.querySelectorAll('.ss-category-block');
        catBlocks.forEach(catBlock => {
            const catName = catBlock.dataset.category;
            let showCat = (selCat === 'ALL' || selCat === catName);

            const accItems = catBlock.querySelectorAll('.ss-accordion-item');
            let hasVisibleSubcat = false;

            accItems.forEach(item => {
                const subcatName = item.dataset.subcategory;
                let showSubcat = showCat && (selSubcat === 'ALL' || selSubcat === subcatName);

                // Filter rows inside table by logger
                const rows = item.querySelectorAll('tbody tr');
                let hasVisibleRow = false;

                rows.forEach(r => {
                    const rowLogger = r.dataset.logger;
                    let showRow = (selLogger === 'ALL' || selLogger === rowLogger);
                    r.style.display = showRow ? '' : 'none';
                    if (showRow) hasVisibleRow = true;
                });

                if (selLogger !== 'ALL') {
                    showSubcat = showSubcat && hasVisibleRow;
                }

                item.style.display = showSubcat ? '' : 'none';
                if (showSubcat) hasVisibleSubcat = true;
            });

            catBlock.style.display = hasVisibleSubcat ? '' : 'none';
        });
    }

    // Realtime Query Modal Action
    async function openQueryModal(sensorId, sensorCode) {
        modalSensorTitle.textContent = `Realtime Query: ${sensorCode || sensorId}`;
        queryTableBody.innerHTML = `<tr><td colspan="2" style="text-align: center;">Loading data for ${sensorCode}...</td></tr>`;
        queryModal.classList.add('active');

        try {
            const resp = await fetch(`/api/sensor-status/query/${encodeURIComponent(sensorId)}`);
            const data = await resp.json();

            renderQueryModalChartAndTable(data);
        } catch (err) {
            console.error('Error fetching query data:', err);
            queryTableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: #ef4444;">Failed to fetch query telemetry.</td></tr>`;
        }
    }

    function renderQueryModalChartAndTable(data) {
        const readings = data.readings || [];
        const unit = data.unit || '';

        // Table Rendering
        if (readings.length === 0) {
            queryTableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: #94a3b8;">No recent telemetry records found.</td></tr>`;
        } else {
            queryTableBody.innerHTML = readings.map(r => `
                <tr>
                    <td>${r.time}</td>
                    <td style="font-weight: 600;">${r.value !== null ? r.value.toFixed(2) : '-'} ${unit}</td>
                </tr>
            `).join('');
        }

        // amCharts Rendering
        if (window.am5) {
            if (modalChartRoot) {
                modalChartRoot.dispose();
            }

            modalChartRoot = am5.Root.new("queryChartContainer");
            modalChartRoot.setThemes([am5themes_Animated.new(modalChartRoot)]);

            const chart = modalChartRoot.container.children.push(am5xy.XYChart.new(modalChartRoot, {
                panX: true,
                panY: true,
                wheelX: "panX",
                wheelY: "zoomX",
                pinchZoomX: true
            }));

            const xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(modalChartRoot, {
                categoryField: "time",
                renderer: am5xy.AxisRendererX.new(modalChartRoot, { minGridDistance: 30 })
            }));
            xAxis.data.setAll(readings);

            const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(modalChartRoot, {
                renderer: am5xy.AxisRendererY.new(modalChartRoot, {})
            }));

            const series = chart.series.push(am5xy.LineSeries.new(modalChartRoot, {
                name: "Reading",
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: "value",
                categoryXField: "time",
                tooltip: am5.Tooltip.new(modalChartRoot, {
                    labelText: "{valueY} " + unit
                })
            }));

            series.bullets.push(function() {
                return am5.Bullet.new(modalChartRoot, {
                    sprite: am5.Circle.new(modalChartRoot, {
                        radius: 4,
                        fill: series.get("fill")
                    })
                });
            });

            series.data.setAll(readings);
            series.appear(1000);
            chart.appear(1000, 100);
        }
    }
});
