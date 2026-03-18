# BiliMusic

一个基于 Bilibili 链接解析的网页音乐播放器，支持将视频/合集转为可播放音频列表，并提供接近桌面迷你播放器的交互体验。

## Features

- 支持 `bilibili.com` / `b23.tv` 链接解析
- 支持多链接追加，合并为一个连续播放列表
- 支持播放/暂停、上一首、下一首、双击切歌、自动下一首
- 支持音量控制、播放列表展开/收起
- 支持封面旋转、当前播放高亮、动态音柱动画
- 支持 Document Picture-in-Picture (PiP) 悬浮窗
- 支持将已添加链接保存到 cookie，并在下次访问时自动恢复
- 后端提供音频代理，规避直接请求音频流时的跨域与 Referer 限制

## Tech Stack

- Frontend: Vanilla JavaScript + HTML/CSS
- Backend: Node.js + Express
- HTTP: Axios

## API

### `GET /api/parse?url={bilibili_url}`

返回专辑标题、封面和可播放列表。

### `GET /api/audio/:bvid/:cid`

音频流代理接口，供前端 `<audio>` 直接播放。

## Local Development

```bash
npm install
npm run dev
```

默认启动在：`http://localhost:3000`

## Project Structure

- `server.js` 后端服务与解析/代理接口
- `public/index.html` 播放器结构
- `public/styles.css` UI 样式与动画
- `public/app.js` 前端状态与交互逻辑

## Notes

- B 站接口存在风控策略，个别链接可能出现解析失败。
- Document PiP 依赖较新版本 Chrome/Edge，且不支持 iframe 沙箱环境。
