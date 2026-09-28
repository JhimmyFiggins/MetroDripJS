from django.db import migrations, models


def copy_existing_titles(apps, schema_editor):
    banner_model = apps.get_model('content', 'CmsHomepageBanner')
    for banner in banner_model.objects.filter(headline='').iterator(chunk_size=200):
        banner_model.objects.filter(pk=banner.pk).update(headline=banner.title)


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cmshomepagebanner',
            name='button_label',
            field=models.CharField(blank=True, default='Shop Now', max_length=50),
        ),
        migrations.AddField(
            model_name='cmshomepagebanner',
            name='ends_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cmshomepagebanner',
            name='headline',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='cmshomepagebanner',
            name='placement',
            field=models.CharField(
                choices=[
                    ('homepage_hero', 'Homepage hero'),
                    ('homepage_secondary', 'Homepage secondary'),
                    ('announcement_bar', 'Announcement bar'),
                    ('category_banner', 'Category banner'),
                    ('checkout_footer', 'Checkout footer'),
                ],
                db_index=True,
                default='homepage_hero',
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name='cmshomepagebanner',
            name='starts_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cmshomepagebanner',
            name='subtext',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.RunPython(copy_existing_titles, migrations.RunPython.noop),
    ]
