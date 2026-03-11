// ==========================================
// core.js: 核心工具、时钟、搜索与全局视图状态
// ==========================================

const todoPanel = document.getElementById('todo-panel');

// --- 全局壁纸与 Live2D 缓存 ---
let live2dApp = null;
let currentLive2dModel = null;
window.currentWallpaperType = 'static'; 

// ==========================================
// 1. 核心工具函数
// ==========================================
function cleanVal(val) {
    if (typeof val !== 'string') return val;
    let cleaned = val.split(' #')[0].trim();
    return cleaned.replace(/^['"]+|['"]+$/g, '').trim();
}

async function performSave(key, value) {
    try {
        await fetch('/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: String(value) })
        });
        console.log(`💾 磁盘写入成功: ${key} = ${value}`);
    } catch (e) { console.error("写入失败:", e); }
}

const debounceTimers = {};
function debouncedSave(key, value) {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => {
        performSave(key, value);
        delete debounceTimers[key];
    }, 2000);
}

// ==========================================
// 2. 视图与特效映射
// ==========================================
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
    
    'STATIC_WALLPAPER': (val) => { 
        window.STATIC_PATH = val; 
        if (window.currentWallpaperType === 'static') document.body.style.backgroundImage = `url('./assets/${val}')`;
    },
    'DYNAMIC_WALLPAPER': (val) => { 
        window.DYNAMIC_PATH = val; 
        if (window.currentWallpaperType === 'dynamic') {
            const video = document.getElementById('bg-video');
            video.innerHTML = `<source src="./assets/${val}" type="video/mp4">`; 
            video.load();
        }
    },
    
    // 切换设置面板里的模型下拉框时触发
    'LIVE2D_WALLPAPER': async (val) => { 
        window.LIVE2D_PATH = val; 
        // 🚀 修复启动竞态：当路径加载完毕，如果系统需要处于 Live2D 状态，则正式唤醒它
        if (window.currentWallpaperType === 'live2d') {
            console.log("🔄 模型路径已就绪，正在拉起看板娘...");
            stopLive2D(); 
            setTimeout(() => { startLive2D(); }, 100); 
        }
    },

    'LIVE2D_SCALE': (val) => { window.live2dScale = parseFloat(val); updateLive2dLayout(); },
    'LIVE2D_X': (val) => { window.live2dXOffset = parseFloat(val); updateLive2dLayout(); },
    'LIVE2D_Y': (val) => { window.live2dYOffset = parseFloat(val); updateLive2dLayout(); },

    'WALLPAPER_TYPE': (val) => {
        const videoElement = document.getElementById('bg-video');
        const toggleButton = document.getElementById('wallpaper-toggle');
        window.currentWallpaperType = val;

        if (val === 'static') {
            videoElement.style.display = 'none';
            if (window.STATIC_PATH) document.body.style.backgroundImage = `url('./assets/${window.STATIC_PATH}')`;
            toggleButton.textContent = '切换动态';
            stopLive2D(); // 释放资源
            
        } else if (val === 'dynamic') {
            videoElement.style.display = 'block';
            document.body.style.backgroundImage = 'none';
            toggleButton.textContent = '切换交互(Live2D)';
            stopLive2D(); // 释放资源
            
        } else if (val === 'live2d') {
            videoElement.style.display = 'none';
            document.body.style.backgroundImage = 'none';
            toggleButton.textContent = '切换静态';
            startLive2D(); // 动态创建并启动
        }
    }
};

