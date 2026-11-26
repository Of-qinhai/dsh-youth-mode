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
    const { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'youth-mode';
    const API = '/api/youth-mode-bgm';
    const MODE_KEY = 'youth-mode.bgm.mode';
    const VOLUME_KEY = 'youth-mode.bgm.volume';
    // One element per plugin instance: remounting the tab must not restart the track.
    const bgm = { audio: null, graph: null, loaded: false, trackName: '', trackId: null, pausedByUser: false };
    const PLAYLIST_REFRESH_MS = 10000;
    const SPECTRUM_BANDS = 20;
    const SPECTRUM_LEVELS = 14;
    const PEAK_HOLD_MS = 120;
    const PEAK_FALL_PER_SECOND = 18;
    const BAR_FALL_PER_SECOND = 72;
    const TYPE_TICK_MS = 40;
    const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
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
      'bgm.choose': '选择曲目',
      'bgm.toggle': '切换 BGM 自动播放',
      'bgm.next': '下一首',
      'bgm.play': '播放',
      'bgm.pause': '暂停',
      'bgm.openFolder': '打开音乐目录',
      'bgm.openFolderError': '无法打开音乐目录。',
      'bgm.playlist': '歌单',
      'bgm.volume': '音量',
      'bgm.loading': '正在读取曲目…',
      'bgm.empty': '曲库为空。可将音乐放进 audio/ 目录。',
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
      'bgm.choose': 'Choose a track',
      'bgm.toggle': 'Toggle automatic BGM',
      'bgm.next': 'Next track',
      'bgm.play': 'Play',
      'bgm.pause': 'Pause',
      'bgm.openFolder': 'Open music folder',
      'bgm.openFolderError': 'Could not open the music folder.',
      'bgm.playlist': 'Playlist',
      'bgm.volume': 'Volume',
      'bgm.loading': 'Loading tracks…',
      'bgm.empty': 'No tracks. Add music to the audio/ folder.',
      'status.running': 'running',
      'status.ok': 'done',
      'status.error': 'failed',
      'status.streaming': 'streaming',
      'bgm.hint': 'input/output triggers · click to toggle',
    };

    const CSS = `
.ym-root{--ym-accent:#8ff8be;--ym-muted:#92a3ad;box-sizing:border-box;display:flex;flex-direction:column;height:100%;max-height:calc(var(--dsh-conversation-viewport-height,100dvh) - var(--dsh-composer-height,152px));min-height:0;overflow:hidden;container-type:inline-size;border:1px solid #2c3940;border-radius:10px;background:linear-gradient(150deg,#131d23,#0c1016 62%);color:#e5edf3;color-scheme:dark;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
.ym-scroll{flex:1;min-height:0;overflow-y:auto;overflow-anchor:none;padding:12px 12px 16px;scrollbar-width:thin;scrollbar-color:#43545d transparent}
.ym-line{display:flex;align-items:baseline;gap:8px;padding:4px 8px;border-inline-start:2px solid transparent;border-radius:2px;font-size:12.5px;line-height:1.65;flex-wrap:wrap}
.ym-line:nth-child(even){background:#d1e2f006}
.ym-line:hover{background:#d1e2f00e}
.ym-line[data-state=streaming],.ym-line[data-state=running]{border-inline-start-color:var(--ym-accent);background:#8ff8be0e}
.ym-line[data-state=error]{border-inline-start-color:#fa8d99}
.ym-time{color:var(--ym-muted);white-space:nowrap;min-width:10ch;font-variant-numeric:tabular-nums}
.ym-path{color:#9ed6ed;white-space:nowrap;max-width:min(40ch,37%);overflow:hidden;text-overflow:ellipsis}
.ym-dollar{color:var(--ym-accent);white-space:nowrap}
.ym-cmd{flex:1;min-width:0;color:#e5edf3;white-space:pre-wrap;overflow-wrap:anywhere}
.ym-meta{flex:none;color:var(--ym-muted);font-size:11px;white-space:nowrap}
.ym-meta.ok,.ym-meta.streaming{color:var(--ym-accent)}
.ym-meta.error{color:#fa8d99}
.ym-meta.running{color:#f4c47a}
.ym-err{margin:0 0 5px;padding-left:18px;color:#fca5a5;font-size:11.5px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:hidden}
.ym-cursor{display:inline-block;width:7px;height:12px;margin-left:3px;background:var(--ym-accent);box-shadow:0 0 8px #8ff8be70;vertical-align:-1px;animation:ym-blink 1.1s steps(2,start) infinite}
.ym-foot{flex:none;display:grid;grid-template-columns:auto minmax(0,1fr) minmax(185px,30%);align-items:center;gap:16px;padding:11px 14px;border-top:1px solid #33444e;background:linear-gradient(180deg,#182329,#10191e);font-size:11px}
.ym-status{display:flex;align-items:center;gap:8px;white-space:nowrap;color:var(--ym-muted)}
.ym-dot{flex:none;width:6px;height:6px;background:#829ba4}
.ym-dot.busy{background:var(--ym-accent);box-shadow:0 0 9px #8ff8be90}
.ym-state{color:#d8e6ed}
.ym-state.busy{color:var(--ym-accent)}
.ym-count{padding-inline-start:8px;border-inline-start:1px solid #3a494f;font-variant-numeric:tabular-nums}
.ym-spectrum{box-sizing:border-box;display:block;inline-size:100%;block-size:64px;min-inline-size:0;padding:6px 10px;border:1px solid #304148;border-radius:4px;background:linear-gradient(180deg,#0c161a,#091014);contain:paint}
.ym-transport{display:flex;align-items:center;min-inline-size:0;gap:6px}
.ym-player{display:flex;align-items:center;gap:5px}
.ym-player button{display:grid;place-items:center;min-block-size:30px;min-inline-size:30px;padding:0;border:1px solid #455961;border-radius:4px;background:#18252c;color:#d4e2ea;font:inherit;cursor:pointer}
.ym-player button:hover:not(:disabled){background:#263b42;border-color:#8aadb3}
.ym-player button:disabled{opacity:.45;cursor:default}
.ym-player button:focus-visible,.ym-transport>button:focus-visible{outline:2px solid var(--ym-accent);outline-offset:2px}
.ym-player .ym-playback{color:#10221b;background:var(--ym-accent);border-color:var(--ym-accent)}
.ym-player .ym-playback:hover:not(:disabled){background:#b4ffd6;border-color:#b4ffd6}
.ym-player button[aria-pressed=true]{background:#1c3a2e;border-color:#51876c;color:var(--ym-accent)}
.ym-icon-pause{box-sizing:border-box;width:9px;height:10px;border-inline:3px solid currentColor}
.ym-icon-folder{position:relative;box-sizing:border-box;width:14px;height:10px;margin-block-start:3px;border:1.5px solid currentColor;border-radius:2px}
.ym-icon-folder::before{content:"";position:absolute;inset-block-start:-4px;inset-inline-start:-1.5px;box-sizing:border-box;width:7px;height:4px;border:1.5px solid currentColor;border-block-end:0;border-radius:2px 2px 0 0}
.ym-transport>.ym-track,.ym-playlist-fallback>.ym-track{box-sizing:border-box;display:flex;flex:1;align-items:center;gap:7px;min-inline-size:0;min-block-size:30px;padding:0 7px;border:1px solid transparent;border-radius:4px;background:transparent;color:#d4e2ea;font:inherit;text-align:start;cursor:pointer;list-style:none}
.ym-track .ym-track-name{min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ym-track::after{content:"";flex:none;width:4px;height:4px;border:solid currentColor;border-width:1px 1px 0 0;transform:translateY(1px) rotate(-45deg);opacity:.7}
.ym-playlist-fallback>.ym-track::-webkit-details-marker{display:none}
.ym-transport>.ym-track:hover:not(:disabled),.ym-playlist-fallback>.ym-track:hover,.ym-track:has(+ :popover-open),.ym-playlist-fallback[open]>.ym-track{background:#263b42;border-color:#455961;color:var(--ym-accent)}
.ym-playlist-panel{box-sizing:border-box;inline-size:min(360px,calc(100vw - 24px));max-block-size:min(360px,calc(100dvh - 24px));overflow:hidden;padding:0;border:1px solid #455d68;border-radius:9px;background:linear-gradient(145deg,#1b2b31,#111b20 50%);color:#e5edf3;box-shadow:0 16px 40px #05080bb3;color-scheme:dark;font:inherit;font-size:12px}
.ym-playlist-panel:is(:popover-open),.ym-playlist-fallback[open]>.ym-playlist-panel{display:flex;flex-direction:column}
.ym-playlist-panel[popover]:not(:popover-open){display:none}
@supports (position-area:block-start){.ym-playlist-panel[popover]{inset:auto;margin:8px 0;position-area:block-start span-inline-start;position-try-fallbacks:flip-block,flip-inline,flip-block flip-inline}}
.ym-playlist-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-block-end:1px solid #34474e}
.ym-playlist-title{margin:0;font-size:12px;font-weight:650}
.ym-playlist-list{list-style:none;margin:0;padding:5px 7px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#52666e transparent}
.ym-playlist-song{display:flex;align-items:center;gap:9px;text-align:start;inline-size:100%;min-block-size:38px;padding:6px 8px;border:1px solid transparent;border-radius:4px;background:transparent;color:#e1edf2;font:inherit;cursor:pointer;overflow-wrap:anywhere}
.ym-playlist-song:hover{background:#24383e}
.ym-playlist-song[aria-current=true]{border-color:#406854;background:#1b352b;color:#b2f8cf}
.ym-playlist-song:focus-visible,.ym-volume input:focus-visible,.ym-playlist-fallback summary:focus-visible{outline:2px solid var(--ym-accent);outline-offset:-2px}
.ym-song-icon{inline-size:13px;flex:none;color:#94acb2}
.ym-playlist-song[aria-current=true] .ym-song-icon{color:var(--ym-accent)}
.ym-playlist-empty{margin:0;padding:16px 14px;color:var(--ym-muted)}
.ym-folder-status:not(:empty){padding:8px 14px;color:#fca5a5}
.ym-volume{flex:none;display:grid;grid-template-columns:auto minmax(0,1fr) 4ch;align-items:center;gap:10px;padding:8px 14px;border-block-start:1px solid #34474e}
.ym-volume input{inline-size:100%;min-block-size:30px;margin:0;accent-color:var(--ym-accent);cursor:pointer}
@supports not (accent-color:auto){
  .ym-volume input{-webkit-appearance:none;appearance:none;background:transparent}
  .ym-volume input::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(to right,var(--ym-accent) var(--ym-volume),#435961 var(--ym-volume))}
  .ym-volume input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-4px;border-radius:50%;background:var(--ym-accent)}
}
.ym-volume-value{text-align:end;color:var(--ym-accent);font-variant-numeric:tabular-nums}
.ym-playlist-fallback{position:relative;flex:1;min-inline-size:0}
.ym-playlist-fallback>.ym-playlist-panel{position:absolute;inset-block-end:calc(100% + 8px);inset-inline-end:0;max-inline-size:min(360px,65vw);max-block-size:40dvh;z-index:1}
@keyframes ym-blink{0%,100%{opacity:1}50%{opacity:0}}
@container (max-width:560px){.ym-foot{grid-template-columns:auto minmax(0,1fr);gap:8px;padding:8px 10px}.ym-spectrum{grid-column:1/-1;grid-row:1;block-size:50px}}
@container (max-width:340px){.ym-foot{grid-template-columns:minmax(0,1fr)}.ym-spectrum{grid-column:1}}
@media (pointer:coarse){.ym-player button,.ym-transport>.ym-track,.ym-playlist-fallback>.ym-track{min-block-size:40px;min-inline-size:40px}}
@media (prefers-reduced-motion:reduce){.ym-cursor{animation:none}}
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

    function typewriterStep(typeCps, credit, onBeat) {
      const available = credit + typeCps * TYPE_TICK_MS * (onBeat ? 2 : 1);
      const count = Math.floor(available / 1000);
      return { count, credit: available - count * 1000 };
    }

    function connectSpectrum(audio) {
      // Keep the element on its native output until Web Audio is allowed to run.
      if (!window.AudioContext || window.navigator.userActivation?.hasBeenActive === false) return;
      try {
        bgm.graph ??= { context: new window.AudioContext(), analyser: null };
      } catch {
        return;
      }
      const graph = bgm.graph;
      const { context } = graph;
      if (graph.analyser && context.state === 'running') return;
      context.resume().then(() => {
        if (bgm.graph !== graph || graph.analyser) return;
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.12;
        analyser.connect(context.destination);
        context.createMediaElementSource(audio).connect(analyser);
        graph.analyser = analyser;
        graph.spectrum = new Float32Array(analyser.frequencyBinCount);
        const hzPerBin = context.sampleRate / analyser.fftSize;
        const highHz = Math.min(12000, context.sampleRate / 2);
        graph.edges = Array.from({ length: SPECTRUM_BANDS + 1 }, (_, index) =>
          Math.round(45 * (highHz / 45) ** (index / SPECTRUM_BANDS) / hzPerBin),
        );
        graph.bassStart = Math.ceil(45 / hzPerBin);
        graph.bassEnd = Math.floor(160 / hzPerBin);
      }).catch(() => {
        // The element can still play when analysis cannot be initialized.
      });
    }

    function detectBeat(pulse, energy, now, elapsed) {
      const { average, previous, until } = pulse;
      if (now >= until + 130 && energy > 0.00004 && energy > average * 2.5 && energy > previous * 1.5) {
        pulse.until = now + 110;
      }
      const weight = 1 - Math.exp(-elapsed / 520);
      pulse.average = average + (energy - average) * weight;
      pulse.previous = energy;
    }

    function updateMeterBand(band, target, now, elapsed) {
      band.level = Math.max(target, band.level - BAR_FALL_PER_SECOND * elapsed / 1000);
      if (target >= band.peak) {
        band.peak = target;
        band.holdUntil = now + PEAK_HOLD_MS;
      } else {
        const fallTime = Math.max(0, Math.min(elapsed, now - band.holdUntil));
        band.peak = Math.max(band.level, band.peak - PEAK_FALL_PER_SECOND * fallTime / 1000);
      }
    }

    const METER_COLORS = ['#27694f', '#3fa782', '#62d7ab', '#93e6be', '#c1e6a8', '#e7be79'];

    function paintSpectrum(context, bands) {
      const { width, height } = context.canvas;
      const column = width / SPECTRUM_BANDS;
      const row = height / SPECTRUM_LEVELS;
      const blockWidth = Math.round(column * 0.72);
      context.clearRect(0, 0, width, height);
      for (let index = 0; index < bands.length; index += 1) {
        const { level, peak } = bands[index];
        const x = Math.round(index * column + (column - blockWidth) / 2);
        const lit = Math.round(level);
        for (let step = 0; step < SPECTRUM_LEVELS; step += 1) {
          const color = METER_COLORS[Math.floor(step * METER_COLORS.length / SPECTRUM_LEVELS)];
          context.fillStyle = step < lit ? color : '#172429';
          context.fillRect(x, height - (step + 1) * row + 2, blockWidth, row - 2);
        }
        const peakStep = Math.round(peak);
        if (peakStep > lit) {
          context.fillStyle = peakStep >= 11 ? '#ffdc9b' : '#c3f7d7';
          context.fillRect(x, height - peakStep * row + 2, blockWidth, 3);
        }
      }
    }

    function useEventWindow(source) {
      const subscribe = useCallback((listener) => source.subscribe(listener), [source]);
      const snapshot = useCallback(() => source.getSnapshot(), [source]);
      return useSyncExternalStore(subscribe, snapshot, snapshot);
    }

    function readMode() {
      try {
        const mode = localStorage.getItem(MODE_KEY);
        if (mode === 'off' || mode === 'auto') return mode;
      } catch {
        // The host determines the default when browser storage is unavailable.
      }
      return null;
    }

    function readVolume() {
      try {
        const saved = localStorage.getItem(VOLUME_KEY);
        const value = Number(saved);
        if (saved && value >= 0 && value <= 1) return value;
      } catch {
        // The host default applies when browser storage is unavailable.
      }
      return null;
    }

    function writePreference(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // A blocked storage area only loses the preference, never playback.
      }
    }

    function trackTitle(name) {
      return name.replace(/\.[^.]+$/, '') || name;
    }

    function nextTrack(tracks, currentId) {
      const index = tracks.findIndex((track) => (track.key ?? track.id) === currentId);
      return tracks[index + 1] ?? tracks[0];
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
      const [savedMode, setMode] = useState(readMode);
      const mode = savedMode ?? config?.mode ?? 'auto';
      const [pausedByUser, setPausedByUser] = useState(bgm.pausedByUser);
      const [track, setTrack] = useState(() => ({ id: bgm.trackId, name: bgm.trackName }));
      const [active, setActive] = useState(false);
      const [folderStatus, setFolderStatus] = useState('idle');
      const [savedVolume, setSavedVolume] = useState(readVolume);
      const volume = savedVolume ?? config?.volume ?? 0.45;
      const volumeRef = useRef(volume);
      const fadeLevelRef = useRef(0);
      const playlistId = useId();
      const playingRef = useRef(false);
      const playTokenRef = useRef(0);
      const pendingRef = useRef(false);
      const previousRef = useRef(null);
      const idleTimerRef = useRef(null);
      const fadeTimerRef = useRef(null);
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
      const autoStartedRef = useRef(false);
      const canvasRef = useRef(null);
      const beatUntilRef = useRef(0);
      const [revealTick, bump] = useState(0);
      const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.(REDUCED_MOTION).matches ?? false);

      useEffect(() => {
        const preference = window.matchMedia?.(REDUCED_MOTION);
        const update = () => setReducedMotion(preference.matches);
        preference?.addEventListener('change', update);
        return () => preference?.removeEventListener('change', update);
      }, []);

      useEffect(() => {
        const controller = new AbortController();
        let pending = false;
        let previous;
        async function refresh() {
          if (pending || document.hidden) return;
          pending = true;
          try {
            const response = await fetch(`${API}?config=1`, { credentials: 'same-origin', signal: controller.signal });
            if (!response.ok) return;
            const body = await response.text();
            if (controller.signal.aborted || body === previous) return;
            const value = JSON.parse(body);
            setConfig(value);
            previous = body;
          } catch {
            // Keep the last good playlist during a temporary disconnect.
          } finally {
            pending = false;
          }
        }
        void refresh();
        const timer = setInterval(refresh, PLAYLIST_REFRESH_MS);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => {
          controller.abort();
          clearInterval(timer);
          document.removeEventListener('visibilitychange', refresh);
          window.removeEventListener('focus', refresh);
        };
      }, []);

      const fadeValue = (value, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
      };

      useEffect(() => {
        volumeRef.current = volume;
        if (bgm.audio) bgm.audio.volume = volume * fadeLevelRef.current;
      }, [volume]);

      const cancelIdle = useCallback(() => {
        if (idleTimerRef.current === null) return;
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }, []);

      const cancelFade = useCallback(() => {
        if (fadeTimerRef.current === null) return;
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }, []);

      // Keep the fade separate so a slider change takes effect even mid-fade.
      const fadeTo = useCallback((target, duration, onDone) => {
        const audio = bgm.audio;
        if (audio === null) return;
        cancelFade();
        const from = fadeLevelRef.current;
        const startedAt = performance.now();
        fadeTimerRef.current = setInterval(() => {
          const progress = Math.min(1, (performance.now() - startedAt) / duration);
          const level = from + (target - from) * progress;
          fadeLevelRef.current = level;
          audio.volume = volumeRef.current * level;
          if (progress < 1) return;
          cancelFade();
          onDone?.();
        }, 30);
      }, [cancelFade]);

      const stop = useCallback((immediate = false) => {
        cancelIdle();
        const audio = bgm.audio;
        playTokenRef.current += 1;
        pendingRef.current = false;
        playingRef.current = false;
        if (immediate || audio === null || audio.paused) {
          cancelFade();
          audio?.pause();
          setActive(false);
          return;
        }
        const fadeOutMs = fadeValue(config?.fadeOutMs, 10000);
        fadeTo(0, fadeOutMs, () => {
          audio.pause();
          setActive(false);
        });
      }, [cancelFade, cancelIdle, config, fadeTo]);

      const play = useCallback((selected = null) => {
        if (config === null) return;
        if (selected === null && (mode === 'off' || pausedByUser || playingRef.current || pendingRef.current)) return;
        const tracks = config.tracks ?? [];
        const track = selected ?? tracks.find((item) => (item.key ?? item.id) === bgm.trackId) ?? tracks[0];
        if (!track) return;
        let audio = bgm.audio;
        if (audio === null) {
          audio = bgm.audio = new Audio();
          audio.loop = true;
        }
        audio.onerror = () => {
          bgm.loaded = false;
          playingRef.current = false;
          setActive(false);
        };
        cancelFade();
        // Resume a fade from its current level unless the element is paused.
        if (audio.paused) {
          fadeLevelRef.current = 0;
          audio.volume = 0;
        }
        const id = track.key ?? track.id;
        if (!bgm.loaded || id !== bgm.trackId) {
          const query = new URLSearchParams({ t: String(Date.now()) });
          if (track.key) query.set('key', track.key);
          else query.set('track', String(track.id));
          audio.src = `${API}?${query}`;
          setActive(false);
          bgm.loaded = true;
          bgm.trackId = id;
          bgm.trackName = track.name || '';
          setTrack({ id: bgm.trackId, name: bgm.trackName });
        }
        const token = ++playTokenRef.current;
        pendingRef.current = false;
        playingRef.current = true;
        const started = audio.play();
        const fadeInMs = selected === null ? Math.max(10000, fadeValue(config.fadeInMs, 10000)) : 350;
        // Ramp only once playback actually started; during buffering the fade
        // would otherwise finish before the first audible sample.
        const begin = () => {
          if (playTokenRef.current !== token || !playingRef.current) return;
          if (!reducedMotion) connectSpectrum(audio);
          setActive(true);
          fadeTo(1, fadeInMs);
        };
        if (started && typeof started.then === 'function') {
          started.then(begin).catch((error) => {
            if (playTokenRef.current !== token) return;
            playingRef.current = false;
            pendingRef.current = error.name === 'NotAllowedError';
            setActive(false);
          });
        } else begin();
      }, [cancelFade, config, fadeTo, mode, pausedByUser, reducedMotion]);

      useEffect(() => {
        if (mode === 'off') {
          autoStartedRef.current = false;
          return;
        }
        if (autoStartedRef.current || pausedByUser || !config?.tracks?.length) return;
        autoStartedRef.current = true;
        play();
      }, [config, mode, pausedByUser, play]);

      // One typing beat: start if silent, then fade out after a short silence.
      const kick = useCallback(() => {
        if (mode === 'off' || pausedByUser || config === null) return;
        play();
        cancelIdle();
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          typingActiveRef.current = false;
          stop();
        }, Math.max(400, Number(config.idleMs) || 1500));
      }, [cancelIdle, config, mode, pausedByUser, play, stop]);

      const switchTrack = (selected) => {
        if (!selected) return;
        if (mode === 'off') {
          setMode('auto');
          writePreference(MODE_KEY, 'auto');
        }
        bgm.pausedByUser = false;
        setPausedByUser(false);
        cancelIdle();
        playTokenRef.current += 1;
        const audio = bgm.audio;
        if (!audio || audio.paused || (selected.key ?? selected.id) === bgm.trackId) {
          play(selected);
        } else {
          playingRef.current = true;
          fadeTo(0, 180, () => play(selected));
        }
      };

      useEffect(() => {
        const unlock = () => {
          if (mode === 'off' || pausedByUser) return;
          if (!reducedMotion && bgm.audio && (!bgm.audio.paused || pendingRef.current)) {
            connectSpectrum(bgm.audio);
          }
          if (!pendingRef.current) return;
          pendingRef.current = false;
          if (idleTimerRef.current !== null && !runModeRef.current) kick();
          else play();
        };
        window.addEventListener('click', unlock, true);
        window.addEventListener('keydown', unlock, true);
        return () => {
          window.removeEventListener('click', unlock, true);
          window.removeEventListener('keydown', unlock, true);
        };
      }, [kick, mode, pausedByUser, play, reducedMotion]);

      useEffect(() => {
        const context = canvasRef.current?.getContext('2d');
        if (!context) return;
        const bands = Array.from({ length: SPECTRUM_BANDS }, () => ({ level: 0, peak: 0, holdUntil: 0 }));
        paintSpectrum(context, bands);
        if (!active || mode === 'off' || reducedMotion) return;
        if (bgm.audio && !bgm.audio.paused) connectSpectrum(bgm.audio);

        const pulse = { average: 0, previous: 0, until: -Infinity };
        let lastFrame = performance.now();
        let frame;
        const update = (now) => {
          frame = requestAnimationFrame(update);
          const elapsed = now - lastFrame;
          if (elapsed < 16) return;
          lastFrame = now;
          const graph = bgm.graph;
          if (!graph?.analyser || graph.context.state !== 'running' || bgm.audio.paused || bgm.audio.volume < 0.008) {
            if (bands.some(({ peak }) => peak > 0)) {
              for (const band of bands) updateMeterBand(band, 0, now, elapsed);
              paintSpectrum(context, bands);
            }
            beatUntilRef.current = 0;
            return;
          }
          const { analyser, spectrum, edges, bassStart, bassEnd } = graph;
          analyser.getFloatFrequencyData(spectrum);
          let bass = 0;
          for (let bin = bassStart; bin <= bassEnd; bin += 1) bass += 10 ** (spectrum[bin] / 10);
          detectBeat(pulse, bass / (bassEnd - bassStart + 1), now, elapsed);
          beatUntilRef.current = pulse.until;

          for (let band = 0; band < SPECTRUM_BANDS; band += 1) {
            const start = edges[band];
            const end = Math.max(start + 1, edges[band + 1]);
            let peak = -Infinity;
            for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, spectrum[bin]);
            // Compensate for quieter treble so the upper bands stay legible.
            const compensated = peak + 7 * band / (SPECTRUM_BANDS - 1);
            const strength = Math.min(1, Math.max(0, (compensated + 70) / 41));
            updateMeterBand(bands[band], strength ** 1.2 * SPECTRUM_LEVELS, now, elapsed);
          }
          paintSpectrum(context, bands);
        };
        frame = requestAnimationFrame(update);
        return () => {
          cancelAnimationFrame(frame);
          beatUntilRef.current = 0;
        };
      }, [active, mode, reducedMotion, track.id]);

      useEffect(
        () => () => {
          cancelIdle();
          cancelFade();
          playTokenRef.current += 1;
          if (tickerRef.current !== null) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
          // Pause only: the element and its position survive a remount.
          playingRef.current = false;
          if (bgm.audio !== null) {
            bgm.audio.onerror = null;
            bgm.audio.pause();
          }
        },
        [cancelFade, cancelIdle],
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
        if (mode === 'off' || pausedByUser) {
          runModeRef.current = false;
          typingActiveRef.current = false;
          armedRef.current = false;
          if (playingRef.current || idleTimerRef.current !== null) stop(true);
          return;
        }
        if (previous.running && !summary.running) {
          runModeRef.current = false;
          typingActiveRef.current = false;
          armedRef.current = false;
          // Let the last command finish typing; the idle timer fades after it.
          if (!typingPendingRef.current && (playingRef.current || idleTimerRef.current !== null)) stop();
          return;
        }
        if (summary.running && !previous.running) {
          // A long prompt starts music at send time, so thinking and tool gaps
          // are covered; otherwise the first output starts it.
          runModeRef.current = playingRef.current || armedRef.current;
          armedRef.current = false;
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
      }, [cancelIdle, config, draftLength, kick, mode, pausedByUser, play, stop, summary]);

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
        let credit = 0;
        tickerRef.current = setInterval(() => {
          const step = typewriterStep(typeCps, credit, performance.now() < beatUntilRef.current);
          credit = step.credit;
          if (step.count === 0) return;
          if (advanceReveal(revealRef.current, totalsRef.current, step.count)) {
            bump((value) => value + 1);
            if (typingAliveRef.current !== null) typingAliveRef.current();
          } else {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
          }
        }, TYPE_TICK_MS);
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
        writePreference(MODE_KEY, next);
        if (next === 'off') stop(true);
      };

      const tracks = config?.tracks ?? [];
      const selected = tracks.find((song) => (song.key ?? song.id) === track.id) ?? tracks[0];
      const isPlaying = mode !== 'off' && active && !pausedByUser;
      const selectedId = isPlaying ? track.id : (selected?.key ?? selected?.id);
      const trackName = isPlaying ? track.name : selected?.name ?? track.name;
      const trackLabel = trackName ? trackTitle(trackName) : t('bgm.choose');
      const playbackLabel = t(isPlaying ? 'bgm.pause' : 'bgm.play');
      const openFolderLabel = t('bgm.openFolder');
      const openFolder = async () => {
        setFolderStatus('opening');
        try {
          const response = await fetch(`${API}/open-folder`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'x-youth-mode-action': 'open-folder' },
          });
          setFolderStatus(response.status === 204 ? 'idle' : 'error');
        } catch {
          setFolderStatus('error');
        }
      };
      const togglePlayback = () => {
        if (!isPlaying) {
          switchTrack(selected);
          return;
        }
        bgm.pausedByUser = true;
        setPausedByUser(true);
        stop(true);
      };
      const nativePopover = window.HTMLElement && 'popover' in window.HTMLElement.prototype;
      const trackTrigger = h(nativePopover ? 'button' : 'summary', {
        className: 'ym-track',
        type: nativePopover ? 'button' : undefined,
        popoverTarget: nativePopover ? playlistId : undefined,
        title: trackLabel,
        'aria-label': trackName ? `${trackLabel} · ${t('bgm.playlist')}` : undefined,
      }, h('span', { className: 'ym-track-name' }, trackLabel));
      const volumePercent = Math.round(volume * 100);
      const playlist = h(
        'section',
        { id: playlistId, className: 'ym-playlist-panel', popover: nativePopover ? 'auto' : undefined, 'aria-labelledby': `${playlistId}-title` },
        h(
          'div',
          { className: 'ym-playlist-head' },
          h('h2', { id: `${playlistId}-title`, className: 'ym-playlist-title' }, t('bgm.playlist')),
          h(
            'div',
            { className: 'ym-player' },
            h('button', {
              type: 'button',
              onClick: openFolder,
              disabled: folderStatus === 'opening',
              title: openFolderLabel,
              'aria-label': openFolderLabel,
            }, h('span', { className: 'ym-icon-folder', 'aria-hidden': true })),
            h('button', {
              type: 'button',
              className: 'ym-playback',
              onClick: togglePlayback,
              disabled: !selected && !isPlaying,
              title: playbackLabel,
              'aria-label': playbackLabel,
            }, isPlaying ? h('span', { className: 'ym-icon-pause', 'aria-hidden': true }) : '▶'),
            h('button', {
              type: 'button',
              onClick: () => switchTrack(nextTrack(tracks, track.id)),
              disabled: mode === 'off' || tracks.length < 2,
              title: t('bgm.next'),
              'aria-label': t('bgm.next'),
            }, '⏭\uFE0E'),
            h('button', {
              type: 'button',
              onClick: toggle,
              title: t('bgm.toggle'),
              'aria-label': t('bgm.toggle'),
              'aria-pressed': mode === 'auto',
            }, '♪'),
          ),
        ),
        tracks.length > 0
          ? h('ul', { className: 'ym-playlist-list', role: 'list' }, tracks.map((song) => {
              const id = song.key ?? song.id;
              const current = id === selectedId;
              return h('li', { key: id }, h(
                'button',
                {
                  type: 'button',
                  className: 'ym-playlist-song',
                  'aria-current': current || undefined,
                  title: song.name,
                  onClick: () => switchTrack(song),
                },
                h('span', { className: 'ym-song-icon', 'aria-hidden': true }, current && isPlaying ? '▶' : '♪'),
                h('span', null, trackTitle(song.name)),
              ));
            }))
          : h('p', { className: 'ym-playlist-empty' }, t(config === null ? 'bgm.loading' : 'bgm.empty')),
        h('div', { className: 'ym-folder-status', role: 'status' }, folderStatus === 'error' ? t('bgm.openFolderError') : ''),
        h(
          'div',
          { className: 'ym-volume' },
          h('label', { htmlFor: `${playlistId}-volume` }, t('bgm.volume')),
          h('input', {
            id: `${playlistId}-volume`,
            type: 'range',
            min: 0,
            max: 100,
            value: volumePercent,
            style: { '--ym-volume': `${volumePercent}%` },
            'aria-valuetext': `${volumePercent}%`,
            onChange: (event) => {
              const value = event.currentTarget.valueAsNumber / 100;
              setSavedVolume(value);
              writePreference(VOLUME_KEY, value);
            },
          }),
          h('span', { className: 'ym-volume-value', 'aria-hidden': true }, `${volumePercent}%`),
        ),
      );

      const reveal = revealRef.current;
      const totals = new Map();
      // The first non-empty snapshot is history: show it whole. Only rows that
      // appear after that baseline get the typewriter.
      const hasRows = visibleCalls.length + streaming.length > 0;
      const animate = baselineRef.current && !reducedMotion;
      const revealed = (id, text) => {
        if (reducedMotion || !reveal.has(id)) reveal.set(id, animate ? 0 : text.length);
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
        if (!runModeRef.current && mode !== 'off' && config !== null) kick();
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
          h(
            'div',
            { className: 'ym-status' },
            h('span', { className: `ym-dot${summary.running ? ' busy' : ''}`, 'aria-hidden': true }),
            h('span', { className: `ym-state${summary.running ? ' busy' : ''}` }, summary.running ? t('running') : t('idle')),
            h('span', { className: 'ym-count' }, `${calls.length} ${t('calls')}`),
          ),
          h('canvas', { className: 'ym-spectrum', ref: canvasRef, width: 840, height: 112, 'aria-hidden': true }),
          h(
            'div',
            { className: 'ym-transport' },
            nativePopover
              ? h(React.Fragment, null, trackTrigger, playlist)
              : h('details', { className: 'ym-playlist-fallback' }, trackTrigger, playlist),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      // Exposed for the offline smoke test; the Loader ignores extra fields.
      __test: { commandOf, partialCommand, summarize, buildCalls, buildStreaming, advanceReveal, typewriterStep, detectBeat, updateMeterBand, nextTrack },
      apply(ctx) {
        ctx.effect(() => () => {
          bgm.audio?.pause();
          void bgm.graph?.context.close().catch(() => {});
          Object.assign(bgm, { audio: null, graph: null, loaded: false, trackName: '', trackId: null, pausedByUser: false });
        }, 'youth-mode: BGM cleanup');
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
