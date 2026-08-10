// ==========================================
// Monthly Report Generation Logic
// ==========================================

const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

document.addEventListener("DOMContentLoaded", () => {
    initMonthlyControls();
});

// ==========================================
// Controls & Period Logic
// ==========================================
function initMonthlyControls() {
    const periodSelect = document.getElementById("select-period");
    const refreshBtn = document.getElementById("btn-refresh-report");

    if (!periodSelect || !refreshBtn) return;

    populateMonthOptions();
    refreshBtn.addEventListener("click", generateMonthlyReport);
    periodSelect.addEventListener("change", generateMonthlyReport); // Auto-update on selection

    // Auto-generate on load
    setTimeout(generateMonthlyReport, 500);
}

function populateMonthOptions() {
    const periodSelect = document.getElementById("select-period");
    const today = new Date();

    for (let i = 0; i < 6; i++) {
        const mDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const lastDay = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0);

        const startStr = formatDate(mDate);
        const endStr = formatDate(lastDay);
        const label = `${MONTHS[mDate.getMonth()]} ${mDate.getFullYear()}`;
        const value = `${startStr} 00:00:00|${endStr} 23:59:59`;

        periodSelect.innerHTML += `<option value="${value}">${label}</option>`;
    }
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ==========================================
// Report Generation
// ==========================================
async function generateMonthlyReport() {
    const periodValue = document.getElementById("select-period").value;
    if (!periodValue) return;

    const [start, end] = periodValue.split("|");
    const startDate = start.split(" ")[0];
    const endDate = end.split(" ")[0];

    const periodSelect = document.getElementById("select-period");
    const selectedOption = periodSelect.options[periodSelect.selectedIndex].text; // e.g. "February 2026"

    // Parse month name for display based on dropdown text directly
    const monthLabel = selectedOption;
    const periodLabel = selectedOption.replace(" ", ". ");

    console.log("Generating monthly report:", startDate, "to", endDate);

    try {
        const res = await fetch(`/api/monitoring-summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        const monData = await res.json();

        // Compute aggregate stats
        const stats = computeStats(monData);

        // Update PAGE 1 (Cover)
        updateCoverPage(monthLabel, periodLabel, stats);

        // Update PAGE 2 (General Info + Overall Status)
        updateSummaryPage(monData, stats, monthLabel, periodLabel, startDate, endDate);

        // Update PAGE 3 (Monitoring Table)
        renderMonitoringTable(monData, start, end);

    } catch (e) {
        console.error("Monthly report error:", e);
        if (window.SHMToast) window.SHMToast.danger("Gagal mengambil data laporan bulanan", "Laporan Bulanan");
    }
}

// ==========================================
// Stats Computation
// ==========================================
function computeStats(data) {
    const totalChannels = data.length;
    const normalChannels = data.filter(d => d.operation_ok).length;
    const abnormalChannels = totalChannels - normalChannels;
    const orRate = totalChannels > 0 ? (normalChannels / totalChannels * 100) : 0;

    const thresholdOk = data.filter(d => d.threshold_ok).length;
    const thresholdFail = totalChannels - thresholdOk;
    const trRate = totalChannels > 0 ? (thresholdOk / totalChannels * 100) : 0;

    // SHMS Start
    const shmsStart = "2025-01-01";

    // Service Period Score: SS = 30 - 2 * (SHMS age in years)
    const shmsAgeYears = 1; // Jembatan Bentang Pendek Duplikasi 2
    const ssScore = 30 - (2 * shmsAgeYears);
    const ssValue = `${shmsAgeYears} year`;

    // Performance Index: weighted average of OR, TR, SS scores
    const orScore = orRate > 0 ? (orRate / 100 * 30) : 0;
    const trScore = trRate > 0 ? (trRate / 100 * 40) : 0;
    const pi = orScore + trScore + ssScore;

    let piLabel = "Good";
    if (pi < 50) piLabel = "Poor";
    else if (pi < 70) piLabel = "Caution";
    else if (pi < 85) piLabel = "Good";
    else piLabel = "Excellent";

    // Per-group stats
    const groups = {};
    data.forEach(d => {
        if (!groups[d.group]) {
            groups[d.group] = { channels: 0, normal: 0, abnormal: 0, thresholdOk: 0, thresholdFail: 0 };
        }
        groups[d.group].channels++;
        if (d.operation_ok) groups[d.group].normal++;
        else groups[d.group].abnormal++;
        if (d.threshold_ok) groups[d.group].thresholdOk++;
        else groups[d.group].thresholdFail++;
    });

    return {
        totalChannels, normalChannels, abnormalChannels, shmsStart, orRate,
        thresholdOk, thresholdFail, trRate,
        ssValue, ssScore, pi, piLabel,
        orScore: orScore.toFixed(1), trScoreVal: trScore.toFixed(1),
        groups
    };
}

// ==========================================
// PAGE 1: Cover
// ==========================================
function updateCoverPage(monthLabel, periodLabel, stats) {
    const coverPeriod = document.getElementById("cover-period");
    const coverOR = document.getElementById("cover-or");
    const coverPI = document.getElementById("cover-pi");

    if (coverPeriod) coverPeriod.innerText = periodLabel;
    if (coverOR) coverOR.innerText = stats.orRate.toFixed(1) + "%";

    if (coverPI) {
        const piColor = stats.piLabel === "Caution" ? "#e6a817" :
            stats.piLabel === "Poor" ? "#dc3545" :
                stats.piLabel === "Good" ? "#28a745" : "#17a2b8";
        coverPI.innerHTML = `<span style="background: ${piColor}22; color: ${piColor}; padding: 2px 10px; font-weight: 700;">${stats.piLabel}</span> &nbsp; ${stats.pi.toFixed(1)}`;
    }
}

// ==========================================
// PAGE 2: Summary Tables
// ==========================================
function updateSummaryPage(data, stats, monthLabel, periodLabel, startDate, endDate) {
    // General Information
    const el = (id) => document.getElementById(id);

    if (el("gi-shms-start")) el("gi-shms-start").innerText = stats.shmsStart;
    if (el("gi-inspection-date")) el("gi-inspection-date").innerText = endDate;
    if (el("gi-monitoring-period")) el("gi-monitoring-period").innerText = periodLabel;
    if (el("gi-or-value")) el("gi-or-value").innerText = stats.orRate.toFixed(1) + "%";
    if (el("gi-or-score")) el("gi-or-score").innerText = stats.orScore;
    if (el("gi-tr-value")) el("gi-tr-value").innerText = stats.trRate.toFixed(1) + "%";
    if (el("gi-tr-score")) el("gi-tr-score").innerText = stats.trScoreVal;
    if (el("gi-ss-value")) el("gi-ss-value").innerText = stats.ssValue;
    if (el("gi-ss-score")) el("gi-ss-score").innerText = stats.ssScore.toFixed(1);

    if (el("gi-pi-label")) {
        const piColor = stats.piLabel === "Caution" ? "#e6a817" :
            stats.piLabel === "Poor" ? "#dc3545" : "#28a745";
        el("gi-pi-label").innerHTML = `<span style="color: ${piColor}; font-weight: 700;">${stats.piLabel}</span>`;
    }
    if (el("gi-pi-score")) el("gi-pi-score").innerText = stats.pi.toFixed(1);

    // Overall Status table
    const tbody = document.getElementById("overall-status-body");
    if (!tbody) return;

    let html = "";

    // Total row
    const totalOR = stats.totalChannels > 0 ? (stats.normalChannels / stats.totalChannels * 100).toFixed(1) + "%" : "-";
    const totalTR = stats.totalChannels > 0 ? (stats.thresholdOk / stats.totalChannels * 100).toFixed(1) + "%" : "-";
    html += `<tr style="font-weight: 700; background: #f5f5f5;">
        <td>Total</td>
        <td>${stats.totalChannels}</td>
        <td>${stats.normalChannels}</td>
        <td>${stats.abnormalChannels}</td>
        <td>${totalOR}</td>
        <td>${stats.thresholdOk}</td>
        <td>${stats.thresholdFail}</td>
        <td>${totalTR}</td>
        <td></td>
    </tr>`;

    // Per-group rows
    const groupKeys = Object.keys(stats.groups).sort();
    groupKeys.forEach(g => {
        const grp = stats.groups[g];
        const gOR = grp.channels > 0 ? (grp.normal / grp.channels * 100).toFixed(1) + "%" : "-";
        const gTR = grp.channels > 0 ? (grp.thresholdOk / grp.channels * 100).toFixed(1) + "%" : "-";
        html += `<tr>
            <td>${g}</td>
            <td>${grp.channels}</td>
            <td>${grp.normal}</td>
            <td>${grp.abnormal}</td>
            <td>${gOR}</td>
            <td>${grp.thresholdOk}</td>
            <td>${grp.thresholdFail}</td>
            <td>${gTR}</td>
            <td></td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

// ==========================================
// PAGE 3: Monitoring Table Renderer
// ==========================================
function renderMonitoringTable(data, start, end) {
    const tbody = document.getElementById("monitoring-table-body");
    const title = document.getElementById("monitoring-table-title");
    if (!tbody) return;

    // Update title with period
    if (title) {
        const startDate = start.split(" ")[0];
        const endDate = end.split(" ")[0];
        title.innerText = `[Laporan Monitoring Bulanan]`;
        const periodEl = document.getElementById("monitoring-table-period");
        if (periodEl) periodEl.innerText = `Periode : ${startDate} – ${endDate}`;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#999; padding:20px;">No monitoring data found for this period</td></tr>`;
        return;
    }

    const CHECK = `<span class="icon-ok">✅</span>`;
    const CROSS = `<span class="icon-fail">❌</span>`;

    let html = "";
    let groupCount = {};
    let typeCount = {};

    // Pre-calculate row spans
    data.forEach(d => {
        groupCount[d.group] = (groupCount[d.group] || 0) + 1;
        const typeKey = d.group + "|" + d.sensor_type;
        typeCount[typeKey] = (typeCount[typeKey] || 0) + 1;
    });

    let groupRendered = {};
    let typeRendered = {};
    let channelCounter = {};

    data.forEach((d) => {
        const total = d.abnormal_count + d.system_error;
        const typeKey = d.group + "|" + d.sensor_type;

        // Per-type channel numbering
        channelCounter[typeKey] = (channelCounter[typeKey] || 0) + 1;

        html += `<tr>`;

        // Group cell (rowspan)
        if (!groupRendered[d.group]) {
            html += `<td rowspan="${groupCount[d.group]}" class="cell-center">${d.group}</td>`;
            groupRendered[d.group] = true;
        }

        // Type cell (rowspan)
        if (!typeRendered[typeKey]) {
            html += `<td rowspan="${typeCount[typeKey]}" class="cell-center">${d.sensor_type}</td>`;
            typeRendered[typeKey] = true;
        }

        html += `<td>${channelCounter[typeKey]}</td>`;
        html += `<td class="cell-center">${d.operation_ok ? CHECK : CROSS}</td>`;
        html += `<td class="cell-right">${d.abnormal_count > 0 ? d.abnormal_count : "-"}</td>`;
        html += `<td class="cell-right">${d.system_error > 0 ? d.system_error : "-"}</td>`;
        html += `<td class="cell-right">${total > 0 ? total : "-"}</td>`;
        html += `<td class="cell-center">${d.threshold_ok ? CHECK : CROSS}</td>`;
        html += `<td>${d.remark || ""}</td>`;
        html += `</tr>`;
    });

    tbody.innerHTML = html;
}
