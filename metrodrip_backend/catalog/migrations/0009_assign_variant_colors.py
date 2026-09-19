from django.db import migrations


def assign_variant_colors(apps, schema_editor):
    CatalogColor = apps.get_model("catalog", "CatalogColor")
    CatalogProductVariant = apps.get_model("catalog", "CatalogProductVariant")

    black = CatalogColor.objects.get(
        name="Black",
        hex_code="#000000"
    )

    CatalogProductVariant.objects.filter(
        attributes__color="Black"
    ).update(color=black)


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0008_seed_colors"),
    ]

    operations = [
        migrations.RunPython(assign_variant_colors),
    ]