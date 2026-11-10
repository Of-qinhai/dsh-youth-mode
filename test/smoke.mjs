/**
 * Assert-based smoke test: no browser, no Host. Run with
 * `node test/smoke.mjs` from the package directory.
 */
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------- Host half
const routes = new Map();
const hostCtx = {
  effect: (factory) => factory(),
  connection: {
    fetch: {
      register: (route) => {
        routes.set(route.path, route);
        return () => {};
      },
    },
  },
};

const host = await import('../index.js');
host.apply(hostCtx, {
  tracks: ['Atmozfears - Release (Chill Mix)_HQ.mp3'],
  inChars: 24,
  outChars: 120,
  volume: 0.45,
  mode: 'auto',
});

const route = routes.get('/api/youth-mode-bgm');
assert.ok(route, 'host registers the BGM route');
assert.deepEqual(route.methods, ['GET', 'HEAD']);

const configResponse = await route.fetch(new Request('http://127.0.0.1/api/youth-mode-bgm?config=1'));
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
assert.equal(config.tracks.length, 1, 'one configured track');
assert.equal(config.tracks[0].name, 'Atmozfears - Release (Chill Mix)_HQ.mp3');
assert.equal(config.tracks[0].path, undefined, 'track paths never reach the browser');
assert.equal(config.inChars, 24);

const audioResponse = await route.fetch(new Request('http://127.0.0.1/api/youth-mode-bgm?track=0'));
assert.equal(audioResponse.status, 200);
assert.equal(audioResponse.headers.get('content-type'), 'audio/mpeg');
const body = new Uint8Array(await audioResponse.arrayBuffer());
const fileSize = statSync(`${root}audio/Atmozfears - Release (Chill Mix)_HQ.mp3`).size;
assert.equal(body.byteLength, fileSize, 'streams the complete file');

const missing = await route.fetch(new Request('http://127.0.0.1/api/youth-mode-bgm?track=9'));
assert.equal(missing.status, 404);

const traversal = await import('../index.js');
assert.equal(typeof traversal.apply, 'function');

