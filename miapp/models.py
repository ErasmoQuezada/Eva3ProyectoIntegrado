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
    
    INGRESO_SOURCE_CHOICES = [
        ('archivo', 'Archivo de Carga'),
        ('manual', 'Ingreso Manual'),
        ('sistema', 'Proveniente del Sistema'),
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
    fuente_ingreso = models.CharField(max_length=20, choices=INGRESO_SOURCE_CHOICES, default='manual', db_index=True, help_text="Fuente de ingreso de la calificación")
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
            models.Index(fields=['fuente_ingreso']),
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


class DividendMaintainer(models.Model):
    """Modelo para mantenedor de dividendos"""
    
    MARKET_TYPE_CHOICES = [
        ('acciones', 'Acciones'),
        ('cfi', 'CFI'),
        ('fondos_mutuos', 'Fondos Mutuos'),
    ]
    
    ORIGIN_CHOICES = [
        ('corredora', 'Corredora'),
        ('sistema', 'Sistema'),
    ]
    
    ISFUT_ISIFT_CHOICES = [
        ('isfut', 'ISFUT'),
        ('isift', 'ISIFT'),
        ('ninguno', 'Ninguno'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Filtros
    tipo_mercado = models.CharField(max_length=20, choices=MARKET_TYPE_CHOICES, db_index=True, help_text="Tipo de mercado")
    origen_informacion = models.CharField(max_length=20, choices=ORIGIN_CHOICES, db_index=True, help_text="Origen de la información")
    periodo_comercial = models.IntegerField(db_index=True, help_text="Año del periodo comercial")
    
    # Campos de la grilla
    instrumento = models.CharField(max_length=255, help_text="Instrumento financiero")
    fecha_pago_dividendo = models.DateField(help_text="Fecha de pago del dividendo")
    descripcion_dividendo = models.TextField(blank=True, help_text="Descripción del dividendo")
    secuencia_evento_capital = models.IntegerField(null=True, blank=True, help_text="Secuencia del evento de capital")
    acogido_isfut_isift = models.CharField(max_length=10, choices=ISFUT_ISIFT_CHOICES, default='ninguno', help_text="Acogido a ISFUT/ISIFT")
    origen = models.CharField(max_length=20, choices=ORIGIN_CHOICES, help_text="Origen (corredora o sistema)")
    factor_actualizacion = models.DecimalField(max_digits=15, decimal_places=6, null=True, blank=True, help_text="Factor de actualización")
    dividendo = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text="Dividendo")
    valor_historico = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text="Valor histórico")
    
    # Campos detallados del SII (29 campos según homologación)
    campos_detallados_sii = models.JSONField(default=dict, blank=True, help_text="29 campos detallados del certificado SII")
    
    # Factores del 8 al 37 (almacenados como JSON)
    factores_8_37 = models.JSONField(default=dict, blank=True, help_text="Factores del 8 al 37 con sus nombres")
    
    # Campos de auditoría
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='dividend_maintainers_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='dividend_maintainers_updated')
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'dividend_maintainers'
        indexes = [
            models.Index(fields=['tipo_mercado', 'origen_informacion', 'periodo_comercial']),
            models.Index(fields=['periodo_comercial']),
            models.Index(fields=['tipo_mercado']),
            models.Index(fields=['origen_informacion']),
            models.Index(fields=['instrumento']),
            # Índice compuesto para la llave única de actualización
            models.Index(fields=['periodo_comercial', 'instrumento', 'fecha_pago_dividendo', 'secuencia_evento_capital'], name='dividend_unique_key_idx'),
        ]
        ordering = ['-periodo_comercial', 'instrumento', 'fecha_pago_dividendo']
    
    def __str__(self):
        return f"{self.instrumento} - {self.periodo_comercial} - {self.fecha_pago_dividendo}"