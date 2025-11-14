// API Configuration
const API_BASE_URL = '/api';
let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');
let currentPage = 1;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Import form
    document.getElementById('importForm').addEventListener('submit', handleImport);
    
    // Search inputs (debounce)
    let searchTimeout;
    ['searchRut', 'searchYear', 'searchType', 'searchStatus'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(searchTaxGrades, 500);
            });
        }
    });
}

// Authentication
function checkAuth() {
    if (accessToken) {
        // Verify token is still valid
        fetch(`${API_BASE_URL}/tax-grades/`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
        .then(response => {
            if (response.ok) {
                showApp();
                loadTaxGrades();
                loadImports();
            } else {
                if (response.status === 401) {
                    tryRefreshToken();
                } else {
                    showLogin();
                }
            }
        })
        .catch(() => showLogin());
    } else {
        showLogin();
    }
}

function tryRefreshToken() {
    if (!refreshToken) {
        showLogin();
        return;
    }
    
    fetch(`${API_BASE_URL}/auth/refresh/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken })
    })
    .then(response => response.json())
    .then(data => {
        if (data.access) {
            accessToken = data.access;
            localStorage.setItem('accessToken', accessToken);
            if (data.refresh) {
                refreshToken = data.refresh;
                localStorage.setItem('refreshToken', refreshToken);
            }
            showApp();
            loadTaxGrades();
            loadImports();
        } else {
            showLogin();
        }
    })
    .catch(() => showLogin());
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.access) {
            accessToken = data.access;
            refreshToken = data.refresh;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            showApp();
            loadTaxGrades();
            loadImports();
        } else {
            errorDiv.textContent = data.detail || 'Error al iniciar sesión';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Error de conexión';
        errorDiv.classList.remove('hidden');
    }
}

function logout() {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    showLogin();
}

function showLogin() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('appSection').classList.add('hidden');
}

function showApp() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
    document.getElementById('userInfo').textContent = 'Usuario autenticado';
}

// API Helpers
function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    }
}

// Tax Grades
async function loadTaxGrades(page = 1) {
    currentPage = page;
    const loading = document.getElementById('loading');
    const tbody = document.getElementById('taxTableBody');
    
    loading.classList.remove('hidden');
    tbody.innerHTML = '';
    
    const params = new URLSearchParams({
        page: page,
    });
    
    const rut = document.getElementById('searchRut').value;
    const year = document.getElementById('searchYear').value;
    const type = document.getElementById('searchType').value;
    const status = document.getElementById('searchStatus').value;
    
    if (rut) params.append('rut', rut);
    if (year) params.append('year', year);
    if (type) params.append('source_type', type);
    if (status) params.append('status', status);
    
    try {
        const response = await fetch(`${API_BASE_URL}/tax-grades/?${params}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        loading.classList.add('hidden');
        
        if (response.ok && data.results) {
            tbody.innerHTML = data.results.map(tg => `
                <tr>
                    <td>${tg.rut}</td>
                    <td>${tg.name}</td>
                    <td>${tg.year}</td>
                    <td>${getSourceTypeLabel(tg.source_type)}</td>
                    <td>$${parseFloat(tg.amount).toLocaleString('es-CL')}</td>
                    <td>${tg.factor || '-'}</td>
                    <td><span class="status-badge status-${tg.status}">${tg.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="editTaxGrade('${tg.id}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTaxGrade('${tg.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
            
            // Pagination
            updatePagination(data);
        }
    } catch (error) {
        loading.classList.add('hidden');
        alert('Error al cargar datos: ' + error.message);
    }
}

function searchTaxGrades() {
    loadTaxGrades(1);
}

function updatePagination(data) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    
    if (data.previous || data.next) {
        if (data.previous) {
            pagination.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadTaxGrades(${currentPage - 1}); return false;">Anterior</a></li>`;
        }
        if (data.next) {
            pagination.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadTaxGrades(${currentPage + 1}); return false;">Siguiente</a></li>`;
        }
    }
}

function getSourceTypeLabel(type) {
    const labels = {
        'declaracion': 'Declaración',
        'certificado': 'Certificado',
        'manual': 'Manual',
        'calculo': 'Cálculo'
    };
    return labels[type] || type;
}

function showCreateModal() {
    document.getElementById('modalTitle').textContent = 'Nueva Calificación';
    document.getElementById('taxForm').reset();
    document.getElementById('taxId').value = '';
    new bootstrap.Modal(document.getElementById('taxModal')).show();
}

async function editTaxGrade(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/tax-grades/${id}/`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('taxId').value = data.id;
            document.getElementById('taxRut').value = data.rut;
            document.getElementById('taxName').value = data.name;
            document.getElementById('taxYear').value = data.year;
            document.getElementById('taxSourceType').value = data.source_type;
            document.getElementById('taxStatus').value = data.status;
            document.getElementById('taxAmount').value = data.amount;
            document.getElementById('taxFactor').value = data.factor || '';
            document.getElementById('taxCalculationBasis').value = data.calculation_basis || '';
            
            document.getElementById('modalTitle').textContent = 'Editar Calificación';
            new bootstrap.Modal(document.getElementById('taxModal')).show();
        }
    } catch (error) {
        alert('Error al cargar datos: ' + error.message);
    }
}

async function saveTaxGrade() {
    const id = document.getElementById('taxId').value;
    const data = {
        rut: document.getElementById('taxRut').value,
        name: document.getElementById('taxName').value,
        year: parseInt(document.getElementById('taxYear').value),
        source_type: document.getElementById('taxSourceType').value,
        status: document.getElementById('taxStatus').value,
        amount: parseFloat(document.getElementById('taxAmount').value) || 0,
        factor: document.getElementById('taxFactor').value ? parseFloat(document.getElementById('taxFactor').value) : null,
        calculation_basis: document.getElementById('taxCalculationBasis').value
    };
    
    const url = id ? `${API_BASE_URL}/tax-grades/${id}/` : `${API_BASE_URL}/tax-grades/`;
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('taxModal')).hide();
            loadTaxGrades(currentPage);
            alert('Calificación guardada exitosamente');
        } else {
            const error = await response.json();
            alert('Error: ' + (error.detail || JSON.stringify(error)));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteTaxGrade(id) {
    if (!confirm('¿Está seguro de eliminar esta calificación? (Se marcará como inactivo)')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/tax-grades/${id}/`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            loadTaxGrades(currentPage);
            alert('Calificación eliminada');
        } else {
            alert('Error al eliminar');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function exportData() {
    const year = prompt('Ingrese el año a exportar:');
    if (!year) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/tax-grades/export/?year=${year}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_${year}.json`;
            a.click();
        } else {
            alert('Error al exportar');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Imports
async function loadImports() {
    const tbody = document.getElementById('importsTableBody');
    
    try {
        const response = await fetch(`${API_BASE_URL}/imports/`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.results) {
            tbody.innerHTML = data.results.map(imp => `
                <tr>
                    <td>${imp.file_name}</td>
                    <td>${imp.file_type}</td>
                    <td><span class="badge bg-${getStatusColor(imp.status)}">${imp.status}</span></td>
                    <td>${new Date(imp.uploaded_at).toLocaleString('es-CL')}</td>
                    <td>${imp.records_count || 0} (${imp.success_count || 0} OK, ${imp.error_count || 0} Error)</td>
                    <td>
                        ${imp.report_path ? `<button class="btn btn-sm btn-info" onclick="downloadReport('${imp.id}')">
                            <i class="bi bi-download"></i> Reporte
                        </button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading imports:', error);
    }
}

function getStatusColor(status) {
    const colors = {
        'pending': 'warning',
        'processing': 'info',
        'done': 'success',
        'failed': 'danger'
    };
    return colors[status] || 'secondary';
}

async function handleImport(e) {
    e.preventDefault();
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Seleccione un archivo');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/imports/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
                // No incluir Content-Type, el navegador lo establecerá automáticamente con el boundary
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Archivo subido exitosamente. El procesamiento se realizará en segundo plano.');
            fileInput.value = '';
            setTimeout(() => loadImports(), 2000);
        } else {
            alert('Error: ' + (data.error || JSON.stringify(data)));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function downloadReport(importId) {
    try {
        const response = await fetch(`${API_BASE_URL}/imports/${importId}/report/`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report_${importId}.txt`;
            a.click();
        } else {
            alert('Error al descargar reporte');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