// -------------------------------------------------------------- Client half
let registered;
globalThis.window = {
  __ModuleLoader__: {
    load: (module) => {
      registered = module;
    },
  },
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

await import('../client.js');
assert.equal(registered.id, '@local/youth-mode');
assert.equal(typeof registered.factory, 'function');

const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: Symbol('fragment'),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
const require = (id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected module ${id}`);
};

const client = registered.factory(require);
assert.ok(client.inject.includes('slots'));

const slotRegistrations = [];
const clientCtx = {
  effect: (factory) => factory(),
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
  },
  slots: {
    inject: (owner, factory) => factory(),
    register: (options, component) => {
      slotRegistrations.push({ options, component });
      return () => {};
    },
  },
  sessions: {
    binding: () => ({
      eventSource: { getSnapshot: () => ({ entries: [] }), subscribe: () => () => {} },
    }),
  },
};
client.apply(clientCtx);

const { commandOf, partialCommand, summarize, buildCalls, buildStreaming, advanceReveal } = client.__test;
assert.equal(partialCommand('{"command":"npm test"}'), 'npm test');
assert.equal(partialCommand('{"command":"npm te'), 'npm te');
assert.equal(partialCommand('{"timeoutMs":10}'), '{"timeoutMs":10}');

const reveal = new Map([['a', 0]]);
const totals = new Map([['a', 5]]);
assert.equal(advanceReveal(reveal, totals, 2), true);
assert.equal(reveal.get('a'), 2);
assert.equal(advanceReveal(reveal, totals, 2), true);
assert.equal(reveal.get('a'), 4);
assert.equal(advanceReveal(reveal, totals, 2), true);
assert.equal(reveal.get('a'), 5);
assert.equal(advanceReveal(reveal, totals, 2), false, 'finished rows do not keep the ticker alive');

const streamEntries = [
  { type: 'event', event: { type: 'turn/start', seq: 1, time: 1, data: {} } },
  { type: 'transient', event: { type: 'assistant/live-chunk', seq: 1.5, time: 2, data: { chunk: { type: 'tool-call-delta', id: 'x1', name: 'bash', argumentsDelta: '{"command":"ls' } } } },
  { type: 'transient', event: { type: 'assistant/live-chunk', seq: 1.6, time: 3, data: { chunk: { type: 'tool-call-delta', id: 'x1', argumentsDelta: ' -la"}' } } } },
];
const streamed = buildStreaming(streamEntries);
assert.equal(streamed.length, 1, 'streams one pending command');
assert.equal(streamed[0].name, 'bash');
assert.equal(partialCommand(streamed[0].args), 'ls -la');
assert.equal(buildStreaming(streamEntries.concat([
  { type: 'event', event: { type: 'tool/call', seq: 2, time: 4, data: { callId: 'x1', name: 'bash', arguments: '{"command":"ls -la"}' } } },
])).length, 0, 'durable tool call settles the streaming row');
assert.equal(commandOf('{"command":"npm test"}'), 'npm test');
assert.equal(commandOf('{"command":"ls","timeoutMs":10}'), 'ls');
assert.equal(commandOf('plain text'), 'plain text');
assert.equal(commandOf(''), '');

const entries = [
  { type: 'event', event: { type: 'turn/start', seq: 1, time: 1000, data: {} } },
  { type: 'event', event: { type: 'tool/call', seq: 2, time: 1100, data: { callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' } } },
  { type: 'transient', event: { type: 'assistant/live-chunk', seq: 2.5, time: 1200, data: { chunk: { type: 'text-delta', text: 'hello' } } } },
  { type: 'event', event: { type: 'tool/result', seq: 3, time: 1600, data: { message: { source: { callId: 'c1' }, content: [], isError: false } } } },
];
const summary = summarize(entries);
assert.equal(summary.running, true, 'turn/start opens a run');
assert.equal(summary.turnText, 5);
assert.equal(summary.lastToolSeq, 2);
assert.equal(summary.sawTool, true, 'a tool call marks the command line as streamed');

const noTool = summarize([
  { type: 'event', event: { type: 'turn/start', seq: 1, time: 1000, data: {} } },
  { type: 'transient', event: { type: 'assistant/live-chunk', seq: 1.5, time: 1100, data: { chunk: { type: 'text-delta', text: 'hi' } } } },
]);
assert.equal(noTool.sawTool, false);
assert.equal(noTool.running, true);

const calls = buildCalls(entries);
assert.equal(calls.length, 1);
assert.equal(calls[0].command, 'npm test');
assert.equal(calls[0].result.isError, false);
assert.equal(calls[0].result.time, 1600);

const failed = buildCalls(entries.slice(0, 3).concat([
  { type: 'event', event: { type: 'tool/result', seq: 3, time: 1600, data: { message: { source: { callId: 'c1' }, content: [], isError: true } } } },
]));
assert.equal(failed[0].result.isError, true);

assert.equal(slotRegistrations.length, 1, 'registers one View tab');
const [{ options, component }] = slotRegistrations;
assert.equal(options.name, 'conversation.view');
assert.equal(options.id, 'youth-mode');
assert.equal(typeof options.label, 'function');
assert.equal(options.label(), 'view.label', 'label resolves through the dictionary key');
assert.equal(typeof component, 'function');

// Render once with stub hooks: a component that throws blanks the slot entry.
assert.ok(client.__test, 'test hooks survive the factory');
const rendered = component({
  source: { getSnapshot: () => ({ entries }), subscribe: () => () => {} },
  t: (key) => key,
  useInput: () => ({ draft: 'x'.repeat(30) }),
});
assert.ok(rendered, 'view renders');

function collect(node, output) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, output);
    return;
  }
  if (node.type === React.Fragment) {
    collect(node.children, output);
    return;
  }
  output.push(node);
  collect(node.children, output);
}
const nodes = [];
collect(rendered, nodes);
const row = nodes.find((node) => node.props && node.props.call && typeof node.type === 'function');
assert.ok(row, 'renders a tool-call row');
const rowNodes = [];
collect(row.type(row.props), rowNodes);
const texts = rowNodes.flatMap((node) => (Array.isArray(node.children) ? node.children : [node.children])).filter((value) => typeof value === 'string');
assert.ok(texts.includes('npm test'), 'shows the command line');
assert.ok(texts.includes('$'), 'renders a shell prompt');

console.log('smoke: ok');
