// ==========================================
// wallpaper.js: Live2D 极致生命周期引擎与壁纸切换
// ==========================================

let live2dApp = null;
let currentLive2dModel = null;

async function startLive2D() {
    if (live2dApp) return; 
    if (!window.PIXI) { console.warn("⚠️ 尚未加载 PIXI 引擎。"); return; }

    if (!window.ToolBoxContext.paths.live2d || window.ToolBoxContext.paths.live2d === 'undefined') {
        console.log("⏳ 等待读取 Live2D 模型路径...");
        return; 
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
        currentLive2dModel = await PIXI.live2d.Live2DModel.from(`/data/${window.ToolBoxContext.paths.live2d}`);
        live2dApp.stage.addChild(currentLive2dModel);

        updateLive2dLayout();
        setupLive2DInteractions(currentLive2dModel);

        if (PIXI.live2d.SoundManager) {
            PIXI.live2d.SoundManager.volume = window.ToolBoxContext.live2dVolume;
        }

        console.log("✅ Live2D 引擎启动成功！");
    } catch (e) { console.error("❌ Live2D 加载失败:", e); }
}

function stopLive2D() {
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
    
    document.querySelectorAll('#live2d-canvas').forEach(canvas => canvas.remove());
    console.log("🛑 Live2D 引擎已完全卸载，释放所有显存。");
}

function updateLive2dLayout() {
    if (!currentLive2dModel) return;
    const ctx = window.ToolBoxContext;
    const originalHeight = currentLive2dModel.height / currentLive2dModel.scale.y;
    const baseScale = window.innerHeight / originalHeight;
    currentLive2dModel.scale.set(baseScale * ctx.live2dScale);

    currentLive2dModel.x = (window.innerWidth - currentLive2dModel.width) / 2 + ctx.live2dXOffset;
    currentLive2dModel.y = (window.innerHeight - currentLive2dModel.height) / 2 + ctx.live2dYOffset;
}

// ==========================================
// 🚀 性能优化：Live2D 响应式布局防抖 (Debounce)
// ==========================================
let resizeTimer = null;
window.addEventListener('resize', () => {
    // 每次触发 resize 时，先清除上一次的定时器
    if (resizeTimer) {
        clearTimeout(resizeTimer);
    }
    // 只有当用户停止拖拽窗口 100 毫秒后，才真正执行一次重绘操作
    resizeTimer = setTimeout(() => {
        if (typeof updateLive2dLayout === 'function') {
            updateLive2dLayout();
            console.log("📐 窗口尺寸改变，Live2D 布局已重新计算。");
        }
    }, 100);
});

// --- 智能动作引擎 ---
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
        targetMotion = interactiveMotions.length > 0 
            ? interactiveMotions[Math.floor(Math.random() * interactiveMotions.length)]
            : availableMotions[Math.floor(Math.random() * availableMotions.length)];
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

window.addEventListener('pointerdown', (e) => {
    if (window.ToolBoxContext.wallpaperType !== 'live2d' || !currentLive2dModel) return;

    const target = e.target;
    const clickedUI = target.closest('#top-controls') || 
                  target.closest('#todo-panel') || 
                  target.closest('#settings-modal') || 
                  target.closest('#app-menu-modal') ||
                  target.closest('#music-widget') ||
                  target.closest('#time-widget');
    if (clickedUI) return; 

    setTimeout(() => {
    if (!window.ToolBoxContext.live2dHitTriggered) {
        // 🚀 核心修复：同样检查状态锁，动作没播完就不响应空地点击
        if (currentLive2dModel && currentLive2dModel.isInteracting) {
            return;
        }
        
        console.log("👉 触发桌面全局空地点击 (兜底)");
        currentLive2dModel.isInteracting = true; // 开启拦截锁
        playSmartMotion(currentLive2dModel, []);
    }
}, 50);
});

function setupLive2DInteractions(model) {
    model.interactive = true; 
    model.buttonMode = true;
    model.trackedPointers = [{ id: 1, type: 'pointermove', flags: 0 }];

    // 🚀 终极防跟随方案：劫持底层 Focus 引擎
    if (model.internalModel && model.internalModel.focusController) {
        const originalFocus = model.internalModel.focusController.focus.bind(model.internalModel.focusController);
        model.internalModel.focusController.focus = function(x, y) {
            if (model.isInteracting) {
                // 正在互动时，无视鼠标坐标，强制眼球和脖子回正看中心
                originalFocus(0, 0); 
            } else {
                // 待机时，正常跟随鼠标
                originalFocus(x, y); 
            }
        };
    }

    model.on('hit', (hitAreas) => {
    window.ToolBoxContext.live2dHitTriggered = true;
    setTimeout(() => window.ToolBoxContext.live2dHitTriggered = false, 100);

    // 🚀 核心修复：如果模型正在播放动画，直接无视新的点击，防止鬼畜和打断
    if (model.isInteracting) {
        console.log("⏳ 模型正在动作中，忽略本次点击");
        return;
    }

    model.isInteracting = true; // 开启拦截锁
    console.log("👉 触发精准判定区:", hitAreas);
    playSmartMotion(model, hitAreas);
});

    model.internalModel.motionManager.on('motionFinish', () => { 
        model.isInteracting = false; // 动作播放完毕，解除拦截锁，恢复鼠标跟随
        playSmartIdle(model); 
    });

    // 刚打开软件登场时，也假装在 Interacting，不跟随鼠标
    model.isInteracting = true;
    playEntranceAnimation(model);
}

// 绑定壁纸切换按钮
document.getElementById('wallpaper-toggle').addEventListener('click', () => {
    let nextState = 'static';
    if (window.ToolBoxContext.wallpaperType === 'static') nextState = 'dynamic';
    else if (window.ToolBoxContext.wallpaperType === 'dynamic') nextState = 'live2d';
    else if (window.ToolBoxContext.wallpaperType === 'live2d') nextState = 'static';
    
    applyVisualEffect['WALLPAPER_TYPE'](nextState); 
    performSave('WALLPAPER_TYPE', nextState);       
});

// ==========================================
// 核心修复：破解 Chromium 内核的媒体自动播放限制
// ==========================================
let isAudioUnlocked = false;
window.addEventListener('pointerdown', () => {
    if (isAudioUnlocked) return;
    
    // 用户第一次点击屏幕时，悄悄播放一个空音频，骗过浏览器安全机制
    const unlockAudio = new Audio();
    unlockAudio.play().catch(() => {});
    
    // 如果 PIXI 引擎使用了 Web Audio API，顺便唤醒它
    if (window.PIXI && PIXI.live2d && PIXI.live2d.SoundManager && PIXI.live2d.SoundManager._context) {
        if (PIXI.live2d.SoundManager._context.state === 'suspended') {
            PIXI.live2d.SoundManager._context.resume();
        }
    }
    
    isAudioUnlocked = true;
    console.log("🔊 浏览器全局音频播放限制已解除");
}, { once: true }); // once: true 确保这个监听器触发一次后就自动销毁，节省性能