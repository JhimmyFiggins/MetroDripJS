import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const python = process.env.QA_PYTHON;
const databaseUrl = process.env.QA_DATABASE_URL;
const port = Number(process.env.QA_LOAD_PORT || 8010);
const totalRequests = Number(process.env.QA_LOAD_REQUESTS || 100);
const concurrency = Number(process.env.QA_LOAD_CONCURRENCY || 10);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const backendRoot = join(repoRoot, 'metrodrip_backend');
const apiBase = `http://127.0.0.1:${port}`;

if (!python || !databaseUrl) {
  throw new Error('QA_PYTHON and QA_DATABASE_URL are required for the disposable local load probe.');
}
if (!Number.isInteger(totalRequests) || totalRequests < 1 || totalRequests > 1000) {
  throw new Error('QA_LOAD_REQUESTS must be an integer between 1 and 1000.');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
  throw new Error('QA_LOAD_CONCURRENCY must be an integer between 1 and 50.');
}

await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', error => reject(new Error(`Loopback port ${port} is unavailable: ${error.code || error.message}`)));
  server.listen(port, '127.0.0.1', () => server.close(resolve));
});

const backend = spawn(
  python,
  ['manage.py', 'runserver', `127.0.0.1:${port}`, '--noreload'],
  {
    cwd: backendRoot,
    windowsHide: true,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DJANGO_SECRET_KEY: 'disposable-load-probe-secret-with-more-than-fifty-characters-2026',
      DJANGO_DEBUG: 'true',
    },
  },
);
let serverOutput = '';
const capture = chunk => {
  serverOutput = `${serverOutput}${chunk}`.slice(-50000);
};
backend.stdout.on('data', capture);
backend.stderr.on('data', capture);

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

async function waitForHealth() {
  const started = performance.now();
  const deadline = started + 45000;
  while (performance.now() < deadline) {
    if (backend.exitCode !== null) throw new Error(`Django exited during startup.\n${serverOutput}`);
    try {
      const response = await fetch(`${apiBase}/health/`);
      if (response.status === 200 && (await response.json()).status === 'ok') {
        return performance.now() - started;
      }
    } catch {
      // The owned loopback process may still be binding and importing.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Django did not become ready within 45 seconds.\n${serverOutput}`);
}

async function exercise(path) {
  let nextIndex = 0;
  const durations = [];
  const failures = [];

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= totalRequests) return;
      const started = performance.now();
      try {
        const response = await fetch(`${apiBase}${path}`);
        await response.arrayBuffer();
        durations.push(performance.now() - started);
        if (response.status !== 200) failures.push(`${response.status} at request ${index + 1}`);
      } catch (error) {
        durations.push(performance.now() - started);
        failures.push(`${error.message} at request ${index + 1}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    path,
    requests: totalRequests,
    concurrency,
    errors: failures.length,
    errorRate: failures.length / totalRequests,
    p50Ms: Number(percentile(durations, 0.50).toFixed(1)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
    maxMs: Number(Math.max(...durations).toFixed(1)),
    failureSamples: failures.slice(0, 5),
  };
}

async function stopBackend() {
  await new Promise(resolve => {
    if (backend.exitCode !== null || backend.killed) return resolve();
    const timeout = setTimeout(() => {
      if (backend.exitCode === null) backend.kill('SIGKILL');
      resolve();
    }, 5000);
    backend.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    backend.kill();
  });
}

try {
  const coldStartMs = await waitForHealth();
  for (let index = 0; index < 5; index += 1) await fetch(`${apiBase}/health/`);
  const health = await exercise('/health/');
  const catalog = await exercise('/products/');
  const provisionalThresholds = {
    coldStartMs: 10000,
    healthP95Ms: 250,
    catalogP95Ms: 750,
    errorRate: 0,
  };
  const provisionalComparisons = {
    coldStart: coldStartMs <= provisionalThresholds.coldStartMs,
    healthP95: health.p95Ms <= provisionalThresholds.healthP95Ms,
    catalogP95: catalog.p95Ms <= provisionalThresholds.catalogP95Ms,
    zeroErrors: health.errorRate === 0 && catalog.errorRate === 0,
  };

  console.log(JSON.stringify({
    environment: 'local Django development server + disposable PostgreSQL; not a production capacity result',
    coldStartMs: Number(coldStartMs.toFixed(1)),
    health,
    catalog,
    provisionalUnapprovedThresholds: provisionalThresholds,
    provisionalComparisons,
  }, null, 2));

  if (health.errors || catalog.errors) process.exitCode = 1;
} finally {
  await stopBackend();
}
