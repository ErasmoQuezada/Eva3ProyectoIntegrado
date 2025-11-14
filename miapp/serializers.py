from rest_framework import serializers
from django.contrib.auth.models import User
from .models import TaxGrade, Import, ImportRecord, AuditLog


class UserSerializer(serializers.ModelSerializer):
    """Serializer para usuarios"""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class TaxGradeSerializer(serializers.ModelSerializer):
    """Serializer para TaxGrade con información de auditoría"""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    updated_by_username = serializers.CharField(source='updated_by.username', read_only=True)
    
    class Meta:
        model = TaxGrade
        fields = [
            'id', 'rut', 'name', 'year', 'source_type', 'amount', 'factor',
            'calculation_basis', 'status', 'created_by', 'created_by_username',
            'created_at', 'updated_by', 'updated_by_username', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_rut(self, value):
        """Validar formato de RUT"""
        if not value or len(value.strip()) == 0:
            raise serializers.ValidationError("El RUT no puede estar vacío")
        return value.strip()
    
    def validate_year(self, value):
        """Validar año"""
        if value < 2000 or value > 2100:
            raise serializers.ValidationError("El año debe estar entre 2000 y 2100")
        return value


class TaxGradeListSerializer(serializers.ModelSerializer):
    """Serializer simplificado para listado de TaxGrade"""
    
    class Meta:
        model = TaxGrade
        fields = ['id', 'rut', 'name', 'year', 'source_type', 'amount', 'status']


class ImportRecordSerializer(serializers.ModelSerializer):
    """Serializer para ImportRecord"""
    
    class Meta:
        model = ImportRecord
        fields = [
            'id', 'import_id', 'row_number_or_page', 'rut', 'year',
            'status', 'error_message', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ImportSerializer(serializers.ModelSerializer):
    """Serializer para Import con records asociados"""
    
    uploader_username = serializers.CharField(source='uploader_id.username', read_only=True)
    records = ImportRecordSerializer(many=True, read_only=True)
    records_count = serializers.SerializerMethodField()
    success_count = serializers.SerializerMethodField()
    error_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Import
        fields = [
            'id', 'uploader_id', 'uploader_username', 'file_name', 'file_hash',
            'file_type', 'uploaded_at', 'status', 'report_path',
            'records', 'records_count', 'success_count', 'error_count'
        ]
        read_only_fields = ['id', 'uploaded_at', 'file_hash']
    
    def get_records_count(self, obj):
        return obj.records.count()
    
    def get_success_count(self, obj):
        return obj.records.filter(status='success').count()
    
    def get_error_count(self, obj):
        return obj.records.filter(status='error').count()


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer para AuditLog"""
    
    user_username = serializers.CharField(source='user_id.username', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user_id', 'user_username', 'entity', 'entity_id',
            'action', 'before', 'after', 'timestamp', 'ip_address', 'user_agent'
        ]
        read_only_fields = ['id', 'timestamp']


class ImportFileSerializer(serializers.Serializer):
    """Serializer para recibir archivos de importación"""
    
    file = serializers.FileField(help_text="Archivo CSV, ZIP o PDF para importar")
    
    def validate_file(self, value):
        """Validar tipo de archivo"""
        allowed_extensions = ['.csv', '.zip', '.pdf', '.xlsx', '.xls']
        file_name = value.name.lower()
        
        if not any(file_name.endswith(ext) for ext in allowed_extensions):
            raise serializers.ValidationError(
                f"Tipo de archivo no permitido. Formatos aceptados: {', '.join(allowed_extensions)}"
            )
        
        # Validar tamaño máximo (50MB)
        if value.size > 50 * 1024 * 1024:
            raise serializers.ValidationError("El archivo es demasiado grande. Máximo 50MB")
        
        return value

