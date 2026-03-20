# BiliMusic

一个基于网页的轻量音乐播放器，支持把 Bilibili 或 YouTube 视频链接解析成可播放音频列表。

## Features

- 支持 `bilibili.com` / `b23.tv` 链接解析
- 支持 `youtube.com` / `youtu.be` 链接解析
- 支持多链接追加，合并为一个连续播放列表
- 支持播放/暂停、上一首、下一首、点击切歌、自动下一首
- 支持音量控制、列表折叠、封面显示
- 支持 Document Picture-in-Picture (PiP) 悬浮窗口
- 支持将已添加链接保存到 cookie，并在下次访问时自动恢复

## Tech Stack

- Frontend: Vanilla JavaScript + HTML/CSS
- Backend: Node.js + Express
- HTTP: Axios
- YouTube 解析: `@distube/ytdl-core`

## API

### `GET /api/parse?url={video_url}`

输入 Bilibili 或 YouTube 链接，返回专辑标题、封面、播放列表。

### `GET /api/audio/:bvid/:cid`

Bilibili 音频流代理接口，供前端 `<audio>` 直接播放。
支持 `quality=high|low`（默认 `high`）。

### `GET /api/audio/youtube/:videoId`

YouTube 音频流代理接口，供前端 `<audio>` 直接播放。
支持 `quality=high|low`（默认 `high`）。

## Local Development

```bash
npm install
npm run dev
```

默认地址：`http://localhost:30030`

## Project Structure

- `server.js`: 后端服务与解析/代理接口
- `public/index.html`: 播放器结构
- `public/styles.css`: UI 样式
- `public/app.js`: 前端状态与交互逻辑

## Notes

- Bilibili / YouTube 都有一定风控策略，个别链接可能会解析失败或音频拉取失败。
- Document PiP 依赖较新版本 Chrome/Edge，且不支持部分受限环境。
