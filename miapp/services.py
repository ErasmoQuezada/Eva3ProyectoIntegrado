import os
import zipfile
import csv
import hashlib
import pandas as pd
import PyPDF2
from io import StringIO, BytesIO
from pathlib import Path
from django.conf import settings
from django.utils import timezone
from .models import Import, ImportRecord, TaxGrade, AuditLog, DividendMaintainer
import logging

logger = logging.getLogger(__name__)


def calculate_file_hash(file_content):
    """Calcula el hash SHA-256 de un archivo"""
    sha256_hash = hashlib.sha256()
    if isinstance(file_content, bytes):
        sha256_hash.update(file_content)
    else:
        sha256_hash.update(file_content.read())
        file_content.seek(0)  # Reset file pointer
    return sha256_hash.hexdigest()


def get_file_type(file_name):
    """Determina el tipo de archivo por extensión"""
    ext = Path(file_name).suffix.lower()
    type_mapping = {
        '.csv': 'csv',
        '.zip': 'zip',
        '.pdf': 'pdf',
        '.xlsx': 'xlsx',
        '.xls': 'xlsx',
    }
    return type_mapping.get(ext, 'unknown')


def process_csv_file(file_content, import_obj, user):
    """Procesa un archivo CSV y crea registros"""
    errors = []
    success_count = 0
    row_number = 0
    
    try:
        # Leer CSV con manejo de encoding
        if isinstance(file_content, bytes):
            # Intentar diferentes encodings
            for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                try:
                    file_content = StringIO(file_content.decode(encoding))
                    break
                except UnicodeDecodeError:
                    continue
            else:
                # Si todos fallan, usar utf-8 con errors='replace'
                file_content = StringIO(file_content.decode('utf-8', errors='replace'))
        elif hasattr(file_content, 'read'):
            content = file_content.read()
            if isinstance(content, bytes):
                # Intentar diferentes encodings
                for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                    try:
                        file_content = StringIO(content.decode(encoding))
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    # Si todos fallan, usar utf-8 con errors='replace'
                    file_content = StringIO(content.decode('utf-8', errors='replace'))
            else:
                file_content.seek(0)
        
        csv_reader = csv.DictReader(file_content)
        
        for row in csv_reader:
            row_number += 1
            try:
                # Validar campos requeridos
                rut = row.get('rut', '').strip()
                name = row.get('name', '').strip()
                year = row.get('year', '').strip()
                
                if not rut:
                    raise ValueError("RUT es requerido")
                if not name:
                    raise ValueError("Nombre es requerido")
                if not year:
                    raise ValueError("Año es requerido")
                
                try:
                    year = int(year)
                except ValueError:
                    raise ValueError(f"Año inválido: {year}")
                
                # Obtener otros campos opcionales
                source_type = row.get('source_type', 'manual').strip()
                if source_type not in ['declaracion', 'certificado', 'manual', 'calculo']:
                    source_type = 'manual'
                
                amount = row.get('amount', '0').strip()
                try:
                    amount = float(amount) if amount else 0.0
                except ValueError:
                    amount = 0.0
                
                factor = row.get('factor', '').strip()
                try:
                    factor = float(factor) if factor else None
                except ValueError:
                    factor = None
                
                calculation_basis = row.get('calculation_basis', '').strip()
                status = row.get('status', 'activo').strip()
                if status not in ['activo', 'inactivo']:
                    status = 'activo'
                
                # Crear o actualizar TaxGrade
                tax_grade, created = TaxGrade.objects.update_or_create(
                    rut=rut,
                    year=year,
                    defaults={
                        'name': name,
                        'source_type': source_type,
                        'fuente_ingreso': 'archivo',  # Marcar como proveniente de archivo
                        'amount': amount,
                        'factor': factor,
                        'calculation_basis': calculation_basis,
                        'status': status,
                        'updated_by': user,
                    }
                )
                
                if not created:
                    tax_grade.created_by = tax_grade.created_by or user
                    tax_grade.save()
                else:
                    tax_grade.created_by = user
                    tax_grade.save()
                
                # Registrar auditoría
                AuditLog.objects.create(
                    user_id=user,
                    entity='tax_grades',
                    entity_id=str(tax_grade.id),
                    action='import',
                    after={
                        'rut': rut,
                        'name': name,
                        'year': year,
                        'source_type': source_type,
                    },
                    timestamp=timezone.now()
                )
                
                # Crear ImportRecord
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=rut,
                    year=year,
                    status='success',
                )
                success_count += 1
                
            except Exception as e:
                error_msg = str(e)
                errors.append(f"Fila {row_number}: {error_msg}")
                
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=row.get('rut', '')[:20],
                    year=None,
                    status='error',
                    error_message=error_msg[:500],
                )
        
        return success_count, errors
        
    except Exception as e:
        logger.error(f"Error procesando CSV: {str(e)}")
        errors.append(f"Error general al procesar CSV: {str(e)}")
        return success_count, errors


