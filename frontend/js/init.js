// ==========================================
// init.js: 统筹全局初始化
// ==========================================
window.onload = async function() {
    // 1. 同步全局视图配置
    try {
        const response = await fetch('/get-all-settings?t=' + new Date().getTime());
        const settings = await response.json();
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