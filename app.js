const API = 'https://itunes.apple.com/search';
const FALLBACK_TERMS = ['funk pop', 'dance pop', 'disco funk'];
const LANES = ['D', 'F', 'J', 'K'];
const HIT_WINDOW = 0.24;
const LEAD_TIME = 1.8;
const SAMPLE_SECONDS = 30;

const $ = (selector) => document.querySelector(selector);
const trackList = $('#track-list');
const searchStatus = $('#search-status');
const overlay = $('#board-overlay');
const tilesElement = $('#tiles');
const audio = new Audio();
audio.preload = 'auto';
audio.volume = 0.82;

let tracks = [];
let selectedTrack = null;
let bpm = 112;
let game = null;
let animationFrame = 0;
let searchSequence = 0;
let tempoSequence = 0;

function artwork(url, size = 300) {
  return (url || '').replace(/100x100bb\.(jpg|png)/i, `${size}x${size}bb.$1`);
}

function setStatus(message, isError = false) {
  searchStatus.textContent = message;
  searchStatus.classList.toggle('error-text', isError);
}

async function searchTracks(term, quiet = false) {
  const sequence = ++searchSequence;
  if (!quiet) {
    $('#shelf-title').textContent = `Songs for “${term}”`;
    $('#shelf-eyebrow').textContent = 'YOUR SEARCH';
    setStatus('Finding your next jam...');
  }
  try {
    const url = `${API}?term=${encodeURIComponent(term)}&entity=song&limit=16&media=music`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('The music catalog is taking a breather.');
    const data = await response.json();
    if (sequence !== searchSequence) return;
    tracks = (data.results || []).filter((track) => track.previewUrl && track.trackName);
    renderTracks();
    setStatus(tracks.length ? `${tracks.length} preview${tracks.length === 1 ? '' : 's'} ready to play.` : 'No previews found. Try another artist or search.');
    if (!selectedTrack && tracks.length) selectTrack(tracks[0]);
  } catch (error) {
    if (sequence !== searchSequence) return;
    tracks = [];
    renderTracks();
    setStatus('Could not reach the iTunes catalog. Check your connection and try again.', true);
  }
}

function renderTracks() {
  trackList.replaceChildren();
  if (!tracks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Try a different search to discover more music.';
    trackList.append(empty);
    return;
  }
  for (const track of tracks) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `track-card${selectedTrack?.trackId === track.trackId ? ' selected' : ''}`;
    card.setAttribute('aria-label', `Play ${track.trackName} by ${track.artistName}`);
    const image = document.createElement('img');
    image.src = artwork(track.artworkUrl100, 100);
    image.alt = '';
    image.loading = 'lazy';
    const copy = document.createElement('span');
    copy.className = 'track-card-copy';
    const title = document.createElement('strong');
    title.textContent = track.trackName;
    const artist = document.createElement('span');
    artist.textContent = track.artistName;
    copy.append(title, artist);
    const play = document.createElement('span');
    play.className = 'card-play';
    play.textContent = '● SELECTED';
    card.append(image, copy, play);
    card.addEventListener('click', () => selectTrack(track));
    trackList.append(card);
  }
}

function selectTrack(track) {
  if (game?.playing) stopGame('paused');
  selectedTrack = track;
  audio.pause();
  audio.src = track.previewUrl;
  audio.load();
  $('#selected-art').src = artwork(track.artworkUrl100, 300);
  $('#selected-art').alt = `${track.trackName} album artwork`;
  $('#selected-title').textContent = track.trackName;
  $('#selected-artist').textContent = track.artistName;
  $('#start-button').disabled = false;
  $('#overlay-title').textContent = 'Ready to catch the beat?';
  $('#overlay-copy').textContent = 'Tiles fall in time with this 30-second preview.';
  $('#start-button').innerHTML = '<span>▶</span> Start jamming';
  overlay.classList.remove('hidden');
  $('#score').textContent = '00000';
  $('#combo').innerHTML = '0 <small>×</small>';
  tilesElement.replaceChildren();
  renderTracks();
  estimateTempo(track.previewUrl);
}

