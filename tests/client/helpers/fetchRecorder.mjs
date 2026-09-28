// Deterministic `fetch` double: records every call and replays scripted
// responses. No timers, no network, no randomness.
export function createFetchRecorder() {
  const calls = [];
  let handler = () => ({ status: 200, body: {} });

  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const scripted = await handler(url, init);
    const status = scripted.status ?? 200;
    const text = scripted.text !== undefined
      ? scripted.text
      : (scripted.body === undefined ? '' : JSON.stringify(scripted.body));

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      async text() {
        return text;
      },
    };
  };

  return {
    fetchImpl,
    calls,
    get last() {
      return calls[calls.length - 1];
    },
    /** Script the next response(s). `respond(fn)` receives (url, init). */
    respond(fn) {
      handler = fn;
      return this;
    },
    reply(body, status = 200) {
      handler = () => ({ status, body });
      return this;
    },
    fail(message = 'boom', name = 'TypeError') {
      handler = () => {
        throw Object.assign(new Error(message), { name });
      };
      return this;
    },
  };
}

/** Install the recorder as the global fetch and return it. */
export function installFetch() {
  const recorder = createFetchRecorder();
  globalThis.fetch = recorder.fetchImpl;
  return recorder;
}

/** Parsed JSON request body of a recorded call. */
export function sentBody(call) {
  return JSON.parse(call.init.body);
}

/** Header lookup that is case-insensitive, matching fetch semantics. */
export function headerOf(call, name) {
  const headers = call.init.headers || {};
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}
