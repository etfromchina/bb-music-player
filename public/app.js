const COOKIE_NAME = 'w_music_links';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const MODE_KEY = 'wmusic_ui_mode';
const VALID_MODES = ['large', 'medium', 'small'];

const state = {
  isPlaying: false,
  isLoading: false,
  playlist: [],
  albums: [],
  sourceLinks: [],
  coverUrl: '',
  currentSongIndex: -1,
  audioQuality: 'high',
  desktopMode: false,
  uiMode: 'medium',
  isPlaylistCollapsed: false,
};

const dom = {
  body: document.body,
  addModal: document.getElementById('add-modal'),
  addForm: document.getElementById('add-form'),
  addLinkBtn: document.getElementById('add-link-btn'),
  albumTitle: document.getElementById('album-title'),
  audio: document.getElementById('audio'),
  cancelAddBtn: document.getElementById('cancel-add-btn'),
  clearBtn: document.getElementById('clear-btn'),
  confirmAddBtn: document.getElementById('confirm-add-btn'),
  coverFallback: document.getElementById('cover-fallback'),
  coverImg: document.getElementById('cover-img'),
  coverWrapper: document.getElementById('cover-wrapper'),
  currentTime: document.getElementById('current-time'),
  desktopCloseBtn: document.getElementById('desktop-close-btn'),
  desktopDragHandle: document.getElementById('desktop-drag-handle'),
  desktopMinBtn: document.getElementById('desktop-min-btn'),
  loader: document.getElementById('loader'),
  miniArtist: document.getElementById('mini-artist'),
  miniCoverFallback: document.getElementById('mini-cover-fallback'),
  miniCoverImg: document.getElementById('mini-cover-img'),
  miniCoverWrapper: document.getElementById('mini-cover-wrapper'),
  miniExpandBtn: document.getElementById('mini-expand-btn'),
  miniNextBtn: document.getElementById('mini-next-btn'),
  miniPlayBtn: document.getElementById('mini-play-btn'),
  miniTitle: document.getElementById('mini-title'),
  modeLargeBtn: document.getElementById('mode-large-btn'),
  modeMediumBtn: document.getElementById('mode-medium-btn'),
  modeSmallBtn: document.getElementById('mode-small-btn'),
  nowPlaying: document.getElementById('now-playing'),
  nextBtn: document.getElementById('next-btn'),
  playBtn: document.getElementById('play-btn'),
  playlist: document.getElementById('playlist'),
  playlistCount: document.getElementById('playlist-count'),
  prevBtn: document.getElementById('prev-btn'),
  progressSlider: document.getElementById('progress-slider'),
  qualityBtn: document.getElementById('quality-btn'),
  toggleListBtn: document.getElementById('toggle-list-btn'),
  totalTime: document.getElementById('total-time'),
  urlInput: document.getElementById('url-input'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeText: document.getElementById('volume-text'),
};

const API_BASE = (() => {
  try {
    const query = new URLSearchParams(window.location.search);
    const apiPort = query.get('apiPort');
    return apiPort ? `http://127.0.0.1:${apiPort}` : '';
  } catch {
    return '';
  }
})();

const ICONS = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5a1 1 0 0 1 1.5-.86l8 5a1.6 1.6 0 0 1 0 2.72l-8 5A1 1 0 0 1 8 16.5v-11Z"></path></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm8 0a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Z"></path></svg>`,
  expand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h5v2H8.4l4.3 4.3-1.4 1.4L7 7.4V11H5V4h2Zm10 0h2v7h-2V7.4l-4.3 4.3-1.4-1.4L15.6 6H12V4h5Zm-5.7 8.3 1.4 1.4L8.4 18H12v2H5v-7h2v3.6l4.3-4.3Zm1.4 1.4L17 18.1V14h2v7h-7v-2h3.6l-4.3-4.3 1.4-1.4Z"></path></svg>`,
  collapse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10h10v2H7v-2Zm0 4h10v2H7v-2Zm0-8h10v2H7V6Z"></path></svg>`,
};

function setIcon(node, name) {
  if (node) node.innerHTML = ICONS[name] || '';
}

function currentSong() {
  if (state.currentSongIndex < 0 || state.currentSongIndex >= state.playlist.length) return null;
  return state.playlist[state.currentSongIndex];
}

function withApiBase(url) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return API_BASE ? `${API_BASE}${url}` : url;
}

