import os
import threading
from io import BytesIO
from django.http import FileResponse, JsonResponse
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django_filters.rest_framework import DjangoFilterBackend

from .models import TaxGrade, Import, ImportRecord, AuditLog, DividendMaintainer
from .serializers import (
    TaxGradeSerializer, TaxGradeListSerializer,
    ImportSerializer, AuditLogSerializer, ImportFileSerializer,
    UserRegistrationSerializer,
    DividendMaintainerSerializer, DividendMaintainerListSerializer
)
from .services import (
    calculate_file_hash, get_file_type, process_csv_file,
    process_zip_file, process_pdf_file, process_excel_file,
    generate_import_report, detect_file_type_by_columns,
    process_dividend_csv, process_dividend_excel
)
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Serializer personalizado para incluir información adicional en el JWT"""
    
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['email'] = user.email
        return token


class CustomTokenObtainPairView(TokenObtainPairView):
    """Vista personalizada para login JWT"""
    serializer_class = CustomTokenObtainPairSerializer


class UserRegistrationView(APIView):
    """Vista para registro de nuevos usuarios"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Registrar un nuevo usuario"""
        serializer = UserRegistrationSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.save()
            
            # Generar tokens JWT para el nuevo usuario
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            
            return Response({
                'message': 'Usuario registrado exitosamente',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name
                },
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TaxGradeViewSet(viewsets.ModelViewSet):
    """
    ViewSet para TaxGrade con CRUD completo y búsqueda avanzada.
    
    Endpoints:
    - GET /api/tax-grades/ - Listar con filtros
    - GET /api/tax-grades/{id}/ - Detalle
    - POST /api/tax-grades/ - Crear
    - PUT /api/tax-grades/{id}/ - Actualizar
    - DELETE /api/tax-grades/{id}/ - Marcar como inactivo
    - GET /api/tax-grades/export/ - Exportar histórico
    """
    
    queryset = TaxGrade.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['rut', 'year', 'source_type', 'status']
    search_fields = ['rut', 'name', 'calculation_basis']
    ordering_fields = ['year', 'rut', 'created_at', 'amount']
    ordering = ['-year', 'rut']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return TaxGradeListSerializer
        return TaxGradeSerializer
    
    def get_queryset(self):
        """Filtros adicionales por query params"""
        queryset = super().get_queryset()
        
        # --- INICIO DEL CAMBIO ---
        # Si el frontend NO está pidiendo un estado específico (ej: buscando 'inactivo'),
        # entonces filtramos por defecto para mostrar SOLO los 'activo'.
        # Así, los que marque como 'inactivo' desaparecerán de la lista visualmente.
        status_param = self.request.query_params.get('status')
        if not status_param:
            queryset = queryset.filter(status='activo')
        # --- FIN DEL CAMBIO ---

        # Filtro por rango de años (Código original)
        year_from = self.request.query_params.get('year_from')
        year_to = self.request.query_params.get('year_to')
        if year_from:
            queryset = queryset.filter(year__gte=int(year_from))
        if year_to:
            queryset = queryset.filter(year__lte=int(year_to))
        
        # Filtro por rango de fechas (Código original)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        return queryset
    
    def perform_create(self, serializer):
        """Crear TaxGrade y registrar auditoría"""
        # Si no se especifica fuente_ingreso, marcar como manual
        if 'fuente_ingreso' not in serializer.validated_data or not serializer.validated_data.get('fuente_ingreso'):
            serializer.validated_data['fuente_ingreso'] = 'manual'
        
        tax_grade = serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user
        )
        
        # Registrar auditoría
        AuditLog.objects.create(
            user_id=self.request.user,
            entity='tax_grades',
            entity_id=str(tax_grade.id),
            action='create',
            after=self._serialize_model(tax_grade),
            ip_address=self._get_client_ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            timestamp=timezone.now()
        )
    
    def perform_update(self, serializer):
        """Actualizar TaxGrade y registrar auditoría"""
        instance = self.get_object()
        before = self._serialize_model(instance)
        
        # Preservar fuente_ingreso original (no se puede cambiar desde el frontend)
        # El campo es read_only en el serializer, pero por seguridad lo preservamos aquí también
        if 'fuente_ingreso' in serializer.validated_data:
            serializer.validated_data['fuente_ingreso'] = instance.fuente_ingreso
        
        tax_grade = serializer.save(updated_by=self.request.user)
        after = self._serialize_model(tax_grade)
        
        # Registrar auditoría
        AuditLog.objects.create(
            user_id=self.request.user,
            entity='tax_grades',
            entity_id=str(tax_grade.id),
            action='update',
            before=before,
            after=after,
            ip_address=self._get_client_ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            timestamp=timezone.now()
        )
    
    def perform_destroy(self, instance):
        """Marcar como inactivo en lugar de borrar"""
        instance.status = 'inactivo'
        instance.updated_by = self.request.user
        instance.save()
        
        # Registrar auditoría
        AuditLog.objects.create(
            user_id=self.request.user,
            entity='tax_grades',
            entity_id=str(instance.id),
            action='delete',
            before=self._serialize_model(instance),
            after={'status': 'inactivo'},
            ip_address=self._get_client_ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            timestamp=timezone.now()
        )
    
    @action(detail=True, methods=['get'])
    def audit(self, request, pk=None):
        """Obtener logs de auditoría para un TaxGrade específico"""
        tax_grade = self.get_object()
        logs = AuditLog.objects.filter(
            entity='tax_grades',
            entity_id=str(tax_grade.id)
        ).order_by('-timestamp')
        
        serializer = AuditLogSerializer(logs, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exportar histórico de TaxGrade (solo años activos)"""
        year = request.query_params.get('year')
        if not year:
            return Response(
                {'error': 'Parámetro "year" es requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            year = int(year)
        except ValueError:
            return Response(
                {'error': 'Año inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(year=year, status='activo')
        serializer = TaxGradeSerializer(queryset, many=True)
        
        return Response({
            'year': year,
            'count': queryset.count(),
            'data': serializer.data
        })
    
    def _serialize_model(self, instance):
        """Serializar instancia para auditoría"""
        return {
            'id': str(instance.id),
            'rut': instance.rut,
            'name': instance.name,
            'year': instance.year,
            'source_type': instance.source_type,
            'fuente_ingreso': instance.fuente_ingreso,
            'amount': str(instance.amount),
            'status': instance.status,
        }
    
    def _get_client_ip(self):
        """Obtener IP del cliente"""
        x_forwarded_for = self.request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = self.request.META.get('REMOTE_ADDR')
        return ip


class ImportViewSet(viewsets.ModelViewSet):
    """
    ViewSet para Import con procesamiento de archivos.
    
    Endpoints:
    - POST /api/imports/ - Subir archivo para procesamiento
    - GET /api/imports/ - Listar imports
    - GET /api/imports/{id}/ - Detalle de import
    - GET /api/imports/{id}/report/ - Descargar reporte
    """
    
    queryset = Import.objects.all()
    serializer_class = ImportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'file_type']
    ordering_fields = ['uploaded_at']
    ordering = ['-uploaded_at']
    
    def get_queryset(self):
        """Filtrar por usuario si no es admin"""
        queryset = super().get_queryset()
        if not self.request.user.is_staff:
            queryset = queryset.filter(uploader_id=self.request.user)
        return queryset
    
    def create(self, request, *args, **kwargs):
        """Procesar archivo de importación"""
        serializer = ImportFileSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        uploaded_file = serializer.validated_data['file']
        file_name = uploaded_file.name
        file_type = get_file_type(file_name)
        
        # Leer contenido del archivo
        file_content = uploaded_file.read()
        uploaded_file.seek(0)  # Reset para posibles relecturas
        
        # Calcular hash
        file_hash = calculate_file_hash(file_content)
        uploaded_file.seek(0)  # Reset nuevamente
        
        # Verificar si ya existe un import con el mismo hash
        existing_import = Import.objects.filter(file_hash=file_hash).first()
        if existing_import:
            return Response(
                {
                    'error': 'Este archivo ya fue importado anteriormente',
                    'existing_import_id': str(existing_import.id),
                    'existing_import_date': existing_import.uploaded_at.isoformat()
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Crear registro de import
        import_obj = Import.objects.create(
            uploader_id=request.user,
            file_name=file_name,
            file_hash=file_hash,
            file_type=file_type,
            status='pending'
        )
        
        # Procesar archivo en background (thread)
        def process_file():
            try:
                import_obj.status = 'processing'
                import_obj.save()
                
                # Guardar archivo
                file_path = settings.IMPORTS_DIR / f"{import_obj.id}_{file_name}"
                with open(file_path, 'wb') as f:
                    f.write(file_content)
                
                # Procesar según tipo
                errors = []
                success_count = 0
                
                uploaded_file.seek(0)  # Reset para procesamiento
                
                # Detectar tipo de archivo (dividendos o tax grades)
                if file_type == 'csv':
                    # Leer headers para detectar tipo
                    import csv
                    from io import StringIO
                    csv_content = uploaded_file.read()
                    uploaded_file.seek(0)
                    
                    # Intentar decodificar
                    for encoding in ['utf-8', 'latin-1', 'cp1252']:
                        try:
                            csv_text = csv_content.decode(encoding)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        csv_text = csv_content.decode('utf-8', errors='replace')
                    
                    reader = csv.DictReader(StringIO(csv_text))
                    headers = [h.lower().strip() for h in reader.fieldnames or []]
                    file_content_type = detect_file_type_by_columns(headers)
                    
                    uploaded_file.seek(0)  # Reset again
                    
                    if file_content_type == 'dividend':
                        success_count, errors = process_dividend_csv(
                            uploaded_file, import_obj, request.user
                        )
                    else:
                        success_count, errors = process_csv_file(
                            uploaded_file, import_obj, request.user
                        )
                elif file_type == 'zip':
                    success_count, errors = process_zip_file(
                        BytesIO(file_content), import_obj, request.user
                    )
                elif file_type == 'pdf':
                    success_count, errors = process_pdf_file(
                        BytesIO(file_content), import_obj, request.user
                    )
                elif file_type == 'xlsx':
                    # Leer headers para detectar tipo
                    import pandas as pd
                    df = pd.read_excel(BytesIO(file_content), nrows=0)
                    headers = [h.lower().strip() for h in df.columns]
                    file_content_type = detect_file_type_by_columns(headers)
                    
                    uploaded_file.seek(0)  # Reset
                    
                    if file_content_type == 'dividend':
                        success_count, errors = process_dividend_excel(
                            BytesIO(file_content), import_obj, request.user
                        )
                    else:
                        success_count, errors = process_excel_file(
                            BytesIO(file_content), import_obj, request.user
                        )
                else:
                    errors.append(f"Tipo de archivo no soportado: {file_type}")
                
                # Generar reporte
                generate_import_report(import_obj, errors)
                
                # Actualizar estado
                import_obj.status = 'done' if success_count > 0 or not errors else 'failed'
                import_obj.save()
                
                # Registrar auditoría
                AuditLog.objects.create(
                    user_id=request.user,
                    entity='imports',
                    entity_id=str(import_obj.id),
                    action='import',
                    after={
                        'file_name': file_name,
                        'status': import_obj.status,
                        'success_count': success_count,
                        'errors_count': len(errors),
                    },
                    timestamp=timezone.now()
                )
                
            except Exception as e:
                logger.error(f"Error procesando import {import_obj.id}: {str(e)}")
                import_obj.status = 'failed'
                import_obj.save()
        
        # Iniciar procesamiento en thread separado
        thread = threading.Thread(target=process_file)
        thread.daemon = True
        thread.start()
        
        return Response(
            ImportSerializer(import_obj).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        """Descargar reporte de importación"""
        import_obj = self.get_object()
        
        if not import_obj.report_path:
            return Response(
                {'error': 'No hay reporte disponible para esta importación'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        report_path = settings.MEDIA_ROOT / import_obj.report_path
        
        if not os.path.exists(report_path):
            return Response(
                {'error': 'Archivo de reporte no encontrado'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return FileResponse(
            open(report_path, 'rb'),
            content_type='text/plain',
            filename=f"report_{import_obj.id}.txt"
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet de solo lectura para AuditLog.
    Solo accesible para usuarios admin/auditor.
    
    Endpoints:
    - GET /api/audit-logs/ - Listar logs
    - GET /api/audit-logs/{id}/ - Detalle de log
    """
    
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['entity', 'action', 'user_id']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        """Filtros adicionales"""
        queryset = super().get_queryset()
        
        entity_id = self.request.query_params.get('entity_id')
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)
        
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
        if date_to:
            queryset = queryset.filter(timestamp__lte=date_to)
        
        return queryset


