/* ============================================================
   WHISTLE PLAYER — app.js
   Sections:
     1.  Config & Constants
     2.  State
     3.  DOM References
     4.  Helpers  (esc, fmt, getCSS)
     5.  Storage  (load / save settings)
     6.  UI Helpers (syncToggle, setPlaying, updateProgressBar, updateVolumeBar)
     7.  Player Core  (loadSong, pauseAudio, updateIdx)
     8.  Playlist Engine  (buildPlaylist, reorderSong, toggleSong)
     9.  Playlist Renderer  (renderList)
    10.  Search & Suggestions
    11.  Modal Manager
    12.  Settings Bindings
    13.  Controls & Audio Events
    14.  Volume Popup
    15.  Keyboard Shortcuts
    16.  Init
   ============================================================ */


/* ── 1. CONFIG & CONSTANTS ── */

const RAW       = 'https://raw.githubusercontent.com/Crazy-Ledend/whistle-audio-files/main/';
const SONGS_URL = RAW + 'songs.json';
const songPath  = f => RAW + 'songs/' + f;
const thumbPath = f => RAW + 'thumbs/' + f;


/* ── 2. STATE ── */

let allSongs     = [];   // master list from JSON
let playlist     = [];   // filtered + ordered active list
let enabled      = {};   // origIdx → bool

let currentIdx   = 0;
let isPlaying    = false;
let isLoop       = false;
let dragSrcIdx   = null;
let currentOrder = 'default';
let searchQuery  = '';

let settings = {
  autoplay:      true,
  loopPlaylist:  false,
  crossfade:     0,
  showIndex:     true,
  pulse:         true,
  ring:          true,
  theme:         'void',
};


/* ── 3. DOM REFERENCES ── */

const audio        = document.getElementById('audio');
const $            = id => document.getElementById(id);

// Player
const songTitleEl  = $('songTitle');
const songIndexEl  = $('songIndex');
const artInner     = $('artInner');
const ringEl       = $('ring');
const pulseEls     = [$('pulse1'), $('pulse2'), $('pulse3')];
const playBtn      = $('playBtn');
const playIcon     = $('playIcon');
const pauseIcon    = $('pauseIcon');
const prevBtn      = $('prevBtn');
const nextBtn      = $('nextBtn');
const loopBtn      = $('loopBtn');
const progressBar  = $('progressBar');
const timeEl       = $('timeEl');
const durationEl   = $('durationEl');

// Volume
const volumeBar    = $('volumeBar');
const volLabel     = $('volLabel');
const volAnchor    = $('volAnchor');
const volPopup     = $('volPopup');
const volWave1     = $('volWave1');
const volWave2     = $('volWave2');

// Search
const searchInput  = $('searchInput');
const searchSuggest= $('searchSuggest');

// Playlist modal
const songList         = $('songList');
const playlistModal    = $('playlistModal');
const playlistToggle   = $('playlistToggle');
const playlistClose    = $('playlistClose');
const modalBadge       = $('modalBadge');
const selectAllBtn     = $('selectAllBtn');
const deselectAllBtn   = $('deselectAllBtn');

// Order buttons
const orderBtns = {
  default:  $('orderDefault'),
  az:       $('orderAZ'),
  za:       $('orderZA'),
  shuffle:  $('orderShuffle'),
};

// Settings modal
const settingsModal    = $('settingsModal');
const settingsToggle   = $('settingsToggle');
const settingsClose    = $('settingsClose');
const themeGrid        = $('themeGrid');


/* ── 4. HELPERS ── */

/** Escape HTML special characters */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Format seconds → "m:ss" */
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/** Read a computed CSS variable from body */
function getCSS(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}


/* ── 5. STORAGE ── */

function loadStorage() {
  try {
    const s = localStorage.getItem('wSettings');
    if (s) settings = Object.assign(settings, JSON.parse(s));
  } catch (e) { /* ignore */ }
}

