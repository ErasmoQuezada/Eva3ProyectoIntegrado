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
from .models import Import, ImportRecord, TaxGrade, AuditLog
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
        # Leer CSV
        if isinstance(file_content, bytes):
            file_content = StringIO(file_content.decode('utf-8'))
        elif hasattr(file_content, 'read'):
            content = file_content.read()
            if isinstance(content, bytes):
                file_content = StringIO(content.decode('utf-8'))
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

