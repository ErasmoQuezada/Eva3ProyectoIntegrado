from django.shortcuts import render

def index(request):
    """Vista para servir el frontend"""
    return render(request, 'index.html')

