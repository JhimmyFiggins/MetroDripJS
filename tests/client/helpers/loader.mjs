// Dependency-free ESM loader for the MetroDrip client tree.
//
// The repo has no installed node_modules, so this registers resolution hooks that
// (a) append the .js/.jsx extension to the extensionless relative imports the
// React Native bundler tolerates, and (b) redirect bare `react`, `react-native`
// and `expo-constants` specifiers to the local stubs in ./stubs.
//
// Nothing here touches the network or the filesystem outside the repo.
import module from 'node:module';
import path from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stubs = path.join(here, '..', 'stubs');

const BARE_STUBS = {
  react: path.join(stubs, 'react.mjs'),
  'react-native': path.join(stubs, 'react-native.mjs'),
  'expo-constants': path.join(stubs, 'expo-constants.mjs'),
};

const EXTENSIONS = ['.js', '.jsx', '.mjs'];

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

let installed = false;

/** Idempotently install the hooks; Node registers them process-wide. */
export function ensureClientLoader() {
  if (installed) return;
  installed = true;

  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (Object.prototype.hasOwnProperty.call(BARE_STUBS, specifier)) {
        return { url: pathToFileURL(BARE_STUBS[specifier]).href, shortCircuit: true };
      }

      // Only extensionless relative specifiers need help; anything the default
      // resolver already understands is left alone.
      const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
      if (!isRelative || path.extname(specifier) !== '' || !context.parentURL) {
        return nextResolve(specifier, context);
      }

      const base = new URL(specifier, context.parentURL);
      for (const ext of EXTENSIONS) {
        const candidate = new URL(`${base.href}${ext}`);
        if (isFile(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }

      return nextResolve(specifier, context);
    },
  });
}

ensureClientLoader();