function apiUrl(pathname) {
  return API_BASE ? `${API_BASE}${pathname}` : pathname;
}

function buildAudioUrl(url, quality) {
  const full = withApiBase(url);
  const separator = full.includes('?') ? '&' : '?';
  return `${full}${separator}quality=${quality}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}

function escapeHtml(value = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeMode(mode) {
  return VALID_MODES.includes(mode) ? mode : 'medium';
}

function getCookie(name) {
  const pair = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function setCookie(name, value, maxAge) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}

function clearCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/; samesite=lax`;
}

function showError(message) {
  window.alert(message);
}

function setLoading(loading) {
  state.isLoading = loading;
  dom.loader.classList.toggle('hidden', !loading);
  dom.confirmAddBtn.disabled = loading;
}

function updateCover() {
  const hasCover = Boolean(state.coverUrl);

  if (hasCover) {
    dom.coverImg.src = state.coverUrl;
    dom.coverImg.classList.remove('hidden');
    dom.coverFallback.classList.add('hidden');
    dom.miniCoverImg.src = state.coverUrl;
    dom.miniCoverImg.classList.remove('hidden');
    dom.miniCoverFallback.classList.add('hidden');
  } else {
    dom.coverImg.removeAttribute('src');
    dom.coverImg.classList.add('hidden');
    dom.coverFallback.classList.remove('hidden');
    dom.miniCoverImg.removeAttribute('src');
    dom.miniCoverImg.classList.add('hidden');
    dom.miniCoverFallback.classList.remove('hidden');
  }

  dom.coverWrapper.classList.toggle('empty', !hasCover);
  dom.miniCoverWrapper.classList.toggle('empty', !hasCover);
}

function updateMeta() {
  const song = currentSong();
  const title = song?.title || '等待解析';
  const album = song?.albumTitle || 'w-music';
  const subtitle = song ? `正在播放 ${song.title}` : '请添加 Bilibili 或 YouTube 链接开始播放';

  dom.albumTitle.textContent = album;
  dom.albumTitle.title = album;
  dom.nowPlaying.textContent = subtitle;
  dom.nowPlaying.title = subtitle;
  dom.miniTitle.textContent = title;
  dom.miniTitle.title = title;
  dom.miniArtist.textContent = album;
  dom.miniArtist.title = album;
}

function updateTime() {
  const current = Number.isFinite(dom.audio.currentTime) ? dom.audio.currentTime : 0;
  const duration = Number.isFinite(dom.audio.duration) ? dom.audio.duration : 0;
  dom.currentTime.textContent = formatTime(current);
  dom.totalTime.textContent = formatTime(duration);
  dom.progressSlider.value = duration > 0 ? String((current / duration) * 100) : '0';
}

function updateVolume() {
  dom.volumeText.textContent = `${Math.round((dom.audio.volume || 0) * 100)}%`;
  dom.volumeSlider.value = String(dom.audio.volume || 0);
}

function updateControls() {
  const hasSong = Boolean(currentSong());
  dom.prevBtn.disabled = !hasSong;
  dom.nextBtn.disabled = !hasSong;
  dom.playBtn.disabled = !hasSong;
  dom.miniPlayBtn.disabled = !hasSong;
  dom.miniNextBtn.disabled = !hasSong;
  setIcon(dom.playBtn, state.isPlaying ? 'pause' : 'play');
  setIcon(dom.miniPlayBtn, state.isPlaying ? 'pause' : 'play');
  setIcon(dom.toggleListBtn, state.isPlaylistCollapsed ? 'expand' : 'collapse');
  dom.modeLargeBtn.classList.toggle('active', state.uiMode === 'large');
  dom.modeMediumBtn.classList.toggle('active', state.uiMode === 'medium');
  dom.modeSmallBtn.classList.toggle('active', state.uiMode === 'small');
  dom.qualityBtn.classList.toggle('low', state.audioQuality === 'low');
  dom.qualityBtn.textContent = state.audioQuality === 'high' ? 'H' : 'L';
}

function updatePlaylistCount() {
  dom.playlistCount.textContent = `${state.playlist.length} TRACKS`;
}

