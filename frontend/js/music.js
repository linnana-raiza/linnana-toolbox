// ==========================================
// music.js: 纯便携版音乐引擎 (支持多文件夹队列)
// ==========================================
let allPlaylists = {};       // 新增：存放所有文件夹的字典 { "默认列表": [...], "分类1": [...] }
let currentPlaylistName = '';// 新增：当前选中的文件夹名
let playlist = [];           // 当前正在播放的数组
let currentTrackIndex = -1;
let isPlaying = false;
let fadeTimer = null;

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

function getTargetVolume() { return parseFloat(volumeSlider.value) || 0.5; }

// 1. 获取音乐列表并从 .env 恢复真正便携的记忆
async function fetchMusicList() {
    try {
        const data = await safeFetchJson('/api/music/list?t=' + Date.now());
        if (!data.error) {
            allPlaylists = data;
            
            // 获取所有存在的文件夹名字
            const folderNames = Object.keys(allPlaylists);
            if (folderNames.length === 0) {
                titleDisplay.textContent = "🎵 请在 data/music 放入音乐";
                return;
            }

            // 🚀 核心：向后端请求最新的 .env 数据
            const envData = await safeFetchJson('/api/settings/get-all-settings?t=' + Date.now());
            const savedPlaylist = envData['LAST_PLAYLIST_NAME'];
            const savedName = envData['LAST_MUSIC_NAME'];
            const savedTime = envData['LAST_MUSIC_TIME'];
            
            // 决定初始加载哪个文件夹：如果记忆的文件夹存在就用它，否则用数组里的第一个
            currentPlaylistName = (savedPlaylist && allPlaylists[savedPlaylist]) ? savedPlaylist : folderNames[0];
            playlist = allPlaylists[currentPlaylistName];

            renderMusicList(); // 渲染下拉框和歌曲列表
            
            let startIndex = 0;
            // 强校验。如果用户在外部删了这首歌，indexOf 找不到就会自动重置为 0
            if (savedName) {
                const idx = playlist.findIndex(t => t.name === savedName);
                if (idx !== -1) {
                    startIndex = idx; 
                    console.log(`🎵 成功恢复记忆：[${currentPlaylistName}] -> ${savedName}`);
                }
            }
            
            loadTrack(startIndex, false); 
            
            if (savedTime && !isNaN(savedTime)) {
                audioPlayer.addEventListener('loadedmetadata', function onMetaLoad() {
                    audioPlayer.currentTime = parseFloat(savedTime);
                    audioPlayer.removeEventListener('loadedmetadata', onMetaLoad);
                });
            }
        }
    } catch (e) { console.error("读取音乐列表失败", e); }
}

// 2. 渲染 UI：动态生成下拉框和列表
function renderMusicList() {
    // A. 动态生成或更新下拉框
    let folderSelect = document.getElementById('music-folder-select');
    if (!folderSelect) {
        folderSelect = document.createElement('select');
        folderSelect.id = 'music-folder-select';
        folderSelect.style.cssText = 'width: 100%; padding: 8px; background: rgba(0,0,0,0.4); border: none; border-bottom: 1px dashed rgba(255,255,255,0.2); color: white; outline: none; margin-bottom: 5px; cursor: pointer; font-size: 0.9rem;';
        
        folderSelect.addEventListener('change', (e) => {
            switchPlaylistFolder(e.target.value);
        });
        
        listPanel.insertBefore(folderSelect, listUl);
    }
    
    // 填充下拉框选项
    folderSelect.innerHTML = '';
    Object.keys(allPlaylists).forEach(folder => {
        const option = document.createElement('option');
        option.value = folder;
        option.textContent = `📁 ${folder} (${allPlaylists[folder].length} 首)`;
        option.style.background = "rgba(0,0,0,0.8)";
        if (folder === currentPlaylistName) option.selected = true;
        folderSelect.appendChild(option);
    });

    // B. 渲染当前文件夹里的歌曲
    listUl.innerHTML = '';
    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.className = 'music-item';
        li.textContent = track.name;
        li.title = track.name;
        li.onclick = () => {
            loadTrack(index, true); 
            playMusicWithFade();
            listPanel.classList.remove('show');
        };
        listUl.appendChild(li);
    });
    updateListHighlight();
}

// 🚀 新增：切换文件夹队列的逻辑
function switchPlaylistFolder(newFolderName) {
    if (newFolderName === currentPlaylistName) return;
    
    currentPlaylistName = newFolderName;
    playlist = allPlaylists[currentPlaylistName];
    
    // 保存选择到 .env
    if (typeof debouncedSave === 'function') {
        debouncedSave('LAST_PLAYLIST_NAME', currentPlaylistName);
    }
    
    // 渲染新列表，并默认开始播放这个文件夹里的第一首歌
    renderMusicList();
    loadTrack(0, true);
    playMusicWithFade();
}

function updateListHighlight() {
    document.querySelectorAll('.music-item').forEach((li, idx) => {
        if (idx === currentTrackIndex) li.classList.add('active');
        else li.classList.remove('active');
    });
}

