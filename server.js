import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BILIBILI_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
};

function normalizeDuration(seconds) {
  const total = Number(seconds) || 0;
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(Math.floor(total % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function extractBvidFromText(text) {
  const patterns = [/\/(BV[0-9A-Za-z]{10,})/i, /(BV[0-9A-Za-z]{10,})/i];
  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1]) return match[1];
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

async function getAudioStreamUrl({ bvid, cid }) {
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
  const audio = dash?.audio?.[0]?.baseUrl || dash?.audio?.[0]?.base_url;
  if (!audio) {
    throw new Error('未找到可用音频流，可能是视频不支持或被风控限制');
  }

  return audio;
}

app.get('/api/parse', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少 url 参数' });
    }

    if (!url.includes('bilibili.com') && !url.includes('b23.tv')) {
      return res.status(400).json({ code: 400, message: '请输入有效的 Bilibili 链接' });
    }

    const bvid = await resolveBvid(url);
    const videoInfo = await getVideoInfo(bvid);

    const seasonPlaylist = buildPlaylistFromUgcSeason(videoInfo.ugc_season);
    const pagePlaylist = buildPlaylistFromPages(videoInfo);
    const playlist = seasonPlaylist.length > 1 ? seasonPlaylist : pagePlaylist;

    return res.json({
      code: 200,
      data: {
        bvid,
        albumTitle: videoInfo.ugc_season?.title || videoInfo.title || '未知标题',
        coverUrl: videoInfo.pic || '',
        playlist,
      },
    });
  } catch (error) {
    const message = error?.message || '解析失败';
    return res.status(500).json({ code: 500, message });
  }
});

app.get('/api/audio/:bvid/:cid', async (req, res) => {
  try {
    const { bvid, cid } = req.params;
    const streamUrl = await getAudioStreamUrl({ bvid, cid });

    const headers = {
      ...BILIBILI_HEADERS,
      Accept: '*/*',
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
  } catch (error) {
    const message = error?.message || '音频代理失败';
    res.status(500).json({ code: 500, message });
  }
});

app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BiliMusic running at http://localhost:${PORT}`);
});