// ==========================================
// 3. Live2D 极致生命周期引擎 (动态拉起与彻底销毁)
// ==========================================
async function startLive2D() {
    if (live2dApp) return; 
    if (!window.PIXI) { console.warn("⚠️ 尚未加载 PIXI 引擎。"); return; }

    // 🚀 核心护城河：如果此时还不知道模型路径，绝对不启动，防止 PIXI 底层崩溃！
    if (!window.LIVE2D_PATH || window.LIVE2D_PATH === 'undefined') {
        console.log("⏳ 等待读取 Live2D 模型路径...");
        return; // 直接返回，稍后 LIVE2D_WALLPAPER 加载时会自动触发它
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'live2d-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '1'; 
    canvas.style.pointerEvents = 'auto'; 
    document.body.appendChild(canvas);

    live2dApp = new PIXI.Application({
        view: canvas,
        resizeTo: window,
        transparent: true,
        backgroundAlpha: 0,
    });

    try {
        currentLive2dModel = await PIXI.live2d.Live2DModel.from(`./assets/${window.LIVE2D_PATH}`);
        live2dApp.stage.addChild(currentLive2dModel);

        updateLive2dLayout();
        setupLive2DInteractions(currentLive2dModel);
        console.log("✅ Live2D 引擎启动成功！");
    } catch (e) { console.error("❌ Live2D 加载失败:", e); }
}

function stopLive2D() {
    // 🚀 加强容错处理，即使之前崩溃了，也能强行把现场打扫干净
    try {
        if (currentLive2dModel) {
            currentLive2dModel.destroy();
            currentLive2dModel = null;
        }
        if (live2dApp) {
            live2dApp.destroy(true, { children: true, texture: true, baseTexture: true });
            live2dApp = null;
        }
    } catch (e) { console.error("强制清理引擎残留:", e); }
    
    // 把 DOM 里所有能找到的动态画布全部拔掉
    document.querySelectorAll('#live2d-canvas').forEach(canvas => canvas.remove());
    console.log("🛑 Live2D 引擎已完全卸载，释放所有显存。");
}

function updateLive2dLayout() {
    if (!currentLive2dModel) return;
    const scaleMultiplier = window.live2dScale !== undefined ? window.live2dScale : 1.2;
    const xOffset = window.live2dXOffset !== undefined ? window.live2dXOffset : 0;
    const yOffset = window.live2dYOffset !== undefined ? window.live2dYOffset : 150;

    const originalHeight = currentLive2dModel.height / currentLive2dModel.scale.y;
    const baseScale = window.innerHeight / originalHeight;
    currentLive2dModel.scale.set(baseScale * scaleMultiplier);

    currentLive2dModel.x = (window.innerWidth - currentLive2dModel.width) / 2 + xOffset;
    currentLive2dModel.y = (window.innerHeight - currentLive2dModel.height) / 2 + yOffset;
}

window.addEventListener('resize', updateLive2dLayout);

// ==========================================
// Live2D 智能动作引擎 (动作雷达、待机池、登场逻辑)
// ==========================================
function playSmartMotion(model, hitArea) {
    if (!model || !model.internalModel || !model.internalModel.motionManager) return;
    const availableMotions = Object.keys(model.internalModel.motionManager.motionGroups);
    if (availableMotions.length === 0) return;

    let targetMotion = null;

    if (hitArea.includes('Head')) {
        targetMotion = availableMotions.find(m => {
            const lm = m.toLowerCase();
            return lm.includes('head') || lm.includes('pat') || lm.includes('face');
        });
    } else if (hitArea.some(area => ['Body', 'Breast', 'Chest'].includes(area))) {
        targetMotion = availableMotions.find(m => {
            const lm = m.toLowerCase();
            return (lm.includes('body') || lm.includes('chest') || lm.includes('touch') || lm.includes('main') || lm.includes('tap')) && !lm.includes('head');
        });
    }

    if (!targetMotion) {
        const interactiveMotions = availableMotions.filter(m => {
            const lm = m.toLowerCase();
            return !lm.includes('idle') && !lm.includes('home') && !lm.includes('login') && !lm.includes('start');
        });
        
        if (interactiveMotions.length > 0) {
            targetMotion = interactiveMotions[Math.floor(Math.random() * interactiveMotions.length)];
        } else {
            targetMotion = availableMotions[Math.floor(Math.random() * availableMotions.length)];
        }
    }

    if (targetMotion) {
        console.log(`🎬 互动触发动作: ${targetMotion}`);
        model.motion(targetMotion);
    }
}

function playSmartIdle(model) {
    if (!model || !model.internalModel || !model.internalModel.motionManager) return;
    const availableMotions = Object.keys(model.internalModel.motionManager.motionGroups);
    let idleMotions = availableMotions.filter(m => m.toLowerCase().includes('idle'));
    if (idleMotions.length === 0) idleMotions = availableMotions.filter(m => m.toLowerCase().includes('normal'));
    
    if (idleMotions.length > 0) {
        const randomIdle = idleMotions[Math.floor(Math.random() * idleMotions.length)];
        console.log(`💤 随机待机: ${randomIdle}`);
        model.motion(randomIdle);
    }
}

function playEntranceAnimation(model) {
    if (!model || !model.internalModel || !model.internalModel.motionManager) return;
    const availableMotions = Object.keys(model.internalModel.motionManager.motionGroups);
    const entranceMotion = availableMotions.find(m => {
        const lm = m.toLowerCase();
        return lm.includes('login') || lm.includes('home') || lm.includes('start');
    });

    if (entranceMotion) {
        console.log(`✨ 登场动画: ${entranceMotion}`);
        model.motion(entranceMotion);
    } else {
        playSmartIdle(model);
    }
}

// 防抖与全局点击劫持侦听
window.live2dHitTriggered = false; 

window.addEventListener('pointerdown', (e) => {
    if (window.currentWallpaperType !== 'live2d' || !currentLive2dModel) return;

    // 智能拦截 UI 元素
    const target = e.target;
    const clickedUI = target.closest('#top-controls') || 
                      target.closest('#todo-panel') || 
                      target.closest('#settings-modal') || 
                      target.closest('#app-menu-modal');
    if (clickedUI) return; 

    setTimeout(() => {
        if (!window.live2dHitTriggered) {
            console.log("👉 触发桌面全局空地点击 (兜底)");
            playSmartMotion(currentLive2dModel, []);
        }
    }, 50);
});

function setupLive2DInteractions(model) {
    model.interactive = true; 
    model.buttonMode = true;
    model.trackedPointers = [{ id: 1, type: 'pointerdown', flags: 0 }];

    model.on('hit', (hitAreas) => {
        window.live2dHitTriggered = true;
        console.log("👉 触发精准判定区:", hitAreas);
        playSmartMotion(model, hitAreas);
        setTimeout(() => window.live2dHitTriggered = false, 100);
    });

    model.internalModel.motionManager.on('motionFinish', () => {
        playSmartIdle(model); 
    });

    playEntranceAnimation(model);
}

// ==========================================
// 壁纸切换按钮绑定
// ==========================================
document.getElementById('wallpaper-toggle').addEventListener('click', () => {
    let nextState = 'static';
    if (window.currentWallpaperType === 'static') nextState = 'dynamic';
    else if (window.currentWallpaperType === 'dynamic') nextState = 'live2d';
    else if (window.currentWallpaperType === 'live2d') nextState = 'static';
    
    applyVisualEffect['WALLPAPER_TYPE'](nextState); 
    performSave('WALLPAPER_TYPE', nextState);       
});

// ==========================================
// 4. 时钟与搜索组件
// ==========================================
function updateClock() { 
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('zh-CN', { hour12: false }); 
    document.getElementById('date-display').textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
setInterval(updateClock, 1000);

const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsPanel = document.getElementById('search-results');
const searchResultsList = document.getElementById('search-results-list');

searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    searchContainer.classList.toggle('active');
    if (searchContainer.classList.contains('active')) setTimeout(() => searchInput.focus(), 100);
    else { searchInput.value = ''; searchResultsPanel.classList.remove('show'); }
});

