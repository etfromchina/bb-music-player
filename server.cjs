const { ReadableStream: NodeReadableStream, WritableStream: NodeWritableStream, TransformStream: NodeTransformStream } =
  require('stream/web');
const { Blob: NodeBlob } = require('buffer');

if (typeof globalThis.ReadableStream === 'undefined') globalThis.ReadableStream = NodeReadableStream;
if (typeof globalThis.WritableStream === 'undefined') globalThis.WritableStream = NodeWritableStream;
if (typeof globalThis.TransformStream === 'undefined') globalThis.TransformStream = NodeTransformStream;
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = NodeBlob;
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  };
}
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends NodeBlob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = String(name || '');
      this.lastModified = Number(options?.lastModified || Date.now());
    }
  };
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const ytdl = require('@distube/ytdl-core');
const axios = require('axios');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 30030;
let activeServer = null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BILIBILI_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
};

const YOUTUBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.youtube.com/',
  Origin: 'https://www.youtube.com',
};

const YOUTUBE_MEDIA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};
const YOUTUBE_STREAM_URL_TTL_MS = 10 * 60 * 1000;
const youtubeStreamUrlCache = new Map();

function normalizeDuration(seconds) {
  const total = Number(seconds) || 0;
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(Math.floor(total % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function normalizeQuality(input) {
  return String(input || '').toLowerCase() === 'low' ? 'low' : 'high';
}

function isBilibiliUrl(inputUrl = '') {
  return inputUrl.includes('bilibili.com') || inputUrl.includes('b23.tv');
}

function isYoutubeUrl(inputUrl = '') {
  const lowered = inputUrl.toLowerCase();
  return lowered.includes('youtube.com') || lowered.includes('youtu.be');
}

function extractBvidFromText(text) {
  const patterns = [/\/(BV[0-9A-Za-z]{10,})/i, /(BV[0-9A-Za-z]{10,})/i];
  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractYoutubeVideoId(inputUrl) {
  try {
    const parsed = new URL(inputUrl);

    if (parsed.hostname.includes('youtu.be')) {
      const idFromPath = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (idFromPath) return idFromPath;
    }

    const v = parsed.searchParams.get('v');
    if (v) return v;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const embedIndex = pathParts.findIndex((part) => part === 'embed' || part === 'shorts');
    if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
      return pathParts[embedIndex + 1];
    }
  } catch {
    const fallback = inputUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (fallback?.[1]) return fallback[1];
  }

  return null;
}

async function expandShortUrlIfNeeded(inputUrl) {
  if (!inputUrl.includes('b23.tv')) return inputUrl;

  const response = await axios.get(inputUrl, {
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
    headers: BILIBILI_HEADERS,
  });

  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    return response.headers.location;
  }

  return inputUrl;
}

async function resolveBvid(inputUrl) {
  const url = await expandShortUrlIfNeeded(inputUrl);
  const direct = extractBvidFromText(url);
  if (direct) return direct;

  const htmlResp = await axios.get(url, {
    headers: BILIBILI_HEADERS,
    timeout: 10000,
  });
  const fromHtml = extractBvidFromText(htmlResp.data);
  if (fromHtml) return fromHtml;

  throw new Error('无法从链接中解析出 BVID');
}

async function getVideoInfo(bvid) {
  const viewResp = await axios.get('https://api.bilibili.com/x/web-interface/view', {
    params: { bvid },
    headers: BILIBILI_HEADERS,
    timeout: 10000,
  });

  if (viewResp.data?.code !== 0 || !viewResp.data?.data) {
    throw new Error(viewResp.data?.message || 'B站视频信息获取失败');
  }

  return viewResp.data.data;
}

function buildPlaylistFromUgcSeason(ugcSeason = {}) {
  const sections = Array.isArray(ugcSeason.sections) ? ugcSeason.sections : [];
  const episodes = sections.flatMap((s) => (Array.isArray(s.episodes) ? s.episodes : []));

  return episodes
    .filter((item) => item?.cid && item?.bvid)
    .map((item, index) => ({
      id: `cid_${item.cid}_${item.bvid}`,
      cid: String(item.cid),
      bvid: item.bvid,
      page: index + 1,
      title: item.title || item.arc?.title || `第${index + 1}首`,
      duration: normalizeDuration(item.duration || item.arc?.duration),
      audioUrl: `/api/audio/${encodeURIComponent(item.bvid)}/${encodeURIComponent(String(item.cid))}`,
    }));
}

function buildPlaylistFromPages(videoInfo = {}) {
  const pages = Array.isArray(videoInfo.pages) ? videoInfo.pages : [];

  return pages
    .filter((page) => page?.cid)
    .map((page, index) => ({
      id: `cid_${page.cid}`,
      cid: String(page.cid),
      bvid: videoInfo.bvid,
      page: page.page ?? index + 1,
      title: page.part || `P${index + 1}`,
      duration: normalizeDuration(page.duration),
      audioUrl: `/api/audio/${encodeURIComponent(videoInfo.bvid)}/${encodeURIComponent(String(page.cid))}`,
    }));
}

function pickBilibiliAudioTrack(audios = [], quality = 'high') {
  if (!Array.isArray(audios) || audios.length === 0) return null;
  const sorted = [...audios].sort((a, b) => {
    const sa = Number(a?.bandwidth) || Number(a?.id) || 0;
    const sb = Number(b?.bandwidth) || Number(b?.id) || 0;
    return sa - sb;
  });
  return quality === 'low' ? sorted[0] : sorted[sorted.length - 1];
}

async function getAudioStreamUrl({ bvid, cid, quality = 'high' }) {
  const playResp = await axios.get('https://api.bilibili.com/x/player/playurl', {
    params: {
      bvid,
      cid,
      fnval: 16,
      fnver: 0,
      fourk: 0,
    },
    headers: BILIBILI_HEADERS,
    timeout: 10000,
  });

  if (playResp.data?.code !== 0 || !playResp.data?.data) {
    throw new Error(playResp.data?.message || '音频流获取失败');
  }

  const dash = playResp.data.data?.dash;
  const picked = pickBilibiliAudioTrack(dash?.audio, quality);
  const audio = picked?.baseUrl || picked?.base_url;
  if (!audio) {
    throw new Error('未找到可用音频流，可能是视频不支持或被风控限制');
  }

  return audio;
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `yt-dlp 退出码: ${code}`));
    });
  });
}