function saveStorage() {
  try {
    localStorage.setItem('wSettings', JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}


/* ── 6. UI HELPERS ── */

function syncToggle(id, val) {
  const el = $(id);
  if (el) el.classList.toggle('on', val);
}

function setPlaying(val) {
  isPlaying = val;
  playIcon.style.display  = val ? 'none'  : 'block';
  pauseIcon.style.display = val ? 'block' : 'none';
  ringEl.classList.toggle('spinning', val && settings.ring);
  pulseEls.forEach(p => p.classList.toggle('active', val && settings.pulse));
}

function updateProgressBar(pct) {
  progressBar.value = pct;
  const track = getCSS('--slider-track') || 'rgba(255,255,255,0.08)';
  const fill  = getCSS('--text2')        || '#8888a0';
  progressBar.style.background =
    `linear-gradient(to right,${fill} 0%,${fill} ${pct}%,${track} ${pct}%)`;
}

function updateVolumeBar(pct) {
  const track = getCSS('--slider-track') || 'rgba(255,255,255,0.08)';
  const fill  = getCSS('--text2')        || '#8888a0';
  volumeBar.style.background =
    `linear-gradient(to right,${fill} 0%,${fill} ${pct}%,${track} ${pct}%)`;
}


/* ── 7. PLAYER CORE ── */

function updateIdx() {
  songIndexEl.textContent = playlist.length
    ? `${currentIdx + 1} / ${playlist.length}`
    : '– / –';
  songIndexEl.style.display = settings.showIndex ? '' : 'none';
}

/**
 * Load the song at playlist[idx].
 * @param {number}  idx       - index into the active playlist
 * @param {boolean} autoplay  - start playing immediately
 */
function loadSong(idx, autoplay) {
  const song = playlist[idx];
  if (!song) return;

  songTitleEl.textContent = song.title;
  updateIdx();

  // Reset art
  artInner.innerHTML = '<div class="art-placeholder">&#9836;</div>';
  if (song.thumb) {
    const img = new Image();
    img.onload = () => {
      artInner.innerHTML = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      artInner.appendChild(img);
    };
    img.src = thumbPath(song.thumb);
  }

  audio.src = songPath(song.audio);
  audio.load();

  if (autoplay) {
    audio.play()
      .then(() => setPlaying(true))
      .catch(err => { console.error(err); setPlaying(false); });
  } else {
    setPlaying(false);
  }

  renderList();
}

function pauseAudio() {
  audio.pause();
  setPlaying(false);
}


/* ── 8. PLAYLIST ENGINE ── */

/**
 * Rebuild `playlist` from allSongs, applying enabled filter,
 * current search query, and sort order.
 */
function buildPlaylist() {
  const q = searchQuery.trim().toLowerCase();

  let list = allSongs
    .map((s, origIdx) => ({ ...s, origIdx }))
    .filter(s =>
      enabled[s.origIdx] &&
      (!q || s.title.toLowerCase().includes(q))
    );

  if (currentOrder === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
  if (currentOrder === 'za') list.sort((a, b) => b.title.localeCompare(a.title));

  playlist = list;
  if (currentIdx >= playlist.length) currentIdx = 0;
}

/** Toggle a song on/off by its original index */
function toggleSong(origIdx) {
  enabled[origIdx] = !enabled[origIdx];

  const cur = playlist[currentIdx];
  buildPlaylist();

  if (cur && !enabled[cur.origIdx]) {
    if (!playlist.length) {
      pauseAudio();
      songTitleEl.textContent = 'No songs active';
    } else {
      currentIdx = 0;
      loadSong(0, isPlaying);
    }
  } else if (cur) {
    const ni = playlist.findIndex(p => p.origIdx === cur.origIdx);
    currentIdx = ni >= 0 ? ni : 0;
  }

  renderList();
  updateIdx();
}

/** Reorder songs in allSongs via drag-and-drop */
function reorderSong(fromOrig, toOrig) {
  if (
    fromOrig < 0 || toOrig < 0 ||
    fromOrig >= allSongs.length || toOrig >= allSongs.length
  ) return;

  const moved = allSongs.splice(fromOrig, 1)[0];
  allSongs.splice(toOrig, 0, moved);

  // Reset enabled map after index change
  enabled = {};
  allSongs.forEach((_, i) => (enabled[i] = true));

  buildPlaylist();
  renderList();
  if (currentOrder !== 'default') setOrder('default');
}

/** Set playlist order and re-render */
function setOrder(o) {
  currentOrder = o;
  Object.keys(orderBtns).forEach(k =>
    orderBtns[k].classList.toggle('active', k === o)
  );

  if (o === 'shuffle') {
    for (let i = allSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allSongs[i], allSongs[j]] = [allSongs[j], allSongs[i]];
    }
  }

  buildPlaylist();
  renderList();
}


/* ── 9. PLAYLIST RENDERER ── */

function renderList() {
  buildPlaylist();
  modalBadge.textContent = playlist.length + ' active';

  if (!allSongs.length) {
    songList.innerHTML = '<div class="empty-state">No songs.</div>';
    return;
  }

  const curOrig = playlist[currentIdx]?.origIdx ?? -1;
  songList.innerHTML = '';

  allSongs.forEach((song, i) => {
    const isActive = i === curOrig;
    const isEn     = enabled[i];
    const plPos    = playlist.findIndex(p => p.origIdx === i);

    const item = document.createElement('div');
    item.className =
      'song-item' +
      (isActive ? ' playing'  : '') +
      (isEn     ? ''          : ' disabled');
    item.draggable = true;

    item.innerHTML =
      '<div class="drag-handle">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" opacity="0.35">' +
          '<circle cx="9"  cy="6"  r="1.5"/><circle cx="15" cy="6"  r="1.5"/>' +
          '<circle cx="9"  cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>' +
          '<circle cx="9"  cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>' +
        '</svg></div>' +
      `<div class="song-item-thumb" id="lt${i}"><span>&#9836;</span></div>` +
      '<div class="song-item-info">' +
        `<div class="song-item-title">${esc(song.title)}</div>` +
        `<div class="song-item-num">${plPos >= 0 ? '#' + (plPos + 1) + ' in queue' : 'Disabled'}</div>` +
      '</div>' +
      '<div class="playing-eq"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>' +
      `<div class="toggle ${isEn ? 'on' : ''}" data-orig="${i}"></div>`;

    // Lazy-load thumbnail
    if (song.thumb) {
      const img = new Image();
      img.onload = () => {
        const el = $('lt' + i);
        if (el) { el.innerHTML = ''; el.appendChild(img); }
      };
      img.src = thumbPath(song.thumb);
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    }

    // Click → play this song
    item.addEventListener('click', e => {
      if (e.target.closest('.toggle, .drag-handle')) return;
      if (!isEn) return;
      const idx = playlist.findIndex(p => p.origIdx === i);
      if (idx === -1) return;
      currentIdx = idx;
      loadSong(currentIdx, true);
    });

    // Toggle enable/disable
    item.querySelector('.toggle').addEventListener('click', e => {
      e.stopPropagation();
      toggleSong(i);
    });

    // Drag-and-drop reorder
    item.addEventListener('dragstart', e => {
      dragSrcIdx = i;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.song-item').forEach(el => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.song-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrcIdx !== null && dragSrcIdx !== i) reorderSong(dragSrcIdx, i);
    });

    songList.appendChild(item);
  });
}


/* ── 10. SEARCH & SUGGESTIONS ── */

function renderSuggestions(query) {
  if (!query) {
    searchSuggest.style.display = 'none';
    return;
  }

  const matches = allSongs
    .filter(s => s.title.toLowerCase().includes(query))
    .slice(0, 6);

  if (!matches.length) {
    searchSuggest.style.display = 'none';
    return;
  }

  searchSuggest.innerHTML = '';

  matches.forEach(song => {
    const item = document.createElement('div');
    item.className = 'search-suggest-item';

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'suggest-thumb';
    if (song.thumb) {
      const img = new Image();
      img.onload = () => { thumb.innerHTML = ''; thumb.appendChild(img); };
      img.src = thumbPath(song.thumb);
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:7px;';
      thumb.innerHTML = '&#9836;';
    } else {
      thumb.textContent = '♪';
    }

    // Title with highlighted match
    const titleEl = document.createElement('span');
    titleEl.className = 'suggest-title';
    const idx = song.title.toLowerCase().indexOf(query);
    if (idx !== -1) {
      titleEl.innerHTML =
        esc(song.title.slice(0, idx)) +
        `<strong style="color:var(--accent)">${esc(song.title.slice(idx, idx + query.length))}</strong>` +
        esc(song.title.slice(idx + query.length));
    } else {
      titleEl.textContent = song.title;
    }

    item.appendChild(thumb);
    item.appendChild(titleEl);

    // ── KEY FIX: clicking a suggestion plays it immediately ──
    item.addEventListener('mousedown', e => {
      // mousedown fires before blur, preventing input blur from hiding the list
      e.preventDefault();

      // Find this song in allSongs
      const origIdx  = allSongs.indexOf(song);
      // Make sure it is enabled
      if (!enabled[origIdx]) enabled[origIdx] = true;

      // Clear search so the full playlist is restored
      searchInput.value = '';
      searchQuery       = '';
      searchSuggest.style.display = 'none';

      buildPlaylist();
      renderList();

      // Now find it in the (restored) playlist and jump to it
      const plIdx = playlist.findIndex(p => p.origIdx === origIdx);
      if (plIdx !== -1) {
        currentIdx = plIdx;
        loadSong(currentIdx, true);
      }

      updateIdx();
    });

    searchSuggest.appendChild(item);
  });

  searchSuggest.style.display = 'block';
}

// Wire up the search input
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderSuggestions(searchQuery);
  buildPlaylist();
  renderList();
  updateIdx();
});

