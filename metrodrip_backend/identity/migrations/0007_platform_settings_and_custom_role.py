from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('identity', '0006_request_rate_limit_bucket'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformSetting',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('platform_name', models.CharField(default='MetroDrip', max_length=150)),
                ('support_email', models.EmailField(default='support@metrodrip.ph', max_length=254)),
                ('currency', models.CharField(default='PHP', max_length=16)),
                ('timezone', models.CharField(default='Asia/Manila', max_length=64)),
                ('language', models.CharField(default='en', max_length=16)),
                ('date_format', models.CharField(default='YYYY-MM-DD', max_length=32)),
                ('staff_mfa_policy', models.CharField(default='optional', max_length=32)),
                ('session_timeout_minutes', models.CharField(default='60', max_length=16)),
                ('customer_registration', models.CharField(default='enabled', max_length=16)),
                ('maintenance_mode', models.CharField(default='off', max_length=16)),
                ('order_confirmation_emails', models.CharField(default='enabled', max_length=16)),
                ('sender_name', models.CharField(default='MetroDrip Orders', max_length=150)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'identity_platformsetting',
            },
        ),
        migrations.CreateModel(
            name='CustomRole',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=64, unique=True)),
                ('title', models.CharField(max_length=100)),
                ('base_role', models.CharField(default='merchant', max_length=32)),
                ('description', models.TextField(blank=True, default='')),
                ('permissions', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'identity_customrole',
                'ordering': ['title'],
            },
        ),
    ]