def process_zip_file(file_content, import_obj, user):
    """Procesa un archivo ZIP y extrae archivos CSV"""
    errors = []
    success_count = 0
    
    try:
        with zipfile.ZipFile(file_content, 'r') as zip_ref:
            file_list = zip_ref.namelist()
            
            for file_name in file_list:
                if file_name.lower().endswith('.csv'):
                    try:
                        with zip_ref.open(file_name) as csv_file:
                            csv_content = csv_file.read()
                            count, file_errors = process_csv_file(
                                csv_content, import_obj, user
                            )
                            success_count += count
                            errors.extend(file_errors)
                    except Exception as e:
                        errors.append(f"Error procesando {file_name}: {str(e)}")
                elif file_name.lower().endswith('.pdf'):
                    errors.append(f"PDFs dentro de ZIP no se procesan automáticamente: {file_name}")
        
        return success_count, errors
        
    except Exception as e:
        logger.error(f"Error procesando ZIP: {str(e)}")
        errors.append(f"Error general al procesar ZIP: {str(e)}")
        return success_count, errors


def process_pdf_file(file_content, import_obj, user):
    """Procesa un archivo PDF (implementación básica)"""
    errors = []
    success_count = 0
    
    try:
        pdf_reader = PyPDF2.PdfReader(file_content)
        page_number = 0
        
        for page in pdf_reader.pages:
            page_number += 1
            text = page.extract_text()
            
            # Esta es una implementación básica. En producción necesitarías
            # un parser más sofisticado para extraer datos estructurados del PDF
            # Por ahora, solo registramos que se leyó la página
            
            ImportRecord.objects.create(
                import_id=import_obj,
                row_number_or_page=page_number,
                rut='',
                year=None,
                status='warning',
                error_message=f"PDF procesado - Página {page_number}. Extracción automática no implementada.",
            )
        
        errors.append("Procesamiento de PDF requiere implementación de parser específico")
        
        return success_count, errors
        
    except Exception as e:
        logger.error(f"Error procesando PDF: {str(e)}")
        errors.append(f"Error general al procesar PDF: {str(e)}")
        return success_count, errors


def process_excel_file(file_content, import_obj, user):
    """Procesa un archivo Excel (XLSX/XLS)"""
    errors = []
    success_count = 0
    row_number = 0
    
    try:
        # Leer Excel con pandas
        df = pd.read_excel(file_content)
        
        # Normalizar nombres de columnas
        df.columns = df.columns.str.lower().str.strip()
        
        required_columns = ['rut', 'name', 'year']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            errors.append(f"Columnas faltantes: {', '.join(missing_columns)}")
            return success_count, errors
        
        for _, row in df.iterrows():
            row_number += 1
            try:
                rut = str(row.get('rut', '')).strip()
                name = str(row.get('name', '')).strip()
                year = row.get('year', None)
                
                if pd.isna(rut) or not rut:
                    raise ValueError("RUT es requerido")
                if pd.isna(name) or not name:
                    raise ValueError("Nombre es requerido")
                if pd.isna(year):
                    raise ValueError("Año es requerido")
                
                year = int(year)
                
                source_type = str(row.get('source_type', 'manual')).strip()
                if source_type not in ['declaracion', 'certificado', 'manual', 'calculo']:
                    source_type = 'manual'
                
                amount = row.get('amount', 0)
                if pd.isna(amount):
                    amount = 0.0
                amount = float(amount)
                
                factor = row.get('factor', None)
                if pd.notna(factor):
                    try:
                        factor = float(factor)
                    except (ValueError, TypeError):
                        factor = None
                else:
                    factor = None
                
                calculation_basis = str(row.get('calculation_basis', '')).strip()
                status = str(row.get('status', 'activo')).strip()
                if status not in ['activo', 'inactivo']:
                    status = 'activo'
                
                # Crear o actualizar TaxGrade
                tax_grade, created = TaxGrade.objects.update_or_create(
                    rut=rut,
                    year=year,
                    defaults={
                        'name': name,
                        'source_type': source_type,
                        'fuente_ingreso': 'archivo',  # Marcar como proveniente de archivo
                        'amount': amount,
                        'factor': factor,
                        'calculation_basis': calculation_basis,
                        'status': status,
                        'updated_by': user,
                    }
                )
                
                if not created:
                    tax_grade.created_by = tax_grade.created_by or user
                    tax_grade.save()
                else:
                    tax_grade.created_by = user
                    tax_grade.save()
                
                # Registrar auditoría
                AuditLog.objects.create(
                    user_id=user,
                    entity='tax_grades',
                    entity_id=str(tax_grade.id),
                    action='import',
                    after={
                        'rut': rut,
                        'name': name,
                        'year': year,
                        'source_type': source_type,
                    },
                    timestamp=timezone.now()
                )
                
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=rut,
                    year=year,
                    status='success',
                )
                success_count += 1
                
            except Exception as e:
                error_msg = str(e)
                errors.append(f"Fila {row_number}: {error_msg}")
                
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=str(row.get('rut', ''))[:20],
                    year=None,
                    status='error',
                    error_message=error_msg[:500],
                )
        
        return success_count, errors
        
    except Exception as e:
        logger.error(f"Error procesando Excel: {str(e)}")
        errors.append(f"Error general al procesar Excel: {str(e)}")
        return success_count, errors