function renderPlaylist() {
  dom.playlist.classList.toggle('collapsed', state.isPlaylistCollapsed);

  if (state.playlist.length === 0) {
    dom.playlist.innerHTML = `<div class="empty-state"><p>播放列表还是空的。<br />点击上方输入框，把链接加入进来。</p></div>`;
    return;
  }

  let html = '';
  let previousAlbumId = '';

  state.playlist.forEach((song, index) => {
    if (song.albumId !== previousAlbumId) {
      previousAlbumId = song.albumId;
      html += `
        <div class="album-row">
          <span class="album-title-text">${escapeHtml(song.albumTitle || '未命名专辑')}</span>
          <button class="album-remove" type="button" data-album-id="${escapeHtml(song.albumId)}" title="删除这一组">×</button>
        </div>
      `;
    }

    const active = index === state.currentSongIndex;
    html += `
      <article class="track ${active ? 'active' : ''}" data-index="${index}">
        <div class="track-main">
          <span class="track-number">${index + 1}</span>
          <div class="track-text">
            <span class="track-title">${escapeHtml(song.title)}</span>
            <span class="track-subtitle">${escapeHtml(song.albumTitle || 'w-music')}</span>
          </div>
        </div>
        <span class="track-duration">${escapeHtml(song.duration || '--:--')}</span>
      </article>
    `;
  });

  dom.playlist.innerHTML = html;
}

function updateAll() {
  const song = currentSong();
  state.coverUrl = song?.coverUrl || '';
  updateMeta();
  updateCover();
  updateControls();
  updateTime();
  updateVolume();
  updatePlaylistCount();
  renderPlaylist();
}

function setUIMode(mode, options = {}) {
  const nextMode = normalizeMode(mode);
  const persist = options.persist !== false;
  const applyDesktop = options.applyDesktop !== false;
  state.uiMode = nextMode;

  dom.body.classList.remove('ui-large', 'ui-medium', 'ui-small');
  dom.body.classList.add(`ui-${nextMode}`);

  if (nextMode === 'small') {
    state.isPlaylistCollapsed = true;
  }

  if (persist) {
    localStorage.setItem(MODE_KEY, nextMode);
  }

  if (state.desktopMode && applyDesktop && window.desktopAPI?.setWindowMode) {
    window.desktopAPI.setWindowMode(nextMode).catch(() => undefined);
  }

  updateControls();
  renderPlaylist();
}

async function initDesktopMode() {
  const savedMode = normalizeMode(localStorage.getItem(MODE_KEY) || 'medium');
  const query = new URLSearchParams(window.location.search);
  const isDesktop = query.get('desktop') === '1' && Boolean(window.desktopAPI?.isDesktop);

  if (!isDesktop) {
    setUIMode(savedMode === 'small' ? 'medium' : savedMode, { persist: false, applyDesktop: false });
    return;
  }

  state.desktopMode = true;
  dom.body.classList.add('desktop-mode');
  dom.desktopDragHandle.classList.remove('hidden');
  dom.desktopMinBtn.classList.remove('hidden');
  dom.desktopCloseBtn.classList.remove('hidden');

  let currentMode = savedMode;
  if (window.desktopAPI?.getWindowMode) {
    try {
      currentMode = normalizeMode(await window.desktopAPI.getWindowMode());
    } catch {
      currentMode = savedMode;
    }
  }

  setUIMode(currentMode, { applyDesktop: false });

  if (window.desktopAPI?.onModeChanged) {
    window.desktopAPI.onModeChanged((mode) => {
      setUIMode(mode, { applyDesktop: false });
    });
  }
}

function validateUrl(input) {
  const value = input.toLowerCase();
  return value.includes('bilibili.com') || value.includes('b23.tv') || value.includes('youtube.com') || value.includes('youtu.be');
}

function saveSourceLinks() {
  if (state.sourceLinks.length > 0) {
    setCookie(COOKIE_NAME, JSON.stringify(state.sourceLinks), COOKIE_MAX_AGE);
  } else {
    clearCookie(COOKIE_NAME);
  }
}

function loadSourceLinks() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string' && item.length > 0).slice(0, 10);
  } catch {
    return [];
  }
}

function syncAudio(autoPlay = false) {
  const song = currentSong();
  if (!song) {
    state.isPlaying = false;
    dom.audio.pause();
    dom.audio.removeAttribute('src');
    dom.audio.load();
    updateAll();
    return;
  }

  const sourceKey = `${song.id}|${state.audioQuality}`;
  if (dom.audio.dataset.sourceKey !== sourceKey) {
    dom.audio.src = buildAudioUrl(song.audioUrl, state.audioQuality);
    dom.audio.dataset.sourceKey = sourceKey;
    dom.audio.load();
  }

  if (!autoPlay && !state.isPlaying) {
    updateAll();
    return;
  }

  dom.audio
    .play()
    .then(() => {
      state.isPlaying = true;
      updateAll();
    })
    .catch(() => {
      state.isPlaying = false;
      updateAll();
      if (!currentSong()) return;
      dom.nowPlaying.textContent = '已准备就绪，点击播放按钮开始播放';
      dom.miniArtist.textContent = currentSong()?.albumTitle || 'w-music';
    });
}

