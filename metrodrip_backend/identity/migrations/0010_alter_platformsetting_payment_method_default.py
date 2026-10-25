from django.db import migrations, models

import identity.models


class Migration(migrations.Migration):
    dependencies = [
        ('identity', '0009_platformsetting_admin_alert_email_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='platformsetting',
            name='enabled_payment_methods',
            field=models.JSONField(default=identity.models._default_payment_methods),
        ),
    ]

