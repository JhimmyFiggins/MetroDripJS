import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

import verify_microservices_e2e as harness


class E2ESafetyTests(unittest.TestCase):
    def test_requests_require_isolated_gateway(self):
        with patch.object(harness, 'GATEWAY_URL', None):
            with self.assertRaises(RuntimeError):
                harness.make_request('http://127.0.0.1:8000/profile/')

    def test_environment_overrides_external_settings_and_service_urls(self):
        with patch.dict(os.environ, {
            'DATABASE_URL': 'postgres://unavailable.invalid/never-use',
            'DJANGO_SETTINGS_MODULE': 'production.settings',
            'HTTP_PROXY': 'http://unavailable.invalid',
            'IDENTITY_SERVICE_URL': 'https://unavailable.invalid',
        }):
            env = harness.isolated_environment('unused', {'identity': 49152})
        for name in ('DATABASE_URL', 'DJANGO_SETTINGS_MODULE', 'HTTP_PROXY'):
            self.assertNotIn(name, env)
        self.assertEqual(env['IDENTITY_SERVICE_URL'], 'http://127.0.0.1:49152')
        self.assertEqual(env['IDENTITY_URL'], 'http://127.0.0.1:49152')
        self.assertEqual(env['DEBUG'], 'False')

    @patch.object(harness.subprocess, 'run', return_value=Mock(returncode=0))
    def test_database_setup_uses_temporary_database_not_importing_seed_commands(self, run):
        with tempfile.TemporaryDirectory(prefix='metrodrip-safety-') as directory:
            env = harness.prepare_database('identity', directory, {'QA_PASSWORD': 'fixture-only'})
            self.assertEqual(env['DATABASE_URL'], 'sqlite:///' + (Path(directory) / 'identity.sqlite3').as_posix())
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args_list[0].args[0][2:], ['migrate', '--noinput'])
        self.assertEqual(run.call_args_list[1].args[0][2], 'shell')
        self.assertNotIn('seed_identity', run.call_args_list[1].args[0][-1])

    @patch.object(harness.subprocess, 'run', return_value=Mock(returncode=1, stderr='fixture setup failure'))
    def test_database_setup_failure_stops_verification(self, run):
        with self.assertRaises(RuntimeError):
            harness.prepare_database('orders', 'unused', {})


if __name__ == '__main__':
    unittest.main()
