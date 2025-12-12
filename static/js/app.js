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
                    <td><span class="badge bg-info">${getFuenteIngresoLabel(tg.fuente_ingreso || 'manual')}</span></td>
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

function getFuenteIngresoLabel(fuente) {
    const labels = {
        'archivo': 'Archivo de Carga',
        'manual': 'Ingreso Manual',
        'sistema': 'Proveniente del Sistema'
    };
    return labels[fuente] || fuente;
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

// ==================== BULK TAX GRADES UPLOAD ====================

function showBulkTaxGradesModal() {
    // Reset form
    document.getElementById('bulkTaxGradesForm').reset();
    document.getElementById('csvValidationSection').classList.add('hidden');
    document.getElementById('validationSuccess').classList.add('hidden');
    document.getElementById('validationErrors').classList.add('hidden');
    document.getElementById('btnProcessTaxGrades').classList.add('hidden');
    document.getElementById('btnProcessTaxGrades').disabled = true;
    
    // Clear preview
    document.getElementById('csvPreviewHeader').innerHTML = '';
    document.getElementById('csvPreviewBody').innerHTML = '';
    document.getElementById('csvRowCount').textContent = '';
    document.getElementById('validationResults').innerHTML = '';
    document.getElementById('validationErrorsList').innerHTML = '';
    
    // Show modal
    new bootstrap.Modal(document.getElementById('bulkTaxGradesModal')).show();
    
    // Add event listener to file input
    const fileInput = document.getElementById('taxGradesCsvFile');
    fileInput.onchange = function() {
        handleCsvFileSelection(this.files[0]);
    };
}

function handleCsvFileSelection(file) {
    if (!file) return;
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Por favor seleccione un archivo CSV');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csvText = e.target.result;
            const validation = validateCsvFormat(csvText);
            displayCsvPreview(csvText, validation);
        } catch (error) {
            alert('Error al leer el archivo: ' + error.message);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function validateCsvFormat(csvText) {
    const errors = [];
    const warnings = [];
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        errors.push('El archivo CSV está vacío');
        return { valid: false, errors, warnings, data: null };
    }
    
    // Parse CSV (simple parser, handles quoted fields)
    const parseCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };
    
    // Get header
    const headerLine = lines[0];
    const headers = parseCsvLine(headerLine).map(h => h.toLowerCase().trim());
    
    // Required columns
    const requiredColumns = ['rut', 'name', 'year'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
        errors.push(`Columnas requeridas faltantes: ${missingColumns.join(', ')}`);
    }
    
    // Optional columns
    const optionalColumns = ['source_type', 'amount', 'factor', 'calculation_basis', 'status'];
    const availableColumns = headers.filter(h => optionalColumns.includes(h));
    
    // Validate data rows
    const data = [];
    const rowErrors = [];
    
    for (let i = 1; i < Math.min(lines.length, 11); i++) { // Preview first 10 rows
        const line = lines[i];
        const values = parseCsvLine(line);
        const row = {};
        
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        
        // Validate required fields
        if (!row.rut || row.rut.trim() === '') {
            rowErrors.push(`Fila ${i + 1}: RUT es requerido`);
        }
        if (!row.name || row.name.trim() === '') {
            rowErrors.push(`Fila ${i + 1}: Nombre es requerido`);
        }
        if (!row.year || row.year.trim() === '') {
            rowErrors.push(`Fila ${i + 1}: Año es requerido`);
        } else {
            const year = parseInt(row.year);
            if (isNaN(year) || year < 2000 || year > 2100) {
                rowErrors.push(`Fila ${i + 1}: Año inválido (debe estar entre 2000 y 2100)`);
            }
        }
        
        // Validate source_type if present
        if (row.source_type && row.source_type.trim() !== '') {
            const validTypes = ['declaracion', 'certificado', 'manual', 'calculo'];
            if (!validTypes.includes(row.source_type.toLowerCase())) {
                warnings.push(`Fila ${i + 1}: source_type inválido (${row.source_type}), se usará 'manual' por defecto`);
            }
        }
        
        // Validate status if present
        if (row.status && row.status.trim() !== '') {
            const validStatus = ['activo', 'inactivo'];
            if (!validStatus.includes(row.status.toLowerCase())) {
                warnings.push(`Fila ${i + 1}: status inválido (${row.status}), se usará 'activo' por defecto`);
            }
        }
        
        data.push(row);
    }
    
    if (rowErrors.length > 0) {
        errors.push(...rowErrors);
    }
    
    const totalRows = lines.length - 1; // Exclude header
    if (totalRows > 1000) {
        warnings.push(`El archivo contiene ${totalRows} filas. El procesamiento puede tardar.`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        data,
        headers,
        totalRows
    };
}

function displayCsvPreview(csvText, validation) {
    const validationSection = document.getElementById('csvValidationSection');
    const validationResults = document.getElementById('validationResults');
    const validationSuccess = document.getElementById('validationSuccess');
    const validationErrors = document.getElementById('validationErrors');
    const validationErrorsList = document.getElementById('validationErrorsList');
    const btnProcess = document.getElementById('btnProcessTaxGrades');
    const previewHeader = document.getElementById('csvPreviewHeader');
    const previewBody = document.getElementById('csvPreviewBody');
    const rowCount = document.getElementById('csvRowCount');
    
    // Show validation section
    validationSection.classList.remove('hidden');
    
    // Display validation results
    let resultsHtml = `<div class="mb-2"><strong>Total de filas:</strong> ${validation.totalRows}</div>`;
    resultsHtml += `<div class="mb-2"><strong>Columnas encontradas:</strong> ${validation.headers.join(', ')}</div>`;
    
    if (validation.warnings.length > 0) {
        resultsHtml += `<div class="alert alert-warning mt-2"><strong>Advertencias:</strong><ul class="mb-0 mt-2">`;
        validation.warnings.forEach(warning => {
            resultsHtml += `<li>${warning}</li>`;
        });
        resultsHtml += `</ul></div>`;
    }
    
    validationResults.innerHTML = resultsHtml;
    
    // Display errors or success
    if (validation.valid) {
        validationSuccess.classList.remove('hidden');
        validationErrors.classList.add('hidden');
        btnProcess.classList.remove('hidden');
        btnProcess.disabled = false;
    } else {
        validationSuccess.classList.add('hidden');
        validationErrors.classList.remove('hidden');
        validationErrorsList.innerHTML = '';
        validation.errors.forEach(error => {
            const li = document.createElement('li');
            li.textContent = error;
            validationErrorsList.appendChild(li);
        });
        btnProcess.classList.add('hidden');
        btnProcess.disabled = true;
    }
    
    // Display preview table
    previewHeader.innerHTML = '';
    validation.headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        previewHeader.appendChild(th);
    });
    
    previewBody.innerHTML = '';
    validation.data.forEach((row, index) => {
        const tr = document.createElement('tr');
        validation.headers.forEach(header => {
            const td = document.createElement('td');
            td.textContent = row[header] || '';
            if (row[header] && row[header].length > 30) {
                td.textContent = row[header].substring(0, 30) + '...';
                td.title = row[header];
            }
            tr.appendChild(td);
        });
        previewBody.appendChild(tr);
    });
    
    rowCount.textContent = `Mostrando primeras ${validation.data.length} filas de ${validation.totalRows} totales`;
}

