import os
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'fulfillment-insecure-dev-key-change-in-prod-2026')
DEBUG = os.environ.get('DEBUG', 'True').lower() in ('true', '1')
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

INTERNAL_TOKEN = os.environ.get('INTERNAL_TOKEN', 'internal_service_mesh_secret_2026')
IDENTITY_SERVICE_URL = os.environ.get('IDENTITY_SERVICE_URL', 'http://127.0.0.1:8001')

INSTALLED_APPS = [
    'corsheaders',
    'rest_framework',
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'fulfillment',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
    'fulfillment.middleware.CorrelationIdMiddleware',
]

CORS_ALLOW_ALL_ORIGINS = True
ROOT_URLCONF = 'fulfillment_service.urls'

DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///' + str(BASE_DIR / 'db_fulfillment.sqlite3')
    )
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}
