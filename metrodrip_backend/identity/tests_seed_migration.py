from runpy import run_module

from django.db import connection, migrations
from django.db.migrations.loader import MigrationLoader
from django.test import TestCase


class TestCustomerSeedMigrationTests(TestCase):
    def test_seed_module_has_no_fixture_or_import_side_effects(self):
        with self.assertNumQueries(0):
            namespace = run_module('identity.migrations.0002_seed_test_customer')
        self.assertEqual(
            {name for name in namespace if not name.startswith('__')},
            {'migrations', 'Migration'},
        )

    def test_seed_operation_creates_no_customer_and_preserves_graph(self):
        loader = MigrationLoader(None)
        key = ('identity', '0002_seed_test_customer')
        migration = loader.get_migration(*key)
        self.assertEqual(migration.dependencies, [('identity', '0001_initial')])
        self.assertEqual(
            loader.get_migration('identity', '0003_auditlog').dependencies,
            [key],
        )
        self.assertIn(key, loader.graph.forwards_plan(('identity', '0003_auditlog')))
        self.assertEqual(len(migration.operations), 1)
        operation = migration.operations[0]
        self.assertIsInstance(operation, migrations.RunPython)
        self.assertIs(operation.code, migrations.RunPython.noop)

        state = loader.project_state([('identity', '0001_initial')])
        customer = state.apps.get_model('identity', 'AccountsCustomer')
        self.assertEqual(customer.objects.count(), 0)
        with self.assertNumQueries(0):
            operation.database_forwards(
                'identity', connection.schema_editor(), state, state,
            )
        self.assertEqual(customer.objects.count(), 0)
