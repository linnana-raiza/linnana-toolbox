// ==========================================
// launcher.js: 抽屉与应用网格管理器
// ==========================================
let launcherApps = [];

const appMenuModal = document.getElementById('app-menu-modal');
const appMenuBtn = document.getElementById('app-menu-btn');
const closeAppMenuBtn = document.getElementById('close-app-menu');
const addAppBtn = document.getElementById('add-app-btn');
const appGrid = document.getElementById('app-grid');

appMenuBtn.addEventListener('click', () => { appMenuModal.classList.add('show'); fetchApps(); });
closeAppMenuBtn.addEventListener('click', () => appMenuModal.classList.remove('show'));

async function fetchApps() {
    try {
        const res = await fetch('/api/apps/list?t=' + Date.now());
        launcherApps = await res.json();
        renderApps();
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
        
        item.onclick = async (e) => {
            if (e.target.classList.contains('app-delete-btn')) return; 
            try {
                const res = await fetch('/api/open-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: app.path })
                });
                const result = await res.json();
                if (result.status === "error") alert("无法打开：" + result.message);
            } catch (err) { console.error("打开应用失败", err); }
        };

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

addAppBtn.addEventListener('click', async () => {
    const originalText = addAppBtn.innerText;
    addAppBtn.innerText = "⏳ 请在系统弹窗中选择...";
    addAppBtn.style.pointerEvents = "none";
    
    try {
        const res = await fetch('/api/apps/pick-file');
        const data = await res.json();
        
        if (data.status === 'success') {
            launcherApps.push(data.app);
            renderApps();
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