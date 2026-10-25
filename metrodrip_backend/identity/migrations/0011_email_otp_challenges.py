from django.db import migrations, models
from django.utils import timezone


def backfill_verified_email(apps, schema_editor):
    accounts = apps.get_model('identity', 'AccountsCustomer')
    accounts.objects.filter(email_verified_at__isnull=True).update(email_verified_at=timezone.now())


class Migration(migrations.Migration):
    dependencies = [
        ('identity', '0010_alter_platformsetting_payment_method_default'),
    ]

    operations = [
        migrations.AddField(
            model_name='accountscustomer',
            name='email_verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_verified_email, migrations.RunPython.noop),
        migrations.CreateModel(
            name='EmailOtpChallenge',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('purpose', models.CharField(max_length=32)),
                ('challenge_digest', models.CharField(max_length=64, unique=True)),
                ('code_digest', models.CharField(max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('sent_at', models.DateTimeField()),
                ('consumed_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('failed_attempts', models.PositiveSmallIntegerField(default=0)),
                ('max_attempts', models.PositiveSmallIntegerField(default=5)),
                ('customer', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='email_otp_challenges', to='identity.accountscustomer')),
            ],
            options={
                'db_table': 'identity_emailotpchallenge',
                'indexes': [
                    models.Index(fields=['customer', 'purpose', 'consumed_at'], name='identity_em_custome_86141b_idx'),
                    models.Index(fields=['expires_at'], name='identity_em_expires_e12696_idx'),
                ],
            },
        ),
    ]