class DividendMaintainerViewSet(viewsets.ModelViewSet):
    """
    ViewSet para DividendMaintainer con CRUD completo y filtros.
    
    Endpoints:
    - GET /api/dividend-maintainers/ - Listar con filtros
    - GET /api/dividend-maintainers/{id}/ - Detalle
    - POST /api/dividend-maintainers/ - Crear
    - PUT /api/dividend-maintainers/{id}/ - Actualizar
    - DELETE /api/dividend-maintainers/{id}/ - Eliminar
    """
    
    queryset = DividendMaintainer.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['tipo_mercado', 'origen_informacion', 'periodo_comercial', 'origen']
    search_fields = ['instrumento', 'descripcion_dividendo']
    ordering_fields = ['periodo_comercial', 'fecha_pago_dividendo', 'instrumento']
    ordering = ['-periodo_comercial', 'instrumento', 'fecha_pago_dividendo']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return DividendMaintainerListSerializer
        return DividendMaintainerSerializer
    
    def get_queryset(self):
        """Filtros adicionales por query params"""
        queryset = super().get_queryset()
        
        # Filtro por tipo de mercado
        tipo_mercado = self.request.query_params.get('tipo_mercado')
        if tipo_mercado:
            queryset = queryset.filter(tipo_mercado=tipo_mercado)
        
        # Filtro por origen de información
        origen_informacion = self.request.query_params.get('origen_informacion')
        if origen_informacion:
            queryset = queryset.filter(origen_informacion=origen_informacion)
        
        # Filtro por periodo comercial
        periodo_comercial = self.request.query_params.get('periodo_comercial')
        if periodo_comercial:
            try:
                queryset = queryset.filter(periodo_comercial=int(periodo_comercial))
            except ValueError:
                pass
        
        return queryset
    
    def perform_create(self, serializer):
        """Crear DividendMaintainer y registrar auditoría"""
        dividend = serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user
        )
        
        # Registrar auditoría
        AuditLog.objects.create(
            user_id=self.request.user,
            entity='dividend_maintainers',
            entity_id=str(dividend.id),
            action='create',
            after=self._serialize_model(dividend),
            ip_address=self._get_client_ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            timestamp=timezone.now()
        )
    
    def perform_update(self, serializer):
        """Actualizar DividendMaintainer y registrar auditoría"""
        instance = self.get_object()
        before = self._serialize_model(instance)
        
        dividend = serializer.save(updated_by=self.request.user)
        after = self._serialize_model(dividend)
        
        # Registrar auditoría
        AuditLog.objects.create(
            user_id=self.request.user,
            entity='dividend_maintainers',
            entity_id=str(dividend.id),
            action='update',
            before=before,
            after=after,
            ip_address=self._get_client_ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            timestamp=timezone.now()
        )
    
    def perform_destroy(self, instance):
        """Eliminar DividendMaintainer y registrar auditoría"""
        before = self._serialize_model(instance)
        
        # Registrar auditoría antes de eliminar
        AuditLog.objects.create(
            user_id=self.request.user,
            entity='dividend_maintainers',
            entity_id=str(instance.id),
            action='delete',
            before=before,
            after=None,
            ip_address=self._get_client_ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            timestamp=timezone.now()
        )
        
        instance.delete()
    
    def _serialize_model(self, instance):
        """Serializar instancia para auditoría"""
        return {
            'id': str(instance.id),
            'tipo_mercado': instance.tipo_mercado,
            'origen_informacion': instance.origen_informacion,
            'periodo_comercial': instance.periodo_comercial,
            'instrumento': instance.instrumento,
            'fecha_pago_dividendo': str(instance.fecha_pago_dividendo),
            'origen': instance.origen,
        }
    
    def _get_client_ip(self):
        """Obtener IP del cliente"""
        x_forwarded_for = self.request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = self.request.META.get('REMOTE_ADDR')
        return ip