function estimateTempo(previewUrl) {
  const sequence = ++tempoSequence;
  $('#tempo-value').textContent = '… BPM';
  $('#game-hint').textContent = 'Finding the groove...';
  (async () => {
    let context;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      const response = await fetch(previewUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error('Preview unavailable for analysis');
      const buffer = await response.arrayBuffer();
      context = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await context.decodeAudioData(buffer);
      const channel = decoded.getChannelData(0);
      const block = 2048;
      const envelope = [];
      for (let start = 0; start + block < channel.length; start += block) {
        let energy = 0;
        for (let i = start; i < start + block; i += 4) energy += channel[i] * channel[i];
        envelope.push(Math.sqrt(energy / (block / 4)));
      }
      const onset = envelope.map((value, i) => Math.max(0, value - (envelope[i - 1] || value)));
      const hopSeconds = block / decoded.sampleRate;
      let bestBpm = 112;
      let bestScore = -1;
      for (let candidate = 70; candidate <= 160; candidate++) {
        const lag = Math.round(60 / candidate / hopSeconds);
        let score = 0;
        for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
        if (score > bestScore) { bestScore = score; bestBpm = candidate; }
      }
      // Autocorrelation often locks onto half/double time; favor a dance-friendly tempo range.
      if (bestBpm < 85) bestBpm *= 2;
      if (bestBpm > 150) bestBpm = Math.round(bestBpm / 2);
      if (sequence === tempoSequence) {
        bpm = Math.max(80, Math.min(150, bestBpm));
        $('#tempo-value').textContent = `${bpm} BPM`;
        $('#game-hint').textContent = 'Beat grid estimated from the preview';
      }
    } catch {
      if (sequence === tempoSequence) {
        bpm = 112;
        $('#tempo-value').textContent = '112 BPM';
        $('#game-hint').textContent = 'Using a feel-good 112 BPM beat grid';
      }
    } finally {
      if (context) await context.close().catch(() => {});
    }
  })();
}

function startGame() {
  if (!selectedTrack) return;
  cancelAnimationFrame(animationFrame);
  audio.pause();
  audio.currentTime = 0;
  const beat = 60 / bpm;
  game = {
    playing: true,
    startedAt: performance.now(),
    beat,
    notes: [],
    nextBeat: 0,
    score: 0,
    combo: 0,
    maxBeats: Math.ceil(SAMPLE_SECONDS / beat),
    pattern: [0, 2, 1, 3, 0, 1, 2, 3, 1, 0, 3, 2]
  };
  tilesElement.replaceChildren();
  $('#score').textContent = '00000';
  $('#combo').innerHTML = '0 <small>×</small>';
  overlay.classList.add('hidden');
  audio.play().then(() => { animationFrame = requestAnimationFrame(updateGame); }).catch(() => {
    stopGame('error');
    $('#overlay-title').textContent = 'Could not play this preview';
    $('#overlay-copy').textContent = 'Try another song or check your connection.';
    overlay.classList.remove('hidden');
  });
}

function stopGame(reason = 'paused') {
  if (!game) return;
  game.playing = false;
  audio.pause();
  cancelAnimationFrame(animationFrame);
  overlay.classList.remove('hidden');
  if (reason === 'finished') {
    $('#overlay-title').textContent = 'Nice groove!';
    $('#overlay-copy').textContent = `You scored ${game.score.toLocaleString()} points. Ready for another round?`;
    $('#start-button').innerHTML = '<span>↻</span> Play again';
  } else {
    $('#overlay-title').textContent = reason === 'error' ? 'Preview unavailable' : 'Take a breather?';
    $('#overlay-copy').textContent = 'Your next round is just a tap away.';
    $('#start-button').innerHTML = '<span>▶</span> Start jamming';
  }
}

function spawnNote(index, targetTime) {
  const lane = game.pattern[index % game.pattern.length];
  const element = document.createElement('div');
  element.className = 'note-tile';
  element.dataset.index = String(index);
  element.style.left = `calc(${lane * 25}% + 7px)`;
  tilesElement.append(element);
  game.notes.push({ index, lane, targetTime, element, hit: false, missed: false });
}

