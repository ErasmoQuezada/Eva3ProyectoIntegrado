import json
from django.utils import timezone
from .models import AuditLog


class AuditLogMiddleware:
    """
    Middleware para registrar automáticamente acciones en el log de auditoría.
    Captura requests a la API y registra cambios en modelos.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Solo registrar requests a la API
        if request.path.startswith('/api/'):
            # Obtener información del usuario y request
            user = getattr(request, 'user', None)
            if user and user.is_authenticated:
                request._audit_user = user
                request._audit_ip = self.get_client_ip(request)
                request._audit_user_agent = request.META.get('HTTP_USER_AGENT', '')
        
        response = self.get_response(request)
        return response
    
    def get_client_ip(self, request):
        """Obtiene la IP del cliente"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