// 3. 核心播放控制
function loadTrack(index, shouldSaveName = true) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    audioPlayer.src = playlist[index].url;
    titleDisplay.textContent = playlist[index].name;
    updateListHighlight();
    progressBar.style.width = '0%';
    timeDisplay.textContent = '00:00 / 00:00';
    
    // 🚀 核心：只要发生切歌，立马把新歌名存入 .env 防抖队列
    if (shouldSaveName && typeof debouncedSave === 'function') {
        debouncedSave('LAST_MUSIC_NAME', playlist[index].name);
        debouncedSave('LAST_MUSIC_TIME', 0); // 切新歌时把旧时间清零
    }
}

function playMusicWithFade() {
    if (playlist.length === 0) return;
    clearInterval(fadeTimer);
    
    const targetVol = getTargetVolume();
    if (targetVol === 0) {
        audioPlayer.volume = 0;
        audioPlayer.play();
        isPlaying = true;
        playBtn.textContent = '⏸️';
        return;
    }

    audioPlayer.volume = 0; 
    audioPlayer.play();
    isPlaying = true;
    playBtn.textContent = '⏸️';

    const steps = 20; 
    const stepVol = targetVol / steps;
    let currentVol = 0;

    fadeTimer = setInterval(() => {
        currentVol += stepVol;
        if (currentVol >= targetVol) {
            currentVol = targetVol;
            clearInterval(fadeTimer);
        }
        audioPlayer.volume = currentVol;
    }, 40);
}

function pauseMusic() {
    clearInterval(fadeTimer); // 打断可能正在进行的渐入
    
    // 1. 瞬间切换 UI 状态，让用户感觉没有延迟
    isPlaying = false;
    playBtn.textContent = '▶️';
    
    // 2. 防抖记录当前时间到 .env
    if (typeof debouncedSave === 'function') {
        debouncedSave('LAST_MUSIC_TIME', audioPlayer.currentTime);
    }

    const currentVol = audioPlayer.volume;
    // 如果当前音量本来就是静音，直接暂停即可
    if (currentVol <= 0 || audioPlayer.paused) {
        audioPlayer.pause();
        audioPlayer.volume = getTargetVolume();
        return;
    }

    // 3. 开始执行渐出动画
    const steps = 20; // 动画帧数
    const stepVol = currentVol / steps;

    // 大约 800ms 的缓出效果
    fadeTimer = setInterval(() => {
        let nextVol = audioPlayer.volume - stepVol;
        
        // 浮点数精度兜底保护
        if (nextVol <= 0.01) {
            nextVol = 0;
            clearInterval(fadeTimer);
            audioPlayer.pause(); // 音量彻底归零后，才真正执行物理暂停
            audioPlayer.volume = getTargetVolume(); // 暂停后，立刻把音量拨回用户设定的滑块位置，为下次播放做准备
        }
        
        audioPlayer.volume = nextVol;
    }, 40);
}

playBtn.addEventListener('click', () => { isPlaying ? pauseMusic() : playMusicWithFade(); });
prevBtn.addEventListener('click', () => {
    let newIdx = currentTrackIndex - 1;
    if (newIdx < 0) newIdx = playlist.length - 1;
    loadTrack(newIdx, true); playMusicWithFade();
});
nextBtn.addEventListener('click', () => {
    let newIdx = (currentTrackIndex + 1) % playlist.length;
    loadTrack(newIdx, true); playMusicWithFade();
});

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
    
    // 用户手动拖动进度条，也防抖记一下
    if (typeof debouncedSave === 'function') {
        debouncedSave('LAST_MUSIC_TIME', audioPlayer.currentTime);
    }
});

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

listBtn.addEventListener('click', (e) => { e.stopPropagation(); listPanel.classList.toggle('show'); });
volumeSlider.addEventListener('input', (e) => {
    clearInterval(fadeTimer); 
    const val = parseFloat(e.target.value);
    audioPlayer.volume = val;
    updateVolumeIcon(val);
    if (typeof debouncedSave === 'function') debouncedSave('MUSIC_VOLUME', val);
});

let lastVolume = 0.5;
volumeIcon.addEventListener('click', () => {
    clearInterval(fadeTimer);
    if (audioPlayer.volume > 0) {
        lastVolume = audioPlayer.volume;
        audioPlayer.volume = 0;
        volumeSlider.value = 0;
    } else {
        audioPlayer.volume = lastVolume;
        volumeSlider.value = lastVolume;
    }
    updateVolumeIcon(audioPlayer.volume);
    if (typeof debouncedSave === 'function') debouncedSave('MUSIC_VOLUME', audioPlayer.volume);
});

function updateVolumeIcon(val) {
    if (val === 0) volumeIcon.textContent = '🔇';
    else if (val < 0.5) volumeIcon.textContent = '🔉';
    else volumeIcon.textContent = '🔊';
}

window.addEventListener('beforeunload', () => {
    if (currentTrackIndex >= 0 && playlist[currentTrackIndex]) {
        const payload = JSON.stringify({ key: 'LAST_MUSIC_TIME', value: String(audioPlayer.currentTime) });
        fetch('/api/settings/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true 
        }).catch(() => {}); // 紧急退出时忽略任何报错
    }
});

fetchMusicList();