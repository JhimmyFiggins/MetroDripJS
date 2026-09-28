"""Bounded read-only load probe against disposable local microservices.

This tests the Python development gateway and Django runservers, not the
PostgreSQL/Nginx production deployment. It never targets a user-supplied URL.
"""

import json
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import verify_microservices_e2e as harness


STAGES = ((1, 40), (4, 80), (8, 120), (16, 160))
PATHS = (
    ('/products/', 200),
    ('/shipping-zones/', 200),
    ('/banners/', 200),
    ('/profile/', 401),
    ('/orders/', 401),
)


def reserve_ports(count):
    listeners = []
    try:
        for _ in range(count):
            listener = socket.socket()
            listener.bind(('127.0.0.1', 0))
            listeners.append(listener)
        return [listener.getsockname()[1] for listener in listeners]
    finally:
        for listener in listeners:
            listener.close()


def request(base_url, case):
    path, expected = case
    started = time.perf_counter()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(base_url + path, timeout=8) as response:
            response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        error.read()
        status = error.code
    except Exception as error:
        return ((time.perf_counter() - started) * 1000, type(error).__name__, False)
    return ((time.perf_counter() - started) * 1000, str(status), status == expected)


def percentile(values, percentile_rank):
    return sorted(values)[max(0, (len(values) * percentile_rank + 99) // 100 - 1)]


def main():
    processes = []
    with tempfile.TemporaryDirectory(prefix='metrodrip-load-') as directory:
        try:
            ports = reserve_ports(len(harness.SERVICES) + 1)
            service_ports = {name: ports[index] for index, (name, _, _) in enumerate(harness.SERVICES)}
            base_url = f'http://127.0.0.1:{ports[-1]}'
            base_env = harness.isolated_environment(directory, service_ports)
            for name, service_dir, _ in harness.SERVICES:
                env = harness.prepare_database(name, directory, base_env)
                processes.append(subprocess.Popen(
                    [harness.PYTHON_EXE, '-B', 'manage.py', 'runserver',
                     f'127.0.0.1:{service_ports[name]}', '--noreload'],
                    cwd=service_dir, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                ))
            processes.append(subprocess.Popen(
                [harness.PYTHON_EXE, '-B', str(harness.ROOT_DIR / 'gateway' / 'gateway.py')],
                cwd=harness.ROOT_DIR, env=dict(base_env, PORT=str(ports[-1])),
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            ))

            for _ in range(100):
                if any(process.poll() is not None for process in processes):
                    raise RuntimeError('An owned process exited during startup')
                if request(base_url, ('/health/', 200))[2]:
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError('Disposable services did not become healthy within 20 seconds')

            for case in PATHS:
                if not request(base_url, case)[2]:
                    raise RuntimeError(f'Warm-up response did not match expected status: {case[0]}')

            print('Target: disposable SQLite services via local Python gateway; read-only routes')
            total_errors = 0
            for workers, count in STAGES:
                cases = [PATHS[index % len(PATHS)] for index in range(count)]
                started = time.perf_counter()
                with ThreadPoolExecutor(max_workers=workers) as executor:
                    results = list(executor.map(lambda case: request(base_url, case), cases))
                elapsed = time.perf_counter() - started
                latencies = [latency for latency, _, _ in results]
                errors = Counter(status for _, status, passed in results if not passed)
                total_errors += sum(errors.values())
                print(json.dumps({
                    'concurrency': workers, 'requests': count,
                    'elapsed_seconds': round(elapsed, 3), 'throughput_rps': round(count / elapsed, 2),
                    'p50_ms': round(percentile(latencies, 50), 2),
                    'p95_ms': round(percentile(latencies, 95), 2),
                    'p99_ms': round(percentile(latencies, 99), 2),
                    'errors': sum(errors.values()), 'error_signatures': dict(errors),
                }, sort_keys=True))
                if any(process.poll() is not None for process in processes):
                    raise RuntimeError('An owned process exited during load')
            if total_errors:
                raise RuntimeError(f'{total_errors} response errors across bounded load stages')
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


if __name__ == '__main__':
    main()
