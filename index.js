/**
 * Host half of the youth-mode bundle.
 *
 * The browser cannot read file:// URLs, and the built-in /plugins asset route
 * only serves images, so this plugin owns authenticated routes for local music.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const inject = ['connection'];

const AUDIO_DIR = fileURLToPath(new URL('./audio', import.meta.url));
const FOLDER_OPENER = {
  darwin: '/usr/bin/open',
  linux: 'xdg-open',
  win32: join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'),
}[process.platform];

const MEDIA_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.flac', 'audio/flac'],
]);

const DEFAULTS = { inChars: 24, outChars: 0, volume: 0.45, idleMs: 1500, fadeInMs: 10000, fadeOutMs: 10000, typeCps: 30 };

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizedConfig(config) {
  return {
    inChars: clampNumber(config?.inChars, DEFAULTS.inChars, 1, 100000),
    outChars: clampNumber(config?.outChars, DEFAULTS.outChars, 0, 100000),
    volume: clampNumber(config?.volume, DEFAULTS.volume, 0, 1),
    idleMs: clampNumber(config?.idleMs, DEFAULTS.idleMs, 300, 60000),
    fadeInMs: clampNumber(config?.fadeInMs, DEFAULTS.fadeInMs, 0, 60000),
    fadeOutMs: clampNumber(config?.fadeOutMs, DEFAULTS.fadeOutMs, 0, 60000),
    typeCps: clampNumber(config?.typeCps, DEFAULTS.typeCps, 1, 1000),
    mode: config?.mode === 'off' ? 'off' : 'auto',
    entries: Array.isArray(config?.tracks)
      ? config.tracks.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [],
  };
}

/** Resolve one configured entry; relative names stay inside this package's audio/. */
function trackPath(entry) {
  if (isAbsolute(entry)) return entry;
  const path = resolve(AUDIO_DIR, entry);
  return path === AUDIO_DIR || path.startsWith(AUDIO_DIR + sep) ? path : undefined;
}

async function listTracks(config) {
  const view = normalizedConfig(config);
  let entries = view.entries;
  if (entries.length === 0) {
    try {
      entries = (await readdir(AUDIO_DIR, { withFileTypes: true }))
        .filter((file) => file.isFile() && MEDIA_TYPES.has(extname(file.name).toLowerCase()))
        .map((file) => file.name)
        .sort();
    } catch {
      entries = [];
    }
  }
  const seen = new Set();
  const tracks = [];
  for (const entry of entries) {
    const path = trackPath(entry);
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    const key = createHash('sha256').update(path).digest('hex');
    tracks.push({ id: tracks.length, key, name: basename(path), path });
  }
  return { ...view, tracks };
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function notFound() {
  return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
}

export function apply(ctx, config) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: '/api/youth-mode-bgm',
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        async fetch(request) {
          const url = new URL(request.url);
          const list = await listTracks(config);
          if (url.searchParams.has('config')) {
            const body = {
              inChars: list.inChars,
              outChars: list.outChars,
              volume: list.volume,
              idleMs: list.idleMs,
              fadeInMs: list.fadeInMs,
              fadeOutMs: list.fadeOutMs,
              typeCps: list.typeCps,
              mode: list.mode,
              tracks: list.tracks.map(({ id, key, name }) => ({ id, key, name })),
            };
            return new Response(JSON.stringify(body), { headers: JSON_HEADERS });
          }
          // A rescan can reorder the list between selecting and loading a song.
          const key = url.searchParams.get('key');
          const trackParam = url.searchParams.get('track');
          const id = trackParam === null ? NaN : Number(trackParam);
          const track = list.tracks.find((item) => key === null ? item.id === id : item.key === key);
          if (track === undefined) return notFound();
          try {
            const info = await stat(track.path);
            if (!info.isFile()) return notFound();
            const body = request.method === 'HEAD' ? null : await readFile(track.path);
            return new Response(body, {
              headers: {
                'content-type': MEDIA_TYPES.get(extname(track.path).toLowerCase()) ?? 'application/octet-stream',
                'content-length': String(body?.byteLength ?? info.size),
                'cache-control': 'private, max-age=3600',
                'accept-ranges': 'none',
              },
            });
          } catch {
            return notFound();
          }
        },
      }),
    'youth-mode: BGM route',
  );
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: '/api/youth-mode-bgm/open-folder',
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          // Connection authenticates the caller and validates Origin before rewriting the request URL.
          if (request.headers.get('x-youth-mode-action') !== 'open-folder') {
            return new Response(null, { status: 403 });
          }
          if (!FOLDER_OPENER) return new Response(null, { status: 501 });
          try {
            if (!(await stat(AUDIO_DIR)).isDirectory()) return notFound();
            const child = spawn(FOLDER_OPENER, [AUDIO_DIR], { detached: true, stdio: 'ignore', windowsHide: true });
            await once(child, 'spawn');
            child.unref();
            return new Response(null, { status: 204 });
          } catch {
            return new Response(null, { status: 500 });
          }
        },
      }),
    'youth-mode: open audio folder',
  );
}
