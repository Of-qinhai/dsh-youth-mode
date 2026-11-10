# dsh-youth-mode

给 DSH 对话加一个「青春模式」TAB：终端风格的命令日志 + 本机 BGM。

默认对话方式完全不变，只是多一个视图；切过去就像开了一个 CMD 窗口，只显示模型执行的工具调用和命令行。

[English](README.en.md)

```
[18:55:39] ~/dsh-workspace-tmp $ npm test                    ✓ 4.4s
[18:57:42] ~/dsh-workspace-tmp $ python3 - <<'PY'  (+32 行)  ✓ 0.1s
[--:--:--] ~/dsh-workspace-tmp $ █
```

## 功能

- **青春模式 TAB**：在原来的对话旁边新增一个视图，默认仍停在普通对话。
- **只显示命令**：`[时间] ~/路径 $ 命令` 的终端 transcript；多行/超长命令压成首行 + `(+N 行)`。
- **打字机**：命令按 30 字符/秒逐字出现，带光标；纯渲染节奏，不影响模型输出速度。
- **自动滚动**：新命令和流式参数出现时始终贴底。
- **BGM**：
  - 长输入（达到 `inChars`）发送即开始，贯穿整轮，模型思考/工具执行的空档不断；
  - 短输入则在模型开始输出时开始；
  - 每轮随机换歌且不连续重复；
  - 底栏 `⏭` 手动切歌（600ms 淡出 → 10 秒渐入）；
  - 底栏 `♪` 一键关闭：立刻停止，之后永不自动触发，直到再次打开；
  - 空闲/回合结束 10 秒淡出，不会硬切。
- **状态栏**：运行中/空闲、本会话命令数、BGM 控制。

## 安装

### 在 DSH 里一键安装（推荐）

1. 打开 DSH，点击侧边栏 **Plugins**。
2. 点 **Add plugin**，填入仓库地址：

   ```text
   https://github.com/Of-qinhai/dsh-youth-mode
   ```

3. 点 **Install**，完成后点 **Enable now**。
4. 刷新页面，随便发一条消息，标题栏出现 **青春模式** TAB。

> 需要 DSH 的 Web 界面与插件管理（Plugin Manager）。仓库自带已构建好的 `client.js`，安装时不需要额外构建。

### 让 DSH 助手帮你装

直接对 DSH 说：

```text
帮我安装插件 https://github.com/Of-qinhai/dsh-youth-mode 并启用
```

助手会通过 `plugin_manager` 完成安装和启用。

### 本地目录安装（开发用）

```bash
git clone https://github.com/Of-qinhai/dsh-youth-mode.git
```

然后在 **Plugins → Add plugin** 里填这个目录的**绝对路径**，安装并启用。本地目录安装是软链接，改完代码刷新页面即可。

## 配置

配置在插件包的 [cordis.patch.yml](cordis.patch.yml)，修改后需要让 DSH 重新组合（重启 DSH 最稳）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `tracks` | 三首内置曲目 | 音乐列表；相对名从 `audio/` 读，也可写绝对路径；留空则自动扫描 `audio/` |
| `inChars` | `24` | 输入达到多少字符后开始播放 |
| `outChars` | `0` | 输出达到多少字符开始；`0` = 模型一开始输出就播 |
| `volume` | `0.45` | 目标音量（0–1） |
| `idleMs` | `1500` | 停止打字多久后开始淡出 |
| `fadeInMs` | `10000` | 渐入时长（最低按 10 秒执行） |
| `fadeOutMs` | `10000` | 渐出时长 |
| `typeCps` | `30` | 打字机速度（字符/秒） |
| `mode` | `auto` | 首次运行的默认模式；之后由界面上的 `♪` 记忆 |

### 添加自己的音乐

最省事的方式：把 `.mp3` / `.m4a` / `.ogg` / `.wav` / `.flac` 放进 `audio/`，在 `tracks` 里写文件名（或清空 `tracks` 让它自动扫描）：

```yaml
tracks:
  - 'my-song.mp3'
```

也可以直接写绝对路径：

```yaml
tracks:
  - '/path/to/your/music.mp3'
```

音频只由 DSH 宿主读取，页面拿到的是序号和显示名，绝对路径不会进浏览器。

## 使用

| 操作 | 行为 |
| --- | --- |
| 切到「青春模式」TAB | 显示终端日志（历史命令直接完整显示，不回放打字） |
| 长输入后发送 | BGM 立刻开始，贯穿本轮 |
| 底栏 `⏭` | 立即切到下一首（不会连续重复同一首） |
| 底栏 `♪` | 自动 / 关闭；关闭后永不自动触发，开关记在浏览器 `localStorage` |

## 原理

- **Host 半**（[index.js](index.js)）注册一条需要登录态的路由 `/api/youth-mode-bgm`：
  - `?config=1` 返回曲目列表（只有序号和文件名）与阈值；
  - `?track=N` 以 `audio/mpeg` 等 MIME 返回对应文件。
- **Client 半**（[client.js](client.js)）通过 `conversation.view` 插槽注册 TAB，直接折叠会话事件窗口（`tool/call` / `tool/result` / `assistant/live-chunk`），不订阅模型、不写会话日志。
- BGM 是浏览器 `<audio>`，音量用定时器做淡入淡出；歌曲元素在插件实例内复用，切 TAB 不会重新选歌。

## 已知限制

- 音频路由不支持 Range：切歌/首次加载会整首下载，慢的时候有一小段静音，之后才渐入。
- 浏览器自动播放策略：首次播放需要用户手势；打字/点击算手势，纯输出触发的第一次可能被拦，会在下一次交互补播。
- 多行命令只显示首行摘要，不显示完整 heredoc。
- 历史命令在打开 TAB 时直接完整显示，不做打字回放。
- 依赖 DSH 客户端内部接口（`session.eventSource`、`conversation.view` 插槽、`/api` 精确路由），DSH 升级后可能需要跟随调整。

## 开发

```bash
node test/smoke.mjs
```

离线冒烟测试覆盖：Host 路由返回音频字节、配置脱敏、事件折叠、流式命令拼接、打字机推进。

## 目录

```text
.
├── package.json         # bundle 清单（dsh.bundle.patch + dsh.client）
├── cordis.patch.yml     # 插件行与默认配置
├── index.js             # Host 半：/api/youth-mode-bgm
├── client.js            # Client 半：TAB、终端视图、BGM
├── icon.svg
├── locale/              # 插件管理器展示文案
├── audio/               # 内置音乐
└── test/smoke.mjs
```