// Hide suggestions when clicking outside the search area
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    searchSuggest.style.display = 'none';
  }
});


/* ── 11. MODAL MANAGER ── */

function openModal(el) {
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(el) {
  el.classList.remove('open');
  document.body.style.overflow = '';
}
function closeAll() {
  closeModal(playlistModal);
  closeModal(settingsModal);
  playlistToggle.classList.remove('active');
  settingsToggle.classList.remove('active');
}

// Playlist modal
playlistToggle.addEventListener('click', () => {
  if (playlistModal.classList.contains('open')) {
    closeModal(playlistModal);
    playlistToggle.classList.remove('active');
  } else {
    closeModal(settingsModal);
    settingsToggle.classList.remove('active');
    openModal(playlistModal);
    playlistToggle.classList.add('active');
  }
});
playlistClose.addEventListener('click', () => {
  closeModal(playlistModal);
  playlistToggle.classList.remove('active');
});
playlistModal.addEventListener('click', e => {
  if (e.target === playlistModal) {
    closeModal(playlistModal);
    playlistToggle.classList.remove('active');
  }
});

// Settings modal
settingsToggle.addEventListener('click', () => {
  if (settingsModal.classList.contains('open')) {
    closeModal(settingsModal);
    settingsToggle.classList.remove('active');
  } else {
    closeModal(playlistModal);
    playlistToggle.classList.remove('active');
    openModal(settingsModal);
    settingsToggle.classList.add('active');
  }
});
settingsClose.addEventListener('click', () => {
  closeModal(settingsModal);
  settingsToggle.classList.remove('active');
});
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) {
    closeModal(settingsModal);
    settingsToggle.classList.remove('active');
  }
});