def generate_import_report(import_obj, errors):
    """Genera un reporte de importación en formato texto"""
    report_lines = [
        f"Reporte de Importación - {import_obj.file_name}",
        f"Fecha: {import_obj.uploaded_at.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Estado: {import_obj.get_status_display()}",
        f"Tipo de archivo: {import_obj.get_file_type_display()}",
        "",
        f"Total de registros: {import_obj.records.count()}",
        f"Exitosos: {import_obj.records.filter(status='success').count()}",
        f"Errores: {import_obj.records.filter(status='error').count()}",
        f"Advertencias: {import_obj.records.filter(status='warning').count()}",
        "",
    ]
    
    if errors:
        report_lines.append("=== ERRORES ===")
        for error in errors:
            report_lines.append(f"- {error}")
        report_lines.append("")
    
    # Agregar detalles de registros con error
    error_records = import_obj.records.filter(status='error')
    if error_records.exists():
        report_lines.append("=== DETALLE DE ERRORES ===")
        for record in error_records[:50]:  # Limitar a 50 errores
            report_lines.append(
                f"Fila {record.row_number_or_page}: {record.error_message}"
            )
        if error_records.count() > 50:
            report_lines.append(f"... y {error_records.count() - 50} errores más")
    
    report_content = "\n".join(report_lines)
    
    # Guardar reporte
    report_file_name = f"report_{import_obj.id}.txt"
    report_path = settings.REPORTS_DIR / report_file_name
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report_content)
    
    import_obj.report_path = str(report_path.relative_to(settings.MEDIA_ROOT))
    import_obj.save()
    
    return report_path


def detect_file_type_by_columns(headers):
    """Detecta si un archivo es de dividendos o tax grades basándose en las columnas"""
    dividend_columns = ['periodo_comercial', 'tipo_mercado', 'instrumento', 'fecha_pago_dividendo']
    tax_grade_columns = ['rut', 'name', 'year']
    
    has_dividend_cols = any(col in headers for col in dividend_columns)
    has_tax_grade_cols = any(col in headers for col in tax_grade_columns)
    
    if has_dividend_cols:
        return 'dividend'
    elif has_tax_grade_cols:
        return 'tax_grade'
    else:
        return 'unknown'