function appendParsedData(sourceUrl, payload) {
  const sourceId = payload.sourceId || payload.bvid || `source_${Date.now()}`;
  const albumId = `${sourceId}_${Date.now()}`;
  const albumTitle = payload.albumTitle || '未命名专辑';
  const coverUrl = payload.coverUrl || '';

  state.albums.push({ id: albumId, sourceUrl, albumTitle, coverUrl });

  const tracks = (payload.playlist || []).map((track, index) => ({
    id: `${albumId}_${track.id || index}`,
    title: track.title || `Track ${index + 1}`,
    duration: track.duration || '--:--',
    audioUrl: track.audioUrl,
    albumId,
    albumTitle,
    coverUrl,
  }));

  state.playlist = [...state.playlist, ...tracks];
  if (state.currentSongIndex < 0 && tracks.length > 0) {
    state.currentSongIndex = 0;
  }
}

async function parseSource(url, options = {}) {
  const autoPlay = Boolean(options.autoPlay);
  const silent = Boolean(options.silent);
  setLoading(true);

  try {
    const response = await fetch(apiUrl(`/api/parse?url=${encodeURIComponent(url)}`));
    const result = await response.json();

    if (!response.ok || result.code !== 200 || !result.data) {
      throw new Error(result.message || '解析失败');
    }

    if (!Array.isArray(result.data.playlist) || result.data.playlist.length === 0) {
      throw new Error('链接里没有可播放的音频内容');
    }

    appendParsedData(url, result.data);

    if (!state.sourceLinks.includes(url)) {
      state.sourceLinks.push(url);
      state.sourceLinks = state.sourceLinks.slice(0, 10);
      saveSourceLinks();
    }

    if (autoPlay && state.currentSongIndex >= 0) {
      state.isPlaying = true;
      syncAudio(true);
    } else {
      updateAll();
    }
  } catch (error) {
    if (!silent) {
      showError(error.message || '解析失败，请稍后重试');
    }
  } finally {
    setLoading(false);
  }
}

async function restoreFromCookie() {
  const links = loadSourceLinks();
  for (const link of links) {
    await parseSource(link, { silent: true, autoPlay: false });
  }

  state.isPlaying = false;
  if (state.currentSongIndex >= 0) {
    syncAudio(false);
  } else {
    updateAll();
  }
}

function openAddModal() {
  if (state.uiMode === 'small') {
    setUIMode('medium');
  }
  dom.addModal.classList.remove('hidden');
  dom.urlInput.focus();
}

function closeAddModal() {
  dom.addModal.classList.add('hidden');
  dom.urlInput.value = '';
}

function clearAll() {
  state.isPlaying = false;
  state.playlist = [];
  state.albums = [];
  state.sourceLinks = [];
  state.coverUrl = '';
  state.currentSongIndex = -1;
  dom.audio.pause();
  dom.audio.removeAttribute('src');
  dom.audio.load();
  clearCookie(COOKIE_NAME);
  updateAll();
}

function removeAlbum(albumId) {
  const currentId = currentSong()?.id || '';
  const album = state.albums.find((item) => item.id === albumId);
  if (!album) return;

  state.albums = state.albums.filter((item) => item.id !== albumId);
  state.playlist = state.playlist.filter((track) => track.albumId !== albumId);
  state.sourceLinks = state.sourceLinks.filter((item) => item !== album.sourceUrl);
  saveSourceLinks();

  if (state.playlist.length === 0) {
    clearAll();
    return;
  }

  const nextIndex = state.playlist.findIndex((track) => track.id === currentId);
  state.currentSongIndex = nextIndex >= 0 ? nextIndex : 0;
  syncAudio(state.isPlaying);
}

function playAt(index, autoPlay = true) {
  if (index < 0 || index >= state.playlist.length) return;
  state.currentSongIndex = index;
  state.isPlaying = autoPlay;
  syncAudio(autoPlay);
}