async function processBulkTaxGrades() {
    const fileInput = document.getElementById('taxGradesCsvFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Por favor seleccione un archivo');
        return;
    }
    
    // Disable button during processing
    const btnProcess = document.getElementById('btnProcessTaxGrades');
    btnProcess.disabled = true;
    btnProcess.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/imports/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('bulkTaxGradesModal')).hide();
            alert('Archivo subido exitosamente. El procesamiento se realizará en segundo plano.\nPuede revisar el estado en la pestaña "Importaciones".');
            fileInput.value = '';
            
            // Reload tax grades after a delay
            setTimeout(() => {
                loadTaxGrades(currentPage);
                loadImports();
            }, 2000);
        } else {
            let errorMessage = 'Error al procesar el archivo: ';
            if (data.error) {
                errorMessage += data.error;
            } else if (data.detail) {
                errorMessage += data.detail;
            } else {
                errorMessage += JSON.stringify(data);
            }
            alert(errorMessage);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    } finally {
        btnProcess.disabled = false;
        btnProcess.innerHTML = '<i class="bi bi-upload"></i> Procesar y Cargar';
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

// ==================== DIVIDEND MAINTAINER ====================

let selectedDividendIds = new Set();
let currentDividendPage = 1;

// Nombres de los 29 campos detallados del SII (según homologación)
// Estos nombres se pueden personalizar según la pestaña 3.2 Homologación
const SII_FIELDS = [
    'Campo 1', 'Campo 2', 'Campo 3', 'Campo 4', 'Campo 5',
    'Campo 6', 'Campo 7', 'Campo 8', 'Campo 9', 'Campo 10',
    'Campo 11', 'Campo 12', 'Campo 13', 'Campo 14', 'Campo 15',
    'Campo 16', 'Campo 17', 'Campo 18', 'Campo 19', 'Campo 20',
    'Campo 21', 'Campo 22', 'Campo 23', 'Campo 24', 'Campo 25',
    'Campo 26', 'Campo 27', 'Campo 28', 'Campo 29'
];

// Función para generar los campos del SII dinámicamente
function generateSIIFields() {
    const container = document.getElementById('siiFieldsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    SII_FIELDS.forEach((fieldName, index) => {
        const fieldId = `sii_field_${index + 1}`;
        const colClass = index < 15 ? 'col-md-4' : 'col-md-4'; // 3 columnas por fila
        
        const fieldHtml = `
            <div class="${colClass} mb-3">
                <label class="form-label">${fieldName}</label>
                <input type="number" class="form-control sii-field-input" 
                       id="${fieldId}" 
                       data-field-index="${index + 1}"
                       step="0.01" 
                       placeholder="0.00"
                       value="0">
            </div>
        `;
        container.innerHTML += fieldHtml;
    });
}

// Nombres de los 31 factores según especificación
const FACTORES_NAMES = [
    'Factor-08 No constitutiva de renta no acogido a Impto.',
    'Factor-09 Impto. 1ra Categ. afecto GI. comp. con devolucion',
    'Factor-10 Impuesto tasa adicional exento art. 21',
    'Factor-11 Incremento impuesto 1ra categoría',
    'Factor-12 Impto. 1ra categ. exento GI. comp. con devolucion',
    'Factor-13 Impto. 1ra categ. afecto GI. comp. sin devolucion',
    'Factor-14 Impto. 1ra categoría exento GI. comp. sin devolución',
    'Factor-15 Impto. creditos por impuestos externos',
    'Factor-16 No constitutiva de renta acogido a impto.',
    'Factor-17 No constitutiva de renta devolución de capital art.17',
    'Factor-18 Rentas exentas de impto. GC y/o impto adicional',
    'Factor-19 Ingreso no constitutivos de renta',
    'Factor-20 Sin derecho a devolucion',
    'Factor-21 Con derecho a devolucion',
    'Factor-22 Sin derecho a devolucion',
    'Factor-23 Con derecho a devolucion',
    'Factor-24 Sin derecho a devolucion',
    'Factor-25 Con derecho a devolucion',
    'Factor-26 Sin derecho a devolucion',
    'Factor-27 Con derecho a devolucion',
    'Facotr-28 Credito por IPE',
    'Factor-29 Sin derecho a devolucion',
    'Factor-30 Con derecho a devolucion',
    'Factor-31 Sin derecho a devolucion',
    'Factor-32 Con derecho a devolucion',
    'Factor-33 Credito por IPE',
    'Factor-34 Cred. por impto. tasa adicional, Ex art.21 LIR',
    'Factor-35 Tasa efectiva del cred. del FUT (TEF)',
    'Factor-36 Tasa efectiva del cred. del FUNT (TEX)',
    'Factor-37 Devolucion de capital art. 17 num 7 LIR',
    'Factor-38 Descripcion'
];

// Función para generar los campos de factores dinámicamente
function generateFactoresFields() {
    const container = document.getElementById('factoresContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    FACTORES_NAMES.forEach((factorName, index) => {
        const factorId = `factor_${index + 1}`;
        const colClass = 'col-md-6'; // 2 columnas por fila para acomodar nombres largos
        
        const fieldHtml = `
            <div class="${colClass} mb-3">
                <label class="form-label">${factorName}</label>
                <input type="number" class="form-control factor-field-input" 
                       id="${factorId}" 
                       data-factor-index="${index + 1}"
                       step="0.000001" 
                       placeholder="0.000000"
                       value="0">
            </div>
        `;
        container.innerHTML += fieldHtml;
    });
}

