import mimetypes
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.http import FileResponse, Http404
from django.views.decorators.http import require_safe


_PUBLIC_PREFIXES = frozenset({'Registration', 'admin', 'assets', 'css', 'js', 'merchant', 'customer'})
_PUBLIC_SUFFIXES = frozenset({'.css', '.html', '.ico', '.js', '.png', '.svg'})
_CLEAN_PATH_ALIASES = {
    'admin/account/settings': 'admin/account-settings.html',
    'merchant/account/settings': 'merchant/account-settings.html',
}


def _public_relative_path(requested_path):
    """Return an allowlisted console path without permitting filesystem traversal."""
    if requested_path == '':
        return PurePosixPath('index.html')
    if requested_path == 'favicon.ico':
        return PurePosixPath(requested_path)

    normalized_path = requested_path.rstrip('/')
    raw_parts = normalized_path.split('/')
    if (
        not normalized_path
        or '\\' in normalized_path
        or '\x00' in normalized_path
        or any(not part or part in {'.', '..'} or part.startswith('.') for part in raw_parts)
    ):
        raise Http404

    relative_path = PurePosixPath(normalized_path)
    if relative_path.parts[0] not in _PUBLIC_PREFIXES:
        raise Http404

    if relative_path.parts[0] == 'customer':
        if not relative_path.suffix:
            return PurePosixPath('customer/index.html')
        if relative_path.suffix.lower() not in _PUBLIC_SUFFIXES:
            raise Http404
        return relative_path

    alias = _CLEAN_PATH_ALIASES.get(normalized_path)
    if alias:
        return PurePosixPath(alias)

    if relative_path.parts[0] in {'admin', 'merchant'}:
        if len(relative_path.parts) == 1:
            return relative_path / 'index.html'
        if not relative_path.suffix:
            return relative_path.with_suffix('.html')

    if relative_path.suffix.lower() not in _PUBLIC_SUFFIXES:
        raise Http404
    return relative_path


def _resolved_console_file(requested_path):
    console_root = Path(settings.CONSOLE_ROOT).resolve()
    relative_path = _public_relative_path(requested_path)

    try:
        candidate = (console_root / Path(*relative_path.parts)).resolve(strict=True)
        candidate.relative_to(console_root)
    except (OSError, RuntimeError, ValueError):
        raise Http404 from None

    if not candidate.is_file():
        raise Http404
    return candidate


@require_safe
def console_file(request, asset_path=''):
    """Serve the allowlisted staff console files from the repository's web directory."""
    console_file_path = _resolved_console_file(asset_path)
    content_type, encoding = mimetypes.guess_type(console_file_path.name)

    try:
        response = FileResponse(console_file_path.open('rb'), content_type=content_type)
    except OSError:
        raise Http404 from None

    if encoding:
        response['Content-Encoding'] = encoding
    response['Cache-Control'] = (
        'no-store' if console_file_path.suffix.lower() == '.html' else 'public, max-age=300'
    )
    return response
