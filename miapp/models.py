import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import json


class TaxGrade(models.Model):
    """Modelo para calificaciones tributarias"""
    
    SOURCE_TYPE_CHOICES = [
        ('declaracion', 'Declaración'),
        ('certificado', 'Certificado'),
        ('manual', 'Manual'),
        ('calculo', 'Cálculo'),
    ]
    
    STATUS_CHOICES = [
        ('activo', 'Activo'),
        ('inactivo', 'Inactivo'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rut = models.CharField(max_length=20, db_index=True, help_text="RUT/ID del contribuyente")
    name = models.CharField(max_length=255)
    year = models.IntegerField(db_index=True, help_text="Ejercicio fiscal (2023, 2024, ...)")
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES, db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2, help_text="Monto dividendos u otro valor")
    factor = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, help_text="Factor si aplica")
    calculation_basis = models.TextField(blank=True, help_text="Descripción / fórmulas usadas")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='activo', db_index=True)
    
    # Campos de auditoría
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='tax_grades_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='tax_grades_updated')
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tax_grades'
        indexes = [
            models.Index(fields=['rut', 'year']),  # Índice compuesto para búsquedas rápidas
            models.Index(fields=['source_type']),
            models.Index(fields=['status']),
            models.Index(fields=['year']),
        ]
        ordering = ['-year', 'rut']
    
    def __str__(self):
        return f"{self.rut} - {self.year} - {self.name}"


class Import(models.Model):
    """Modelo para importaciones masivas de archivos"""
    
    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('processing', 'Procesando'),
        ('done', 'Completado'),
        ('failed', 'Fallido'),
    ]
    
    FILE_TYPE_CHOICES = [
        ('csv', 'CSV'),
        ('zip', 'ZIP'),
        ('pdf', 'PDF'),
        ('xlsx', 'Excel'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploader_id = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='imports')
    file_name = models.CharField(max_length=255)
    file_hash = models.CharField(max_length=64, help_text="SHA-256 hash del archivo")
    file_type = models.CharField(max_length=10, choices=FILE_TYPE_CHOICES)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    report_path = models.CharField(max_length=500, blank=True, help_text="Ruta al reporte de importación")
    
    class Meta:
        db_table = 'imports'
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"{self.file_name} - {self.status}"


class ImportRecord(models.Model):
    """Registros individuales asociados a cada importación"""
    
    STATUS_CHOICES = [
        ('success', 'Éxito'),
        ('error', 'Error'),
        ('warning', 'Advertencia'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_id = models.ForeignKey(Import, on_delete=models.CASCADE, related_name='records')
    row_number_or_page = models.IntegerField(help_text="Número de fila o página del archivo")
    rut = models.CharField(max_length=20, blank=True)
    year = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    error_message = models.TextField(blank=True, help_text="Mensaje de error si aplica")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'import_records'
        indexes = [
            models.Index(fields=['import_id', 'status']),
            models.Index(fields=['rut', 'year']),
        ]
    
    def __str__(self):
        return f"Import {self.import_id.file_name} - Row {self.row_number_or_page} - {self.status}"


class AuditLog(models.Model):
    """Log de auditoría para todas las acciones"""
    
    ACTION_CHOICES = [
        ('create', 'Crear'),
        ('update', 'Actualizar'),
        ('delete', 'Eliminar'),
        ('import', 'Importar'),
        ('export', 'Exportar'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    entity = models.CharField(max_length=50, db_index=True, help_text="Entidad afectada (ej. 'tax_grades')")
    entity_id = models.CharField(max_length=100, db_index=True, help_text="ID de la entidad afectada")
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    before = models.JSONField(null=True, blank=True, help_text="Estado anterior (JSON)")
    after = models.JSONField(null=True, blank=True, help_text="Estado posterior (JSON)")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    class Meta:
        db_table = 'audit_logs'
        indexes = [
            models.Index(fields=['entity', 'entity_id']),
            models.Index(fields=['user_id', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
        ]
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.action} {self.entity} by {self.user_id} at {self.timestamp}"
