const COOKIE_NAME = 'bili_music_links';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const state = {
  isPlaying: false,
  isLoading: false,
  playlist: [],
  albums: [],
  sourceLinks: [],
  albumTitle: '等待解析...',
  coverUrl: '',
  currentSongIndex: -1,
  pipWindow: null,
  originalParent: null,
  isPlaylistCollapsed: false,
  audioQuality: 'high',
  desktopMode: false,
};

const dom = {
  dragHandle: document.getElementById('desktop-drag-handle'),
  playerContainer: document.getElementById('player-container'),
  tips: document.getElementById('tips'),
  addModal: document.getElementById('add-modal'),
  addForm: document.getElementById('add-form'),
  urlInput: document.getElementById('url-input'),
  loader: document.getElementById('loader'),
  coverWrapper: document.getElementById('cover-wrapper'),
  coverImg: document.getElementById('cover-img'),
  coverFallback: document.getElementById('cover-fallback'),
  albumTitle: document.getElementById('album-title'),
  nowPlaying: document.getElementById('now-playing'),
  prevBtn: document.getElementById('prev-btn'),
  playBtn: document.getElementById('play-btn'),
  nextBtn: document.getElementById('next-btn'),
  desktopMinBtn: document.getElementById('desktop-min-btn'),
  desktopCloseBtn: document.getElementById('desktop-close-btn'),
  clearBtn: document.getElementById('clear-btn'),
  pipBtn: document.getElementById('pip-btn'),
  playlist: document.getElementById('playlist'),
  addLinkBtn: document.getElementById('add-link-btn'),
  cancelAddBtn: document.getElementById('cancel-add-btn'),
  toggleListBtn: document.getElementById('toggle-list-btn'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeText: document.getElementById('volume-text'),
  qualityBtn: document.getElementById('quality-btn'),
  audio: document.getElementById('audio'),
};

function isDesktopMode() {
  const query = new URLSearchParams(window.location.search);
  return query.get('desktop') === '1' && Boolean(window.desktopAPI?.isDesktop);
}

function initDesktopMode() {
  if (!isDesktopMode()) return;

  state.desktopMode = true;
  document.body.classList.add('desktop-mode');
  dom.dragHandle.classList.remove('hidden');
  dom.desktopMinBtn.classList.remove('hidden');
  dom.desktopCloseBtn.classList.remove('hidden');
}

function buildAudioUrl(url, quality) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}quality=${quality}`;
}

function currentSong() {
  if (state.currentSongIndex < 0 || state.currentSongIndex >= state.playlist.length) return null;
  return state.playlist[state.currentSongIndex];
}

function setLoading(loading) {
  state.isLoading = loading;
  dom.loader.classList.toggle('hidden', !loading);
}

function setError(message) {
  window.alert(message);
}

function escapeHtml(str = '') {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCookie(name) {
  const pair = document.cookie
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  if (!pair) return '';
  return decodeURIComponent(pair.split('=').slice(1).join('='));
}

function setCookie(name, value, maxAge) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}

function clearCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/; samesite=lax`;
}

function saveSourceLinksToCookie() {
  setCookie(COOKIE_NAME, JSON.stringify(state.sourceLinks), COOKIE_MAX_AGE);
}

function loadSourceLinksFromCookie() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return [];

  try {
    const links = JSON.parse(raw);
    if (!Array.isArray(links)) return [];
    return links.filter((item) => typeof item === 'string' && item.length > 0).slice(0, 10);
  } catch {
    return [];
  }
}

function updateVolumeUI() {
  const percent = `${Math.round(dom.audio.volume * 100)}%`;
  dom.volumeText.textContent = percent;
  dom.volumeSlider.value = String(dom.audio.volume);
}

function updateMetaFromCurrentSong() {
  const song = currentSong();
  if (!song) return;
  state.albumTitle = song.albumTitle || '未知专辑';
  state.coverUrl = song.coverUrl || '';
}

function updateCover() {
  const hasCover = Boolean(state.coverUrl);

  if (hasCover) {
    dom.coverImg.src = state.coverUrl;
    dom.coverImg.classList.remove('hidden');
    dom.coverImg.classList.add('rotating');
    dom.coverFallback.classList.add('hidden');
  } else {
    dom.coverImg.classList.add('hidden');
    dom.coverFallback.classList.remove('hidden');
  }

  dom.coverWrapper.classList.toggle('empty', state.playlist.length === 0);
  dom.coverImg.classList.toggle('playing', state.isPlaying);
}

