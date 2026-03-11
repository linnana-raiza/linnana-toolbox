// ==========================================
// music.js: 本地纯净音乐播放器引擎
// ==========================================
let playlist = [];
let currentTrackIndex = -1;
let isPlaying = false;

const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('music-play');
const prevBtn = document.getElementById('music-prev');
const nextBtn = document.getElementById('music-next');
const titleDisplay = document.getElementById('music-title');
const timeDisplay = document.getElementById('music-time');
const progressContainer = document.getElementById('music-progress-container');
const progressBar = document.getElementById('music-progress');
const listBtn = document.getElementById('music-list-btn');
const listPanel = document.getElementById('music-list-panel');
const listUl = document.getElementById('music-list');
const volumeSlider = document.getElementById('music-volume-slider');
const volumeIcon = document.getElementById('volume-icon');

audioPlayer.volume = 0.5;

// 1. 获取音乐列表
async function fetchMusicList() {
    try {
        const data = await safeFetchJson('/api/music/list?t=' + Date.now());
        if (!data.error) {
            playlist = data;
            renderMusicList();
            if (playlist.length > 0) loadTrack(0);
            else titleDisplay.textContent = "🎵 请在 data/music 放入音乐";
        }
    } catch (e) { console.error("读取音乐列表失败", e); }
}

// 2. 渲染播放列表UI
function renderMusicList() {
    listUl.innerHTML = '';
    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.className = 'music-item';
        li.textContent = track.name;
        li.title = track.name;
        li.onclick = () => {
            loadTrack(index);
            playMusic();
            listPanel.classList.remove('show');
        };
        listUl.appendChild(li);
    });
    updateListHighlight();
}

function updateListHighlight() {
    document.querySelectorAll('.music-item').forEach((li, idx) => {
        if (idx === currentTrackIndex) li.classList.add('active');
        else li.classList.remove('active');
    });
}

// 3. 核心播放控制
function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    audioPlayer.src = playlist[index].url;
    titleDisplay.textContent = playlist[index].name;
    updateListHighlight();
    // 强制重置进度条
    progressBar.style.width = '0%';
    timeDisplay.textContent = '00:00 / 00:00';
}

function playMusic() {
    if (playlist.length === 0) return;
    audioPlayer.play();
    isPlaying = true;
    playBtn.textContent = '⏸️';
}

function pauseMusic() {
    audioPlayer.pause();
    isPlaying = false;
    playBtn.textContent = '▶️';
}

playBtn.addEventListener('click', () => { isPlaying ? pauseMusic() : playMusic(); });
prevBtn.addEventListener('click', () => {
    let newIdx = currentTrackIndex - 1;
    if (newIdx < 0) newIdx = playlist.length - 1;
    loadTrack(newIdx); playMusic();
});
nextBtn.addEventListener('click', () => {
    let newIdx = (currentTrackIndex + 1) % playlist.length;
    loadTrack(newIdx); playMusic();
});

// 4. 自动连播与进度条
audioPlayer.addEventListener('ended', () => nextBtn.click());

audioPlayer.addEventListener('timeupdate', () => {
    if (!audioPlayer.duration) return;
    const current = audioPlayer.currentTime;
    const duration = audioPlayer.duration;
    progressBar.style.width = `${(current / duration) * 100}%`;
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
});

progressContainer.addEventListener('click', (e) => {
    if (!audioPlayer.duration) return;
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    audioPlayer.currentTime = (clickX / width) * audioPlayer.duration;
});

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// 5. 交互：展开列表
listBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    listPanel.classList.toggle('show');
});
document.addEventListener('click', (e) => {
    if (!listPanel.contains(e.target) && !listBtn.contains(e.target)) {
        listPanel.classList.remove('show');
    }
});

volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    audioPlayer.volume = val;
    updateVolumeIcon(val);
    if (typeof debouncedSave === 'function') {
        debouncedSave('MUSIC_VOLUME', val);
    }
});

let lastVolume = 0.5;
volumeIcon.addEventListener('click', () => {
    if (audioPlayer.volume > 0) {
        lastVolume = audioPlayer.volume;
        audioPlayer.volume = 0;
        volumeSlider.value = 0;
    } else {
        audioPlayer.volume = lastVolume;
        volumeSlider.value = lastVolume;
    }
    updateVolumeIcon(audioPlayer.volume);
    if (typeof debouncedSave === 'function') {
        debouncedSave('MUSIC_VOLUME', audioPlayer.volume);
    }
});

function updateVolumeIcon(val) {
    if (val === 0) volumeIcon.textContent = '🔇';
    else if (val < 0.5) volumeIcon.textContent = '🔉';
    else volumeIcon.textContent = '🔊';
}

// 6. 启动时加载
fetchMusicList();