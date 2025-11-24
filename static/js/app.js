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
    
    // Register form
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
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
    
    // Limpiar errores previos
    errorDiv.classList.add('hidden');
    errorDiv.textContent = '';
    
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

async function handleRegister(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');
    
    // Limpiar mensajes previos
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    errorDiv.textContent = '';
    successDiv.textContent = '';
    
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;
    const firstName = document.getElementById('regFirstName').value;
    const lastName = document.getElementById('regLastName').value;
    
    // Validar que las contraseñas coincidan
    if (password !== passwordConfirm) {
        errorDiv.textContent = 'Las contraseñas no coinciden';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Validar longitud mínima de contraseña
    if (password.length < 8) {
        errorDiv.textContent = 'La contraseña debe tener al menos 8 caracteres';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                email,
                password,
                password_confirm: passwordConfirm,
                first_name: firstName,
                last_name: lastName
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.tokens) {
            // Usuario registrado exitosamente
            successDiv.textContent = 'Usuario registrado exitosamente. Iniciando sesión...';
            successDiv.classList.remove('hidden');
            
            // Guardar tokens y mostrar la aplicación
            accessToken = data.tokens.access;
            refreshToken = data.tokens.refresh;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            
            // Esperar un momento y luego mostrar la app
            setTimeout(() => {
                showApp();
                loadTaxGrades();
                loadImports();
            }, 1500);
        } else {
            // Mostrar errores de validación
            let errorMessage = 'Error al registrar usuario';
            if (data.username) {
                errorMessage = data.username[0];
            } else if (data.email) {
                errorMessage = data.email[0];
            } else if (data.password) {
                errorMessage = data.password[0];
            } else if (data.password_confirm) {
                errorMessage = data.password_confirm[0];
            } else if (data.detail) {
                errorMessage = data.detail;
            } else if (typeof data === 'object') {
                errorMessage = JSON.stringify(data);
            }
            
            errorDiv.textContent = errorMessage;
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = 'Error de conexión: ' + error.message;
        errorDiv.classList.remove('hidden');
    }
}

function showLoginForm() {
    document.getElementById('loginCard').classList.remove('hidden');
    document.getElementById('registerCard').classList.add('hidden');
    // Limpiar formularios
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
    document.getElementById('registerSuccess').classList.add('hidden');
}

function showRegisterForm() {
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('registerCard').classList.remove('hidden');
    // Limpiar formularios
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
    document.getElementById('registerSuccess').classList.add('hidden');
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
    
    // Obtener información del usuario desde el token (opcional)
    if (accessToken) {
        try {
            // Decodificar el token JWT para obtener el username
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            document.getElementById('userInfo').textContent = `Usuario: ${payload.username}`;
        } catch (e) {
            document.getElementById('userInfo').textContent = 'Usuario autenticado';
        }
    } else {
        document.getElementById('userInfo').textContent = 'Usuario autenticado';
    }
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
    
    // Establecer valores por defecto
    document.getElementById('taxSourceType').value = 'manual';
    document.getElementById('taxStatus').value = 'activo';
    document.getElementById('taxAmount').value = '0';
    document.getElementById('taxYear').value = new Date().getFullYear();
    
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
    // Validar campos requeridos
    const rut = document.getElementById('taxRut').value.trim();
    const name = document.getElementById('taxName').value.trim();
    const yearValue = document.getElementById('taxYear').value;
    const sourceType = document.getElementById('taxSourceType').value;
    const status = document.getElementById('taxStatus').value;
    
    // Validaciones básicas
    if (!rut) {
        alert('El RUT es requerido');
        return;
    }
    if (!name) {
        alert('El Nombre es requerido');
        return;
    }
    if (!yearValue) {
        alert('El Año es requerido');
        return;
    }
    if (!sourceType) {
        alert('El Tipo es requerido');
        return;
    }
    
    // Validar año
    const year = parseInt(yearValue);
    if (isNaN(year) || year < 2000 || year > 2100) {
        alert('El año debe ser un número entre 2000 y 2100');
        return;
    }
    
    // Preparar datos
    const amountValue = document.getElementById('taxAmount').value;
    const amount = amountValue ? parseFloat(amountValue) : 0;
    if (isNaN(amount)) {
        alert('El Monto debe ser un número válido');
        return;
    }
    
    const factorValue = document.getElementById('taxFactor').value;
    const factor = factorValue && factorValue.trim() ? parseFloat(factorValue) : null;
    if (factorValue && factorValue.trim() && isNaN(factor)) {
        alert('El Factor debe ser un número válido');
        return;
    }
    
    const calculationBasis = document.getElementById('taxCalculationBasis').value.trim();
    
    const data = {
        rut: rut,
        name: name,
        year: year,
        source_type: sourceType,
        status: status,
        amount: amount,
        factor: factor,
        calculation_basis: calculationBasis
    };
    
    const id = document.getElementById('taxId').value;
    const url = id ? `${API_BASE_URL}/tax-grades/${id}/` : `${API_BASE_URL}/tax-grades/`;
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('taxModal')).hide();
            loadTaxGrades(currentPage);
            alert('Calificación guardada exitosamente');
        } else {
            // Mostrar errores de validación de forma más clara
            let errorMessage = 'Error al guardar: ';
            if (responseData.detail) {
                errorMessage += responseData.detail;
            } else if (responseData.non_field_errors) {
                errorMessage += responseData.non_field_errors.join(', ');
            } else {
                // Mostrar errores de campos específicos
                const fieldErrors = [];
                for (const [field, errors] of Object.entries(responseData)) {
                    if (Array.isArray(errors)) {
                        fieldErrors.push(`${field}: ${errors.join(', ')}`);
                    } else {
                        fieldErrors.push(`${field}: ${errors}`);
                    }
                }
                errorMessage += fieldErrors.join(' | ');
            }
            alert(errorMessage);
            console.error('Error response:', responseData);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
        console.error('Error:', error);
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

