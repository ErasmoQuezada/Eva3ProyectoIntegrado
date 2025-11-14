# Mantenedor de Calificaciones Tributarias

Sistema para gestión de calificaciones tributarias con Django REST Framework, procesamiento de archivos masivos y auditoría completa.

## Requisitos

- Python 3.11+
- MySQL/MariaDB (XAMPP)
- Docker y Docker Compose (opcional)

## Instalación Local

1. **Clonar o descargar el proyecto**

2. **Crear entorno virtual:**
```bash
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
```

3. **Instalar dependencias:**
```bash
pip install -r requirements.txt
```

4. **Configurar base de datos en XAMPP:**
   - Iniciar MySQL en XAMPP
   - Crear base de datos: `CREATE DATABASE db_proyecto;`
   - Verificar configuración en `miproyecto/settings.py`:
     - HOST: `localhost`
     - PORT: `3306`
     - USER: `root`
     - PASSWORD: `` (vacío por defecto en XAMPP)

5. **Ejecutar migraciones:**
```bash
python manage.py makemigrations
python manage.py migrate
```

6. **Crear superusuario:**
```bash
python manage.py createsuperuser
```

7. **Recopilar archivos estáticos:**
```bash
python manage.py collectstatic
```

8. **Ejecutar servidor:**
```bash
python manage.py runserver
```

9. **Acceder a la aplicación:**
   - Frontend: http://localhost:8000
   - Admin: http://localhost:8000/admin
   - API: http://localhost:8000/api/

## Instalación con Docker

1. **Construir y ejecutar:**
```bash
docker-compose up --build
```

2. **Crear superusuario:**
```bash
docker-compose exec web python manage.py createsuperuser
```

3. **Acceder a la aplicación:**
   - Frontend: http://localhost:8000
   - API: http://localhost:8000/api/

## Estructura de Base de Datos

### Tablas principales:

- **tax_grades**: Calificaciones tributarias
  - Campos: id (UUID), rut, name, year, source_type, amount, factor, calculation_basis, status
  - Índices: (rut, year), source_type, status, year

- **imports**: Registro de importaciones
  - Campos: id (UUID), uploader_id, file_name, file_hash, file_type, status, report_path

- **import_records**: Registros individuales de cada importación
  - Campos: id, import_id, row_number_or_page, rut, year, status, error_message

- **audit_logs**: Logs de auditoría
  - Campos: id, user_id, entity, entity_id, action, before, after, timestamp

## Endpoints API

### Autenticación
- `POST /api/auth/login/` - Obtener JWT token
- `POST /api/auth/refresh/` - Refrescar token

### Tax Grades
- `GET /api/tax-grades/` - Listar (con filtros: rut, year, source_type, status, year_from, year_to, date_from, date_to)
- `GET /api/tax-grades/{id}/` - Detalle
- `POST /api/tax-grades/` - Crear
- `PUT /api/tax-grades/{id}/` - Actualizar
- `DELETE /api/tax-grades/{id}/` - Marcar como inactivo
- `GET /api/tax-grades/{id}/audit/` - Logs de auditoría
- `GET /api/tax-grades/export/?year=YYYY` - Exportar por año

### Imports
- `POST /api/imports/` - Subir archivo (CSV/ZIP/PDF/Excel)
- `GET /api/imports/` - Listar importaciones
- `GET /api/imports/{id}/` - Detalle
- `GET /api/imports/{id}/report/` - Descargar reporte

### Auditoría
- `GET /api/audit-logs/` - Listar logs (solo admin)
- `GET /api/audit-logs/{id}/` - Detalle (solo admin)

## Uso del Frontend

1. **Login**: Ingresar con usuario y contraseña del superusuario
2. **Búsqueda**: Usar filtros en la pestaña "Calificaciones"
3. **Crear/Editar**: Botón "Nueva Calificación" o editar desde la tabla
4. **Importar**: Subir archivo CSV/ZIP/PDF/Excel en la pestaña "Importaciones"
5. **Exportar**: Botón "Exportar" para descargar datos por año

## Formato de Archivos CSV para Importación

El archivo CSV debe contener las siguientes columnas:
- `rut` (requerido)
- `name` (requerido)
- `year` (requerido)
- `source_type` (opcional: declaracion, certificado, manual, calculo)
- `amount` (opcional)
- `factor` (opcional)
- `calculation_basis` (opcional)
- `status` (opcional: activo, inactivo)

Ejemplo:
```csv
rut,name,year,source_type,amount,status
12345678-9,Juan Pérez,2023,declaracion,1500000,activo
98765432-1,María González,2023,certificado,2000000,activo
```

## Desarrollo

Para desarrollo, activar modo DEBUG en `miproyecto/settings.py`:
```python
DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']
```

## Producción

1. Cambiar `DEBUG = False`
2. Configurar `ALLOWED_HOSTS`
3. Configurar `SECRET_KEY` segura
4. Usar servidor WSGI (gunicorn, uwsgi)
5. Servir archivos estáticos con nginx
6. Configurar HTTPS

## Notas

- La base de datos se guarda en XAMPP MySQL
- Los archivos importados se guardan en `media/imports/`
- Los reportes se guardan en `media/reports/`
- Los logs de auditoría se registran automáticamente

## Soporte

Para problemas o consultas, revisar los logs en la consola o en la base de datos (tabla audit_logs).