async function runYtDlp(args = []) {
  const customBin = process.env.YT_DLP_BIN?.trim();
  const candidates = [
    customBin ? [customBin, args] : null,
    ['yt-dlp', args],
    ['python', ['-m', 'yt_dlp', ...args]],
    ['py', ['-m', 'yt_dlp', ...args]],
  ].filter(Boolean);

  let lastError = null;
  for (const [command, commandArgs] of candidates) {
    try {
      return await runCommand(command, commandArgs);
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(
    `未检测到可用的 yt-dlp 命令。请安装 yt-dlp，或设置环境变量 YT_DLP_BIN（当前错误: ${lastError?.message || 'unknown'}）`
  );
}

async function getYoutubeInfoViaYtDlp(videoUrl) {
  const { stdout } = await runYtDlp(['--no-playlist', '-J', videoUrl]);
  return JSON.parse(stdout);
}

async function getYoutubeStreamUrlViaYtDlp(videoUrl, quality = 'high') {
  const cacheKey = `${videoUrl}|${quality}`;
  const cached = youtubeStreamUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const format = quality === 'low' ? 'worstaudio/bestaudio/best' : 'bestaudio/best';
  const { stdout } = await runYtDlp(['--no-playlist', '-f', format, '-g', videoUrl]);
  const streamUrl = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!streamUrl) {
    throw new Error('yt-dlp 未返回可用音频地址');
  }

  let expiresAt = Date.now() + YOUTUBE_STREAM_URL_TTL_MS;
  try {
    const parsed = new URL(streamUrl);
    const expire = Number(parsed.searchParams.get('expire'));
    if (Number.isFinite(expire) && expire > 0) {
      expiresAt = Math.max(Date.now() + 30 * 1000, expire * 1000 - 30 * 1000);
    }
  } catch {
    // keep default TTL
  }
  youtubeStreamUrlCache.set(cacheKey, { url: streamUrl, expiresAt });

  return streamUrl;
}

async function proxyAudioStreamByUrl({ streamUrl, req, res, upstreamHeaders = {} }) {
  const headers = {
    ...upstreamHeaders,
  };
  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  const audioResp = await axios.get(streamUrl, {
    responseType: 'stream',
    headers,
    timeout: 20000,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const passthroughHeaders = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'cache-control',
    'etag',
    'last-modified',
  ];

  passthroughHeaders.forEach((key) => {
    const value = audioResp.headers[key];
    if (value) res.setHeader(key, value);
  });

  res.status(audioResp.status);
  audioResp.data.pipe(res);
}

function buildYoutubeResponse({ videoId, title, coverUrl, duration }) {
  return {
    source: 'youtube',
    sourceId: videoId,
    bvid: videoId,
    albumTitle: title,
    coverUrl,
    playlist: [
      {
        id: `yt_${videoId}`,
        cid: videoId,
        bvid: videoId,
        page: 1,
        title,
        duration,
        audioUrl: `/api/audio/youtube/${encodeURIComponent(videoId)}`,
      },
    ],
  };
}

async function buildYoutubeParseData(inputUrl) {
  const videoId = extractYoutubeVideoId(inputUrl);
  if (!videoId || !ytdl.validateID(videoId)) {
    throw new Error('无法从 YouTube 链接中解析出有效视频 ID');
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const info = await ytdl.getBasicInfo(canonicalUrl);
    const details = info.videoDetails;

    if (!details || details.isLiveContent) {
      throw new Error('暂不支持 YouTube 直播链接，请使用普通视频链接');
    }

    const title = details?.title || '未知标题';
    const coverUrl = details?.thumbnails?.[details.thumbnails.length - 1]?.url || '';
    const duration = normalizeDuration(details?.lengthSeconds);

    return buildYoutubeResponse({ videoId, title, coverUrl, duration });
  } catch (ytdlError) {
    console.warn('[youtube parse fallback] ytdl-core failed:', ytdlError?.message || ytdlError);
    const ytDlpInfo = await getYoutubeInfoViaYtDlp(canonicalUrl);

    if (ytDlpInfo?.is_live) {
      throw new Error('暂不支持 YouTube 直播链接，请使用普通视频链接');
    }

    const title = ytDlpInfo?.title || '未知标题';
    const coverUrl =
      ytDlpInfo?.thumbnail ||
      (Array.isArray(ytDlpInfo?.thumbnails)
        ? ytDlpInfo.thumbnails[ytDlpInfo.thumbnails.length - 1]?.url
        : '') ||
      '';
    const duration = normalizeDuration(ytDlpInfo?.duration);

    return buildYoutubeResponse({ videoId, title, coverUrl, duration });
  }
}

app.get('/api/parse', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少 url 参数' });
    }

    if (isBilibiliUrl(url)) {
      const bvid = await resolveBvid(url);
      const videoInfo = await getVideoInfo(bvid);

      const seasonPlaylist = buildPlaylistFromUgcSeason(videoInfo.ugc_season);
      const pagePlaylist = buildPlaylistFromPages(videoInfo);
      const playlist = seasonPlaylist.length > 1 ? seasonPlaylist : pagePlaylist;

      return res.json({
        code: 200,
        data: {
          source: 'bilibili',
          sourceId: bvid,
          bvid,
          albumTitle: videoInfo.ugc_season?.title || videoInfo.title || '未知标题',
          coverUrl: videoInfo.pic || '',
          playlist,
        },
      });
    }

    if (isYoutubeUrl(url)) {
      const data = await buildYoutubeParseData(url);
      return res.json({ code: 200, data });
    }

    return res.status(400).json({
      code: 400,
      message: '请输入有效的 Bilibili 或 YouTube 链接',
    });
  } catch (error) {
    const message = error?.message || '解析失败';
    return res.status(500).json({ code: 500, message });
  }
});