function updateGame() {
  if (!game?.playing) return;
  const now = (performance.now() - game.startedAt) / 1000;
  const beatSeconds = game.beat;
  while (game.nextBeat < game.maxBeats) {
    const targetTime = LEAD_TIME + game.nextBeat * beatSeconds;
    if (targetTime - LEAD_TIME > now + 0.1) break;
    spawnNote(game.nextBeat, targetTime);
    game.nextBeat++;
  }
  const boardHeight = $('#game-board').clientHeight;
  const travelHeight = boardHeight - 80;
  for (const note of game.notes) {
    if (note.hit || note.missed) continue;
    const untilTarget = note.targetTime - now;
    const y = boardHeight - 50 - (untilTarget / LEAD_TIME) * travelHeight;
    note.element.style.top = `${y}px`;
    if (untilTarget < -HIT_WINDOW) {
      note.missed = true;
      note.element.remove();
      game.combo = 0;
      $('#combo').innerHTML = '0 <small>×</small>';
      showFeedback('MISS', '#ff879f');
    }
  }
  if (now >= SAMPLE_SECONDS || audio.ended) {
    stopGame('finished');
    return;
  }
  animationFrame = requestAnimationFrame(updateGame);
}

function tapLane(lane) {
  const keyButton = document.querySelector(`.lane[data-lane="${lane}"]`);
  if (!keyButton) return;
  keyButton.classList.add('pressed');
  setTimeout(() => keyButton.classList.remove('pressed'), 110);
  if (!game?.playing) return;
  const now = (performance.now() - game.startedAt) / 1000;
  const candidates = game.notes.filter((note) => !note.hit && !note.missed && note.lane === lane);
  candidates.sort((a, b) => Math.abs(a.targetTime - now) - Math.abs(b.targetTime - now));
  const note = candidates[0];
  if (note && Math.abs(note.targetTime - now) <= HIT_WINDOW) {
    note.hit = true;
    note.element.classList.add('hit');
    setTimeout(() => note.element.remove(), 220);
    game.combo++;
    game.score += 100 + Math.min(game.combo, 50) * 5;
    $('#score').textContent = String(game.score).padStart(5, '0');
    $('#combo').innerHTML = `${game.combo} <small>×</small>`;
    flashLane(lane);
    showFeedback(game.combo > 0 && game.combo % 10 === 0 ? 'ON FIRE!' : 'NICE!', '#a5ffdf');
  } else if (note && Math.abs(note.targetTime - now) < 0.55) {
    game.combo = 0;
    $('#combo').innerHTML = '0 <small>×</small>';
    showFeedback('TOO SOON', '#ffba7d');
  }
}

function flashLane(lane) {
  const flash = document.createElement('div');
  flash.className = 'hit-flash';
  flash.style.left = `calc(${lane * 25}% + 7px)`;
  $('#game-board').append(flash);
  setTimeout(() => flash.remove(), 220);
}

function showFeedback(text, color) {
  const feedback = $('#feedback');
  feedback.textContent = text;
  feedback.style.color = color;
  feedback.classList.remove('show');
  void feedback.offsetWidth;
  feedback.classList.add('show');
}

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const term = $('#search-input').value.trim();
  if (term) searchTracks(term);
});
$('#start-button').addEventListener('click', startGame);
document.querySelectorAll('.lane').forEach((lane) => {
  lane.addEventListener('pointerdown', (event) => { event.preventDefault(); tapLane(Number(lane.dataset.lane)); });
});
document.addEventListener('keydown', (event) => {
  if (event.repeat || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const lane = LANES.indexOf(event.key.toUpperCase());
  if (lane !== -1) { event.preventDefault(); tapLane(lane); }
});
audio.addEventListener('ended', () => { if (game?.playing) stopGame('finished'); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

searchTracks(FALLBACK_TERMS[0]);