function updateControls() {
  const hasList = state.playlist.length > 0;
  dom.prevBtn.disabled = !hasList;
  dom.nextBtn.disabled = !hasList;
  dom.playBtn.disabled = !hasList;
  dom.playBtn.textContent = state.isPlaying ? '⏸' : '▶';
  dom.toggleListBtn.textContent = state.isPlaylistCollapsed ? '▸' : '▾';
  dom.qualityBtn.textContent = state.audioQuality === 'low' ? 'L' : 'H';
  dom.qualityBtn.title = state.audioQuality === 'low' ? '省流模式 (Low bitrate)' : '高码率模式 (High bitrate)';
  dom.qualityBtn.classList.toggle('low', state.audioQuality === 'low');
}

function updateMeta() {
  const song = currentSong();
  dom.albumTitle.textContent = state.albumTitle;
  dom.albumTitle.title = state.albumTitle;
  dom.nowPlaying.textContent = song ? `正在播放: ${song.title}` : '当前无播放任务';
}

function renderPlaylist() {
  dom.playlist.classList.toggle('collapsed', state.isPlaylistCollapsed);

  if (state.playlist.length === 0) {
    dom.playlist.innerHTML = `
      <div class="empty-state">
        <div style="font-size:44px; color:#d5d5d5;">♪</div>
        <div style="font-size:14px;">列表空空如也</div>
        <p class="note">点击右上角「+」添加 Bilibili / YouTube 链接，可累计多个歌单</p>
      </div>
    `;
    return;
  }

  let html = '';
  let currentAlbum = '';

  state.playlist.forEach((song, idx) => {
    if (song.albumId !== currentAlbum) {
      currentAlbum = song.albumId;
      html += `
        <div class="album-row">
          <span class="album-title-text">${escapeHtml(song.albumTitle || '未命名歌单')}</span>
          <button class="album-remove" data-album-id="${escapeHtml(song.albumId)}" title="删除该歌单">-</button>
        </div>
      `;
    }

    const active = idx === state.currentSongIndex;
    const playingClass = active && state.isPlaying ? 'playing' : '';

    html += `
      <article class="track ${active ? 'active' : ''} ${playingClass}" data-index="${idx}" title="双击播放">
        <div class="track-left">
          <span class="track-index">${idx + 1}</span>
          <span class="track-title">${escapeHtml(song.title)}</span>
          <span class="equalizer"><i></i><i></i><i></i></span>
        </div>
        <span class="track-right">${song.duration || '--:--'}</span>
      </article>
    `;
  });

  dom.playlist.innerHTML = html;
}

function removeAlbum(albumId) {
  const currentId = currentSong()?.id || null;
  const album = state.albums.find((item) => item.id === albumId);
  if (!album) return;

  state.albums = state.albums.filter((item) => item.id !== albumId);
  state.playlist = state.playlist.filter((track) => track.albumId !== albumId);
  state.sourceLinks = state.sourceLinks.filter((link) => link !== album.sourceUrl);
  if (state.sourceLinks.length > 0) saveSourceLinksToCookie();
  else clearCookie(COOKIE_NAME);

  if (state.playlist.length === 0) {
    state.currentSongIndex = -1;
    state.isPlaying = false;
    dom.audio.pause();
    dom.audio.removeAttribute('src');
    dom.audio.load();
    updateAll();
    return;
  }

  let nextIndex = currentId ? state.playlist.findIndex((track) => track.id === currentId) : -1;
  if (nextIndex < 0) {
    nextIndex = Math.min(state.currentSongIndex, state.playlist.length - 1);
  }
  state.currentSongIndex = Math.max(0, nextIndex);
  syncAudioFromState({ autoPlay: state.isPlaying });
  updateAll();
}

function updateAll() {
  updateMetaFromCurrentSong();
  updateMeta();
  updateCover();
  updateControls();
  renderPlaylist();
  updateVolumeUI();
}

