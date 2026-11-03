import logging
import os
import posixpath
import re
import urllib.request
import urllib.error
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage

try:
    import cloudinary
    import cloudinary.uploader
    import cloudinary.api
    from cloudinary.utils import cloudinary_url
    CLOUDINARY_AVAILABLE = True
except ImportError:
    cloudinary = None
    CLOUDINARY_AVAILABLE = False

logger = logging.getLogger(__name__)


def validate_durable_storage_configuration() -> tuple[bool, str]:
    """
    Validates whether the active media storage configuration is durable.
    Returns:
        (is_durable: bool, reason: str)
    """
    is_render = getattr(settings, 'IS_RENDER', False)
    debug = getattr(settings, 'DEBUG', False)
    backend = getattr(settings, 'MEDIA_STORAGE_BACKEND', '') or ''
    backend_class = ''
    storages_config = getattr(settings, 'STORAGES', {})
    if 'default' in storages_config and 'BACKEND' in storages_config['default']:
        backend_class = storages_config['default']['BACKEND']
    else:
        backend_class = backend

    is_cloudinary = (
        'CloudinaryMediaStorage' in backend_class
        or 'cloudinary' in backend_class.lower()
    )

    if is_cloudinary:
        if not CLOUDINARY_AVAILABLE:
            return False, "The 'cloudinary' Python package is not installed."

        c_url = getattr(settings, 'CLOUDINARY_URL', '') or os.environ.get('CLOUDINARY_URL', '')
        c_cloud_name = getattr(settings, 'CLOUDINARY_CLOUD_NAME', '') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')
        c_api_key = getattr(settings, 'CLOUDINARY_API_KEY', '') or os.environ.get('CLOUDINARY_API_KEY', '')
        c_api_secret = getattr(settings, 'CLOUDINARY_API_SECRET', '') or os.environ.get('CLOUDINARY_API_SECRET', '')

        if c_url and c_url.strip():
            return True, "Cloudinary durable storage configured via CLOUDINARY_URL."
        if c_cloud_name and c_api_key and c_api_secret:
            return True, f"Cloudinary durable storage configured for cloud '{c_cloud_name}'."
        return False, "Cloudinary credentials incomplete. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."

    # Non-Cloudinary storage backends
    if is_render:
        # On Render Free, local disk is ephemeral and discarded on every restart or deploy.
        return False, "Render Free uses ephemeral local storage. Image uploads require durable storage (e.g. Cloudinary) to survive container restarts."

    if debug:
        return True, "Local filesystem media storage allowed for local development."

    # Production outside Render: check explicit flag if durable volume is used
    durable_flag = getattr(settings, 'MEDIA_STORAGE_DURABLE', False)
    if durable_flag:
        return True, "Durable media storage explicitly enabled."

    return False, "Durable media storage is not configured for production."


