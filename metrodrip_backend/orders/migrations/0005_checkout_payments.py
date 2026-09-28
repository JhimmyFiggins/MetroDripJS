from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0004_reviewsreview_merchant_reply_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordersorder',
            name='cancelled_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='ordersorder',
            name='checkout_fingerprint',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='ordersorder',
            name='checkout_idempotency_key',
            field=models.CharField(blank=True, max_length=128, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='ordersorder',
            name='reservation_expires_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='orderspayment',
            name='checkout_url',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='orderspayment',
            name='failure_code',
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddField(
            model_name='orderspayment',
            name='last_reconciled_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='orderspayment',
            name='paid_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='orderspayment',
            name='provider',
            field=models.CharField(default='paymongo', max_length=20),
        ),
        migrations.AddField(
            model_name='orderspayment',
            name='provider_payment_ref',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='orderspayment',
            name='provider_ref',
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
        migrations.AddIndex(
            model_name='orderspayment',
            index=models.Index(fields=['provider', 'status'], name='orders_paym_provide_8b8f0a_idx'),
        ),
        migrations.CreateModel(
            name='PaymentWebhookEvent',
            fields=[
                ('event_id', models.CharField(max_length=100, primary_key=True, serialize=False)),
                ('event_type', models.CharField(max_length=100)),
                ('provider_ref', models.CharField(blank=True, db_index=True, default='', max_length=100)),
                ('payload_digest', models.CharField(max_length=64)),
                ('status', models.CharField(default='received', max_length=20)),
                ('error_code', models.CharField(blank=True, default='', max_length=80)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('processed_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'db_table': 'orders_paymentwebhookevent',
            },
        ),
        migrations.AddIndex(
            model_name='paymentwebhookevent',
            index=models.Index(fields=['status', 'received_at'], name='orders_paym_status_69f932_idx'),
        ),
    ]