/* ── 12. SETTINGS BINDINGS ── */

function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.querySelectorAll('.theme-swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.theme === settings.theme)
  );
  syncToggle('toggleAutoplay',     settings.autoplay);
  syncToggle('toggleLoopPlaylist', settings.loopPlaylist);
  syncToggle('toggleShowIndex',    settings.showIndex);
  syncToggle('togglePulse',        settings.pulse);
  syncToggle('toggleRing',         settings.ring);

  document.querySelectorAll('[data-xfade]').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.xfade) === settings.crossfade)
  );

  $('songIndex').style.display = settings.showIndex ? '' : 'none';
  isLoop    = settings.loopPlaylist;
  audio.loop = isLoop;
  loopBtn.classList.toggle('active', isLoop);
}

/** Bind a big-toggle to a settings key with an optional callback */
function bindToggle(id, key, cb) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', () => {
    settings[key] = !settings[key];
    syncToggle(id, settings[key]);
    saveStorage();
    if (cb) cb(settings[key]);
  });
}

bindToggle('toggleAutoplay', 'autoplay');
bindToggle('toggleLoopPlaylist', 'loopPlaylist', v => {
  isLoop     = v;
  audio.loop = v;
  loopBtn.classList.toggle('active', v);
});
bindToggle('toggleShowIndex', 'showIndex', v => {
  $('songIndex').style.display = v ? '' : 'none';
});
bindToggle('togglePulse', 'pulse', v => {
  if (!v) pulseEls.forEach(p => p.classList.remove('active'));
  else if (isPlaying) pulseEls.forEach(p => p.classList.add('active'));
});
bindToggle('toggleRing', 'ring', v => {
  if (!v) ringEl.classList.remove('spinning');
  else if (isPlaying) ringEl.classList.add('spinning');
});