def process_dividend_csv(file_content, import_obj, user):
    """Procesa un archivo CSV de dividendos y crea/actualiza registros"""
    errors = []
    success_count = 0
    update_count = 0
    create_count = 0
    row_number = 0
    
    try:
        # Leer CSV con manejo de encoding
        if isinstance(file_content, bytes):
            for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                try:
                    file_content = StringIO(file_content.decode(encoding))
                    break
                except UnicodeDecodeError:
                    continue
            else:
                file_content = StringIO(file_content.decode('utf-8', errors='replace'))
        elif hasattr(file_content, 'read'):
            content = file_content.read()
            if isinstance(content, bytes):
                for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                    try:
                        file_content = StringIO(content.decode(encoding))
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    file_content = StringIO(content.decode('utf-8', errors='replace'))
            else:
                file_content.seek(0)
        
        csv_reader = csv.DictReader(file_content)
        headers = [h.lower().strip() for h in csv_reader.fieldnames or []]
        
        for row in csv_reader:
            row_number += 1
            try:
                # Validar campos requeridos
                periodo_comercial = row.get('periodo_comercial', '').strip()
                tipo_mercado = row.get('tipo_mercado', '').strip()
                instrumento = row.get('instrumento', '').strip()
                fecha_pago = row.get('fecha_pago_dividendo', '').strip()
                secuencia = row.get('secuencia_evento_capital', '').strip()
                
                if not periodo_comercial:
                    raise ValueError("periodo_comercial es requerido")
                if not tipo_mercado:
                    raise ValueError("tipo_mercado es requerido")
                if not instrumento:
                    raise ValueError("instrumento es requerido")
                if not fecha_pago:
                    raise ValueError("fecha_pago_dividendo es requerido")
                
                try:
                    periodo_comercial = int(periodo_comercial)
                except ValueError:
                    raise ValueError(f"periodo_comercial inválido: {periodo_comercial}")
                
                if tipo_mercado not in ['acciones', 'cfi', 'fondos_mutuos']:
                    raise ValueError(f"tipo_mercado inválido: {tipo_mercado}")
                
                # Parsear fecha
                from datetime import datetime
                try:
                    fecha_pago_date = datetime.strptime(fecha_pago, '%Y-%m-%d').date()
                except ValueError:
                    raise ValueError(f"fecha_pago_dividendo inválida (formato: YYYY-MM-DD): {fecha_pago}")
                
                # Secuencia opcional pero si está presente debe ser > 10000
                secuencia_int = None
                if secuencia:
                    try:
                        secuencia_int = int(secuencia)
                        if secuencia_int <= 10000:
                            raise ValueError("secuencia_evento_capital debe ser superior a 10000")
                    except ValueError as e:
                        raise ValueError(f"secuencia_evento_capital inválida: {str(e)}")
                
                # Obtener campos opcionales
                descripcion = row.get('descripcion_dividendo', '').strip()
                origen_informacion = row.get('origen_informacion', 'sistema').strip()
                if origen_informacion not in ['corredora', 'sistema']:
                    origen_informacion = 'sistema'
                
                dividendo = row.get('dividendo', '0').strip()
                try:
                    dividendo = float(dividendo) if dividendo else 0.0
                except ValueError:
                    dividendo = 0.0
                
                factor_actualizacion = row.get('factor_actualizacion', '').strip()
                try:
                    factor_actualizacion = float(factor_actualizacion) if factor_actualizacion else None
                except ValueError:
                    factor_actualizacion = None
                
                valor_historico = row.get('valor_historico', '').strip()
                try:
                    valor_historico = float(valor_historico) if valor_historico else None
                except ValueError:
                    valor_historico = None
                
                acogido_isfut = row.get('acogido_isfut_isift', 'ninguno').strip()
                if acogido_isfut not in ['isfut', 'isift', 'ninguno']:
                    acogido_isfut = 'ninguno'
                
                # Recopilar factores (factor_1 a factor_31)
                factores = {}
                for i in range(1, 32):
                    factor_key = f'factor_{i}'
                    factor_value = row.get(factor_key, '').strip()
                    if factor_value:
                        try:
                            factor_val = float(factor_value)
                            factores[factor_key] = {
                                'nombre': f'Factor-{i+7}' if i <= 31 else f'Factor {i}',
                                'valor': factor_val
                            }
                        except ValueError:
                            pass  # Ignorar factores inválidos
                
                # LLAVE ÚNICA: periodo_comercial + instrumento + fecha_pago_dividendo + secuencia_evento_capital
                # Buscar registro existente
                lookup_kwargs = {
                    'periodo_comercial': periodo_comercial,
                    'instrumento': instrumento,
                    'fecha_pago_dividendo': fecha_pago_date,
                }
                
                if secuencia_int:
                    lookup_kwargs['secuencia_evento_capital'] = secuencia_int
                
                # Obtener registro existente si existe
                existing = DividendMaintainer.objects.filter(**lookup_kwargs).first()
                
                # Preparar datos para actualización/creación
                defaults = {
                    'tipo_mercado': tipo_mercado,
                    'origen_informacion': origen_informacion,
                    'origen': origen_informacion,
                    'descripcion_dividendo': descripcion,
                    'acogido_isfut_isift': acogido_isfut,
                    'dividendo': dividendo,
                    'factor_actualizacion': factor_actualizacion,
                    'valor_historico': valor_historico,
                    'factores_8_37': factores,
                    'updated_by': user,
                }
                
                if existing:
                    # ACTUALIZAR registro existente
                    before_data = {
                        'factores_8_37': existing.factores_8_37,
                        'dividendo': str(existing.dividendo),
                        'factor_actualizacion': str(existing.factor_actualizacion) if existing.factor_actualizacion else None,
                        'updated_at': existing.updated_at.isoformat() if existing.updated_at else None,
                    }
                    
                    # Actualizar campos
                    for key, value in defaults.items():
                        setattr(existing, key, value)
                    existing.save()
                    
                    after_data = {
                        'factores_8_37': existing.factores_8_37,
                        'dividendo': str(existing.dividendo),
                        'factor_actualizacion': str(existing.factor_actualizacion) if existing.factor_actualizacion else None,
                        'updated_at': existing.updated_at.isoformat() if existing.updated_at else None,
                    }
                    
                    # Registrar auditoría de actualización
                    AuditLog.objects.create(
                        user_id=user,
                        entity='dividend_maintainers',
                        entity_id=str(existing.id),
                        action='update',
                        before=before_data,
                        after=after_data,
                        ip_address=None,
                        user_agent='Bulk Import',
                        timestamp=timezone.now()
                    )
                    
                    update_count += 1
                    action_type = 'actualizado'
                    
                else:
                    # CREAR nuevo registro
                    dividend = DividendMaintainer.objects.create(
                        periodo_comercial=periodo_comercial,
                        tipo_mercado=tipo_mercado,
                        origen_informacion=origen_informacion,
                        origen=origen_informacion,
                        instrumento=instrumento,
                        fecha_pago_dividendo=fecha_pago_date,
                        secuencia_evento_capital=secuencia_int,
                        descripcion_dividendo=descripcion,
                        acogido_isfut_isift=acogido_isfut,
                        dividendo=dividendo,
                        factor_actualizacion=factor_actualizacion,
                        valor_historico=valor_historico,
                        factores_8_37=factores,
                        created_by=user,
                        updated_by=user,
                    )
                    
                    after_data = {
                        'periodo_comercial': periodo_comercial,
                        'instrumento': instrumento,
                        'fecha_pago_dividendo': str(fecha_pago_date),
                        'factores_8_37': factores,
                        'created_at': dividend.created_at.isoformat() if dividend.created_at else None,
                    }
                    
                    # Registrar auditoría de creación
                    AuditLog.objects.create(
                        user_id=user,
                        entity='dividend_maintainers',
                        entity_id=str(dividend.id),
                        action='create',
                        before=None,
                        after=after_data,
                        ip_address=None,
                        user_agent='Bulk Import',
                        timestamp=timezone.now()
                    )
                    
                    create_count += 1
                    action_type = 'creado'
                    existing = dividend
                
                # Crear ImportRecord
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=instrumento[:20],  # Usar instrumento como identificador
                    year=periodo_comercial,
                    status='success',
                    error_message=f"Registro {action_type} exitosamente"
                )
                success_count += 1
                
            except Exception as e:
                error_msg = str(e)
                errors.append(f"Fila {row_number}: {error_msg}")
                
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=row.get('instrumento', '')[:20] if 'instrumento' in row else '',
                    year=None,
                    status='error',
                    error_message=error_msg[:500],
                )
        
        # Agregar resumen al final
        if success_count > 0:
            errors.append(f"RESUMEN: {create_count} registros creados, {update_count} registros actualizados")
        
        return success_count, errors
        
    except Exception as e:
        logger.error(f"Error procesando CSV de dividendos: {str(e)}")
        errors.append(f"Error general al procesar CSV: {str(e)}")
        return success_count, errors


