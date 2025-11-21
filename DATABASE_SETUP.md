# Configuración de Base de Datos MySQL

## ⚠️ IMPORTANTE: NO crear tablas manualmente

**Django crea automáticamente todas las tablas** cuando ejecutas las migraciones. Solo necesitas crear la **base de datos vacía**.

## Paso 1: Crear solo la Base de Datos

En MySQL (phpMyAdmin o línea de comandos), ejecuta:

```sql
CREATE DATABASE db_proyecto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Eso es todo lo que necesitas crear manualmente.**

## Paso 2: Ejecutar Migraciones de Django

Después de crear la base de datos, Django creará automáticamente todas las tablas:

```bash
python manage.py migrate
```

Este comando creará:
- Todas las tablas del sistema Django (auth_user, django_session, etc.)
- Las 4 tablas de la aplicación (tax_grades, imports, import_records, audit_logs)
- Todos los índices y relaciones

---

## Tablas que Django creará automáticamente

### Tablas de la Aplicación (miapp)

#### 1. `tax_grades` - Calificaciones Tributarias
```sql
-- Esta tabla se crea automáticamente, NO la crees manualmente
-- Campos principales:
--   id (UUID, PK)
--   rut (VARCHAR(20), indexado)
--   name (VARCHAR(255))
--   year (INT, indexado)
--   source_type (VARCHAR(20), indexado)
--   amount (DECIMAL(15,2))
--   factor (DECIMAL(10,4), nullable)
--   calculation_basis (TEXT)
--   status (VARCHAR(10), indexado)
--   created_by_id (FK a auth_user)
--   created_at (DATETIME)
--   updated_by_id (FK a auth_user)
--   updated_at (DATETIME)
-- 
-- Índices:
--   - (rut, year) - compuesto
--   - source_type
--   - status
--   - year
```

#### 2. `imports` - Registro de Importaciones
```sql
-- Esta tabla se crea automáticamente, NO la crees manualmente
-- Campos principales:
--   id (UUID, PK)
--   uploader_id (FK a auth_user, nullable)
--   file_name (VARCHAR(255))
--   file_hash (VARCHAR(64))
--   file_type (VARCHAR(10))
--   uploaded_at (DATETIME)
--   status (VARCHAR(20), indexado)
--   report_path (VARCHAR(500))
```

#### 3. `import_records` - Registros Individuales de Importación
```sql
-- Esta tabla se crea automáticamente, NO la crees manualmente
-- Campos principales:
--   id (UUID, PK)
--   import_id (FK a imports, CASCADE)
--   row_number_or_page (INT)
--   rut (VARCHAR(20))
--   year (INT, nullable)
--   status (VARCHAR(10))
--   error_message (TEXT)
--   created_at (DATETIME)
-- 
-- Índices:
--   - (import_id, status)
--   - (rut, year)
```

#### 4. `audit_logs` - Logs de Auditoría
```sql
-- Esta tabla se crea automáticamente, NO la crees manualmente
-- Campos principales:
--   id (UUID, PK)
--   user_id (FK a auth_user, nullable)
--   entity (VARCHAR(50), indexado)
--   entity_id (VARCHAR(100), indexado)
--   action (VARCHAR(20), indexado)
--   before (JSON, nullable)
--   after (JSON, nullable)
--   timestamp (DATETIME, indexado)
--   ip_address (VARCHAR(45), nullable)
--   user_agent (TEXT)
-- 
-- Índices:
--   - (entity, entity_id)
--   - (user_id, timestamp)
--   - (action, timestamp)
```

### Tablas del Sistema Django (se crean automáticamente)

- `auth_user` - Usuarios del sistema
- `auth_group` - Grupos de usuarios
- `auth_permission` - Permisos
- `auth_user_groups` - Relación usuarios-grupos
- `auth_user_user_permissions` - Relación usuarios-permisos
- `django_session` - Sesiones
- `django_migrations` - Historial de migraciones
- `django_content_type` - Tipos de contenido
- Y otras tablas del sistema Django

---

## ⚠️ Por qué NO crear tablas manualmente

1. **Django maneja el esquema**: Las migraciones garantizan que la estructura sea correcta
2. **Relaciones y Foreign Keys**: Django crea automáticamente todas las relaciones
3. **Índices**: Django crea todos los índices necesarios según los modelos
4. **Tipos de datos**: Django usa los tipos correctos (UUID, JSON, etc.)
5. **Sincronización**: Si creas tablas manualmente, Django puede tener problemas

---

## Verificar que todo esté correcto

Después de ejecutar `python manage.py migrate`, puedes verificar las tablas creadas:

```sql
-- Ver todas las tablas creadas
SHOW TABLES;

-- Ver estructura de una tabla específica
DESCRIBE tax_grades;
DESCRIBE imports;
DESCRIBE import_records;
DESCRIBE audit_logs;
```

---

## Resumen

✅ **SÍ crear manualmente:**
- Solo la base de datos: `CREATE DATABASE db_proyecto;`

❌ **NO crear manualmente:**
- Ninguna tabla
- Ningún índice
- Ninguna relación

Django se encarga de todo lo demás con `python manage.py migrate`.