// Theme swatches
themeGrid.addEventListener('click', e => {
  const sw = e.target.closest('.theme-swatch');
  if (!sw) return;
  settings.theme = sw.dataset.theme;
  document.body.dataset.theme = settings.theme;
  document.querySelectorAll('.theme-swatch').forEach(s =>
    s.classList.toggle('active', s === sw)
  );
  saveStorage();
  // Re-render sliders with new theme colours
  const pct = parseFloat(progressBar.value) || 0;
  setTimeout(() => {
    updateProgressBar(pct);
    updateVolumeBar(parseFloat(volumeBar.value));
  }, 50);
});

// Crossfade segment control
document.querySelectorAll('[data-xfade]').forEach(b => {
  b.addEventListener('click', () => {
    settings.crossfade = parseInt(b.dataset.xfade);
    document.querySelectorAll('[data-xfade]').forEach(x =>
      x.classList.toggle('active', x === b)
    );
    saveStorage();
  });
});

// Playlist bulk actions
selectAllBtn.addEventListener('click', () => {
  allSongs.forEach((_, i) => (enabled[i] = true));
  buildPlaylist();
  renderList();
});
deselectAllBtn.addEventListener('click', () => {
  const cur = playlist[currentIdx];
  allSongs.forEach((_, i) => {
    // Keep current song enabled so playback doesn't break
    enabled[i] = cur && cur.origIdx === i;
  });
  buildPlaylist();
  renderList();
  updateIdx();
});

// Order buttons
$('orderDefault').addEventListener('click', () => setOrder('default'));
$('orderAZ').addEventListener('click',      () => setOrder('az'));
$('orderZA').addEventListener('click',      () => setOrder('za'));
$('orderShuffle').addEventListener('click', () => setOrder('shuffle'));


/* ── 13. CONTROLS & AUDIO EVENTS ── */

playBtn.addEventListener('click', () => {
  if (!playlist.length) return;
  if (isPlaying) {
    audio.pause();
    setPlaying(false);
  } else {
    audio.play()
      .then(() => setPlaying(true))
      .catch(e => console.error(e));
  }
});