app.get('/api/audio/youtube/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const quality = normalizeQuality(req.query.quality);
    if (!videoId || !ytdl.validateID(videoId)) {
      return res.status(400).json({ code: 400, message: '无效的 YouTube 视频 ID' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let ytDlpErrorMessage = '';

    try {
      const streamUrl = await getYoutubeStreamUrlViaYtDlp(videoUrl, quality);
      await proxyAudioStreamByUrl({ streamUrl, req, res, upstreamHeaders: YOUTUBE_MEDIA_HEADERS });
      return;
    } catch (ytDlpError) {
      ytDlpErrorMessage = ytDlpError?.message || String(ytDlpError);
      console.warn('[youtube audio fallback] yt-dlp failed:', ytDlpErrorMessage);
    }

    const requestHeaders = { ...YOUTUBE_HEADERS };
    if (req.headers.range) requestHeaders.Range = req.headers.range;

    const stream = ytdl(videoUrl, {
      quality: quality === 'low' ? 'lowestaudio' : 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 24,
      requestOptions: { headers: requestHeaders },
    });

    stream.once('response', (ytResp) => {
      const status = ytResp.statusCode || 200;
      res.status(status);
      ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control'].forEach((key) => {
        const value = ytResp.headers?.[key];
        if (value) res.setHeader(key, value);
      });
    });

    stream.once('error', (err) => {
      console.error('[youtube audio stream error]', err?.message || err);
      if (!res.headersSent) {
        res.status(502).json({
          code: 502,
          message: `YouTube 音频拉取失败。yt-dlp: ${ytDlpErrorMessage || '未执行'}；ytdl-core: ${err?.message || 'unknown'}`,
        });
      } else {
        res.end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('[youtube audio proxy error]', error?.message || error);
    const message = error?.message || 'YouTube 音频代理失败';
    res.status(500).json({ code: 500, message });
  }
});

app.get('/api/audio/:bvid/:cid', async (req, res) => {
  try {
    const { bvid, cid } = req.params;
    const quality = normalizeQuality(req.query.quality);
    const streamUrl = await getAudioStreamUrl({ bvid, cid, quality });

    await proxyAudioStreamByUrl({
      streamUrl,
      req,
      res,
      upstreamHeaders: {
        ...BILIBILI_HEADERS,
        Accept: '*/*',
      },
    });
  } catch (error) {
    const message = error?.message || '音频代理失败';
    res.status(500).json({ code: 500, message });
  }
});

app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer({ port = DEFAULT_PORT, host = '0.0.0.0', silent = false } = {}) {
  if (activeServer?.listening) {
    return { app, server: activeServer, port, host };
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      activeServer = server;
      if (!silent) {
        const displayHost = host === '0.0.0.0' ? 'localhost' : host;
        console.log(`BiliMusic running at http://${displayHost}:${port}`);
      }
      resolve({ app, server, port, host });
    });

    server.once('error', (error) => {
      reject(error);
    });
  });
}

async function stopServer() {
  if (!activeServer?.listening) return;

  await new Promise((resolve) => {
    activeServer.close(() => resolve());
  });
  activeServer = null;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[startup error]', error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  stopServer,
};
