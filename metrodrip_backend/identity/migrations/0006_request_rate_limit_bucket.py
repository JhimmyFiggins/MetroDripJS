from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('identity', '0005_hash_legacy_passwords'),
    ]

    operations = [
        migrations.CreateModel(
            name='RequestRateLimitBucket',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('scope', models.CharField(max_length=64)),
                ('identity_digest', models.CharField(max_length=64)),
                ('window_started_at', models.DateTimeField()),
                ('request_count', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'identity_request_ratelimit',
                'indexes': [
                    models.Index(fields=['updated_at'], name='identity_rl_updated_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('scope', 'identity_digest'),
                        name='uniq_rl_scope_identity',
                    ),
                ],
            },
        ),
    ]