def process_dividend_excel(file_content, import_obj, user):
    """Procesa un archivo Excel de dividendos y crea/actualiza registros"""
    errors = []
    success_count = 0
    update_count = 0
    create_count = 0
    row_number = 0
    
    try:
        # Leer Excel con pandas
        df = pd.read_excel(file_content)
        
        # Normalizar nombres de columnas
        df.columns = df.columns.str.lower().str.strip()
        
        required_columns = ['periodo_comercial', 'tipo_mercado', 'instrumento', 'fecha_pago_dividendo']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            errors.append(f"Columnas faltantes: {', '.join(missing_columns)}")
            return success_count, errors
        
        for _, row in df.iterrows():
            row_number += 1
            try:
                # Similar a process_dividend_csv pero usando pandas
                periodo_comercial = row.get('periodo_comercial', None)
                tipo_mercado = str(row.get('tipo_mercado', '')).strip()
                instrumento = str(row.get('instrumento', '')).strip()
                fecha_pago = row.get('fecha_pago_dividendo', None)
                secuencia = row.get('secuencia_evento_capital', None)
                
                if pd.isna(periodo_comercial):
                    raise ValueError("periodo_comercial es requerido")
                if not tipo_mercado or pd.isna(tipo_mercado):
                    raise ValueError("tipo_mercado es requerido")
                if not instrumento or pd.isna(instrumento):
                    raise ValueError("instrumento es requerido")
                if pd.isna(fecha_pago):
                    raise ValueError("fecha_pago_dividendo es requerido")
                
                periodo_comercial = int(periodo_comercial)
                
                if tipo_mercado not in ['acciones', 'cfi', 'fondos_mutuos']:
                    raise ValueError(f"tipo_mercado inválido: {tipo_mercado}")
                
                # Parsear fecha
                from datetime import datetime
                if isinstance(fecha_pago, str):
                    fecha_pago_date = datetime.strptime(fecha_pago, '%Y-%m-%d').date()
                elif hasattr(fecha_pago, 'date'):
                    fecha_pago_date = fecha_pago.date()
                else:
                    raise ValueError(f"fecha_pago_dividendo inválida: {fecha_pago}")
                
                secuencia_int = None
                if not pd.isna(secuencia):
                    try:
                        secuencia_int = int(secuencia)
                        if secuencia_int <= 10000:
                            raise ValueError("secuencia_evento_capital debe ser superior a 10000")
                    except (ValueError, TypeError) as e:
                        raise ValueError(f"secuencia_evento_capital inválida: {str(e)}")
                
                # Obtener campos opcionales
                descripcion = str(row.get('descripcion_dividendo', '')).strip() if not pd.isna(row.get('descripcion_dividendo')) else ''
                origen_informacion = str(row.get('origen_informacion', 'sistema')).strip()
                if origen_informacion not in ['corredora', 'sistema']:
                    origen_informacion = 'sistema'
                
                dividendo = row.get('dividendo', 0)
                if pd.isna(dividendo):
                    dividendo = 0.0
                dividendo = float(dividendo)
                
                factor_actualizacion = row.get('factor_actualizacion', None)
                if pd.notna(factor_actualizacion):
                    try:
                        factor_actualizacion = float(factor_actualizacion)
                    except (ValueError, TypeError):
                        factor_actualizacion = None
                else:
                    factor_actualizacion = None
                
                valor_historico = row.get('valor_historico', None)
                if pd.notna(valor_historico):
                    try:
                        valor_historico = float(valor_historico)
                    except (ValueError, TypeError):
                        valor_historico = None
                else:
                    valor_historico = None
                
                acogido_isfut = str(row.get('acogido_isfut_isift', 'ninguno')).strip()
                if acogido_isfut not in ['isfut', 'isift', 'ninguno']:
                    acogido_isfut = 'ninguno'
                
                # Recopilar factores
                factores = {}
                for i in range(1, 32):
                    factor_key = f'factor_{i}'
                    if factor_key in df.columns:
                        factor_value = row.get(factor_key)
                        if pd.notna(factor_value):
                            try:
                                factor_val = float(factor_value)
                                factores[factor_key] = {
                                    'nombre': f'Factor-{i+7}' if i <= 31 else f'Factor {i}',
                                    'valor': factor_val
                                }
                            except (ValueError, TypeError):
                                pass
                
                # LLAVE ÚNICA: periodo_comercial + instrumento + fecha_pago_dividendo + secuencia_evento_capital
                lookup_kwargs = {
                    'periodo_comercial': periodo_comercial,
                    'instrumento': instrumento,
                    'fecha_pago_dividendo': fecha_pago_date,
                }
                
                if secuencia_int:
                    lookup_kwargs['secuencia_evento_capital'] = secuencia_int
                
                existing = DividendMaintainer.objects.filter(**lookup_kwargs).first()
                
                defaults = {
                    'tipo_mercado': tipo_mercado,
                    'origen_informacion': origen_informacion,
                    'origen': origen_informacion,
                    'descripcion_dividendo': descripcion,
                    'acogido_isfut_isift': acogido_isfut,
                    'dividendo': dividendo,
                    'factor_actualizacion': factor_actualizacion,
                    'valor_historico': valor_historico,
                    'factores_8_37': factores,
                    'updated_by': user,
                }
                
                if existing:
                    # ACTUALIZAR
                    before_data = {
                        'factores_8_37': existing.factores_8_37,
                        'dividendo': str(existing.dividendo),
                        'factor_actualizacion': str(existing.factor_actualizacion) if existing.factor_actualizacion else None,
                        'updated_at': existing.updated_at.isoformat() if existing.updated_at else None,
                    }
                    
                    for key, value in defaults.items():
                        setattr(existing, key, value)
                    existing.save()
                    
                    after_data = {
                        'factores_8_37': existing.factores_8_37,
                        'dividendo': str(existing.dividendo),
                        'factor_actualizacion': str(existing.factor_actualizacion) if existing.factor_actualizacion else None,
                        'updated_at': existing.updated_at.isoformat() if existing.updated_at else None,
                    }
                    
                    AuditLog.objects.create(
                        user_id=user,
                        entity='dividend_maintainers',
                        entity_id=str(existing.id),
                        action='update',
                        before=before_data,
                        after=after_data,
                        ip_address=None,
                        user_agent='Bulk Import',
                        timestamp=timezone.now()
                    )
                    
                    update_count += 1
                    action_type = 'actualizado'
                else:
                    # CREAR
                    dividend = DividendMaintainer.objects.create(
                        periodo_comercial=periodo_comercial,
                        tipo_mercado=tipo_mercado,
                        origen_informacion=origen_informacion,
                        origen=origen_informacion,
                        instrumento=instrumento,
                        fecha_pago_dividendo=fecha_pago_date,
                        secuencia_evento_capital=secuencia_int,
                        descripcion_dividendo=descripcion,
                        acogido_isfut_isift=acogido_isfut,
                        dividendo=dividendo,
                        factor_actualizacion=factor_actualizacion,
                        valor_historico=valor_historico,
                        factores_8_37=factores,
                        created_by=user,
                        updated_by=user,
                    )
                    
                    after_data = {
                        'periodo_comercial': periodo_comercial,
                        'instrumento': instrumento,
                        'fecha_pago_dividendo': str(fecha_pago_date),
                        'factores_8_37': factores,
                        'created_at': dividend.created_at.isoformat() if dividend.created_at else None,
                    }
                    
                    AuditLog.objects.create(
                        user_id=user,
                        entity='dividend_maintainers',
                        entity_id=str(dividend.id),
                        action='create',
                        before=None,
                        after=after_data,
                        ip_address=None,
                        user_agent='Bulk Import',
                        timestamp=timezone.now()
                    )
                    
                    create_count += 1
                    action_type = 'creado'
                    existing = dividend
                
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=instrumento[:20],
                    year=periodo_comercial,
                    status='success',
                    error_message=f"Registro {action_type} exitosamente"
                )
                success_count += 1
                
            except Exception as e:
                error_msg = str(e)
                errors.append(f"Fila {row_number}: {error_msg}")
                
                ImportRecord.objects.create(
                    import_id=import_obj,
                    row_number_or_page=row_number,
                    rut=str(row.get('instrumento', ''))[:20] if 'instrumento' in row else '',
                    year=None,
                    status='error',
                    error_message=error_msg[:500],
                )
        
        if success_count > 0:
            errors.append(f"RESUMEN: {create_count} registros creados, {update_count} registros actualizados")
        
        return success_count, errors
        
    except Exception as e:
        logger.error(f"Error procesando Excel de dividendos: {str(e)}")
        errors.append(f"Error general al procesar Excel: {str(e)}")
        return success_count, errors