document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
        if (searchContainer.classList.contains('active') && searchInput.value.trim() === '') searchContainer.classList.remove('active');
        searchResultsPanel.classList.remove('show');
    }
});

let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (!query) { searchResultsPanel.classList.remove('show'); return; }

    searchTimeout = setTimeout(async () => {
        searchResultsList.innerHTML = '<div class="search-empty">🔍 搜索中...</div>';
        searchResultsPanel.classList.add('show');
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await response.json();
            
            if (results.error) { searchResultsList.innerHTML = `<div class="search-empty">⚠️ ${results.error}</div>`; return; }
            if (results.length === 0) { searchResultsList.innerHTML = '<div class="search-empty">没有找到相关文件</div>'; return; }

            searchResultsList.innerHTML = '';
            results.forEach(item => {
                const li = document.createElement('li');
                li.className = 'search-item';
                const fullPath = item.path + '\\' + item.filename;
                
                li.innerHTML = `
                    <span class="search-filename" title="${item.filename}">${item.filename}</span>
                    <span class="search-path" title="${fullPath}">${item.path}</span>
                `;
                
                li.onclick = async () => {
                    searchResultsPanel.classList.remove('show');
                    searchContainer.classList.remove('active');
                    searchInput.value = ''; 
                    try {
                        const response = await fetch('/api/open-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: fullPath })
                        });
                        const result = await response.json();
                        if (result.status === "error") alert("打开失败：" + result.message);
                    } catch (err) { console.error("请求打开接口失败", err); }
                };
                searchResultsList.appendChild(li);
            });
        } catch (error) {
            searchResultsList.innerHTML = '<div class="search-empty">❌ 请求失败</div>';
        }
    }, 500); 
});