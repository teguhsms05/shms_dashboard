$(document).ready(function () {
    var table = $('#sensorTable').DataTable({
        dom: '<"dt-scroll-wrap"t><"dt-bottom"ip>', // Removed 'l' and 'f'
        pageLength: 10,
        order: [],
        language: {
            info: "Showing _START_ to _END_ of _TOTAL_ entries",
            paginate: { previous: "‹", next: "›" }
        }
    });

    // ─── Custom Search ───
    $('#customSearch').on('keyup', function () {
        table.search($(this).val()).draw();
    });

    // ─── Custom Length (Show entries) ───
    $('#customLength').on('change', function () {
        table.page.len($(this).val()).draw();
    });

    // ─── Type Filter ───
    $('#typeFilter').on('change', function () {
        var val = $(this).val();
        table.column(5).search(val ? '^' + $.fn.dataTable.util.escapeRegex(val) + '$' : '', true, false).draw();
    });

    // ─── Flatpickr Initialization ───
    if (typeof flatpickr !== 'undefined') {
        const fpInstall = flatpickr("#field_install_at", {
            enableTime: true,
            dateFormat: "Y-m-d H:i:S",
            time_24hr: true,
            allowInput: true
        });

        // Expose flatpickr instance so editSensor can use it
        window.fpInstall = fpInstall;
    }

});





function editSensor(data) {
    console.log("Editing sensor:", data);
    document.getElementById('siFormTitle').innerHTML = '<span class="bar-title-accent"></span>Edit Sensor Info';


    // Fill fields
    document.getElementById('field_id').value = data.id || '';
    document.getElementById('field_sensor_id').value = data.sensor_id || '';
    document.getElementById('field_sensor_code').value = data.sensor_code || '';
    document.getElementById('field_channel_code').value = data.channel_code || '';
    document.getElementById('field_logger').value = data.logger || '';
    document.getElementById('field_channel_index').value = data.channel_index || '';
    document.getElementById('field_sensor_type').value = data.sensor_type || '';
    document.getElementById('field_sensor_group').value = data.sensor_group || '';
    document.getElementById('field_sampling_hz').value = data.sampling_hz || '';
    document.getElementById('field_direction').value = data.direction || '';
    document.getElementById('field_location').value = data.location || '';
    document.getElementById('field_operation').value = data.operation || '';
    document.getElementById('field_trigger_setting').value = data.trigger_setting || '';
    document.getElementById('field_manufacturer').value = data.manufacturer || '';
    document.getElementById('field_model').value = data.model || '';
    document.getElementById('field_serial_no').value = data.serial_no || '';
    if (window.fpInstall) {
        window.fpInstall.setDate(data.install_at || '');
    } else {
        document.getElementById('field_install_at').value = data.install_at || '';
    }
    document.getElementById('field_ip_address').value = data.ip_address || '';
    document.getElementById('field_port').value = data.port || '';
    document.getElementById('field_th1').value = data.th1 || '';

    document.getElementById('field_th2').value = data.th2 || '';
    document.getElementById('field_th3').value = data.th3 || '';

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearForm() {
    document.getElementById('siFormTitle').innerHTML = '<span class="bar-title-accent"></span>Sensor Information';
    document.getElementById('sensorForm').reset();

    document.getElementById('field_id').value = '';
}

// ─── Export Functions ───
function downloadExcel() {
    var table = document.getElementById('sensorTable');
    var headers = [];
    table.querySelectorAll('thead th').forEach(function (th, index) {
        if (index < 10) { // Skip Action column
            headers.push(th.textContent.trim());
        }
    });


    var data = [headers];
    var tableInstance = $('#sensorTable').DataTable();
    var allData = tableInstance.rows({ search: 'applied' }).data();

    allData.each(function (row) {
        var rowData = [];
        for (var i = 0; i < 10; i++) {
            var cellContent = row[i].toString().replace(/<[^>]*>?/gm, '').trim();
            rowData.push(cellContent);
        }
        data.push(rowData);
    });



    var ws = XLSX.utils.aoa_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sensor Info");
    XLSX.writeFile(wb, "sensor_information_list.xlsx");
}

function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.text("Sensor Information List", 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exported at: ${new Date().toLocaleString()}`, 14, 22);

    const table = document.getElementById('sensorTable');
    const headers = [];
    table.querySelectorAll('thead th').forEach((th, index) => {
        if (index < 10) headers.push(th.textContent.trim());
    });


    const data = [];
    var tableInstance = $('#sensorTable').DataTable();
    var allData = tableInstance.rows({ search: 'applied' }).data();

    allData.each(function (row) {
        const rowData = [];
        for (let i = 0; i < 10; i++) {
            rowData.push(row[i].toString().replace(/<[^>]*>?/gm, '').trim());
        }
        data.push(rowData);
    });



    doc.autoTable({
        startY: 27,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8, cellPadding: 2 }
    });

    doc.save("sensor_information_list.pdf");
}
