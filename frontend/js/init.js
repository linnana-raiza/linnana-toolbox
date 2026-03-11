// ==========================================
// init.js: 统筹全局初始化
// ==========================================
window.onload = async function() {
    // 1. 同步全局视图配置
    try {
        const settings = await safeFetchJson('/api/settings/get-all-settings?t=' + new Date().getTime());
        if (settings.error) return;
        for (const [key, value] of Object.entries(settings)) { 
            const cleanValue = cleanVal(value);
            // applyVisualEffect 定义在 core.js 中
            if (applyVisualEffect[key]) applyVisualEffect[key](cleanValue); 
        }
    } catch (error) { console.error("读取基础配置失败", error); }
    
    // 2. 启动子模块时钟与数据加载
    updateClock();          // 来自 core.js
    fetchTodos();           // 来自 todo.js
    loadDynamicSettings();  // 来自 settings.js
    fetchApps();            // 来自 launcher.js
    checkSttStatus();       // 来自 stt.js
};

// ==========================================
// 全局交互优化：点击空白处关闭弹窗面板
// ==========================================
document.addEventListener('pointerdown', (e) => {
    // 获取需要控制的面板和对应的触发按钮
    const settingsModal = document.getElementById('settings-modal');
    const appMenuModal = document.getElementById('app-menu-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const appMenuBtn = document.getElementById('app-menu-btn');

    // 如果设置面板是打开的
    if (settingsModal && settingsModal.classList.contains('show')) {
        // 点击的位置既不在面板内，也不是顶部的齿轮按钮，就关闭它
        if (!settingsModal.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsModal.classList.remove('show');
        }
    }

    // 同理，如果应用启动器是打开的
    if (appMenuModal && appMenuModal.classList.contains('show')) {
        if (!appMenuModal.contains(e.target) && !appMenuBtn.contains(e.target)) {
            appMenuModal.classList.remove('show');
        }
    }
});