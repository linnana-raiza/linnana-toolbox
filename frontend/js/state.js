// ==========================================
// state.js: 全局状态上下文与视图特效映射
// ==========================================

const todoPanel = document.getElementById('todo-panel');

// 统一的上下文容器，避免污染 window 顶层命名空间
window.ToolBoxContext = {
    wallpaperType: 'static',
    live2dScale: 1.2,
    live2dXOffset: 0,
    live2dYOffset: 150,
    live2dVolume: 0.5,
    paths: {
        static: null,
        dynamic: null,
        live2d: null
    },
    live2dHitTriggered: false
};

const applyVisualEffect = {
    'CLOCK_SIZE': (val) => {
        document.getElementById('clock').style.fontSize = val + 'rem';
        document.getElementById('date-display').style.fontSize = (val * 1.0) + 'rem'; 
    },
    'CLOCK_COLOR': (val) => {
        document.getElementById('clock').style.color = val;
        document.getElementById('date-display').style.color = val; 
    },
    'CLOCK_STROKE': (val) => {
        document.getElementById('clock').style.webkitTextStroke = `${val}px currentColor`;
        document.getElementById('date-display').style.webkitTextStroke = `${val}px currentColor`;
    },
    'TODO_X': (val) => { todoPanel.style.left = val + 'px'; },
    'TODO_Y': (val) => { todoPanel.style.top = val + 'px'; },
    'TODO_W': (val) => { todoPanel.style.width = val + 'px'; },
    'TODO_H': (val) => { todoPanel.style.height = val + 'px'; },
    'TODO_MINIMIZED': (val) => {
        if (val === 'true') {
            todoPanel.classList.add('no-transition', 'minimized');
            document.getElementById('todo-content').style.opacity = '0';
            setTimeout(() => todoPanel.classList.remove('no-transition'), 50);
        } else {
            todoPanel.classList.remove('minimized');
            document.getElementById('todo-content').style.opacity = '1';
        }
    },
    
    'STATIC_WALLPAPER': () => { 
        if (window.ToolBoxContext.wallpaperType === 'static') {
            document.body.style.backgroundImage = `url('/data/wallpaper-static.jpg?t=${Date.now()}')`;
        }
    },
    'DYNAMIC_WALLPAPER': () => { 
        if (window.ToolBoxContext.wallpaperType === 'dynamic') {
            const video = document.getElementById('bg-video');
            video.innerHTML = `<source src="/data/wallpaper-dynamic.mp4?t=${Date.now()}" type="video/mp4">`; 
            video.load();
        }
    },
    
    'LIVE2D_WALLPAPER': async (val) => { 
        window.ToolBoxContext.paths.live2d = val; 
        if (window.ToolBoxContext.wallpaperType === 'live2d') {
            console.log("🔄 模型路径已就绪，正在拉起看板娘...");
            if (typeof stopLive2D === 'function') stopLive2D(); 
            setTimeout(() => { if (typeof startLive2D === 'function') startLive2D(); }, 100); 
        }
    },

    'LIVE2D_SCALE': (val) => { window.ToolBoxContext.live2dScale = parseFloat(val); if (typeof updateLive2dLayout === 'function') updateLive2dLayout(); },
    'LIVE2D_X': (val) => { window.ToolBoxContext.live2dXOffset = parseFloat(val); if (typeof updateLive2dLayout === 'function') updateLive2dLayout(); },
    'LIVE2D_Y': (val) => { window.ToolBoxContext.live2dYOffset = parseFloat(val); if (typeof updateLive2dLayout === 'function') updateLive2dLayout(); },

    'LIVE2D_VOLUME': (val) => { 
        window.ToolBoxContext.live2dVolume = parseFloat(val); 
        // 实时调整 PIXI 声音引擎的音量
        if (window.PIXI && PIXI.live2d && PIXI.live2d.SoundManager) {
            PIXI.live2d.SoundManager.volume = window.ToolBoxContext.live2dVolume;
        }
    },

    'MUSIC_VOLUME': (val) => {
        const audioPlayer = document.getElementById('audio-player');
        const volumeSlider = document.getElementById('music-volume-slider');
        const volumeIcon = document.getElementById('volume-icon');

        if (audioPlayer) {
            const volume = parseFloat(val);
            audioPlayer.volume = volume;

            // 同时更新 UI 状态，保证进度条位置和图标是对的
            if (volumeSlider) volumeSlider.value = volume;
            if (volumeIcon) {
                if (volume === 0) volumeIcon.textContent = '🔇';
                else if (volume < 0.5) volumeIcon.textContent = '🔉';
                else volumeIcon.textContent = '🔊';
            }
        }
    },
    
    'WALLPAPER_TYPE': (val) => {
        const videoElement = document.getElementById('bg-video');
        const toggleButton = document.getElementById('wallpaper-toggle');
        window.ToolBoxContext.wallpaperType = val;

        if (val === 'static') {
            videoElement.style.display = 'none';
            document.body.style.backgroundImage = `url('/data/wallpaper-static.jpg?t=${Date.now()}')`;
            toggleButton.textContent = '切换动态';
            if (typeof stopLive2D === 'function') stopLive2D(); 
            
        } else if (val === 'dynamic') {
            videoElement.style.display = 'block';
            document.body.style.backgroundImage = 'none';
            toggleButton.textContent = '切换交互(Live2D)';
            if (typeof stopLive2D === 'function') stopLive2D(); 
            
        } else if (val === 'live2d') {
            videoElement.style.display = 'none';
            document.body.style.backgroundImage = `url('/data/wallpaper-static.jpg?t=${Date.now()}')`;
            toggleButton.textContent = '切换静态';
            if (typeof startLive2D === 'function') startLive2D(); 
        }
    }
};