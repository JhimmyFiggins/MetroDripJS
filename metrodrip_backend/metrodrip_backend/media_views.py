import logging
import os
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse, Http404
from django.views.static import serve
import struct
import zlib

logger = logging.getLogger(__name__)


def _build_fallback_png():
    width, height = 300, 300
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)
        for x in range(width):
            if x < 4 or x >= width - 4 or y < 4 or y >= height - 4:
                raw_data.extend((0, 230, 118))  # Volt accent
            else:
                raw_data.extend((30, 30, 30))  # Dark neutral
    compressed = zlib.compress(bytes(raw_data))
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack('>I', len(ihdr)) + b'IHDR' + ihdr + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr))
    idat_chunk = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    return b'\x89PNG\r\n\x1a\n' + ihdr_chunk + idat_chunk + iend_chunk


def _build_fallback_jpeg():
    try:
        from PIL import Image
        import io
        img = Image.new('RGB', (300, 300), color=(30, 30, 30))
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        return buf.getvalue()
    except Exception:
        # Minimal valid 1x1 JPEG fallback
        return b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9'


def _build_fallback_webp():
    try:
        from PIL import Image
        import io
        img = Image.new('RGB', (300, 300), color=(30, 30, 30))
        buf = io.BytesIO()
        img.save(buf, format='WEBP')
        return buf.getvalue()
    except Exception:
        # Minimal valid 1x1 WEBP fallback
        return b'RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25\xa4\x00\x03\x70\x00\xfe\xfb\xfd\xb0\x00\x00'


_FALLBACK_PNG = _build_fallback_png()
_FALLBACK_JPEG = _build_fallback_jpeg()
_FALLBACK_WEBP = _build_fallback_webp()


def media_file_view(request, path):
    try:
        media_root = Path(settings.MEDIA_ROOT).resolve()
        target_path = (media_root / path).resolve()
        target_path.relative_to(media_root)
    except Exception:
        raise Http404("Invalid media path.")

    if target_path.is_file():
        return serve(request, path, document_root=settings.MEDIA_ROOT)

    # If external durable storage is configured, redirect to the external URL
    storages_config = getattr(settings, 'STORAGES', {})
    backend_name = storages_config.get('default', {}).get('BACKEND', '')
    if 'CloudinaryMediaStorage' in backend_name or 'cloudinary' in backend_name.lower():
        try:
            from django.core.files.storage import default_storage
            from django.http import HttpResponseRedirect
            ext_url = default_storage.url(path)
            if ext_url and ext_url.startswith(('http://', 'https://')):
                return HttpResponseRedirect(ext_url)
        except Exception:
            pass

    # Graceful fallback for missing image files to prevent broken 404 images
    # e.g., if a Render Free container restarted and temporary files were cleared.
    ext = target_path.suffix.lower()
    if ext in {'.png', '.jpg', '.jpeg', '.webp'}:
        logger.warning("Media file '%s' not found on filesystem storage; serving fallback placeholder.", path)
        if ext in {'.jpg', '.jpeg'}:
            jpeg_sample = media_root / 'products' / '2026' / '10' / 'front.jpg'
            content = jpeg_sample.read_bytes() if jpeg_sample.is_file() else _FALLBACK_JPEG
            response = HttpResponse(content, content_type='image/jpeg')
            response['Cache-Control'] = 'public, max-age=86400'
            return response
        elif ext == '.webp':
            webp_sample = media_root / 'products' / '2026' / '10' / 'detail.webp'
            content = webp_sample.read_bytes() if webp_sample.is_file() else _FALLBACK_WEBP
            response = HttpResponse(content, content_type='image/webp')
            response['Cache-Control'] = 'public, max-age=86400'
            return response

        response = HttpResponse(_FALLBACK_PNG, content_type='image/png')
        response['Cache-Control'] = 'public, max-age=86400'
        return response

    return serve(request, path, document_root=settings.MEDIA_ROOT)
