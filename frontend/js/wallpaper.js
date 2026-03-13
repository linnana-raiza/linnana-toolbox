// ==========================================
// wallpaper.js: Live2D 极致生命周期引擎与壁纸切换 (修复事件泄漏版)
// ==========================================

let live2dApp = null;
let currentLive2dModel = null;

// 将捕获阶段的事件提取为具名函数
function handleLive2dPointerDownCapture() {
    const isAnyModalOpen = document.querySelector('.show') || document.querySelector('#search-container.active');
    window.ToolBoxContext.uiWasOpenAtClick = !!isAnyModalOpen;
}

// 将冒泡阶段的兜底点击事件提取为具名函数
function handleLive2dPointerDown(e) {
    if (window.ToolBoxContext.wallpaperType !== 'live2d' || !currentLive2dModel) return;

    const target = e.target;
    const clickedUI = target.closest('#top-controls') || 
                  target.closest('#todo-panel') || 
                  target.closest('#settings-modal') || 
                  target.closest('#app-menu-modal') ||
                  target.closest('#log-modal') ||     
                  target.closest('#todo-modal') ||    
                  target.closest('#music-widget') ||
                  target.closest('#time-widget');
    if (clickedUI) return; 

    if (window.ToolBoxContext.uiWasOpenAtClick) {
        console.log("拦截 (兜底)：点击目的是关闭弹窗，不触发 Live2D。");
        return; 
    }

    setTimeout(() => {
        if (!window.ToolBoxContext.live2dHitTriggered) {
            if (currentLive2dModel && currentLive2dModel.isInteracting) {
                return;
            }
            console.log("👉 触发桌面全局空地点击 (兜底)");
            currentLive2dModel.isInteracting = true; 
            playSmartMotion(currentLive2dModel, []);
        }
    }, 50);
}

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

        // 在启动时动态挂载事件
        window.addEventListener('pointerdown', handleLive2dPointerDownCapture, true);
        window.addEventListener('pointerdown', handleLive2dPointerDown, false);

        console.log("✅ Live2D 引擎启动成功！");
    } catch (e) { console.error("❌ Live2D 加载失败:", e); }
}

function stopLive2D() {
    // 在销毁时彻底解绑事件，防止多次切换壁纸后事件无限叠加触发
    window.removeEventListener('pointerdown', handleLive2dPointerDownCapture, true);
    window.removeEventListener('pointerdown', handleLive2dPointerDown, false);

    try {
        if (currentLive2dModel) {
            currentLive2dModel.destroy();
            currentLive2dModel = null;
        }
        if (live2dApp) {
            if (live2dApp.renderer && live2dApp.renderer.gl) {
                const gl = live2dApp.renderer.gl;
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext) {
                    ext.loseContext();
                    console.log("💥 WebGL 上下文已强制爆破，瞬间释放内存");
                }
            }
            live2dApp.destroy(true, { children: true, texture: true, baseTexture: true });
            live2dApp = null;
        }
        if (window.PIXI && PIXI.utils) {
            PIXI.utils.clearTextureCache();
        }
    } catch (e) { 
        console.error("强制清理引擎残留:", e); 
    }
    
    document.querySelectorAll('#live2d-canvas').forEach(canvas => canvas.remove());
    console.log("🛑 Live2D 引擎已完全卸载。");
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

let resizeTimer = null;
window.addEventListener('resize', () => {
    if (resizeTimer) {
        clearTimeout(resizeTimer);
    }
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

function setupLive2DInteractions(model) {
    model.interactive = true; 
    model.buttonMode = true;
    model.trackedPointers = [{ id: 1, type: 'pointermove', flags: 0 }];

    if (model.internalModel && model.internalModel.focusController) {
        const originalFocus = model.internalModel.focusController.focus.bind(model.internalModel.focusController);
        model.internalModel.focusController.focus = function(x, y) {
            if (model.isInteracting) {
                originalFocus(0, 0); 
            } else {
                originalFocus(x, y); 
            }
        };
    }

    model.on('hit', (hitAreas) => {
        if (window.ToolBoxContext.uiWasOpenAtClick) {
            console.log("拦截 (精准Hit)：点击目的是关闭弹窗，不触发 Live2D。");
            return;
        }

        window.ToolBoxContext.live2dHitTriggered = true;
        setTimeout(() => window.ToolBoxContext.live2dHitTriggered = false, 100);

        if (model.isInteracting) {
            console.log("⏳ 模型正在动作中，忽略本次点击");
            return;
        }

        model.isInteracting = true; 
        console.log("👉 触发精准判定区:", hitAreas);
        playSmartMotion(model, hitAreas);
    });

    model.internalModel.motionManager.on('motionFinish', () => { 
        model.isInteracting = false; 
        playSmartIdle(model); 
    });

    model.isInteracting = true;
    playEntranceAnimation(model);
}

document.getElementById('wallpaper-toggle').addEventListener('click', () => {
    let nextState = 'static';
    if (window.ToolBoxContext.wallpaperType === 'static') nextState = 'dynamic';
    else if (window.ToolBoxContext.wallpaperType === 'dynamic') nextState = 'live2d';
    else if (window.ToolBoxContext.wallpaperType === 'live2d') nextState = 'static';
    
    window.EventBus.emit('SETTING_CHANGED', { key: 'WALLPAPER_TYPE', value: nextState });
    performSave('WALLPAPER_TYPE', nextState);       
});

let isAudioUnlocked = false;
window.addEventListener('pointerdown', () => {
    if (isAudioUnlocked) return;
    
    const unlockAudio = new Audio();
    unlockAudio.play().catch(() => {});
    
    if (window.PIXI && PIXI.live2d && PIXI.live2d.SoundManager && PIXI.live2d.SoundManager._context) {
        if (PIXI.live2d.SoundManager._context.state === 'suspended') {
            PIXI.live2d.SoundManager._context.resume();
        }
    }
    
    isAudioUnlocked = true;
    console.log("🔊 浏览器全局音频播放限制已解除");
}, { once: true });