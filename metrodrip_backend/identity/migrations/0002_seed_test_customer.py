from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0001_initial'),
    ]

    operations = [
        # Preserve migration history without provisioning a fixed-login customer.
        # Previously seeded accounts require separately authorized remediation.
        migrations.RunPython(migrations.RunPython.noop),
    ]
