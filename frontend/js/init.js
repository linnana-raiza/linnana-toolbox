// ==========================================
// init.js: 统筹全局初始化
// ==========================================
async function loadWidgetPlugins() {
    try {
        const plugins = await safeFetchJson('/api/plugins/list?t=' + Date.now());
        if (plugins.error) return;

        plugins.forEach(plugin => {
            // 拦截并处理 "widget" 类型的插件
            if (plugin.type === 'widget') {
                console.log(`🧩 正在向桌面装载挂件: ${plugin.name}`);
                
                // 1. 优先注入 CSS (挂载到 <head> 中，防止 UI 闪烁)
                if (plugin.inject_css) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    // 路径依然走 main.py 里的 adds_static 静态路由
                    link.href = `/adds_static/${plugin.id}/${plugin.inject_css}`;
                    document.head.appendChild(link);
                    console.log(`🎨 挂件 CSS 注入就绪: ${plugin.inject_css}`);
                }

                // 2. 随后注入 JS (挂载到 <body> 底部)
                if (plugin.inject_js) {
                    const script = document.createElement('script');
                    script.src = `/adds_static/${plugin.id}/${plugin.inject_js}`; 
                    script.defer = true; // 确保 DOM 解析完后再执行
                    
                    script.onload = () => console.log(`✅ 挂件 JS 注入成功: ${plugin.inject_js}`);
                    script.onerror = () => console.error(`❌ 挂件 JS 注入失败: ${plugin.inject_js}`);
                    
                    document.body.appendChild(script);
                }
            }
        });
    } catch (e) {
        console.error("加载挂件插件失败:", e);
    }
}

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
    loadWidgetPlugins();    // 来自 /adds/
    updateClock();          // 来自 core.js
    fetchTodos();           // 来自 todo.js
    loadDynamicSettings();  // 来自 settings.js
    fetchApps();            // 来自 launcher.js
};

document.addEventListener('pointerdown', (e) => {
    // 定义所有需要具备“点击空白处关闭”特性的面板及其对应的触发按钮
    const panels = [
        { modalId: 'settings-modal', btnId: 'settings-btn' },
        { modalId: 'app-menu-modal', btnId: 'app-menu-btn' },
        { modalId: 'log-modal', btnId: 'log-btn' },
        { modalId: 'music-list-panel', btnId: 'music-list-btn' }
        // 🗑️ 删除了 search-container 和 search-results 这两项
    ];

    panels.forEach(({ modalId, btnId, isClassActive }) => {
        const modal = document.getElementById(modalId);
        const btn = document.getElementById(btnId);
        
        if (!modal || !btn) return;

        const isOpen = isClassActive ? modal.classList.contains('active') : modal.classList.contains('show');
        
        if (isOpen && !modal.contains(e.target) && !btn.contains(e.target)) {
            if (isClassActive) {
                modal.classList.remove('active');
            } else {
                modal.classList.remove('show');
            }
        }
    });
});

// ==========================================
// 🚀 SPA 原生插件引擎与丝滑拖拽 (无 iframe 版)
// ==========================================

const pluginModal = document.getElementById('plugin-modal');
const pluginHeader = document.getElementById('plugin-modal-header');
const pluginContainer = document.getElementById('plugin-content-container');

// 1. 动态解析并注入 HTML/CSS/JS
async function openPlugin(plugin) {
    document.getElementById('plugin-modal-title').textContent = `${plugin.icon} ${plugin.name}`;
    pluginContainer.innerHTML = '<div style="text-align: center; margin-top: 50px; color: #a0aec0;">🚀 正在挂载原生组件...</div>';
    
    // 强制居中并打开
    pluginModal.style.transform = 'none';
    if (!pluginModal.style.left) pluginModal.style.left = (window.innerWidth - 850) / 2 + 'px';
    if (!pluginModal.style.top) pluginModal.style.top = (window.innerHeight - 600) / 2 + 'px';
    pluginModal.classList.add('show');

    try {
        const res = await fetch(plugin.entry_url);
        const htmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // ① 动态注入 CSS (完美兼容 ./css/style.css 等相对路径)
        doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const newLink = document.createElement('link');
            newLink.rel = 'stylesheet';
            newLink.href = new URL(link.getAttribute('href'), window.location.origin + plugin.entry_url).href;
            newLink.className = 'plugin-dynamic-res'; 
            document.head.appendChild(newLink);
        });

        // ② 注入主体 HTML
        pluginContainer.innerHTML = doc.body.innerHTML;

        // ③ 动态执行 JS (按顺序)
        const scripts = Array.from(doc.querySelectorAll('script'));
        for (let script of scripts) {
            await new Promise((resolve) => {
                const newScript = document.createElement('script');
                newScript.className = 'plugin-dynamic-res';
                if (script.src) {
                    newScript.src = new URL(script.getAttribute('src'), window.location.origin + plugin.entry_url).href;
                    newScript.onload = resolve;
                    newScript.onerror = resolve; 
                } else {
                    newScript.textContent = script.textContent;
                    resolve();
                }
                document.body.appendChild(newScript);
            });
        }
    } catch (e) {
        pluginContainer.innerHTML = `<div style="color: #fc8181;">加载失败: ${e.message}</div>`;
    }
}

// 2. 关闭时物理销毁，防止污染全局内存
document.getElementById('close-plugin-btn').addEventListener('click', () => {
    pluginModal.classList.remove('show');
    setTimeout(() => {
        pluginContainer.innerHTML = ''; 
        document.querySelectorAll('.plugin-dynamic-res').forEach(el => el.remove()); 
    }, 300); 
});

// 3. 0 延迟原生丝滑拖拽
let pDragging = false, pStartX, pStartY, pInitLeft, pInitTop;

pluginHeader.onmousedown = (e) => {
    if (e.target.tagName.toLowerCase() === 'button') return;
    pDragging = true;
    pluginHeader.style.cursor = 'grabbing';
    pluginModal.style.transition = 'none'; // 取消动画实现0延迟跟手

    pStartX = e.clientX; pStartY = e.clientY;
    pInitLeft = pluginModal.offsetLeft; pInitTop = pluginModal.offsetTop;

    const onMove = (ev) => {
        if (!pDragging) return;
        pluginModal.style.left = pInitLeft + (ev.clientX - pStartX) + 'px';
        pluginModal.style.top = pInitTop + (ev.clientY - pStartY) + 'px';
    };
    
    const onUp = () => {
        pDragging = false;
        pluginHeader.style.cursor = 'grab';
        pluginModal.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};