/**
 * Browser half of the youth-mode bundle.
 *
 * Contributes one Conversation View tab ("Youth mode") that renders a
 * terminal-like log of tool calls, and owns the BGM that plays while a long
 * input or output is in flight.
 */
window.__ModuleLoader__.load({
  id: '@local/youth-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'youth-mode';
    const API = '/api/youth-mode-bgm';
    const MODE_KEY = 'youth-mode.bgm.mode';
    // One element per plugin instance: remounting the tab must not restart the track.
    const bgm = { audio: null, loaded: false, trackName: '', trackId: null };
    const EMPTY_SNAPSHOT = Object.freeze({ entries: [], revision: 0, change: { kind: 'replace', entries: [] }, hasMore: false });
    const EMPTY_SOURCE = {
      getSnapshot: () => EMPTY_SNAPSHOT,
      subscribe: () => () => {},
    };

    const ZH = {
      'view.label': '青春模式',
      'bar.title': 'youth://cmd',
      running: '运行中',
      idle: '空闲',
      calls: '条命令',
      empty: '等待工具调用……',
      'bgm.off': 'BGM 已关闭',
      'bgm.on': 'BGM 自动',
      'bgm.toggle': '切换 BGM 自动播放',
      'bgm.next': '下一首',
      'status.running': '执行中',
      'status.ok': '完成',
      'status.error': '失败',
      'status.streaming': '输入中',
      'bgm.hint': '输入/输出触发 · 点击切换',
    };
    const EN = {
      'view.label': 'Youth mode',
      'bar.title': 'youth://cmd',
      running: 'running',
      idle: 'idle',
      calls: 'cmds',
      empty: 'waiting for tool calls…',
      'bgm.off': 'BGM off',
      'bgm.on': 'BGM auto',
      'bgm.toggle': 'Toggle automatic BGM',
      'bgm.next': 'Next track',
      'status.running': 'running',
      'status.ok': 'done',
      'status.error': 'failed',
      'status.streaming': 'streaming',
      'bgm.hint': 'input/output triggers · click to toggle',
    };

    const CSS = `
.ym-root{box-sizing:border-box;display:flex;flex-direction:column;height:100%;max-height:calc(var(--dsh-conversation-viewport-height,100dvh) - var(--dsh-composer-height,152px));min-height:0;overflow:hidden;border:1px solid rgba(94,234,212,.16);border-radius:12px;background:radial-gradient(120% 80% at 50% 0%,#0f1725 0%,#070a11 60%,#05070c 100%);color:#d6dee8;color-scheme:dark;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
.ym-scroll{flex:1;min-height:0;overflow-y:auto;overflow-anchor:none;padding:12px 14px 14px;scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.3) transparent}
.ym-scroll::-webkit-scrollbar{width:8px}
.ym-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.28);border-radius:8px}
.ym-line{display:flex;align-items:baseline;gap:8px;padding:2px 0;font-size:12.5px;line-height:1.7;flex-wrap:wrap}
.ym-line.idle{opacity:.85}
.ym-time{color:#4b5b70;white-space:nowrap;min-width:10ch;font-variant-numeric:tabular-nums}
.ym-path{color:#38bdf8;white-space:nowrap;max-width:40ch;overflow:hidden;text-overflow:ellipsis}
.ym-dollar{color:#4ade80;white-space:nowrap}
.ym-cmd{flex:1;min-width:0;color:#e2e8f0;white-space:pre-wrap;word-break:break-word}
.ym-line.idle .ym-cmd{color:#475569}
.ym-meta{flex:none;color:#64748b;font-size:11px;white-space:nowrap}
.ym-meta.ok{color:#4ade80}
.ym-meta.error{color:#f87171}
.ym-meta.running{color:#fbbf24}
.ym-meta.streaming{color:#5eead4}
.ym-err{margin:0 0 5px;padding-left:18px;color:#fca5a5;font-size:11.5px;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:hidden}
.ym-cursor{display:inline-block;width:7px;height:13px;margin-left:2px;background:#5eead4;vertical-align:-2px;animation:ym-blink 1.1s steps(2,start) infinite}
.ym-foot{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.8);color:#64748b;font-size:10.5px;letter-spacing:.04em}
.ym-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.8)}
.ym-dot.busy{background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.85);animation:ym-pulse 1s ease-in-out infinite}
.ym-state{color:#94a3b8}
.ym-state.busy{color:#fbbf24}
.ym-count{color:#475569}
.ym-spacer{flex:1}
.ym-bgm{cursor:pointer;border:1px solid rgba(148,163,184,.24);border-radius:999px;background:rgba(15,23,42,.6);color:#94a3b8;padding:2px 9px;font:inherit;font-size:10.5px;letter-spacing:.03em;max-width:260px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ym-bgm.on{border-color:rgba(94,234,212,.4);color:#5eead4}
.ym-next{cursor:pointer;border:1px solid rgba(148,163,184,.24);border-radius:999px;background:rgba(15,23,42,.6);color:#94a3b8;padding:2px 7px;font:inherit;font-size:10.5px;line-height:1.2}
.ym-next:hover{color:#5eead4;border-color:rgba(94,234,212,.4)}
.ym-next:focus-visible{outline:2px solid #5eead4;outline-offset:2px}
.ym-bgm:focus-visible{outline:2px solid #5eead4;outline-offset:2px}
@keyframes ym-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes ym-blink{0%,100%{opacity:1}50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.ym-dot.busy,.ym-cursor{animation:none}}
`;

    function formatClock(ms) {
      const date = new Date(ms);
      if (Number.isNaN(date.getTime())) return '--:--:--';
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function formatSeconds(from, to) {
      if (typeof from !== 'number' || typeof to !== 'number' || to < from) return '';
      return `${((to - from) / 1000).toFixed(1)}s`;
    }

    /** Pull the command line out of a tool-call argument blob. */
    function commandOf(raw) {
      if (typeof raw !== 'string' || raw.length === 0) return '';
      try {
        const args = JSON.parse(raw);
        if (args && typeof args === 'object' && !Array.isArray(args)) {
          if (typeof args.command === 'string' && args.command.length > 0) return args.command;
          if (typeof args.cmd === 'string' && args.cmd.length > 0) return args.cmd;
          if (Array.isArray(args.argv) && args.argv.every((item) => typeof item === 'string')) return args.argv.join(' ');
          for (const key of ['path', 'file_path', 'url', 'pattern', 'query']) {
            if (typeof args[key] === 'string' && args[key].length > 0) return args[key];
          }
        }
      } catch {
        // Partial or non-JSON arguments: show them raw.
      }
      return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
    }

    /** Best-effort command preview while the argument JSON is still streaming. */
    function partialCommand(text) {
      if (typeof text !== 'string' || text.length === 0) return '';
      const match = /"(?:command|cmd)"\s*:\s*"((?:\\.|[^"\\])*)/.exec(text);
      const value = match === null ? text : match[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return value.length > 300 ? `${value.slice(0, 300)}…` : value;
    }

    function textLengthOf(content) {
      if (!Array.isArray(content)) return 0;
      let length = 0;
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string') length += block.text.length;
      }
      return length;
    }

    function entryEvent(entry) {
      return entry && entry.event ? entry.event : undefined;
    }

    /** Fold the loaded event window into the few live facts this view needs. */
    function summarize(entries) {
      let running = false;
      let turnText = 0;
      let lastToolSeq = -1;
      // Whether this turn has streamed or logged a tool call (the command line).
      let sawTool = false;
      for (const entry of entries) {
        const event = entryEvent(entry);
        if (event === undefined) continue;
        if (event.type === 'turn/start') {
          running = true;
          turnText = 0;
          sawTool = false;
        } else if (event.type === 'turn/end') {
          running = false;
        } else if (event.type === 'tool/call') {
          lastToolSeq = event.seq;
          sawTool = true;
        } else if (event.type === 'assistant/live-chunk') {
          const chunk = event.data && event.data.chunk;
          if (chunk === undefined) continue;
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') turnText += chunk.text.length;
          if (chunk.type === 'tool-call-delta' || (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'tool-call')) sawTool = true;
        } else if (event.type === 'assistant/message') {
          const message = event.data && event.data.message;
          turnText = Math.max(turnText, textLengthOf(message && message.content));
        }
      }
      return { running, turnText, lastToolSeq, sawTool };
    }

    /** Collect tool calls in the window and pair their results by callId. */
    function buildCalls(entries) {
      const calls = new Map();
      const ordered = [];
      for (const entry of entries) {
        const event = entryEvent(entry);
        if (event === undefined) continue;
        if (event.type === 'tool/call') {
          const data = event.data || {};
          const id = String(data.callId);
          const call = {
            id,
            seq: event.seq,
            time: event.time,
            name: typeof data.name === 'string' && data.name.length > 0 ? data.name : 'tool',
            command: commandOf(data.arguments),
            result: undefined,
          };
          calls.set(id, call);
          ordered.push(call);
        } else if (event.type === 'tool/result') {
          const data = event.data || {};
          const message = data.message || {};
          const call = calls.get(String(message.source && message.source.callId));
          if (call === undefined) continue;
          call.result = {
            time: event.time,
            isError: message.isError === true || data.error !== undefined,
            error: data.error,
          };
        }
      }
      return ordered;
    }

    /** Tool calls the model is still streaming (no durable tool/call yet). */
    function buildStreaming(entries) {
      const live = new Map();
      const order = [];
      for (const entry of entries) {
        const event = entryEvent(entry);
        if (event === undefined) continue;
        if (event.type === 'turn/start') {
          live.clear();
          order.length = 0;
          continue;
        }
        if (event.type === 'tool/call') {
          live.delete(String(event.data && event.data.callId));
          continue;
        }
        if (event.type !== 'assistant/live-chunk') continue;
        const chunk = event.data && event.data.chunk;
        if (chunk === undefined) continue;
        if (chunk.type === 'tool-call-delta') {
          const id = String(chunk.id);
          let call = live.get(id);
          if (call === undefined) {
            call = { id, name: '', args: '', time: event.time };
            live.set(id, call);
            order.push(call);
          }
          if (typeof chunk.name === 'string' && chunk.name.length > 0) call.name = chunk.name;
          if (typeof chunk.argumentsDelta === 'string') call.args += chunk.argumentsDelta;
        } else if (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'tool-call') {
          let id = chunk.block.id === undefined ? '' : String(chunk.block.id);
          if (id === '') {
            // The settled block may omit its id; adopt the newest live call.
            for (let index = order.length - 1; index >= 0; index -= 1) {
              if (live.has(order[index].id)) {
                id = order[index].id;
                break;
              }
            }
          }
          if (id === '') continue;
          let call = live.get(id);
          if (call === undefined) {
            call = { id, name: '', args: '', time: event.time };
            live.set(id, call);
            order.push(call);
          }
          if (typeof chunk.block.name === 'string' && chunk.block.name.length > 0) call.name = chunk.block.name;
          if (typeof chunk.block.arguments === 'string') call.args = chunk.block.arguments;
        }
      }
      return order.filter((call) => live.has(call.id));
    }

    function statusOf(call, running) {
      if (call.result === undefined) return running ? 'running' : 'pending';
      return call.result.isError ? 'error' : 'ok';
    }

    function errorText(call) {
      if (call.result === undefined || !call.result.isError) return '';
      const error = call.result.error;
      if (typeof error === 'string') return error;
      if (error && typeof error.message === 'string') return error.message;
      return '';
    }

    /** Advance every unfinished reveal by `step` characters; returns whether anything moved. */
    function advanceReveal(reveal, totals, step) {
      let changed = false;
      for (const [id, length] of totals) {
        const shown = reveal.get(id) ?? length;
        if (shown >= length) continue;
        reveal.set(id, Math.min(length, shown + step));
        changed = true;
      }
      return changed;
    }

    function useEventWindow(source) {
      const subscribe = useCallback((listener) => source.subscribe(listener), [source]);
      const snapshot = useCallback(() => source.getSnapshot(), [source]);
      return useSyncExternalStore(subscribe, snapshot, snapshot);
    }

    function readMode() {
      try {
        return localStorage.getItem(MODE_KEY) === 'off' ? 'off' : 'auto';
      } catch {
        return 'auto';
      }
    }

    function writeMode(mode) {
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {
        // A blocked storage area only loses the preference, never playback.
      }
    }

    /** Terminal transcript keeps one compact line for huge heredocs. */
    function compactCommand(text) {
      if (typeof text !== 'string' || text.length === 0) return '';
      const lines = text.split('\n');
      const first = lines[0].length > 160 ? `${lines[0].slice(0, 160)}…` : lines[0];
      return lines.length > 1 ? `${first}  (+${lines.length - 1} 行)` : first;
    }

    const SHELL_TOOLS = new Set(['bash', 'sh', 'shell', 'zsh', 'terminal', 'pwsh', 'powershell']);

    /** Prompt path: `~/dsh-workspace-tmp`, `…/a/b`, or `~`. */
    function shortPath(cwd) {
      if (typeof cwd !== 'string' || cwd.length === 0) return '~';
      let parts = cwd.split('/').filter(Boolean);
      if (parts[0] === 'Users' && parts.length >= 2) parts = parts.slice(2);
      if (parts.length === 0) return '~';
      if (parts.length <= 2) return `~/${parts.join('/')}`;
      return `…/${parts.slice(-2).join('/')}`;
    }

    function CmdRow({ call, running, t, promptPath, shownText, typing }) {
      const state = statusOf(call, running);
      const command = shownText.length > 0 ? shownText : '…';
      const duration = call.result === undefined ? '' : formatSeconds(call.time, call.result.time);
      const prefix = SHELL_TOOLS.has(call.name.toLowerCase()) ? '' : `${call.name} `;
      const meta =
        state === 'ok'
          ? `✓ ${duration}`
          : state === 'error'
            ? `✗ ${duration || t('status.error')}`
            : state === 'running'
              ? '…'
              : '';
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'ym-line', 'data-state': state },
          h('span', { className: 'ym-time' }, `[${formatClock(call.time)}]`),
          h('span', { className: 'ym-path', title: promptPath }, promptPath),
          h('span', { className: 'ym-dollar' }, '$'),
          h('span', { className: 'ym-cmd' }, prefix, command, typing ? h('span', { className: 'ym-cursor' }) : null),
          meta.length > 0 ? h('span', { className: `ym-meta ${state}` }, meta) : null,
        ),
        state === 'error' && errorText(call).length > 0 ? h('div', { className: 'ym-err' }, `! ${errorText(call)}`) : null,
      );
    }

    function StreamingRow({ call, t, promptPath, shownText }) {
      const prefix = SHELL_TOOLS.has(call.name.toLowerCase()) ? '' : `${call.name} `;
      return h(
        'div',
        { className: 'ym-line', 'data-state': 'streaming' },
        h('span', { className: 'ym-time' }, `[${formatClock(call.time)}]`),
        h('span', { className: 'ym-path', title: promptPath }, promptPath),
        h('span', { className: 'ym-dollar' }, '$'),
        h('span', { className: 'ym-cmd' }, prefix, shownText.length > 0 ? shownText : '…', h('span', { className: 'ym-cursor' })),
        h('span', { className: 'ym-meta streaming' }, t('status.streaming')),
      );
    }

    function YouthView(props) {
      const source = props.source || EMPTY_SOURCE;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const window_ = useEventWindow(source);
      const entries = window_.entries || [];
      const summary = useMemo(() => summarize(entries), [window_]);
      const calls = useMemo(() => buildCalls(entries), [window_]);
      // Rendering every loaded call would grow without bound on long sessions.
      const visibleCalls = calls.length > 300 ? calls.slice(-300) : calls;
      const streaming = useMemo(() => buildStreaming(entries), [window_]);
      const streamingLength = useMemo(() => streaming.reduce((length, call) => length + call.args.length, 0), [streaming]);
      const input = typeof props.useInput === 'function' ? props.useInput((state) => state) : undefined;
      const draftLength = input && typeof input.draft === 'string' ? input.draft.length : 0;
      const promptPath = useMemo(() => shortPath(props.cwd), [props.cwd]);

      const [config, setConfig] = useState(null);
      const [mode, setMode] = useState(readMode);
      const [trackName, setTrackName] = useState(bgm.trackName);
      const [active, setActive] = useState(false);
      const playingRef = useRef(false);
      const pendingRef = useRef(false);
      const previousRef = useRef(null);
      const idleTimerRef = useRef(null);
      const fadeTimerRef = useRef(null);
      const fadeTokenRef = useRef(0);
      const runModeRef = useRef(false);
      const typingActiveRef = useRef(false);
      // A long prompt arms the next turn so music starts at send time.
      const armedRef = useRef(false);
      const scrollRef = useRef(null);
      // Display-only typewriter: revealed character counts per call id.
      const revealRef = useRef(new Map());
      const totalsRef = useRef(new Map());
      const tickerRef = useRef(null);
      const baselineRef = useRef(false);
      const typingPendingRef = useRef(false);
      const typingAliveRef = useRef(null);
      const rotateRef = useRef(false);
      const [revealTick, bump] = useState(0);

      useEffect(() => {
        let cancelled = false;
        fetch(`${API}?config=1`, { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((value) => {
            if (!cancelled) setConfig(value);
          })
          .catch(() => {
            if (!cancelled) setConfig({ tracks: [], inChars: 24, outChars: 0, volume: 0.45, idleMs: 1500, fadeInMs: 10000, fadeOutMs: 10000, mode: 'auto' });
          });
        return () => {
          cancelled = true;
        };
      }, []);

      useEffect(() => {
        if (config === null) return;
        try {
          if (localStorage.getItem(MODE_KEY) === null) setMode(config.mode === 'off' ? 'off' : 'auto');
        } catch {
          // Ignore unavailable storage.
        }
      }, [config]);

      const fadeValue = (value, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
      };

      const volumeOf = useCallback(
        () => Math.min(1, Math.max(0, Number(config?.volume) || 0.45)),
        [config],
      );

      const cancelIdle = useCallback(() => {
        if (idleTimerRef.current === null) return;
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }, []);

      // Ramp the element volume instead of cutting the sound.
      const fadeTo = useCallback((target, duration, onDone) => {
        const audio = bgm.audio;
        if (audio === null) return;
        if (!(duration > 0)) {
          audio.volume = target;
          if (onDone !== undefined) onDone();
          return;
        }
        const token = ++fadeTokenRef.current;
        if (fadeTimerRef.current !== null) clearInterval(fadeTimerRef.current);
        const from = audio.volume;
        const startedAt = Date.now();
        fadeTimerRef.current = setInterval(() => {
          if (fadeTokenRef.current !== token || bgm.audio !== audio) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
            return;
          }
          const progress = Math.min(1, (Date.now() - startedAt) / duration);
          audio.volume = from + (target - from) * progress;
          if (progress < 1) return;
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
          if (onDone !== undefined) onDone();
        }, 30);
      }, []);

      const stop = useCallback(() => {
        cancelIdle();
        const audio = bgm.audio;
        playingRef.current = false;
        setActive(false);
        if (audio === null || audio.paused) {
          fadeTokenRef.current += 1;
          return;
        }
        const fadeOutMs = fadeValue(config === null ? undefined : config.fadeOutMs, 10000);
        fadeTo(0, fadeOutMs, () => {
          audio.pause();
        });
      }, [cancelIdle, config, fadeTo]);

      const play = useCallback((force = false) => {
        if ((!force && playingRef.current) || mode === 'off' || config === null) return;
        const tracks = Array.isArray(config.tracks) ? config.tracks : [];
        if (tracks.length === 0) return;
        let audio = bgm.audio;
        if (audio === null) {
          audio = bgm.audio = new Audio();
          audio.loop = true;
          audio.addEventListener('error', () => {
            bgm.loaded = false;
            playingRef.current = false;
            setActive(false);
          });
        }
        // Start from silence only when the element is actually paused; a
        // fade-out that is still running must reverse from its current level.
        if (audio.paused) audio.volume = 0;
        if (rotateRef.current) {
          rotateRef.current = false;
          bgm.loaded = false;
        }
        if (!bgm.loaded) {
          const pool = tracks.length > 1 ? tracks.filter((item) => item.id !== bgm.trackId) : tracks;
          const choices = pool.length > 0 ? pool : tracks;
          const track = choices[Math.floor(Math.random() * choices.length)];
          audio.src = `${API}?track=${encodeURIComponent(String(track.id))}&t=${Date.now()}`;
          bgm.loaded = true;
          bgm.trackId = track.id;
          bgm.trackName = track.name || '';
          setTrackName(bgm.trackName);
        }
        const started = audio.play();
        playingRef.current = true;
        setActive(true);
        const target = volumeOf();
        const fadeInMs = Math.max(10000, fadeValue(config === null ? undefined : config.fadeInMs, 10000));
        // Ramp only once playback actually started; during buffering the fade
        // would otherwise finish before the first audible sample.
        const begin = () => {
          if (!playingRef.current) return;
          fadeTo(target, fadeInMs);
        };
        if (started && typeof started.then === 'function') {
          started.then(begin).catch(() => {
            playingRef.current = false;
            pendingRef.current = true;
            setActive(false);
          });
        } else begin();
      }, [config, fadeTo, mode, volumeOf]);

      // One typing beat: start if silent, then fade out after a short silence.
      const kick = useCallback(() => {
        if (mode === 'off' || config === null) return;
        play();
        cancelIdle();
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          typingActiveRef.current = false;
          stop();
        }, Math.max(400, Number(config.idleMs) || 1500));
      }, [cancelIdle, config, mode, play, stop]);

      const skip = useCallback(() => {
        if (mode === 'off' || config === null) return;
        rotateRef.current = true;
        const audio = bgm.audio;
        if (audio === null || audio.paused) {
          play(true);
          kick();
          return;
        }
        // Fade the current song down first, then swap at silence and let the
        // new track ramp up over the normal 10-second fade-in.
        fadeTo(0, 600, () => {
          if (mode === 'off') {
            playingRef.current = false;
            setActive(false);
            return;
          }
          play(true);
          kick();
        });
      }, [config, fadeTo, kick, mode, play]);

      useEffect(() => {
        const unlock = () => {
          if (!pendingRef.current) return;
          pendingRef.current = false;
          kick();
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
        return () => {
          window.removeEventListener('pointerdown', unlock, true);
          window.removeEventListener('keydown', unlock, true);
        };
      }, [kick]);

      useEffect(
        () => () => {
          if (idleTimerRef.current !== null) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
          }
          fadeTokenRef.current += 1;
          if (fadeTimerRef.current !== null) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
          if (tickerRef.current !== null) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
          // Pause only: the element and its position survive a remount.
          if (bgm.audio !== null) bgm.audio.pause();
        },
        [],
      );

      useEffect(() => {
        if (config === null) return;
        const previous = previousRef.current;
        previousRef.current = {
          draft: draftLength,
          text: summary.turnText,
          tool: summary.lastToolSeq,
          running: summary.running,
        };
        // The first observation only sets a baseline: opening the tab must not
        // replay music from typing or output that happened before it existed.
        if (previous === null) return;
        if (mode === 'off') {
          runModeRef.current = false;
          typingActiveRef.current = false;
          armedRef.current = false;
          rotateRef.current = false;
          if (playingRef.current || idleTimerRef.current !== null) stop();
          return;
        }
        if (previous.running && !summary.running) {
          runModeRef.current = false;
          typingActiveRef.current = false;
          armedRef.current = false;
          rotateRef.current = false;
          // Let the last command finish typing; the idle timer fades after it.
          if (!typingPendingRef.current && (playingRef.current || idleTimerRef.current !== null)) stop();
          return;
        }
        if (summary.running && !previous.running) {
          // A long prompt starts music at send time, so thinking and tool gaps
          // are covered; otherwise the first output starts it.
          runModeRef.current = playingRef.current || armedRef.current;
          armedRef.current = false;
          // A new turn gets a new random song, unless the current one is still
          // playing from the typing phase.
          if (runModeRef.current && !playingRef.current) rotateRef.current = true;
        }

        const outChars = Number(config.outChars) || 0;
        // A streamed command line starts continuous playback for the rest of
        // the turn; the model's response counts too (`outChars: 0` means its
        // first streamed character).
        const textStreamed = summary.turnText > 0 && (outChars <= 0 || summary.turnText >= outChars);
        if (summary.running && (summary.sawTool || textStreamed)) runModeRef.current = true;
        if (summary.running && runModeRef.current) {
          cancelIdle();
          if (!playingRef.current) play();
          return;
        }

        if (draftLength === 0 && !summary.running) {
          typingActiveRef.current = false;
          armedRef.current = false;
        }
        const inChars = Number(config.inChars) || 24;
        // Any edit counts as typing, including deletions; the threshold only
        // decides whether a fresh burst starts.
        if (draftLength !== previous.draft && (draftLength >= inChars || (typingActiveRef.current && draftLength > 0))) {
          typingActiveRef.current = true;
          if (draftLength >= inChars) armedRef.current = true;
          kick();
        }
      }, [cancelIdle, config, draftLength, kick, mode, play, stop, summary]);

      const typeCps = Number(config?.typeCps) || 30;
      useEffect(() => {
        const reveal = revealRef.current;
        let pending = false;
        for (const [id, length] of totalsRef.current) {
          if ((reveal.get(id) ?? length) < length) {
            pending = true;
            break;
          }
        }
        if (!pending) {
          if (tickerRef.current !== null) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
          return;
        }
        if (tickerRef.current !== null) return;
        const step = Math.max(1, Math.round((typeCps * 40) / 1000));
        tickerRef.current = setInterval(() => {
          if (advanceReveal(revealRef.current, totalsRef.current, step)) {
            bump((value) => value + 1);
            if (typingAliveRef.current !== null) typingAliveRef.current();
          } else {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
        }, 40);
      }, [revealTick, typeCps, window_, calls.length, streaming.length]);

      // Follow the log on every event: the panel itself when it scrolls,
      // otherwise the conversation scrollport the panel sits in.
      useEffect(() => {
        const element = scrollRef.current;
        if (element === null) return;
        const follow = () => {
          element.scrollTop = element.scrollHeight;
          const outer = element.closest('[data-conversation-scroll]');
          if (outer !== null) outer.scrollTop = outer.scrollHeight;
        };
        follow();
        const frame = requestAnimationFrame(follow);
        return () => cancelAnimationFrame(frame);
      }, [window_, calls.length, streaming.length, streamingLength, summary.running, revealTick]);

      const toggle = () => {
        const next = mode === 'off' ? 'auto' : 'off';
        setMode(next);
        writeMode(next);
        if (next === 'off') stop();
      };

      const bgmLabel = mode === 'off' ? t('bgm.off') : active && trackName.length > 0 ? `♪ ${trackName}` : t('bgm.on');

      const reveal = revealRef.current;
      const totals = new Map();
      // The first non-empty snapshot is history: show it whole. Only rows that
      // appear after that baseline get the typewriter.
      const hasRows = visibleCalls.length + streaming.length > 0;
      const animate = baselineRef.current;
      const revealed = (id, text) => {
        if (!reveal.has(id)) reveal.set(id, animate ? 0 : text.length);
        const shown = Math.min(reveal.get(id), text.length);
        totals.set(id, text.length);
        return shown;
      };
      let typingPending = false;
      const renderedCalls = visibleCalls.map((call) => {
        const text = compactCommand(call.command);
        const shown = revealed(call.id, text);
        if (shown < text.length) typingPending = true;
        return h(CmdRow, {
          key: `${call.id}:${call.seq}`,
          call,
          running: summary.running,
          t,
          promptPath,
          shownText: text.slice(0, shown),
          typing: shown < text.length,
        });
      });
      const renderedStreaming = streaming.map((call) => {
        const text = compactCommand(partialCommand(call.args));
        const shown = revealed(call.id, text);
        if (shown < text.length) typingPending = true;
        return h(StreamingRow, { key: `stream:${call.id}`, call, t, promptPath, shownText: text.slice(0, shown) });
      });
      typingPendingRef.current = typingPending;
      typingAliveRef.current = () => {
        if (mode !== 'off' && config !== null) kick();
      };
      totalsRef.current = totals;
      if (hasRows) baselineRef.current = true;
      for (const id of reveal.keys()) if (!totals.has(id)) reveal.delete(id);

      return h(
        'div',
        { className: 'ym-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'ym-scroll', ref: scrollRef },
          renderedCalls,
          renderedStreaming,
          calls.length === 0 && streaming.length === 0
            ? h(
                'div',
                { className: 'ym-line idle' },
                h('span', { className: 'ym-time' }, '[--:--:--]'),
                h('span', { className: 'ym-path', title: promptPath }, promptPath),
                h('span', { className: 'ym-dollar' }, '$'),
                h('span', { className: 'ym-cmd' }, h('span', { className: 'ym-cursor' })),
              )
            : summary.running && streaming.length === 0
              ? h(
                  'div',
                  { className: 'ym-line idle' },
                  h('span', { className: 'ym-time' }, `[${formatClock(Date.now())}]`),
                  h('span', { className: 'ym-path', title: promptPath }, promptPath),
                  h('span', { className: 'ym-dollar' }, '$'),
                  h('span', { className: 'ym-cmd' }, h('span', { className: 'ym-cursor' })),
                )
              : null,
        ),
        h(
          'div',
          { className: 'ym-foot' },
          h('span', { className: `ym-dot${summary.running ? ' busy' : ''}` }),
          h('span', { className: `ym-state${summary.running ? ' busy' : ''}` }, summary.running ? t('running') : t('idle')),
          h('span', { className: 'ym-count' }, `${calls.length} ${t('calls')}`),
          h('span', { className: 'ym-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'ym-next',
              onClick: skip,
              title: t('bgm.next'),
              'aria-label': t('bgm.next'),
            },
            '⏭',
          ),
          h(
            'button',
            {
              type: 'button',
              className: `ym-bgm${mode === 'off' ? '' : ' on'}`,
              onClick: toggle,
              title: t('bgm.toggle'),
              'aria-pressed': mode === 'off',
            },
            bgmLabel,
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      // Exposed for the offline smoke test; the Loader ignores extra fields.
      __test: { commandOf, partialCommand, summarize, buildCalls, buildStreaming, advanceReveal },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'youth-mode: dictionaries');
        ctx.slots.inject('conversation.view', () =>
          ctx.slots.register(
            {
              name: 'conversation.view',
              id: 'youth-mode',
              order: 10,
              locale: NS,
              label: () => ctx.locale.bind(NS)('view.label'),
              inject: (sessionId) => {
                const binding = ctx.sessions.binding(sessionId);
                const row = ctx.sessions.list?.getSnapshot?.().byId?.[sessionId];
                return {
                  sessionId,
                  source: binding === undefined ? EMPTY_SOURCE : binding.eventSource,
                  cwd: row?.cwd,
                  t: (key) => ctx.locale.bind(NS)(key),
                };
              },
            },
            YouthView,
          ),
        );
      },
    };
  },
});
