# MetroDripJS setup

MetroDripJS is an Expo shopping interface. Its checkout preview uses local example data; the payment handler displays a simulated handoff rather than processing a charge.

## Prerequisites and versions

Install Node.js and npm, then open a terminal in the repository. Linux was verified with Node 22.23.2 and npm 10.9.8. On macOS use Terminal; on Windows use PowerShell; on Linux use your terminal. The commands below work on all three, but macOS and Windows were not executed in this session.

| Component | Installed version verified 2026-09-13 |
| --- | --- |
| Expo | 54.0.37 (SDK 54) |
| React / React DOM | 19.1.0 |
| React Native | 0.81.5 |
| React Native Web | 0.21.2 |

Use the committed lockfile to preserve compatible versions. Expo's local SDK compatibility map was used to install the web dependencies.

## Install and run checkout

```sh
npm ci
npm run web -- --localhost --port 8081
```

Keep the terminal running and open <http://localhost:8081/checkout>. Metro is Expo's development bundler: it turns the application source into JavaScript that the browser can load.

```text
Browser /checkout → Expo Metro :8081 → navigation stack → Checkout screen
Browser /         → Expo Metro :8081 → navigation stack → Initial screen
```

Working means the terminal reports `Waiting on http://localhost:8081`, and the checkout displays Delivery address, Payment method, and Pay ₱2,632. At desktop sizes, the existing layout stays centered at phone width. Stop the server with Ctrl+C.

No environment variables or service credentials are required for this preview. Keep future secrets out of source control and client-side environment variables.

## Other commands and verification

| Task | Command / status |
| --- | --- |
| Android | `npm run android`; requires a compatible device or emulator; not tested here |
| iOS simulator | `npm run ios`; requires macOS and Xcode; not tested here |
| Development server | `npm start` |
| Web bundle export | `npx expo export --platform web`; not executed here |
| Test / lint | No test or lint scripts currently defined |
| Deployment | No deployment workflow verified in this task |

Executed browser smoke checks on 2026-09-13: checkout loaded at 390x844 and 1440x900 without JavaScript page errors, and a desktop reload retained checkout. Screenshots were visually inspected. These checks do not verify actual payments or native behavior.

## Troubleshooting

1. If the browser cannot connect, check that the Expo terminal is still running and reports port 8081.
2. If the port is occupied, run `npm run web -- --localhost --port 8082`, then use `http://localhost:8082/checkout`.
3. If modules are missing, stop Expo, run `npm ci`, and restart the command above.
4. If registration appears, check that the address ends in `/checkout`.
5. If bundling fails, read the first error in the Expo terminal and browser console before changing dependencies.

The install reported 24 dependency vulnerabilities. Dependency remediation and production readiness remain outside this local preview task.
