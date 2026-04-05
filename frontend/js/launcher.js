// ==========================================
// launcher.js: 抽屉与应用网格管理器 (双分栏支持版)
// ==========================================
let launcherApps = [];
let launcherPlugins = [];
let currentAppTab = 'apps'; // 新增状态：当前停留的标签页 ('apps' 或 'plugins')

const appMenuModal = document.getElementById('app-menu-modal');
const appMenuBtn = document.getElementById('app-menu-btn');
const closeAppMenuBtn = document.getElementById('close-app-menu');
const addAppBtn = document.getElementById('add-app-btn');
const appGrid = document.getElementById('app-grid');

// ==========================================
// 🚀 新增：标签页切换逻辑
// ==========================================
document.querySelectorAll('#app-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        // 1. 切换按钮高亮样式
        document.querySelectorAll('#app-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // 2. 更新状态
        currentAppTab = this.getAttribute('data-app-tab');
        
        // 3. 智能显示/隐藏添加按钮（插件不支持前端手动添加）
        if (currentAppTab === 'apps') {
            addAppBtn.style.display = 'block';
        } else {
            addAppBtn.style.display = 'none';
        }
        
        // 4. 重新渲染网格
        renderApps();
    });
});

appMenuBtn.addEventListener('click', () => { appMenuModal.classList.add('show'); fetchApps(); });
closeAppMenuBtn.addEventListener('click', () => appMenuModal.classList.remove('show'));

// 统一获取应用和插件数据
async function fetchApps() {
    try {
        const [appData, pluginData] = await Promise.all([
            safeFetchJson('/api/apps/list?t=' + Date.now()),
            safeFetchJson('/api/plugins/list?t=' + Date.now())
        ]);

        if (!appData.error) launcherApps = appData;
        if (!pluginData.error) launcherPlugins = pluginData;

        renderApps();
    } catch (e) { console.error("加载应用或插件列表失败", e); }
}

function getIconElement(iconPath) {
    if (iconPath === 'folder') return `<div class="fallback-icon">📁</div>`;
    if (iconPath === 'default') return `<div class="fallback-icon">⚙️</div>`;
    return `<img src="./data/${iconPath}?t=${Date.now()}" alt="icon" onerror="this.outerHTML='<div class=\\'fallback-icon\\'>⚙️</div>'">`;
}

// ==========================================
// 🚀 更新：根据当前标签页分流渲染
// ==========================================
function renderApps() {
    appGrid.innerHTML = '';
    
    // --- 渲染：本地应用分类 ---
    if (currentAppTab === 'apps') {
        if (launcherApps.length === 0) {
            appGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.5); padding-top: 50px;">点击上方「➕ 添加应用」按钮来丰富你的工具箱吧</div>`;
            return;
        }

        launcherApps.forEach((app, index) => {
            const item = document.createElement('div');
            item.className = 'app-item';
            item.title = app.path;
            item.innerHTML = `
                <button class="app-delete-btn" title="移除该应用">✖</button>
                ${getIconElement(app.icon)}
                <div class="app-name">${app.name}</div>
            `;
            
            item.onclick = async (e) => {
                if (e.target.classList.contains('app-delete-btn')) return; 
                try {
                    const result = await safeFetchJson('/api/search/open-file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: app.path })
                    });
                    if (result.status === "error") alert("无法打开：" + result.message);
                } catch (err) { console.error("打开应用失败", err); }
            };

            item.querySelector('.app-delete-btn').onclick = async (e) => {
                e.stopPropagation(); // 阻止冒泡触发打开应用
                launcherApps.splice(index, 1);
                renderApps();
                await safeFetchJson('/api/apps/save', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(launcherApps) 
                });
            };
            appGrid.appendChild(item);
        });
    } 
    // --- 渲染：扩展插件分类 ---
    else if (currentAppTab === 'plugins') {
        // 过滤出有前端入口的有效插件
        const validPlugins = launcherPlugins.filter(p => p.entry_url);
        
        if (validPlugins.length === 0) {
            appGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.5); padding-top: 50px;">暂无具备界面的插件，请将插件放入 adds 目录并重启</div>`;
            return;
        }

        validPlugins.forEach(plugin => {
            const item = document.createElement('div');
            item.className = 'app-item';
            item.title = "插件: " + plugin.name;
            
            item.innerHTML = `
                <div class="fallback-icon">${plugin.icon || '🧩'}</div>
                <div class="app-name">${plugin.name}</div>
            `;
            
            item.onclick = () => {
                if (typeof openPlugin === 'function') {
                    openPlugin(plugin);
                    // 点击插件后，自动关闭整个应用列表，让体验更清爽
                    appMenuModal.classList.remove('show');
                }
            };
            appGrid.appendChild(item);
        });
    }
}

// 系统弹窗选择应用
addAppBtn.addEventListener('click', async () => {
    const originalText = addAppBtn.innerText;
    addAppBtn.innerText = "⏳ 请在弹窗中选择...";
    addAppBtn.style.pointerEvents = "none";
    
    try {
        const data = await safeFetchJson('/api/apps/pick-file');
        if (!data.error && data.status === 'success') {
            launcherApps.push(data.app);
            renderApps();
            await safeFetchJson('/api/apps/save', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(launcherApps) 
            });
        }
    } catch (e) { console.error("添加应用异常", e); } 
    finally {
        addAppBtn.innerText = originalText;
        addAppBtn.style.pointerEvents = "auto";
    }
});