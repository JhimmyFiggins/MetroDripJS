import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('identity', '0003_auditlog'),
    ]

    operations = [
        migrations.CreateModel(
            name='CustomerAccessToken',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('token_digest', models.CharField(max_length=64, unique=True)),
                ('token_prefix', models.CharField(db_index=True, max_length=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('last_used_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='access_tokens', to='identity.accountscustomer')),
            ],
            options={
                'db_table': 'identity_customeraccesstoken',
            },
        ),
        migrations.AddIndex(
            model_name='customeraccesstoken',
            index=models.Index(fields=['customer', 'expires_at'], name='identity_cu_custome_8d6187_idx'),
        ),
    ]