class CloudinaryMediaStorage(Storage):
    """
    Durable media storage backend using Cloudinary for persistent file storage.
    Enforces HTTPS URLs, supports public ID extraction, collision prevention,
    and automatic deletion/cleanup.
    """

    def __init__(self, **kwargs):
        super().__init__()
        self._configure_cloudinary(**kwargs)

    def _configure_cloudinary(self, **kwargs):
        if not CLOUDINARY_AVAILABLE:
            raise RuntimeError(
                "The 'cloudinary' package is required to use CloudinaryMediaStorage. "
                "Ensure it is listed in requirements.txt and installed in your environment."
            )

        c_url = kwargs.get('cloudinary_url') or getattr(settings, 'CLOUDINARY_URL', '') or os.environ.get('CLOUDINARY_URL', '')
        cloud_name = kwargs.get('cloud_name') or getattr(settings, 'CLOUDINARY_CLOUD_NAME', '') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')
        api_key = kwargs.get('api_key') or getattr(settings, 'CLOUDINARY_API_KEY', '') or os.environ.get('CLOUDINARY_API_KEY', '')
        api_secret = kwargs.get('api_secret') or getattr(settings, 'CLOUDINARY_API_SECRET', '') or os.environ.get('CLOUDINARY_API_SECRET', '')

        if c_url and c_url.strip():
            cloudinary.config(cloudinary_url=c_url.strip(), secure=True)
            self.cloud_name = cloudinary.config().cloud_name
        elif cloud_name and api_key and api_secret:
            cloudinary.config(
                cloud_name=cloud_name.strip(),
                api_key=api_key.strip(),
                api_secret=api_secret.strip(),
                secure=True,
            )
            self.cloud_name = cloud_name.strip()
        else:
            self.cloud_name = getattr(cloudinary.config(), 'cloud_name', None)

    @staticmethod
    def extract_public_id(name_or_url: str) -> str:
        """
        Extracts Cloudinary public_id from a storage path or full Cloudinary URL.
        Examples:
          'products/2026/11/abc.jpg' -> 'products/2026/11/abc'
          'https://res.cloudinary.com/cloud/image/upload/v1234/products/2026/11/abc.jpg' -> 'products/2026/11/abc'
        """
        if not name_or_url:
            return ''
        clean = name_or_url.split('?')[0].split('#')[0]
        match = re.search(r'/image/upload/(?:v\d+/)?(.+)$', clean)
        if match:
            path = match.group(1)
        else:
            path = clean.lstrip('/')
            if path.startswith('media/'):
                path = path[len('media/'):]
        public_id, _ = posixpath.splitext(path)
        return public_id

    def _save(self, name: str, content) -> str:
        """
        Uploads content to Cloudinary and returns the stored path/name.
        """
        if not CLOUDINARY_AVAILABLE:
            raise IOError("Cloudinary package is not available.")

        norm_name = posixpath.normpath(name.replace('\\', '/')).lstrip('/')
        folder, filename = posixpath.split(norm_name)
        base_name, ext = posixpath.splitext(filename)
        ext_clean = ext.lstrip('.').lower()

        # Cloudinary options
        options = {
            'resource_type': 'image',
            'overwrite': False,
            'unique_filename': False,
            'use_filename': True,
            'secure': True,
        }
        if folder:
            options['folder'] = folder
            options['public_id'] = base_name
        else:
            options['public_id'] = base_name

        if ext_clean in {'jpg', 'jpeg', 'png', 'webp'}:
            options['format'] = 'jpg' if ext_clean == 'jpeg' else ext_clean

        if hasattr(content, 'seek'):
            content.seek(0)

        try:
            upload_result = cloudinary.uploader.upload(content, **options)
        except Exception as exc:
            logger.error("Cloudinary upload failed for %s: %s", norm_name, exc)
            raise IOError(f"Failed to upload media to Cloudinary: {exc}") from exc

        # Format saved name
        res_format = upload_result.get('format', ext_clean)
        public_id = upload_result.get('public_id', norm_name)
        if res_format and not public_id.endswith(f'.{res_format}'):
            saved_name = f"{public_id}.{res_format}"
        else:
            saved_name = public_id

        return saved_name

    def _open(self, name: str, mode: str = 'rb'):
        """
        Opens and reads a remote file stored in Cloudinary.
        """
        file_url = self.url(name)
        if not file_url:
            raise FileNotFoundError(f"File '{name}' could not be resolved.")

        try:
            req = urllib.request.Request(
                file_url,
                headers={'User-Agent': 'MetroDrip-Storage/1.0'}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                return ContentFile(data, name=name)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise FileNotFoundError(f"File '{name}' not found at {file_url}.") from exc
            raise IOError(f"HTTP error fetching '{name}': {exc.code} {exc.reason}") from exc
        except Exception as exc:
            raise IOError(f"Failed to read file '{name}' from Cloudinary: {exc}") from exc

    def url(self, name: str) -> str:
        """
        Returns the absolute HTTPS URL for the given asset.
        """
        if not name:
            return ''

        # If already a full URL, ensure HTTPS and return
        if name.startswith(('http://', 'https://')):
            if name.startswith('http://res.cloudinary.com/'):
                return 'https://' + name[len('http://'):]
            return name

        # Strip redundant leading slashes or /media/ prefix
        norm = name.replace('\\', '/').lstrip('/')
        if norm.startswith('media/'):
            norm = norm[len('media/'):]

        # Use Cloudinary URL helper
        try:
            built_url, _ = cloudinary_url(norm, secure=True)
            return built_url
        except Exception:
            # Fallback if config is missing cloud_name
            cloud = self.cloud_name or getattr(settings, 'CLOUDINARY_CLOUD_NAME', '')
            if cloud:
                return f"https://res.cloudinary.com/{cloud}/image/upload/{norm}"
            return f"/media/{norm}"

    def delete(self, name: str):
        """
        Deletes the file from Cloudinary.
        """
        if not name or not CLOUDINARY_AVAILABLE:
            return

        public_id = self.extract_public_id(name)
        if not public_id:
            return

        try:
            cloudinary.uploader.destroy(public_id, invalidate=True)
            logger.info("Successfully deleted Cloudinary asset: %s", public_id)
        except Exception as exc:
            logger.warning("Could not delete Cloudinary asset '%s': %s", public_id, exc)

    def exists(self, name: str) -> bool:
        """
        Checks whether the file exists on Cloudinary.
        """
        if not name or not CLOUDINARY_AVAILABLE:
            return False

        public_id = self.extract_public_id(name)
        try:
            cloudinary.api.resource(public_id)
            return True
        except Exception:
            return False

    def size(self, name: str) -> int:
        """
        Returns the size of the file in bytes if available from Cloudinary.
        """
        if not name or not CLOUDINARY_AVAILABLE:
            return 0

        public_id = self.extract_public_id(name)
        try:
            info = cloudinary.api.resource(public_id)
            return int(info.get('bytes', 0))
        except Exception:
            return 0

    def get_available_name(self, name: str, max_length: int = None) -> str:
        """
        Ensures a clean POSIX path without backslashes.
        """
        norm = name.replace('\\', '/')
        return super().get_available_name(norm, max_length=max_length)

