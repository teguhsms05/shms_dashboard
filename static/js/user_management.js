// User Management JS - Consistent with Sensor Info New Pattern

$(document).ready(function () {
    // ─── DataTable Initialization ───
    var table = $('#userTable').DataTable({
        dom: '<"dt-scroll-wrap"t><"dt-bottom"ip>', // Hidden 'l' and 'f' to use custom controls
        pageLength: 10,
        order: [[0, 'asc']], // Order by ID
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

    // Store table globally for other functions if needed
    window.userTable = table;
});

function editUser(data) {
    console.log("Editing user:", data);
    document.getElementById('userFormTitle').innerHTML = '<span class="bar-title-accent"></span>Edit User Registration';
    
    // Populate form fields
    document.getElementById('field_id').value = data.id || '';
    document.getElementById('field_username').value = data.username || '';
    document.getElementById('field_password').value = data.password || '';
    document.getElementById('field_role').value = data.role || '';
    
    // Smooth scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearForm() {
    document.getElementById('userFormTitle').innerHTML = '<span class="bar-title-accent"></span>User Registration';
    document.getElementById('userForm').reset();
    document.getElementById('field_id').value = '';
    document.getElementById('field_action').value = 'save';
}

function deleteUser(id, username) {
    if (confirm(`Are you sure you want to permanently delete user '${username}'?`)) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/user-management';
        
        const actionInput = document.createElement('input');
        actionInput.type = 'hidden';
        actionInput.name = 'action';
        actionInput.value = 'delete';
        
        const idInput = document.createElement('input');
        idInput.type = 'hidden';
        idInput.name = 'id';
        idInput.value = id;
        
        form.appendChild(actionInput);
        form.appendChild(idInput);
        document.body.appendChild(form);
        form.submit();
    }
}

// ─── Export Functions (Mirroring Sensor Info) ───

function downloadUserExcel() {
    var tableEl = document.getElementById('userTable');
    var headers = [];
    tableEl.querySelectorAll('thead th').forEach(function (th, index) {
        if (index < 4) { // ID, Username, Password, Role
            headers.push(th.textContent.trim());
        }
    });

    var data = [headers];
    var tableInstance = $('#userTable').DataTable();
    var allData = tableInstance.rows({ search: 'applied' }).data();

    allData.each(function (row) {
        var rowData = [];
        for (var i = 0; i < 4; i++) {
            // Clean HTML tags from data (especially for the Role badge)
            var cellContent = row[i].toString().replace(/<[^>]*>?/gm, '').trim();
            rowData.push(cellContent);
        }
        data.push(rowData);
    });

    var ws = XLSX.utils.aoa_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "User List");
    XLSX.writeFile(wb, "shms_user_list.xlsx");
}

function downloadUserPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.text("Registered User List", 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exported at: ${new Date().toLocaleString()}`, 14, 22);

    const tableEl = document.getElementById('userTable');
    const headers = [];
    tableEl.querySelectorAll('thead th').forEach((th, index) => {
        if (index < 4) headers.push(th.textContent.trim());
    });

    const data = [];
    var tableInstance = $('#userTable').DataTable();
    var allData = tableInstance.rows({ search: 'applied' }).data();

    allData.each(function (row) {
        const rowData = [];
        for (let i = 0; i < 4; i++) {
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
        styles: { fontSize: 9, cellPadding: 3 }
    });

    doc.save("shms_user_list.pdf");
}


function togglePasswordVisibility() {
    const pwd = document.getElementById('field_password');
    const icon = document.getElementById('eyeIcon');
    if (pwd.type === 'password') {
        pwd.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        pwd.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}
