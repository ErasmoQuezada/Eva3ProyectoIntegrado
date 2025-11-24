"""
URL configuration for miproyecto project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from miapp.views import (
    TaxGradeViewSet,
    ImportViewSet,
    AuditLogViewSet,
    CustomTokenObtainPairView,
    UserRegistrationView
)

# Router para ViewSets
router = DefaultRouter()
router.register(r'tax-grades', TaxGradeViewSet, basename='taxgrade')
router.register(r'imports', ImportViewSet, basename='import')
router.register(r'audit-logs', AuditLogViewSet, basename='auditlog')

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API endpoints (deben ir antes del frontend para que tengan prioridad)
    path('api/auth/register/', UserRegistrationView.as_view(), name='user_register'),
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include(router.urls)),
    
    # Frontend (debe ir al final para capturar todas las demás rutas)
    path('', include('miapp.urls_frontend')),
]

# Servir archivos media y static en desarrollo
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    from django.contrib.staticfiles.urls import staticfiles_urlpatterns
    urlpatterns += staticfiles_urlpatterns()
