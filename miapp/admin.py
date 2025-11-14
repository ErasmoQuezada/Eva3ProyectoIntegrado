from django.contrib import admin
from .models import TaxGrade, Import, ImportRecord, AuditLog


@admin.register(TaxGrade)
class TaxGradeAdmin(admin.ModelAdmin):
    list_display = ['rut', 'name', 'year', 'source_type', 'amount', 'status', 'created_at']
    list_filter = ['year', 'source_type', 'status', 'created_at']
    search_fields = ['rut', 'name']
    readonly_fields = ['id', 'created_at', 'updated_at']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        ('Información Principal', {
            'fields': ('rut', 'name', 'year', 'source_type', 'status')
        }),
        ('Valores', {
            'fields': ('amount', 'factor', 'calculation_basis')
        }),
        ('Auditoría', {
            'fields': ('created_by', 'created_at', 'updated_by', 'updated_at', 'id')
        }),
    )


@admin.register(Import)
class ImportAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'file_type', 'status', 'uploader_id', 'uploaded_at']
    list_filter = ['status', 'file_type', 'uploaded_at']
    search_fields = ['file_name', 'file_hash']
    readonly_fields = ['id', 'file_hash', 'uploaded_at']
    date_hierarchy = 'uploaded_at'


@admin.register(ImportRecord)
class ImportRecordAdmin(admin.ModelAdmin):
    list_display = ['import_id', 'row_number_or_page', 'rut', 'year', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['rut', 'error_message']
    readonly_fields = ['id', 'created_at']
    date_hierarchy = 'created_at'


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['user_id', 'entity', 'entity_id', 'action', 'timestamp']
    list_filter = ['entity', 'action', 'timestamp']
    search_fields = ['user_id__username', 'entity_id']
    readonly_fields = ['id', 'timestamp']
    date_hierarchy = 'timestamp'
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