function playNext() {
  if (state.playlist.length === 0) return;
  const nextIndex = (state.currentSongIndex + 1) % state.playlist.length;
  playAt(nextIndex, true);
}

function playPrev() {
  if (state.playlist.length === 0) return;
  const prevIndex = (state.currentSongIndex - 1 + state.playlist.length) % state.playlist.length;
  playAt(prevIndex, true);
}

function togglePlay() {
  if (!currentSong()) return;

  if (state.isPlaying) {
    dom.audio.pause();
    state.isPlaying = false;
    updateControls();
    return;
  }

  syncAudio(true);
}

function toggleQuality() {
  state.audioQuality = state.audioQuality === 'high' ? 'low' : 'high';
  syncAudio(state.isPlaying);
}

function bindEvents() {
  dom.modeLargeBtn.addEventListener('click', () => setUIMode('large'));
  dom.modeMediumBtn.addEventListener('click', () => setUIMode('medium'));
  dom.modeSmallBtn.addEventListener('click', () => setUIMode('small'));
  dom.miniExpandBtn.addEventListener('click', () => setUIMode('medium'));
  dom.playBtn.addEventListener('click', togglePlay);
  dom.miniPlayBtn.addEventListener('click', togglePlay);
  dom.prevBtn.addEventListener('click', playPrev);
  dom.nextBtn.addEventListener('click', playNext);
  dom.miniNextBtn.addEventListener('click', playNext);
  dom.qualityBtn.addEventListener('click', toggleQuality);
  dom.addLinkBtn.addEventListener('click', openAddModal);
  dom.cancelAddBtn.addEventListener('click', closeAddModal);
  dom.clearBtn.addEventListener('click', clearAll);
  dom.toggleListBtn.addEventListener('click', () => {
    state.isPlaylistCollapsed = !state.isPlaylistCollapsed;
    updateControls();
    renderPlaylist();
  });

  dom.addModal.addEventListener('click', (event) => {
    if (event.target === dom.addModal) closeAddModal();
  });

  dom.addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = dom.urlInput.value.trim();
    if (!validateUrl(url)) {
      showError('请输入有效的 Bilibili 或 YouTube 链接');
      return;
    }
    if (state.sourceLinks.includes(url)) {
      showError('这个链接已经添加过了');
      return;
    }
    await parseSource(url, { autoPlay: state.playlist.length === 0 });
    closeAddModal();
  });

  dom.playlist.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.album-remove');
    if (removeButton) {
      removeAlbum(removeButton.dataset.albumId);
      return;
    }

    const track = event.target.closest('.track');
    if (!track) return;
    const index = Number(track.dataset.index);
    if (!Number.isFinite(index)) return;
    playAt(index, true);
  });

  dom.audio.addEventListener('play', () => {
    state.isPlaying = true;
    updateControls();
  });

  dom.audio.addEventListener('pause', () => {
    state.isPlaying = false;
    updateControls();
  });

  dom.audio.addEventListener('timeupdate', updateTime);
  dom.audio.addEventListener('loadedmetadata', updateTime);
  dom.audio.addEventListener('durationchange', updateTime);
  dom.audio.addEventListener('ended', playNext);
  dom.audio.addEventListener('error', () => {
    showError('当前音频加载失败，请尝试切换音质或重新解析链接');
  });

  dom.volumeSlider.addEventListener('input', () => {
    dom.audio.volume = Number(dom.volumeSlider.value);
    updateVolume();
  });

  dom.progressSlider.addEventListener('input', () => {
    const duration = Number.isFinite(dom.audio.duration) ? dom.audio.duration : 0;
    if (duration <= 0) return;
    const ratio = Math.min(100, Math.max(0, Number(dom.progressSlider.value))) / 100;
    dom.audio.currentTime = duration * ratio;
    updateTime();
  });

  if (window.desktopAPI?.isDesktop) {
    dom.desktopMinBtn.addEventListener('click', () => window.desktopAPI.minimizeWindow());
    dom.desktopCloseBtn.addEventListener('click', () => window.desktopAPI.closeWindow());
  }
}

async function bootstrap() {
  dom.audio.volume = 0.8;
  setIcon(dom.playBtn, 'play');
  setIcon(dom.miniPlayBtn, 'play');
  setIcon(dom.toggleListBtn, 'collapse');
  await initDesktopMode();
  bindEvents();
  updateAll();
  await restoreFromCookie();
}

bootstrap();