// Load dividends
async function loadDividends(page = 1) {
    currentDividendPage = page;
    const loading = document.getElementById('dividendLoading');
    const tbody = document.getElementById('dividendTableBody');
    
    if (!loading || !tbody) return;
    
    loading.classList.remove('hidden');
    tbody.innerHTML = '';
    
    const params = new URLSearchParams({
        page: page,
    });
    
    const tipoMercado = document.getElementById('filterTipoMercado')?.value;
    const origenInformacion = document.getElementById('filterOrigenInformacion')?.value;
    const periodoComercial = document.getElementById('filterPeriodoComercial')?.value;
    
    if (tipoMercado) params.append('tipo_mercado', tipoMercado);
    if (origenInformacion) params.append('origen_informacion', origenInformacion);
    if (periodoComercial) params.append('periodo_comercial', periodoComercial);
    
    try {
        const response = await fetch(`${API_BASE_URL}/dividend-maintainers/?${params}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        loading.classList.add('hidden');
        
        if (response.ok && data.results) {
            tbody.innerHTML = data.results.map(d => {
                const fechaPago = d.fecha_pago_dividendo ? new Date(d.fecha_pago_dividendo).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
                
                return `
                    <tr>
                        <td><input type="checkbox" class="dividend-checkbox" value="${d.id}" onchange="toggleDividendSelection('${d.id}')"></td>
                        <td>${getMarketTypeLabel(d.tipo_mercado) || '-'}</td>
                        <td>${d.instrumento || '-'}</td>
                        <td>${d.descripcion_dividendo || '-'}</td>
                        <td>${fechaPago}</td>
                        <td>${d.secuencia_evento_capital || '-'}</td>
                        <td>${formatNumber(d.dividendo, 0)}</td>
                        <td>${formatNumber(d.valor_historico, 8)}</td>
                        <td>${formatNumber(d.factor_actualizacion, 6)}</td>
                        <td>${d.periodo_comercial || '-'}</td>
                        <td>${getIsfutIsiftLabel(d.acogido_isfut_isift)}</td>
                    </tr>
                `;
            }).join('');
            
            updateDividendPagination(data);
            updateDividendButtons();
        }
    } catch (error) {
        loading.classList.add('hidden');
        alert('Error al cargar datos: ' + error.message);
    }
}

function searchDividends() {
    loadDividends(1);
}

function clearDividendFilters() {
    document.getElementById('filterTipoMercado').value = '';
    document.getElementById('filterOrigenInformacion').value = '';
    document.getElementById('filterPeriodoComercial').value = '';
    loadDividends(1);
}

function updateDividendPagination(data) {
    const pagination = document.getElementById('dividendPagination');
    if (!pagination) return;
    
    pagination.innerHTML = '';
    
    if (data.previous || data.next) {
        if (data.previous) {
            pagination.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadDividends(${currentDividendPage - 1}); return false;">Anterior</a></li>`;
        }
        if (data.next) {
            pagination.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="loadDividends(${currentDividendPage + 1}); return false;">Siguiente</a></li>`;
        }
    }
}

function getIsfutIsiftLabel(value) {
    const labels = {
        'isfut': 'ISFUT',
        'isift': 'ISIFT',
        'ninguno': 'Ninguno'
    };
    return labels[value] || value;
}

function getOriginLabel(value) {
    const labels = {
        'corredora': 'Corredora',
        'sistema': 'Sistema'
    };
    return labels[value] || value;
}

function getMarketTypeLabel(value) {
    const labels = {
        'acciones': 'AC',
        'cfi': 'CFI',
        'fondos_mutuos': 'FM'
    };
    return labels[value] || value;
}

function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || value === '') return '0';
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    return num.toFixed(decimals).replace('.', ',');
}

function toggleDividendSelection(id) {
    if (selectedDividendIds.has(id)) {
        selectedDividendIds.delete(id);
    } else {
        selectedDividendIds.add(id);
    }
    updateDividendButtons();
}

function toggleSelectAllDividends() {
    const selectAll = document.getElementById('selectAllDividends');
    const checkboxes = document.querySelectorAll('.dividend-checkbox');
    
    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        if (selectAll.checked) {
            selectedDividendIds.add(cb.value);
        } else {
            selectedDividendIds.delete(cb.value);
        }
    });
    updateDividendButtons();
}

function updateDividendButtons() {
    const hasSelection = selectedDividendIds.size > 0;
    const btnDelete = document.getElementById('btnDeleteDividend');
    const btnModify = document.getElementById('btnModifyDividend');
    
    if (btnDelete) btnDelete.disabled = !hasSelection;
    if (btnModify) btnModify.disabled = selectedDividendIds.size !== 1;
}

function showCreateDividendModal() {
    document.getElementById('dividendModalTitle').textContent = 'Nueva Calificación';
    document.getElementById('dividendForm').reset();
    document.getElementById('dividendId').value = '';
    
    // Reset to step 1
    resetDividendSteps();
    
    // Pre-load values from filters
    const filterTipoMercado = document.getElementById('filterTipoMercado')?.value;
    const filterPeriodoComercial = document.getElementById('filterPeriodoComercial')?.value;
    
    if (filterTipoMercado) {
        document.getElementById('dividendTipoMercado').value = filterTipoMercado;
    }
    if (filterPeriodoComercial) {
        document.getElementById('dividendPeriodoComercial').value = filterPeriodoComercial;
    } else {
        const currentYear = new Date().getFullYear();
        document.getElementById('dividendPeriodoComercial').value = currentYear;
    }
    
    // Set default values
    document.getElementById('dividendDividendo').value = '0';
    document.getElementById('dividendFactorActualizacion').value = '0';
    document.getElementById('dividendFechaPago').value = new Date().toISOString().split('T')[0];
    document.getElementById('dividendSecuencia').value = '10001';
    document.getElementById('dividendIsfut').checked = false;
    
    new bootstrap.Modal(document.getElementById('dividendModal')).show();
}

function resetDividendSteps() {
    // Reset to step 1
    const step1Tab = document.getElementById('step1-tab');
    const step2Tab = document.getElementById('step2-tab');
    const step3Tab = document.getElementById('step3-tab');
    const step4Tab = document.getElementById('step4-tab');
    const step1Pane = document.getElementById('step1');
    const step2Pane = document.getElementById('step2');
    const step3Pane = document.getElementById('step3');
    const step4Pane = document.getElementById('step4');
    const btnNext = document.getElementById('btnNextStep');
    const btnNextToStep3 = document.getElementById('btnNextToStep3');
    const btnCalculate = document.getElementById('btnCalculateDividend');
    const btnOkFactores = document.getElementById('btnOkFactores');
    const btnCancelFactores = document.getElementById('btnCancelFactores');
    const btnSave = document.getElementById('btnSaveDividend');
    const btnBack = document.getElementById('btnBackStep');
    
    // Activate step 1
    step1Tab.classList.add('active');
    step1Tab.removeAttribute('disabled');
    step1Pane.classList.add('show', 'active');
    
    // Deactivate step 2, 3 and 4
    step2Tab.classList.remove('active');
    step2Tab.setAttribute('disabled', 'disabled');
    step2Pane.classList.remove('show', 'active');
    
    step3Tab.classList.remove('active');
    step3Tab.setAttribute('disabled', 'disabled');
    step3Pane.classList.remove('show', 'active');
    
    step4Tab.classList.remove('active');
    step4Tab.setAttribute('disabled', 'disabled');
    step4Pane.classList.remove('show', 'active');
    
    // Show/hide buttons
    btnNext.classList.remove('hidden');
    btnNextToStep3.classList.add('hidden');
    btnCalculate.classList.add('hidden');
    btnOkFactores.classList.add('hidden');
    btnCancelFactores.classList.add('hidden');
    btnSave.classList.add('hidden');
    btnBack.classList.add('hidden');
    
    // Generate SII fields and factores fields
    generateSIIFields();
    generateFactoresFields();
}

function nextDividendStep() {
    // Validate step 1 fields
    const tipoMercado = document.getElementById('dividendTipoMercado').value;
    const periodoComercial = document.getElementById('dividendPeriodoComercial').value;
    const instrumento = document.getElementById('dividendInstrumento').value.trim();
    const secuencia = document.getElementById('dividendSecuencia').value;
    const fechaPago = document.getElementById('dividendFechaPago').value;
    const origenInformacion = document.getElementById('dividendOrigenInformacion').value;
    
    if (!tipoMercado || !periodoComercial || !instrumento || !fechaPago || !origenInformacion) {
        alert('Por favor complete todos los campos requeridos del Paso 1');
        return;
    }
    
    // Validate secuencia > 10000
    if (parseInt(secuencia) <= 10000) {
        alert('La secuencia del evento debe ser superior a 10,000');
        return;
    }
    
    // Move to step 2
    const step1Tab = document.getElementById('step1-tab');
    const step2Tab = document.getElementById('step2-tab');
    const step1Pane = document.getElementById('step1');
    const step2Pane = document.getElementById('step2');
    const btnNext = document.getElementById('btnNextStep');
    const btnNextToStep3 = document.getElementById('btnNextToStep3');
    const btnBack = document.getElementById('btnBackStep');
    
    step1Tab.classList.remove('active');
    step2Tab.classList.add('active');
    step2Tab.removeAttribute('disabled');
    step1Pane.classList.remove('show', 'active');
    step2Pane.classList.add('show', 'active');
    
    btnNext.classList.add('hidden');
    btnNextToStep3.classList.remove('hidden');
    btnBack.classList.remove('hidden');
}

function nextToStep3() {
    // Move to step 3
    const step2Tab = document.getElementById('step2-tab');
    const step3Tab = document.getElementById('step3-tab');
    const step2Pane = document.getElementById('step2');
    const step3Pane = document.getElementById('step3');
    const btnNextToStep3 = document.getElementById('btnNextToStep3');
    const btnCalculate = document.getElementById('btnCalculateDividend');
    const btnSave = document.getElementById('btnSaveDividend');
    const btnBack = document.getElementById('btnBackStep');
    
    step2Tab.classList.remove('active');
    step3Tab.classList.add('active');
    step3Tab.removeAttribute('disabled');
    step2Pane.classList.remove('show', 'active');
    step3Pane.classList.add('show', 'active');
    
    btnNextToStep3.classList.add('hidden');
    btnCalculate.classList.remove('hidden');
    btnSave.classList.remove('hidden');
    btnBack.classList.remove('hidden');
}

function backDividendStep() {
    // Determine current step and go back
    const step1Tab = document.getElementById('step1-tab');
    const step2Tab = document.getElementById('step2-tab');
    const step3Tab = document.getElementById('step3-tab');
    const step4Tab = document.getElementById('step4-tab');
    const step1Pane = document.getElementById('step1');
    const step2Pane = document.getElementById('step2');
    const step3Pane = document.getElementById('step3');
    const step4Pane = document.getElementById('step4');
    const btnNext = document.getElementById('btnNextStep');
    const btnNextToStep3 = document.getElementById('btnNextToStep3');
    const btnCalculate = document.getElementById('btnCalculateDividend');
    const btnOkFactores = document.getElementById('btnOkFactores');
    const btnCancelFactores = document.getElementById('btnCancelFactores');
    const btnSave = document.getElementById('btnSaveDividend');
    const btnBack = document.getElementById('btnBackStep');
    
    // Check if we're on step 4
    if (step4Tab.classList.contains('active')) {
        // Go back to step 3
        step4Tab.classList.remove('active');
        step4Tab.setAttribute('disabled', 'disabled');
        step3Tab.classList.add('active');
        step4Pane.classList.remove('show', 'active');
        step3Pane.classList.add('show', 'active');
        
        btnCalculate.classList.remove('hidden');
        btnOkFactores.classList.add('hidden');
        btnCancelFactores.classList.add('hidden');
        btnSave.classList.add('hidden');
    } else if (step3Tab.classList.contains('active')) {
        // Go back to step 2
        step3Tab.classList.remove('active');
        step3Tab.setAttribute('disabled', 'disabled');
        step2Tab.classList.add('active');
        step3Pane.classList.remove('show', 'active');
        step2Pane.classList.add('show', 'active');
        
        btnNextToStep3.classList.remove('hidden');
        btnCalculate.classList.add('hidden');
        btnSave.classList.add('hidden');
    } else if (step2Tab.classList.contains('active')) {
        // Go back to step 1
        step2Tab.classList.remove('active');
        step2Tab.setAttribute('disabled', 'disabled');
        step1Tab.classList.add('active');
        step2Pane.classList.remove('show', 'active');
        step1Pane.classList.add('show', 'active');
        
        btnNext.classList.remove('hidden');
        btnNextToStep3.classList.add('hidden');
        btnBack.classList.add('hidden');
    }
}

/**
 * Mapeo de campos SII a factores según hoja de homologación
 * 
 * IMPORTANTE: Este mapeo debe ajustarse según la hoja de homologación real.
 * Cada factor (8-16) se calcula basándose en los montos de los campos SII asociados.
 * 
 * Estructura:
 * - campos: Array de índices de campos SII (1-based) que contribuyen a este factor
 * - nombre: Nombre descriptivo del factor
 * - formula: Función opcional para calcular el factor (si no se proporciona, se usa la fórmula por defecto)
 */
const HOMOLOGACION_MAP = {
    // Factor 1 (Factor-08): mapeo de campos SII que contribuyen al factor 1
    factor_1: {
        campos: [1, 2, 3], // Índices de campos SII (1-based) según hoja homologación
        nombre: FACTORES_NAMES[0] || "Factor-08 No constitutiva de renta no acogido a Impto."
    },
    // Factor 2 (Factor-09)
    factor_2: {
        campos: [4, 5],
        nombre: FACTORES_NAMES[1] || "Factor-09 Impto. 1ra Categ. afecto GI. comp. con devolucion"
    },
    // Factor 3 (Factor-10)
    factor_3: {
        campos: [6, 7],
        nombre: FACTORES_NAMES[2] || "Factor-10 Impuesto tasa adicional exento art. 21"
    },
    // Factor 4 (Factor-11)
    factor_4: {
        campos: [8, 9],
        nombre: FACTORES_NAMES[3] || "Factor-11 Incremento impuesto 1ra categoría"
    },
    // Factor 5 (Factor-12)
    factor_5: {
        campos: [10, 11],
        nombre: FACTORES_NAMES[4] || "Factor-12 Impto. 1ra categ. exento GI. comp. con devolucion"
    },
    // Factor 6 (Factor-13)
    factor_6: {
        campos: [12, 13],
        nombre: FACTORES_NAMES[5] || "Factor-13 Impto. 1ra categ. afecto GI. comp. sin devolucion"
    },
    // Factor 7 (Factor-14)
    factor_7: {
        campos: [14, 15],
        nombre: FACTORES_NAMES[6] || "Factor-14 Impto. 1ra categoría exento GI. comp. sin devolución"
    },
    // Factor 8 (Factor-15)
    factor_8: {
        campos: [16, 17],
        nombre: FACTORES_NAMES[7] || "Factor-15 Impto- creditos pro impuestos externos"
    },
    // Factor 9 (Factor-16)
    factor_9: {
        campos: [18, 19],
        nombre: FACTORES_NAMES[8] || "Factor-16 No constitutiva de renta acogido a impto."
    },
    // Factor 10 (Factor-17)
    factor_10: {
        campos: [20, 21],
        nombre: FACTORES_NAMES[9] || "Factor-17 No constitutiva de renta devolución de capital art.17"
    },
    // Factor 11 (Factor-18)
    factor_11: {
        campos: [22, 23],
        nombre: FACTORES_NAMES[10] || "Factor-18 Rentas exentas de impto. GC y/o impto adicional"
    },
    // Factor 12 (Factor-19)
    factor_12: {
        campos: [24, 25],
        nombre: FACTORES_NAMES[11] || "Factor-19 Ingreso no constitutivos de renta"
    },
    // Factor 13 (Factor-20)
    factor_13: {
        campos: [26, 27],
        nombre: FACTORES_NAMES[12] || "Factor-20 Sin derecho a devolucion"
    },
    // Factor 14 (Factor-21)
    factor_14: {
        campos: [28, 29],
        nombre: FACTORES_NAMES[13] || "Factor-21 Con derecho a devolucion"
    },
    // Factor 15 (Factor-22)
    factor_15: {
        campos: [1, 2], // Ajustar según hoja homologación real
        nombre: FACTORES_NAMES[14] || "Factor-22 Sin derecho a devolucion"
    },
    // Factor 16 (Factor-23)
    factor_16: {
        campos: [3, 4], // Ajustar según hoja homologación real
        nombre: FACTORES_NAMES[15] || "Factor-23 Con derecho a devolucion"
    }
};

/**
 * Función para calcular un factor individual según la hoja de homologación
 * Esta función puede ser sobrescrita o ajustada según las fórmulas reales
 * 
 * @param {number} montoBase - Suma de los montos de los campos SII asociados
 * @param {number} totalMontos - Total de todos los montos SII
 * @param {object} homologacion - Configuración del factor desde HOMOLOGACION_MAP
 * @returns {number} - Valor calculado del factor
 */
function calcularFactorSegunHomologacion(montoBase, totalMontos, homologacion) {
    // FÓRMULA POR DEFECTO: Proporción del monto base sobre el total
    // ESTA FÓRMULA DEBE AJUSTARSE SEGÚN LA HOJA DE HOMOLOGACIÓN REAL
    if (totalMontos === 0) return 0;
    
    // Ejemplo: factor = montoBase / totalMontos
    // Ajustar esta fórmula según la columna de homologación real
    return montoBase / totalMontos;
}

function calculateDividend() {
    // Obtener todos los valores de los campos SII
    const siiFields = {};
    let total = 0;
    
    SII_FIELDS.forEach((fieldName, index) => {
        const fieldId = `sii_field_${index + 1}`;
        const fieldElement = document.getElementById(fieldId);
        if (fieldElement) {
            const value = parseFloat(fieldElement.value) || 0;
            siiFields[`campo_${index + 1}`] = {
                nombre: fieldName,
                valor: value
            };
            total += value;
        }
    });
    
    // Calcular factores 8-16 según la hoja de homologación
    // Nota: Los factores 8-16 corresponden a los índices 7-15 en el array (0-based)
    // Factor 8 = índice 7, Factor 9 = índice 8, ..., Factor 16 = índice 15
    const factoresCalculados = {};
    let sumaFactores = 0;
    
    // Calcular cada factor del 8 al 16 (índices 7-15 en FACTORES_NAMES)
    for (let factorNum = 8; factorNum <= 16; factorNum++) {
        const factorKey = `factor_${factorNum}`;
        const homologacion = HOMOLOGACION_MAP[factorKey];
        
        if (homologacion) {
            // Sumar los valores de los campos SII asociados a este factor
            let valorFactor = 0;
            homologacion.campos.forEach(campoIndex => {
                const campoKey = `campo_${campoIndex}`;
                if (siiFields[campoKey]) {
                    valorFactor += siiFields[campoKey].valor;
                }
            });
            
            // Calcular el factor usando la función de homologación
            const factorValue = calcularFactorSegunHomologacion(valorFactor, total, homologacion);
            
            factoresCalculados[factorKey] = {
                nombre: homologacion.nombre,
                valor: factorValue,
                montoBase: valorFactor
            };
            
            sumaFactores += factorValue;
        }
    }
    
    // Validar que la suma de factores 8-16 no supere 1
    if (sumaFactores > 1) {
        alert(`Error: La suma de los factores 8-16 (${sumaFactores.toFixed(4)}) supera 1.\nPor favor, ajuste los montos ingresados.`);
        return;
    }
    
    // Cargar factores calculados en los campos de la pestaña de factores
    loadFactoresCalculados(factoresCalculados);
    
    // Abrir la pestaña de factores
    openFactoresTab();
}

function showCalculatedFactorsModal(factores, sumaFactores, totalMontos) {
    // Crear contenido del modal
    let modalContent = `
        <div class="table-responsive">
            <table class="table table-bordered table-sm">
                <thead class="table-dark">
                    <tr>
                        <th>Factor</th>
                        <th>Nombre</th>
                        <th>Monto Base</th>
                        <th>Factor Calculado</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Ordenar factores por número
    const factorKeys = Object.keys(factores).sort((a, b) => {
        const numA = parseInt(a.replace('factor_', ''));
        const numB = parseInt(b.replace('factor_', ''));
        return numA - numB;
    });
    
    factorKeys.forEach(factorKey => {
        const factor = factores[factorKey];
        modalContent += `
            <tr>
                <td><strong>${factorKey.replace('factor_', 'Factor ')}</strong></td>
                <td>${factor.nombre}</td>
                <td>$${factor.montoBase.toLocaleString('es-CL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td><strong>${factor.valor.toFixed(6)}</strong></td>
            </tr>
        `;
    });
    
    modalContent += `
                </tbody>
                <tfoot class="table-secondary">
                    <tr>
                        <td colspan="3"><strong>Suma Total Factores 8-16:</strong></td>
                        <td><strong>${sumaFactores.toFixed(6)}</strong></td>
                    </tr>
                    <tr>
                        <td colspan="3"><strong>Total Montos SII:</strong></td>
                        <td><strong>$${totalMontos.toLocaleString('es-CL', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    
    // Crear o actualizar el modal
    let modal = document.getElementById('calculatedFactorsModal');
    if (!modal) {
        // Crear el modal si no existe
        modal = document.createElement('div');
        modal.id = 'calculatedFactorsModal';
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-calculator"></i> Factores Calculados (8-16)
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="calculatedFactorsModalBody">
                        ${modalContent}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" class="btn btn-primary" onclick="acceptCalculatedFactors()">Aceptar Factores</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        // Actualizar contenido existente
        document.getElementById('calculatedFactorsModalBody').innerHTML = modalContent;
    }
    
    // Mostrar el modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Guardar factores calculados globalmente para poder aceptarlos
    window.calculatedFactors = factores;
}

/**
 * Cargar factores calculados en los campos de la pestaña de factores
 */
function loadFactoresCalculados(factoresCalculados) {
    // Primero, asegurarse de que los campos de factores estén generados
    generateFactoresFields();
    
    // Cargar los factores calculados (8-16)
    Object.keys(factoresCalculados).forEach(factorKey => {
        const factorField = document.getElementById(factorKey);
        if (factorField) {
            factorField.value = factoresCalculados[factorKey].valor.toFixed(6);
        }
    });
    
    // Los demás factores (1-7 y 17-31) se mantienen en 0 o se pueden calcular según necesidad
    // Guardar factores calculados para referencia
    window.calculatedFactors = factoresCalculados;
}

/**
 * Abrir la pestaña de factores después del cálculo
 */
function openFactoresTab() {
    const step3Tab = document.getElementById('step3-tab');
    const step4Tab = document.getElementById('step4-tab');
    const step3Pane = document.getElementById('step3');
    const step4Pane = document.getElementById('step4');
    const btnCalculate = document.getElementById('btnCalculateDividend');
    const btnOkFactores = document.getElementById('btnOkFactores');
    const btnCancelFactores = document.getElementById('btnCancelFactores');
    const btnSave = document.getElementById('btnSaveDividend');
    const btnBack = document.getElementById('btnBackStep');
    
    // Desactivar paso 3 y activar paso 4
    step3Tab.classList.remove('active');
    step4Tab.classList.add('active');
    step4Tab.removeAttribute('disabled');
    step3Pane.classList.remove('show', 'active');
    step4Pane.classList.add('show', 'active');
    
    // Mostrar/ocultar botones
    btnCalculate.classList.add('hidden');
    btnOkFactores.classList.remove('hidden');
    btnCancelFactores.classList.remove('hidden');
    btnSave.classList.add('hidden');
    btnBack.classList.remove('hidden');
}

/**
 * Aceptar los factores y continuar (permitir grabar)
 */
function acceptFactores() {
    // Validar que la suma de factores 8-16 no supere 1
    let sumaFactores = 0;
    for (let factorNum = 8; factorNum <= 16; factorNum++) {
        const factorKey = `factor_${factorNum}`;
        const factorField = document.getElementById(factorKey);
        if (factorField) {
            const valor = parseFloat(factorField.value) || 0;
            sumaFactores += valor;
        }
    }
    
    if (sumaFactores > 1) {
        alert(`Error: La suma de los factores 8-16 (${sumaFactores.toFixed(4)}) supera 1.\nPor favor, ajuste los valores.`);
        return;
    }
    
    // Actualizar el campo de factores en el paso 2 con todos los factores
    updateFactoresFieldFromStep4();
    
    // Ocultar botones de factores y mostrar botón de grabar
    const btnOkFactores = document.getElementById('btnOkFactores');
    const btnCancelFactores = document.getElementById('btnCancelFactores');
    const btnSave = document.getElementById('btnSaveDividend');
    
    btnOkFactores.classList.add('hidden');
    btnCancelFactores.classList.add('hidden');
    btnSave.classList.remove('hidden');
    
    alert('Factores aceptados. Puede proceder a grabar el registro.');
}

/**
 * Cancelar y volver al paso 3
 */
function cancelFactores() {
    const step3Tab = document.getElementById('step3-tab');
    const step4Tab = document.getElementById('step4-tab');
    const step3Pane = document.getElementById('step3');
    const step4Pane = document.getElementById('step4');
    const btnCalculate = document.getElementById('btnCalculateDividend');
    const btnOkFactores = document.getElementById('btnOkFactores');
    const btnCancelFactores = document.getElementById('btnCancelFactores');
    const btnBack = document.getElementById('btnBackStep');
    
    // Volver al paso 3
    step4Tab.classList.remove('active');
    step4Tab.setAttribute('disabled', 'disabled');
    step3Tab.classList.add('active');
    step4Pane.classList.remove('show', 'active');
    step3Pane.classList.add('show', 'active');
    
    // Mostrar/ocultar botones
    btnCalculate.classList.remove('hidden');
    btnOkFactores.classList.add('hidden');
    btnCancelFactores.classList.add('hidden');
    btnBack.classList.remove('hidden');
}

/**
 * Actualizar el campo de factores del paso 2 con todos los factores del paso 4
 */
function updateFactoresFieldFromStep4() {
    const factoresFormato = {};
    
    // Obtener todos los factores del paso 4 (1-31)
    for (let factorNum = 1; factorNum <= FACTORES_NAMES.length; factorNum++) {
        const factorKey = `factor_${factorNum}`;
        const factorField = document.getElementById(factorKey);
        if (factorField) {
            const valor = parseFloat(factorField.value) || 0;
            if (valor !== 0) { // Solo incluir factores con valor
                factoresFormato[factorKey] = {
                    nombre: FACTORES_NAMES[factorNum - 1] || `Factor ${factorNum}`,
                    valor: valor
                };
            }
        }
    }
    
    // Actualizar el campo de factores en el paso 2
    const factoresField = document.getElementById('dividendFactores');
    if (factoresField) {
        factoresField.value = JSON.stringify(factoresFormato, null, 2);
    }
}

function updateFactoresField(factores) {
    // Actualizar el campo de factores en el paso 2
    const factoresField = document.getElementById('dividendFactores');
    if (factoresField) {
        // Convertir factores calculados al formato esperado
        const factoresFormato = {};
        Object.keys(factores).forEach(factorKey => {
            factoresFormato[factorKey] = {
                nombre: factores[factorKey].nombre,
                valor: factores[factorKey].valor
            };
        });
        
        factoresField.value = JSON.stringify(factoresFormato, null, 2);
    }
}

async function showEditDividendModal() {
    if (selectedDividendIds.size !== 1) {
        alert('Por favor seleccione un solo registro para modificar');
        return;
    }
    
    const id = Array.from(selectedDividendIds)[0];
    
    try {
        const response = await fetch(`${API_BASE_URL}/dividend-maintainers/${id}/`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Reset to step 1 and generate SII fields
            resetDividendSteps();
            
            document.getElementById('dividendId').value = data.id;
            document.getElementById('dividendTipoMercado').value = data.tipo_mercado;
            document.getElementById('dividendOrigenInformacion').value = data.origen_informacion;
            document.getElementById('dividendPeriodoComercial').value = data.periodo_comercial;
            document.getElementById('dividendInstrumento').value = data.instrumento;
            document.getElementById('dividendFechaPago').value = data.fecha_pago_dividendo || '';
            document.getElementById('dividendDescripcion').value = data.descripcion_dividendo || '';
            document.getElementById('dividendSecuencia').value = data.secuencia_evento_capital || '';
            document.getElementById('dividendDividendo').value = data.dividendo || '0';
            document.getElementById('dividendValorHistorico').value = data.valor_historico || '';
            
            // Step 2 fields
            document.getElementById('dividendIsfut').checked = data.acogido_isfut_isift === 'isfut';
            document.getElementById('dividendFactorActualizacion').value = data.factor_actualizacion || '0';
            document.getElementById('dividendFactores').value = JSON.stringify(data.factores_8_37 || {}, null, 2);
            
            // Load SII detailed fields after they are generated
            setTimeout(() => {
                if (data.campos_detallados_sii) {
                    Object.keys(data.campos_detallados_sii).forEach((key) => {
                        const fieldData = data.campos_detallados_sii[key];
                        const fieldIndex = parseInt(key.replace('campo_', ''));
                        const fieldId = `sii_field_${fieldIndex}`;
                        const fieldElement = document.getElementById(fieldId);
                        if (fieldElement && fieldData.valor !== undefined) {
                            fieldElement.value = fieldData.valor;
                        }
                    });
                }
                
                // Load factores in step 4
                generateFactoresFields();
                if (data.factores_8_37) {
                    setTimeout(() => {
                        Object.keys(data.factores_8_37).forEach((factorKey) => {
                            const factorData = data.factores_8_37[factorKey];
                            const factorField = document.getElementById(factorKey);
                            if (factorField && factorData.valor !== undefined) {
                                factorField.value = factorData.valor;
                            }
                        });
                    }, 50);
                }
            }, 100);
            
            document.getElementById('dividendModalTitle').textContent = 'Editar Calificación';
            new bootstrap.Modal(document.getElementById('dividendModal')).show();
        }
    } catch (error) {
        alert('Error al cargar datos: ' + error.message);
    }
}

async function saveDividend() {
    // Validate required fields
    const tipoMercado = document.getElementById('dividendTipoMercado').value;
    const origenInformacion = document.getElementById('dividendOrigenInformacion').value;
    const periodoComercial = document.getElementById('dividendPeriodoComercial').value;
    const instrumento = document.getElementById('dividendInstrumento').value.trim();
    const fechaPago = document.getElementById('dividendFechaPago').value;
    
    if (!tipoMercado || !origenInformacion || !periodoComercial || !instrumento || !fechaPago) {
        alert('Por favor complete todos los campos requeridos');
        return;
    }
    
    // Get ISFUT from checkbox
    const isfutCheckbox = document.getElementById('dividendIsfut');
    const acogidoIsfutIsift = isfutCheckbox && isfutCheckbox.checked ? 'isfut' : 'ninguno';
    
    // Parse factores
    let factores = {};
    const factoresText = document.getElementById('dividendFactores').value.trim();
    if (factoresText) {
        try {
            factores = JSON.parse(factoresText);
        } catch (e) {
            alert('Error en el formato JSON de los factores: ' + e.message);
            return;
        }
    }
    
    // Obtener campos detallados del SII
    const camposDetalladosSII = {};
    SII_FIELDS.forEach((fieldName, index) => {
        const fieldId = `sii_field_${index + 1}`;
        const fieldElement = document.getElementById(fieldId);
        if (fieldElement) {
            const value = parseFloat(fieldElement.value) || 0;
            camposDetalladosSII[`campo_${index + 1}`] = {
                nombre: fieldName,
                valor: value
            };
        }
    });
    
    // Prepare data
    const data = {
        tipo_mercado: tipoMercado,
        origen_informacion: origenInformacion,
        periodo_comercial: parseInt(periodoComercial),
        instrumento: instrumento,
        fecha_pago_dividendo: fechaPago,
        descripcion_dividendo: document.getElementById('dividendDescripcion').value.trim(),
        secuencia_evento_capital: document.getElementById('dividendSecuencia').value ? parseInt(document.getElementById('dividendSecuencia').value) : null,
        acogido_isfut_isift: acogidoIsfutIsift,
        origen: origenInformacion, // Use mismo origen que origen_informacion
        factor_actualizacion: document.getElementById('dividendFactorActualizacion').value ? parseFloat(document.getElementById('dividendFactorActualizacion').value) : 0,
        dividendo: document.getElementById('dividendDividendo').value ? parseFloat(document.getElementById('dividendDividendo').value) : 0,
        valor_historico: document.getElementById('dividendValorHistorico').value ? parseFloat(document.getElementById('dividendValorHistorico').value) : null,
        factores_8_37: factores,
        campos_detallados_sii: camposDetalladosSII
    };
    
    const id = document.getElementById('dividendId').value;
    const url = id ? `${API_BASE_URL}/dividend-maintainers/${id}/` : `${API_BASE_URL}/dividend-maintainers/`;
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('dividendModal')).hide();
            selectedDividendIds.clear();
            loadDividends(currentDividendPage);
            alert('Dividendo guardado exitosamente');
        } else {
            let errorMessage = 'Error al guardar: ';
            if (responseData.detail) {
                errorMessage += responseData.detail;
            } else if (responseData.non_field_errors) {
                errorMessage += responseData.non_field_errors.join(', ');
            } else {
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

async function deleteSelectedDividend() {
    if (selectedDividendIds.size === 0) {
        alert('Por favor seleccione al menos un registro para eliminar');
        return;
    }
    
    if (!confirm(`¿Está seguro de eliminar ${selectedDividendIds.size} registro(s)?`)) {
        return;
    }
    
    const deletePromises = Array.from(selectedDividendIds).map(id => 
        fetch(`${API_BASE_URL}/dividend-maintainers/${id}/`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        })
    );
    
    try {
        const responses = await Promise.all(deletePromises);
        const allOk = responses.every(r => r.ok);
        
        if (allOk) {
            selectedDividendIds.clear();
            loadDividends(currentDividendPage);
            alert('Registro(s) eliminado(s) exitosamente');
        } else {
            alert('Error al eliminar algunos registros');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showBulkUploadModal() {
    // Reset form
    document.getElementById('bulkUploadForm').reset();
    document.getElementById('dividendPreviewFields').classList.add('hidden');
    document.getElementById('btnProcessDividendUpload').classList.add('hidden');
    document.getElementById('btnProcessDividendUpload').disabled = true;
    
    // Clear preview fields
    document.getElementById('previewPeriodoComercial').value = '';
    document.getElementById('previewTipoMercado').value = '';
    document.getElementById('previewInstrumento').value = '';
    document.getElementById('previewFechaPago').value = '';
    document.getElementById('previewDescripcion').value = '';
    document.getElementById('previewSecuencia').value = '';
    document.getElementById('dividendPreviewHeader').innerHTML = '';
    document.getElementById('dividendPreviewBody').innerHTML = '';
    document.getElementById('dividendRowCount').textContent = '';
    document.getElementById('dividendValidationResults').innerHTML = '';
    document.getElementById('previewFactoresContainer').innerHTML = '';
    
    // Show modal
    new bootstrap.Modal(document.getElementById('bulkUploadModal')).show();
    
    // Add event listener to file input
    const fileInput = document.getElementById('bulkUploadFile');
    fileInput.onchange = function() {
        handleDividendFileSelection(this.files[0]);
    };
}

function showDividendFileFormat() {
    new bootstrap.Modal(document.getElementById('dividendFileFormatModal')).show();
}

function handleDividendFileSelection(file) {
    if (!file) return;
    
    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
        alert('Por favor seleccione un archivo CSV o Excel');
        return;
    }
    
    const reader = new FileReader();
    
    if (fileExtension === '.csv') {
        reader.onload = function(e) {
            try {
                const csvText = e.target.result;
                const preview = parseDividendCsv(csvText);
                displayDividendPreview(preview);
            } catch (error) {
                alert('Error al leer el archivo CSV: ' + error.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    } else {
        // For Excel files, we'll need to use a library or process on backend
        alert('El procesamiento de archivos Excel se realizará en el servidor. Por favor, use CSV para previsualización.');
        // Still show upload button
        document.getElementById('dividendPreviewFields').classList.remove('hidden');
        document.getElementById('btnProcessDividendUpload').classList.remove('hidden');
        document.getElementById('btnProcessDividendUpload').disabled = false;
    }
}

function parseDividendCsv(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
        throw new Error('El archivo CSV está vacío');
    }
    
    // Simple CSV parser
    const parseCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };
    
    const headerLine = lines[0];
    const headers = parseCsvLine(headerLine).map(h => h.toLowerCase().trim());
    
    const data = [];
    for (let i = 1; i < Math.min(lines.length, 6); i++) { // First 5 data rows
        const line = lines[i];
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    // Extract preview data from first row
    const firstRow = data[0] || {};
    const factores = {};
    
    // Extract factors
    for (let i = 1; i <= 31; i++) {
        const factorKey = `factor_${i}`;
        if (firstRow[factorKey] !== undefined) {
            factores[factorKey] = parseFloat(firstRow[factorKey]) || 0;
        }
    }
    
    return {
        headers,
        data,
        totalRows: lines.length - 1,
        preview: {
            periodo_comercial: firstRow.periodo_comercial || '',
            tipo_mercado: firstRow.tipo_mercado || '',
            instrumento: firstRow.instrumento || '',
            fecha_pago_dividendo: firstRow.fecha_pago_dividendo || '',
            descripcion_dividendo: firstRow.descripcion_dividendo || '',
            secuencia_evento_capital: firstRow.secuencia_evento_capital || '',
            factores: factores
        },
        validation: validateDividendData(data, headers)
    };
}

function validateDividendData(data, headers) {
    const errors = [];
    const warnings = [];
    
    const requiredFields = ['periodo_comercial', 'tipo_mercado', 'instrumento', 'fecha_pago_dividendo', 'secuencia_evento_capital'];
    const missingFields = requiredFields.filter(field => !headers.includes(field));
    
    if (missingFields.length > 0) {
        errors.push(`Columnas requeridas faltantes: ${missingFields.join(', ')}`);
    }
    
    // Validate data rows
    data.forEach((row, index) => {
        const rowNum = index + 2; // +2 because index is 0-based and we skip header
        
        if (!row.periodo_comercial || row.periodo_comercial.trim() === '') {
            errors.push(`Fila ${rowNum}: periodo_comercial es requerido`);
        } else {
            const year = parseInt(row.periodo_comercial);
            if (isNaN(year) || year < 2000 || year > 2100) {
                errors.push(`Fila ${rowNum}: periodo_comercial inválido (debe estar entre 2000 y 2100)`);
            }
        }
        
        if (row.tipo_mercado && row.tipo_mercado.trim() !== '') {
            const validTypes = ['acciones', 'cfi', 'fondos_mutuos'];
            if (!validTypes.includes(row.tipo_mercado.toLowerCase())) {
                warnings.push(`Fila ${rowNum}: tipo_mercado inválido (${row.tipo_mercado}), valores válidos: ${validTypes.join(', ')}`);
            }
        }
        
        if (row.secuencia_evento_capital) {
            const secuencia = parseInt(row.secuencia_evento_capital);
            if (isNaN(secuencia) || secuencia <= 10000) {
                errors.push(`Fila ${rowNum}: secuencia_evento_capital debe ser un número superior a 10000`);
            }
        }
    });
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

function displayDividendPreview(preview) {
    const previewFields = document.getElementById('dividendPreviewFields');
    const btnProcess = document.getElementById('btnProcessDividendUpload');
    const validationResults = document.getElementById('dividendValidationResults');
    
    // Show preview fields
    previewFields.classList.remove('hidden');
    
    // Fill preview fields
    document.getElementById('previewPeriodoComercial').value = preview.preview.periodo_comercial || '';
    document.getElementById('previewTipoMercado').value = preview.preview.tipo_mercado || '';
    document.getElementById('previewInstrumento').value = preview.preview.instrumento || '';
    document.getElementById('previewFechaPago').value = preview.preview.fecha_pago_dividendo || '';
    document.getElementById('previewDescripcion').value = preview.preview.descripcion_dividendo || '';
    document.getElementById('previewSecuencia').value = preview.preview.secuencia_evento_capital || '';
    
    // Display factors
    const factoresContainer = document.getElementById('previewFactoresContainer');
    factoresContainer.innerHTML = '';
    
    for (let i = 1; i <= 31; i++) {
        const factorKey = `factor_${i}`;
        const factorValue = preview.preview.factores[factorKey] || 0;
        const factorName = FACTORES_NAMES[i - 1] || `Factor ${i}`;
        
        const colClass = 'col-md-4';
        const factorHtml = `
            <div class="${colClass} mb-2">
                <label class="form-label small">${factorName}</label>
                <input type="text" class="form-control form-control-sm" 
                       value="${factorValue}" 
                       readonly>
            </div>
        `;
        factoresContainer.innerHTML += factorHtml;
    }
    
    // Display preview table
    const previewHeader = document.getElementById('dividendPreviewHeader');
    const previewBody = document.getElementById('dividendPreviewBody');
    const rowCount = document.getElementById('dividendRowCount');
    
    previewHeader.innerHTML = '';
    preview.headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        previewHeader.appendChild(th);
    });
    
    previewBody.innerHTML = '';
    preview.data.forEach((row, index) => {
        const tr = document.createElement('tr');
        preview.headers.forEach(header => {
            const td = document.createElement('td');
            let value = row[header] || '';
            if (value && value.length > 30) {
                td.textContent = value.substring(0, 30) + '...';
                td.title = value;
            } else {
                td.textContent = value;
            }
            tr.appendChild(td);
        });
        previewBody.appendChild(tr);
    });
    
    rowCount.textContent = `Mostrando primeras ${preview.data.length} filas de ${preview.totalRows} totales`;
    
    // Display validation
    let validationHtml = '';
    if (preview.validation.warnings.length > 0) {
        validationHtml += `<div class="alert alert-warning"><strong>Advertencias:</strong><ul class="mb-0 mt-2">`;
        preview.validation.warnings.forEach(warning => {
            validationHtml += `<li>${warning}</li>`;
        });
        validationHtml += `</ul></div>`;
    }
    
    if (preview.validation.valid) {
        validationHtml += `<div class="alert alert-success"><i class="bi bi-check-circle"></i> <strong>Archivo válido</strong> - Listo para cargar</div>`;
        btnProcess.classList.remove('hidden');
        btnProcess.disabled = false;
    } else {
        validationHtml += `<div class="alert alert-danger"><strong>Errores encontrados:</strong><ul class="mb-0 mt-2">`;
        preview.validation.errors.forEach(error => {
            validationHtml += `<li>${error}</li>`;
        });
        validationHtml += `</ul></div>`;
        btnProcess.classList.add('hidden');
        btnProcess.disabled = true;
    }
    
    validationResults.innerHTML = validationHtml;
}

async function processDividendBulkUpload() {
    const fileInput = document.getElementById('bulkUploadFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Por favor seleccione un archivo');
        return;
    }
    
    // Disable button during processing
    const btnProcess = document.getElementById('btnProcessDividendUpload');
    btnProcess.disabled = true;
    btnProcess.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/imports/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('bulkUploadModal')).hide();
            alert('Archivo subido exitosamente. El procesamiento se realizará en segundo plano.\nPuede revisar el estado en la pestaña "Importaciones".');
            fileInput.value = '';
            
            // Reload dividends after a delay
            setTimeout(() => {
                loadDividends(currentDividendPage);
                loadImports();
            }, 2000);
        } else {
            let errorMessage = 'Error al procesar el archivo: ';
            if (data.error) {
                errorMessage += data.error;
            } else if (data.detail) {
                errorMessage += data.detail;
            } else {
                errorMessage += JSON.stringify(data);
            }
            alert(errorMessage);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    } finally {
        btnProcess.disabled = false;
        btnProcess.innerHTML = '<i class="bi bi-upload"></i> Subir y Procesar';
    }
}

// Load dividends when tab is shown
document.addEventListener('DOMContentLoaded', function() {
    const dividendTab = document.getElementById('dividend-tab');
    if (dividendTab) {
        dividendTab.addEventListener('shown.bs.tab', function() {
            loadDividends();
        });
    }
    
    // Reset modal when closed
    const dividendModal = document.getElementById('dividendModal');
    if (dividendModal) {
        dividendModal.addEventListener('hidden.bs.modal', function() {
            resetDividendSteps();
            document.getElementById('dividendForm').reset();
            document.getElementById('dividendId').value = '';
        });
    }
});