function syncAudioFromState({ autoPlay = false } = {}) {
  const song = currentSong();

  if (!song) {
    dom.audio.pause();
    dom.audio.removeAttribute('src');
    dom.audio.load();
    state.isPlaying = false;
    updateAll();
    return;
  }

  const nextUrl = buildAudioUrl(song.audioUrl, state.audioQuality);
  const nextSourceKey = `${song.id}|${state.audioQuality}`;
  if (dom.audio.dataset.sourceKey !== nextSourceKey) {
    dom.audio.src = nextUrl;
    dom.audio.dataset.sourceKey = nextSourceKey;
    dom.audio.load();
  }

  if (autoPlay || state.isPlaying) {
    dom.audio
      .play()
      .then(() => {
        state.isPlaying = true;
        updateAll();
      })
      .catch(() => {
        state.isPlaying = false;
        updateAll();
        setError('音频播放失败，可能触发了浏览器自动播放限制，请手动点击播放。');
      });
  }
}

function playNext() {
  if (state.playlist.length === 0) return;
  state.currentSongIndex = (state.currentSongIndex + 1) % state.playlist.length;
  syncAudioFromState({ autoPlay: true });
}

function playPrev() {
  if (state.playlist.length === 0) return;
  state.currentSongIndex = (state.currentSongIndex - 1 + state.playlist.length) % state.playlist.length;
  syncAudioFromState({ autoPlay: true });
}

function togglePlay() {
  if (!currentSong()) return;

  if (state.isPlaying) {
    dom.audio.pause();
    state.isPlaying = false;
    updateAll();
    return;
  }

  dom.audio
    .play()
    .then(() => {
      state.isPlaying = true;
      updateAll();
    })
    .catch(() => setError('播放失败，请重试。'));
}

function toggleQuality() {
  state.audioQuality = state.audioQuality === 'high' ? 'low' : 'high';
  const shouldAutoPlay = state.isPlaying;
  syncAudioFromState({ autoPlay: shouldAutoPlay });
  updateAll();
}

function setupDocumentPiP() {
  if (state.desktopMode) return;

  if (state.pipWindow) {
    state.pipWindow.close();
    return;
  }

  if (!('documentPictureInPicture' in window)) {
    setError('当前浏览器不支持 Document PiP，请升级到最新版 Chrome 或 Edge。');
    return;
  }

  window.documentPictureInPicture
    .requestWindow({ width: 380, height: 500 })
    .then((pip) => {
      for (const sheet of [...document.styleSheets]) {
        try {
          const cssText = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
          const style = document.createElement('style');
          style.textContent = cssText;
          pip.document.head.appendChild(style);
        } catch {
          if (sheet.href) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            pip.document.head.appendChild(link);
          }
        }
      }

      state.originalParent = dom.playerContainer.parentNode;
      pip.document.body.style.margin = '0';
      pip.document.body.style.background = 'transparent';
      pip.document.body.appendChild(dom.playerContainer);

      state.pipWindow = pip;
      dom.tips.classList.add('hidden');

      pip.addEventListener('pagehide', () => {
        if (state.originalParent?.isConnected) {
          state.originalParent.appendChild(dom.playerContainer);
        }
        state.pipWindow = null;
        dom.tips.classList.remove('hidden');
      });
    })
    .catch(() => {
      setError('画中画开启失败，请检查浏览器权限后重试。');
    });
}

function clearAll() {
  state.isPlaying = false;
  state.playlist = [];
  state.albums = [];
  state.sourceLinks = [];
  state.albumTitle = '等待解析...';
  state.coverUrl = '';
  state.currentSongIndex = -1;

  dom.audio.pause();
  dom.audio.removeAttribute('src');
  dom.audio.load();

  dom.urlInput.value = '';
  clearCookie(COOKIE_NAME);
  updateAll();
}

function validateUrl(input) {
  const lowered = input.toLowerCase();
  return (
    lowered.includes('bilibili.com') ||
    lowered.includes('b23.tv') ||
    lowered.includes('youtube.com') ||
    lowered.includes('youtu.be')
  );
}

function openAddModal() {
  dom.addModal.classList.remove('hidden');
  dom.urlInput.focus();
}

function closeAddModal() {
  dom.addModal.classList.add('hidden');
  dom.urlInput.value = '';
}

function appendParsedData(sourceUrl, data) {
  const sourceId = data.sourceId || data.bvid || 'unknown_source';
  const albumId = `${sourceId}_${Date.now()}`;

  const album = {
    id: albumId,
    sourceUrl,
    title: data.albumTitle || '未知歌单',
    coverUrl: data.coverUrl || '',
  };

  const tracks = (data.playlist || []).map((song, index) => ({
    id: `${albumId}_${song.id}_${index}`,
    title: song.title || `Track ${index + 1}`,
    duration: song.duration || '--:--',
    audioUrl: song.audioUrl,
    albumId,
    albumTitle: album.title,
    coverUrl: album.coverUrl,
  }));

  state.albums.push(album);
  state.playlist = [...state.playlist, ...tracks];

  if (state.currentSongIndex < 0 && tracks.length > 0) {
    state.currentSongIndex = 0;
  }
}

