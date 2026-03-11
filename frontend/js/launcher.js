// ==========================================
// launcher.js: 抽屉与应用网格管理器 (防爆破优化版)
// ==========================================
let launcherApps = [];

const appMenuModal = document.getElementById('app-menu-modal');
const appMenuBtn = document.getElementById('app-menu-btn');
const closeAppMenuBtn = document.getElementById('close-app-menu');
const addAppBtn = document.getElementById('add-app-btn');
const appGrid = document.getElementById('app-grid');

appMenuBtn.addEventListener('click', () => { appMenuModal.classList.add('show'); fetchApps(); });
closeAppMenuBtn.addEventListener('click', () => appMenuModal.classList.remove('show'));

// 🚀 替换 1：获取应用列表
async function fetchApps() {
    try {
        const data = await safeFetchJson('/api/apps/list?t=' + Date.now());
        // 如果没有报错，就把数据赋给列表并渲染
        if (!data.error) {
            launcherApps = data;
            renderApps();
        }
    } catch (e) { console.error("加载应用列表失败", e); }
}

function getIconElement(iconPath) {
    if (iconPath === 'folder') return `<div class="fallback-icon">📁</div>`;
    if (iconPath === 'default') return `<div class="fallback-icon">⚙️</div>`;
    return `<img src="./assets/${iconPath}?t=${Date.now()}" alt="icon" onerror="this.outerHTML='<div class=\\'fallback-icon\\'>⚙️</div>'">`;
}

function renderApps() {
    appGrid.innerHTML = '';
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
        
        // 🚀 替换 2：点击图标打开应用
        item.onclick = async (e) => {
            if (e.target.classList.contains('app-delete-btn')) return; 
            try {
                const result = await safeFetchJson('/api/open-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: app.path })
                });
                
                // 处理网络层面的错误
                if (result.error) {
                    alert("网络请求失败，请检查后台运行状态");
                    return;
                }
                // 处理业务层面的错误（比如文件不存在）
                if (result.status === "error") {
                    alert("无法打开：" + result.message);
                }
            } catch (err) { console.error("打开应用失败", err); }
        };

        // 💡 这里的 save 请求只发送数据，不需要 json() 解析，所以保留原生 fetch
        item.querySelector('.app-delete-btn').onclick = async () => {
            launcherApps.splice(index, 1);
            renderApps();
            await fetch('/api/apps/save', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(launcherApps) 
            });
        };
        appGrid.appendChild(item);
    });
}

// 🚀 替换 3：添加新应用时的系统弹窗选择
addAppBtn.addEventListener('click', async () => {
    const originalText = addAppBtn.innerText;
    addAppBtn.innerText = "⏳ 请在系统弹窗中选择...";
    addAppBtn.style.pointerEvents = "none";
    
    try {
        const data = await safeFetchJson('/api/apps/pick-file');
        
        // 确保没有网络报错，且业务状态为成功
        if (!data.error && data.status === 'success') {
            launcherApps.push(data.app);
            renderApps();
            // 💡 这里的 save 同样只发送不解析，保留原生 fetch
            await fetch('/api/apps/save', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(launcherApps) 
            });
        }
    } catch (e) {
        console.error("添加应用异常", e);
    } finally {
        addAppBtn.innerText = originalText;
        addAppBtn.style.pointerEvents = "auto";
    }
});