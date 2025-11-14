# Guía Rápida de Configuración

## Configuración Inicial (Local - XAMPP)

### 1. Configurar Base de Datos en XAMPP

1. Iniciar XAMPP y asegurarse de que MySQL esté corriendo
2. Abrir phpMyAdmin (http://localhost/phpmyadmin)
3. Crear base de datos:
```sql
CREATE DATABASE db_proyecto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Instalar Dependencias Python

```bash
# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

**Nota para Windows con XAMPP:**
Si tienes problemas instalando `mysqlclient`, puedes usar solo `pymysql` y comentar `mysqlclient` en `requirements.txt`.

### 3. Configurar Base de Datos en settings.py

Verificar que en `miproyecto/settings.py` esté configurado:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'db_proyecto',
        'USER': 'root',
        'PASSWORD': '',  
        'HOST': 'localhost',
        'PORT': '3306',
    }
}
```

### 4. Ejecutar Migraciones

```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Crear Superusuario

```bash
python manage.py createsuperuser
```

Seguir las instrucciones para crear el usuario admin.

### 6. Recopilar Archivos Estáticos

```bash
python manage.py collectstatic
```

### 7. Ejecutar Servidor

```bash
python manage.py runserver
```

### 8. Acceder a la Aplicación

- **Frontend**: http://localhost:8000
- **Admin**: http://localhost:8000/admin
- **API**: http://localhost:8000/api/

## Usar Docker (Alternativa)

Si prefieres usar Docker en lugar de XAMPP:

```bash
# Construir y ejecutar
docker-compose up --build

# Crear superusuario
docker-compose exec web python manage.py createsuperuser
```

**Nota:** El docker-compose incluye MySQL, así que no necesitas XAMPP cuando uses Docker.

## Solución de Problemas

### Error: "No module named 'pymysql'"
```bash
pip install pymysql
```

### Error: "Can't connect to MySQL server"
- Verificar que XAMPP MySQL esté corriendo
- Verificar usuario/contraseña en `settings.py`
- Verificar que la base de datos `db_proyecto` exista

### Error: "No module named '_mysql'"
Si usas `mysqlclient` y falla en Windows, usar solo `pymysql`:
```bash
pip uninstall mysqlclient
pip install pymysql
```

Y verificar que `miproyecto/__init__.py` tenga:
```python
import pymysql
pymysql.install_as_MySQLdb()
```

## Próximos Pasos

1. Iniciar sesión con el superusuario creado
2. Crear algunas calificaciones manualmente
3. Probar importar un archivo CSV
4. Revisar logs de auditoría en el admin

## Estructura de Archivos CSV para Importar

Crear un archivo CSV con las siguientes columnas:

```csv
rut,name,year,source_type,amount,status
12345678-9,Juan Pérez,2023,declaracion,1500000,activo
98765432-1,María González,2023,certificado,2000000,activo
11111111-1,Pedro Martínez,2024,manual,1000000,activo
```

Guardar como `import.csv` y subirlo desde la aplicación.