async function parseSource(url, { autoPlay = false, silent = false } = {}) {
  setLoading(true);

  try {
    const response = await fetch(`/api/parse?url=${encodeURIComponent(url)}`);
    const payload = await response.json();

    if (!response.ok || payload.code !== 200 || !payload.data) {
      throw new Error(payload.message || '解析失败');
    }

    if (!Array.isArray(payload.data.playlist) || payload.data.playlist.length === 0) {
      throw new Error('该链接没有解析出可播放的列表。');
    }

    appendParsedData(url, payload.data);

    if (!state.sourceLinks.includes(url)) {
      state.sourceLinks.push(url);
      state.sourceLinks = state.sourceLinks.slice(0, 10);
      saveSourceLinksToCookie();
    }

    if (autoPlay && state.currentSongIndex >= 0) {
      state.isPlaying = true;
      syncAudioFromState({ autoPlay: true });
    }

    updateAll();
  } catch (error) {
    if (!silent) setError(error.message || '解析失败，请稍后重试。');
  } finally {
    setLoading(false);
  }
}

async function restoreFromCookie() {
  const links = loadSourceLinksFromCookie();
  if (links.length === 0) return;

  state.sourceLinks = [];
  for (const link of links) {
    await parseSource(link, { autoPlay: false, silent: true });
  }

  state.isPlaying = false;
  if (state.currentSongIndex >= 0) {
    syncAudioFromState({ autoPlay: false });
  }

  updateAll();
}

function bindEvents() {
  if (state.desktopMode) {
    dom.desktopMinBtn.addEventListener('click', () => {
      window.desktopAPI?.minimizeWindow?.();
    });

    dom.desktopCloseBtn.addEventListener('click', () => {
      window.desktopAPI?.closeWindow?.();
    });
  }

  dom.playBtn.addEventListener('click', togglePlay);
  dom.prevBtn.addEventListener('click', playPrev);
  dom.nextBtn.addEventListener('click', playNext);
  dom.clearBtn.addEventListener('click', clearAll);
  dom.pipBtn.addEventListener('click', setupDocumentPiP);
  dom.qualityBtn.addEventListener('click', toggleQuality);

  dom.addLinkBtn.addEventListener('click', openAddModal);
  dom.cancelAddBtn.addEventListener('click', closeAddModal);
  dom.addModal.addEventListener('click', (event) => {
    if (event.target === dom.addModal) closeAddModal();
  });

  dom.addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = dom.urlInput.value.trim();

    if (!validateUrl(url)) {
      setError('请输入有效的 Bilibili 或 YouTube 链接。');
      return;
    }

    if (state.sourceLinks.includes(url)) {
      setError('这个链接已经添加过了。');
      return;
    }

    const shouldAutoplay = state.playlist.length === 0;
    await parseSource(url, { autoPlay: shouldAutoplay, silent: false });
    closeAddModal();
  });

  dom.toggleListBtn.addEventListener('click', () => {
    state.isPlaylistCollapsed = !state.isPlaylistCollapsed;
    updateAll();
  });

  dom.playlist.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('.album-remove');
    if (removeBtn) {
      const albumId = removeBtn.dataset.albumId;
      if (albumId) removeAlbum(albumId);
      return;
    }

    const track = event.target.closest('.track');
    if (!track) return;

    const index = Number(track.dataset.index);
    if (Number.isNaN(index)) return;

    state.currentSongIndex = index;
    state.isPlaying = true;
    syncAudioFromState({ autoPlay: true });
  });

  dom.audio.addEventListener('play', () => {
    state.isPlaying = true;
    updateAll();
  });

  dom.audio.addEventListener('pause', () => {
    state.isPlaying = false;
    updateAll();
  });

  dom.audio.addEventListener('ended', () => {
    playNext();
  });

  dom.audio.addEventListener('error', () => {
    setError('当前音频加载失败，可能是来源受限或已失效。');
  });

  dom.volumeSlider.addEventListener('input', () => {
    dom.audio.volume = Number(dom.volumeSlider.value);
    updateVolumeUI();
  });
}

dom.audio.volume = 0.8;
initDesktopMode();
bindEvents();
updateAll();
restoreFromCookie();
