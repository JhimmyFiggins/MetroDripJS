import os
from pathlib import Path
from django.conf import settings
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from catalog.models import CatalogProduct, CatalogProductMedia
from content.models import CmsHomepageBanner
from metrodrip_backend.storage import validate_durable_storage_configuration


class Command(BaseCommand):
    help = (
        "Audits and synchronizes local media assets to external durable storage (Cloudinary). "
        "Safely migrates local product media and banner images so they survive container restarts."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Inspect and report assets without uploading or modifying database records.',
        )
        parser.add_argument(
            '--upload-all-local',
            action='store_true',
            help='Upload all local files found in media/ to durable storage, even if unlinked in DB.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Run synchronization even if durable storage validation returns false.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        upload_all_local = options['upload_all_local']
        force = options['force']

        self.stdout.write(self.style.MIGRATE_HEADING("=== MetroDrip Media Durable Storage Synchronization ==="))
        if dry_run:
            self.stdout.write(self.style.WARNING("Running in DRY-RUN mode. No changes will be saved.\n"))

        is_durable, status_msg = validate_durable_storage_configuration()
        self.stdout.write(f"Storage status: {status_msg}")

        if not is_durable and not force and not dry_run:
            self.stdout.write(
                self.style.ERROR(
                    "Error: Durable storage is not active. Configure CLOUDINARY_URL or CLOUDINARY credentials, "
                    "or pass --dry-run or --force to proceed."
                )
            )
            return

        media_root = Path(settings.MEDIA_ROOT).resolve()
        stats = {
            'product_media_total': 0,
            'product_media_synced': 0,
            'product_media_already_durable': 0,
            'product_media_missing_local': 0,
            'products_updated': 0,
            'banners_synced': 0,
            'local_files_uploaded': 0,
        }

        # 1. Audit CatalogProductMedia records
        self.stdout.write("\nAuditing CatalogProductMedia records...")
        media_qs = CatalogProductMedia.objects.select_related('product').all()
        stats['product_media_total'] = media_qs.count()

        for media in media_qs:
            file_name = media.file.name if media.file else ''
            if not file_name:
                continue

            if file_name.startswith(('http://', 'https://')):
                stats['product_media_already_durable'] += 1
                continue

            local_path = (media_root / file_name).resolve()
            if not local_path.is_file():
                self.stdout.write(self.style.WARNING(f"  [MISSING] Product #{media.product_id} media #{media.id}: local file not found at {local_path}"))
                stats['product_media_missing_local'] += 1
                continue

            # File exists locally
            if dry_run:
                self.stdout.write(f"  [DRY-RUN] Would sync #{media.id} ({file_name}) to durable storage.")
                stats['product_media_synced'] += 1
            else:
                try:
                    with open(local_path, 'rb') as f:
                        new_name = default_storage.save(file_name, File(f))
                    media.file.name = new_name
                    media.save(update_fields=['file'])
                    if media.is_primary and media.product:
                        media.product.image_url = media.url
                        media.product.save(update_fields=['image_url'])
                        stats['products_updated'] += 1
                    stats['product_media_synced'] += 1
                    self.stdout.write(self.style.SUCCESS(f"  [SYNCED] Product #{media.product_id} media #{media.id} -> {media.url}"))
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f"  [FAILED] Failed syncing media #{media.id}: {exc}"))

        # 2. Audit Products with direct image_url pointing to /media/
        self.stdout.write("\nAuditing CatalogProduct direct image_url...")
        products = CatalogProduct.objects.filter(image_url__startswith='/media/')
        for prod in products:
            rel_path = prod.image_url[len('/media/'):]
            local_path = (media_root / rel_path).resolve()
            if local_path.is_file():
                if dry_run:
                    self.stdout.write(f"  [DRY-RUN] Would sync product #{prod.id} '{prod.name}' image ({rel_path}).")
                    stats['products_updated'] += 1
                else:
                    try:
                        with open(local_path, 'rb') as f:
                            saved_name = default_storage.save(rel_path, File(f))
                        prod.image_url = default_storage.url(saved_name)
                        prod.save(update_fields=['image_url'])
                        stats['products_updated'] += 1
                        self.stdout.write(self.style.SUCCESS(f"  [SYNCED] Product #{prod.id} '{prod.name}' -> {prod.image_url}"))
                    except Exception as exc:
                        self.stdout.write(self.style.ERROR(f"  [FAILED] Product #{prod.id} upload failed: {exc}"))

        # 3. Audit Banners pointing to /media/
        self.stdout.write("\nAuditing CmsHomepageBanner records...")
        banners = CmsHomepageBanner.objects.filter(image_url__startswith='/media/')
        for b in banners:
            rel_path = b.image_url[len('/media/'):]
            local_path = (media_root / rel_path).resolve()
            if local_path.is_file():
                if dry_run:
                    self.stdout.write(f"  [DRY-RUN] Would sync banner #{b.id} '{b.title}' ({rel_path}).")
                    stats['banners_synced'] += 1
                else:
                    try:
                        with open(local_path, 'rb') as f:
                            saved_name = default_storage.save(rel_path, File(f))
                        b.image_url = default_storage.url(saved_name)
                        b.save(update_fields=['image_url'])
                        stats['banners_synced'] += 1
                        self.stdout.write(self.style.SUCCESS(f"  [SYNCED] Banner #{b.id} '{b.title}' -> {b.image_url}"))
                    except Exception as exc:
                        self.stdout.write(self.style.ERROR(f"  [FAILED] Banner #{b.id} upload failed: {exc}"))

        # 4. Optional: Upload all local media files in media_root
        if upload_all_local:
            self.stdout.write("\nScanning and uploading all local files in media directory...")
            for root, _, files in os.walk(media_root):
                for fname in files:
                    full_p = Path(root) / fname
                    rel_p = str(full_p.relative_to(media_root)).replace('\\', '/')
                    ext = full_p.suffix.lower()
                    if ext not in {'.png', '.jpg', '.jpeg', '.webp'}:
                        continue
                    if dry_run:
                        self.stdout.write(f"  [DRY-RUN] Would upload local file: {rel_p}")
                        stats['local_files_uploaded'] += 1
                    else:
                        try:
                            with open(full_p, 'rb') as f:
                                default_storage.save(rel_p, File(f))
                            stats['local_files_uploaded'] += 1
                            self.stdout.write(self.style.SUCCESS(f"  [UPLOADED] {rel_p}"))
                        except Exception as exc:
                            self.stdout.write(self.style.ERROR(f"  [FAILED] {rel_p}: {exc}"))

        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Synchronization Summary ==="))
        self.stdout.write(f"CatalogProductMedia checked: {stats['product_media_total']}")
        self.stdout.write(f"  - Synced to durable storage: {stats['product_media_synced']}")
        self.stdout.write(f"  - Already durable:          {stats['product_media_already_durable']}")
        self.stdout.write(f"  - Missing on local disk:    {stats['product_media_missing_local']}")
        self.stdout.write(f"Products updated:             {stats['products_updated']}")
        self.stdout.write(f"Banners synced:               {stats['banners_synced']}")
        if upload_all_local:
            self.stdout.write(f"All local files uploaded:     {stats['local_files_uploaded']}")
        self.stdout.write(self.style.SUCCESS("\nSynchronization audit completed successfully."))

