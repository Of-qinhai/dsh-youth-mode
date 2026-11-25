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
- **Typewriter**: commands reveal at `typeCps`, with a brief speed boost on pronounced bass hits. A system preference for reduced motion shows commands immediately.
- **Auto-scroll**: always follows new commands and streamed arguments.
- **BGM**:
  - The playlist loads automatically. With BGM enabled, the first visit starts at the first track.
  - Click the track name to open the playlist with play, pause, next track, and BGM controls. Next follows playlist order.
  - Resume a manually paused track from the same position. With automatic BGM enabled, typing or model output can resume music that faded out after inactivity or the end of a turn.
- **Status bar**: run state, command count, current track, and playback controls. A 20-column segmented spectrum follows the music. Peak markers linger at the top of each hit and then fall slowly.

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
| `tracks` | empty (scan `audio/`) | Optional selection of tracks. Relative names resolve under `audio/`. Absolute paths also work. |
| `inChars` | `24` | Input length that starts playback |
| `outChars` | `0` | Output length that starts playback; `0` = as soon as the model streams |
| `volume` | `0.45` | Target volume (0–1) |
| `idleMs` | `1500` | Silence before fading out |
| `fadeInMs` | `10000` | Fade-in duration (enforced minimum of 10 s) |
| `fadeOutMs` | `10000` | Fade-out duration |
| `typeCps` | `30` | Typewriter speed (chars/sec) |
| `mode` | `auto` | Default mode for the first run; the `♪` toggle remembers afterwards |

### Adding your own music

Bring your own music. Drop `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`, `.wav`, or `.flac` files into `audio/`. Git ignores these local files. With Youth mode open, refocus the window or wait about 10 seconds for the files to appear in the playlist.

Set `tracks` only to play a specific selection:

```yaml
tracks:
  - 'my-song.mp3'
```

DSH reads the audio locally. The browser receives the display name and an identifier.

## Usage

| Action | Behaviour |
| --- | --- |
| Switch to the Youth mode tab | Shows the terminal log (history appears complete, no typing replay) |
| Send after typing a long prompt | BGM starts immediately and runs through the turn |
| Track name in the bottom bar | Open the playlist and select a track to play. |
| Top of the playlist | Play or pause, skip to the next track in order, or toggle BGM. |
| Bottom of the playlist | Adjust the volume. The browser remembers your setting. |

## How it works

- **Host half** ([index.js](index.js)) registers one authenticated route `/api/youth-mode-bgm`:
  - `?config=1` returns the track list, including display names and stable identifiers, and the playback settings.
  - `?key=…` returns the audio file. The identifier survives playlist reordering.
- **Client half** ([client.js](client.js)) registers the tab through the `conversation.view` slot and folds the session event window (`tool/call`, `tool/result`, `assistant/live-chunk`) directly. It never subscribes to the model or writes session events.
- BGM is a browser `<audio>` element with timer-based volume ramps; the element is reused across tab switches.

## Known limitations

- The audio route does not support Range: the first load or a track switch downloads the whole file, so a slow file gives a short silence before the fade-in.
- If the browser blocks autoplay, the first click or key press retries playback.
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
├── audio/               # local music directory
└── test/smoke.mjs
```
