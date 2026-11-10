# dsh-youth-mode

A "Youth mode" tab for DSH conversations: a terminal-style log of tool calls, with local BGM.

The default conversation is untouched; this only adds another view. Switch to it and you get a CMD-like window that shows nothing but the commands the model runs.

[中文](README.md)

```
[18:55:39] ~/dsh-workspace-tmp $ npm test                    ✓ 4.4s
[18:57:42] ~/dsh-workspace-tmp $ python3 - <<'PY'  (+32 lines)  ✓ 0.1s
[--:--:--] ~/dsh-workspace-tmp $ █
```

## Features

- **Youth mode tab**: a new conversation view next to the normal chat; the default stays on chat.
- **Commands only**: a terminal transcript in the form `[time] ~/path $ command`; multi-line or huge commands collapse to the first line plus `(+N lines)`.
- **Typewriter**: commands reveal at 30 chars/sec with a cursor. Rendering only — model speed is untouched.
- **Auto-scroll**: always follows new commands and streamed arguments.
- **BGM**:
  - a long prompt (>= `inChars`) starts music at send time and keeps it for the whole turn, covering thinking and tool gaps;
  - a short prompt starts music when the model first streams output;
  - a random track each turn, never the same track twice in a row;
  - `⏭` in the bottom bar switches tracks manually (600 ms fade-out, then a 10 s fade-in);
  - `♪` turns it off: stops immediately and never auto-triggers again until re-enabled;
  - idle/turn end fades out over 10 s, no hard cuts.
- **Status bar**: running/idle, command count, BGM controls.

## Install

### One-click inside DSH (recommended)

1. Open DSH and go to **Plugins** in the sidebar.
2. Click **Add plugin** and paste the repository URL:

   ```text
   https://github.com/Of-qinhai/dsh-youth-mode
   ```

3. Click **Install**, then **Enable now**.
4. Refresh the page and send a message; the **Youth mode** tab appears in the header.

> Requires the DSH Web UI with the Plugin Manager. The repository ships a prebuilt `client.js`; no extra build step is needed.

### Let the DSH agent install it

Tell DSH:

```text
Install the plugin https://github.com/Of-qinhai/dsh-youth-mode and enable it
```

The agent uses `plugin_manager` to install and enable it.

### Local directory (for development)

```bash
git clone https://github.com/Of-qinhai/dsh-youth-mode.git
```

Then use **Plugins → Add plugin** with the **absolute path** of that directory, install and enable. Local installs are symlinked, so code changes show up after a page refresh.

## Configuration

Configuration lives in the bundle's [cordis.patch.yml](cordis.patch.yml); after editing, let DSH recompose (restarting DSH is the safe way):

| Key | Default | Description |
| --- | --- | --- |
| `tracks` | three bundled tracks | Music list; relative names resolve under `audio/`, absolute paths also work; empty means scan `audio/` |
| `inChars` | `24` | Input length that starts playback |
| `outChars` | `0` | Output length that starts playback; `0` = as soon as the model streams |
| `volume` | `0.45` | Target volume (0–1) |
| `idleMs` | `1500` | Silence before fading out |
| `fadeInMs` | `10000` | Fade-in duration (enforced minimum of 10 s) |
| `fadeOutMs` | `10000` | Fade-out duration |
| `typeCps` | `30` | Typewriter speed (chars/sec) |
| `mode` | `auto` | Default mode for the first run; the `♪` toggle remembers afterwards |

### Adding your own music

Easiest: drop `.mp3` / `.m4a` / `.ogg` / `.wav` / `.flac` files into `audio/` and list their names in `tracks` (or clear `tracks` to scan the directory):

```yaml
tracks:
  - 'my-song.mp3'
```

Absolute paths work too:

```yaml
tracks:
  - '/path/to/your/music.mp3'
```

Audio is read by the DSH host only; the page receives an index and a display name, never the absolute path.

## Usage

| Action | Behaviour |
| --- | --- |
| Switch to the Youth mode tab | Shows the terminal log (history appears complete, no typing replay) |
| Send after typing a long prompt | BGM starts immediately and runs through the turn |
| `⏭` in the bottom bar | Switch to another track right away (no immediate repeat) |
| `♪` in the bottom bar | Auto / off; off never auto-triggers and is remembered in `localStorage` |

## How it works

- **Host half** ([index.js](index.js)) registers one authenticated route `/api/youth-mode-bgm`:
  - `?config=1` returns the track list (index + file name) and thresholds;
  - `?track=N` returns the file with its audio MIME type.
- **Client half** ([client.js](client.js)) registers the tab through the `conversation.view` slot and folds the session event window (`tool/call`, `tool/result`, `assistant/live-chunk`) directly. It never subscribes to the model or writes session events.
- BGM is a browser `<audio>` element with timer-based volume ramps; the element is reused across tab switches.

## Known limitations

- The audio route does not support Range: the first load or a track switch downloads the whole file, so a slow file gives a short silence before the fade-in.
- Browser autoplay policy: the first playback needs a user gesture; typing/clicking counts, but an output-only first trigger may be blocked and gets retried on the next interaction.
- Multi-line commands show only the first line plus a line count, not the full heredoc.
- History is shown complete when the tab opens; no typing replay.
- Depends on DSH client internals (`session.eventSource`, the `conversation.view` slot, exact `/api` routes); a DSH upgrade may require follow-up changes.

## Development

```bash
node test/smoke.mjs
```

The offline smoke test covers the Host route bytes, config sanitisation, event folding, streamed command assembly and typewriter advancement.

## Layout

```text
.
├── package.json         # bundle manifest (dsh.bundle.patch + dsh.client)
├── cordis.patch.yml     # plugin row and default config
├── index.js             # Host half: /api/youth-mode-bgm
├── client.js            # Client half: tab, terminal view, BGM
├── icon.svg
├── locale/              # Plugin Manager display strings
├── audio/               # bundled music
└── test/smoke.mjs
```
