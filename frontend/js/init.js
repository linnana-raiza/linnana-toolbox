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
            window.EventBus.emit('SETTING_CHANGED', { key: key, value: cleanValue }); 
        }
    } catch (error) { console.error("读取基础配置失败", error); }
    
    // 2. 启动子模块时钟与数据加载
    updateClock();          // 来自 core.js
    fetchTodos();           // 来自 todo.js
    loadDynamicSettings();  // 来自 settings.js
    fetchApps();            // 来自 launcher.js
    checkSttStatus();       // 来自 stt.js
};

document.addEventListener('pointerdown', (e) => {
    // 定义所有需要具备“点击空白处关闭”特性的面板及其对应的触发按钮
    const panels = [
        { modalId: 'settings-modal', btnId: 'settings-btn' },
        { modalId: 'app-menu-modal', btnId: 'app-menu-btn' },
        { modalId: 'log-modal', btnId: 'log-btn' },
        { modalId: 'music-list-panel', btnId: 'music-list-btn' },
        { modalId: 'search-container', btnId: 'search-btn', isClassActive: true },
        { modalId: 'search-results', btnId: 'search-btn' } // 搜索结果面板
    ];

    panels.forEach(({ modalId, btnId, isClassActive }) => {
        const modal = document.getElementById(modalId);
        const btn = document.getElementById(btnId);
        
        if (!modal || !btn) return;

        const isOpen = isClassActive ? modal.classList.contains('active') : modal.classList.contains('show');
        
        // 如果面板开着，且点击的目标既不在面板内，也不在触发按钮内
        if (isOpen && !modal.contains(e.target) && !btn.contains(e.target)) {
            if (isClassActive) {
                // 特殊处理搜索框的 active 状态
                const searchInput = document.getElementById('search-input');
                if (searchInput && searchInput.value.trim() === '') {
                    modal.classList.remove('active');
                }
            } else {
                modal.classList.remove('show');
            }
        }
    });
});