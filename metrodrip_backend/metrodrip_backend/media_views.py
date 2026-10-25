import os
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse, Http404
from django.views.static import serve
import struct
import zlib


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


_FALLBACK_PNG = _build_fallback_png()


def media_file_view(request, path):
    try:
        media_root = Path(settings.MEDIA_ROOT).resolve()
        target_path = (media_root / path).resolve()
        target_path.relative_to(media_root)
    except Exception:
        raise Http404("Invalid media path.")

    if target_path.is_file():
        return serve(request, path, document_root=settings.MEDIA_ROOT)

    # Graceful fallback for missing image files to prevent broken 404 images
    ext = target_path.suffix.lower()
    if ext in {'.png', '.jpg', '.jpeg', '.webp'}:
        if ext in {'.jpg', '.jpeg'}:
            jpeg_sample = media_root / 'products' / '2026' / '10' / 'front.jpg'
            if jpeg_sample.is_file():
                response = HttpResponse(jpeg_sample.read_bytes(), content_type='image/jpeg')
                response['Cache-Control'] = 'public, max-age=86400'
                return response
        elif ext == '.webp':
            webp_sample = media_root / 'products' / '2026' / '10' / 'detail.webp'
            if webp_sample.is_file():
                response = HttpResponse(webp_sample.read_bytes(), content_type='image/webp')
                response['Cache-Control'] = 'public, max-age=86400'
                return response

        response = HttpResponse(_FALLBACK_PNG, content_type='image/png')
        response['Cache-Control'] = 'public, max-age=86400'
        return response

    return serve(request, path, document_root=settings.MEDIA_ROOT)