nextBtn.addEventListener('click', () => {
  if (!playlist.length) return;
  currentIdx = (currentIdx + 1) % playlist.length;
  loadSong(currentIdx, true);
});

prevBtn.addEventListener('click', () => {
  if (!playlist.length) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  currentIdx = (currentIdx - 1 + playlist.length) % playlist.length;
  loadSong(currentIdx, true);
});

loopBtn.addEventListener('click', () => {
  isLoop      = !isLoop;
  audio.loop  = isLoop;
  loopBtn.classList.toggle('active', isLoop);
  settings.loopPlaylist = isLoop;
  saveStorage();
  syncToggle('toggleLoopPlaylist', isLoop);
});

// Progress scrub
progressBar.addEventListener('input', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  audio.currentTime = (progressBar.value / 100) * audio.duration;
  updateProgressBar(parseFloat(progressBar.value));
});

// Time update → move progress bar
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  updateProgressBar(pct);
  timeEl.textContent = fmt(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = fmt(audio.duration);
});

// Track ended → advance or stop
audio.addEventListener('ended', () => {
  if (isLoop) return;
  if (settings.autoplay && currentIdx < playlist.length - 1) {
    currentIdx++;
    loadSong(currentIdx, true);
  } else if (settings.loopPlaylist) {
    currentIdx = 0;
    loadSong(currentIdx, true);
  } else {
    currentIdx = 0;
    loadSong(currentIdx, false);
    setPlaying(false);
  }
});


/* ── 14. VOLUME POPUP ── */

// Set initial volume
audio.volume = 0.8;
updateVolumeBar(80);

volumeBar.addEventListener('input', () => {
  const v = parseFloat(volumeBar.value);
  audio.volume = v / 100;
  updateVolumeBar(v);
  volLabel.textContent = Math.round(v) + '%';
  volWave1.style.display = v > 5  ? '' : 'none';
  volWave2.style.display = v > 40 ? '' : 'none';
});

// JS-driven hover with a grace-period timer so moving between
// the button and the popup doesn't accidentally close it
let volHideTimer = null;

function showVolPopup() {
  if (volHideTimer) { clearTimeout(volHideTimer); volHideTimer = null; }
  volPopup.style.opacity       = '1';
  volPopup.style.pointerEvents = 'all';
  volPopup.style.transform     = 'translateX(-50%) translateY(0)';
}
function hideVolPopup() {
  volHideTimer = setTimeout(() => {
    volPopup.style.opacity       = '0';
    volPopup.style.pointerEvents = 'none';
    volPopup.style.transform     = 'translateX(-50%) translateY(6px)';
  }, 120);
}

volAnchor.addEventListener('mouseenter', showVolPopup);
volAnchor.addEventListener('mouseleave', hideVolPopup);
volPopup.addEventListener('mouseenter',  showVolPopup);
volPopup.addEventListener('mouseleave',  hideVolPopup);


/* ── 15. KEYBOARD SHORTCUTS ── */

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space')       { e.preventDefault(); playBtn.click(); }
  if (e.code === 'ArrowRight')  nextBtn.click();
  if (e.code === 'ArrowLeft')   prevBtn.click();
  if (e.code === 'KeyL')        loopBtn.click();
  if (e.code === 'Escape')      closeAll();
});


/* ── 16. INIT ── */

async function init() {
  loadStorage();
  applySettings();

  try {
    const res = await fetch(SONGS_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    allSongs = await res.json();
    allSongs.forEach((_, i) => (enabled[i] = true));
    buildPlaylist();
    loadSong(0, false);
    renderList();
  } catch (e) {
    songList.innerHTML =
      `<div class="empty-state">Could not load songs.<br><small>${e.message}</small></div>`;
    songTitleEl.textContent = 'Error loading songs';
  }
}

init();