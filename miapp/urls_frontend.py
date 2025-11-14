from django.urls import path
from .views_frontend import index

urlpatterns = [
    path('', index, name='index'),
]

