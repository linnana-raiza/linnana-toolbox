// ==========================================
// widgets.js: 时钟、搜索等独立桌面小部件
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

let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (!query) { searchResultsPanel.classList.remove('show'); return; }

    searchTimeout = setTimeout(async () => {
        searchResultsList.innerHTML = '<div class="search-empty">🔍 搜索中...</div>';
        searchResultsPanel.classList.add('show');
        
        try {
            const results = await safeFetchJson(`/api/search/search?q=${encodeURIComponent(query)}`);
            if (results.error) { searchResultsList.innerHTML = `<div class="search-empty">⚠️ 请求失败</div>`; return; }
            
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
                        const result = await safeFetchJson('/api/search/open-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: fullPath })
                        });
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

// ==========================================
// 运行日志面板逻辑
// ==========================================
const logModal = document.getElementById('log-modal');
const logBtn = document.getElementById('log-btn');
const closeLogBtn = document.getElementById('close-log-btn');
const logContent = document.getElementById('log-content');
let logInterval = null;

logBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    logModal.classList.add('show');
    fetchLogs(); // 立即拉取一次
    // 只要面板打开着，就每秒去后端取一次最新日志
    logInterval = setInterval(fetchLogs, 1000);
});

closeLogBtn.addEventListener('click', () => {
    logModal.classList.remove('show');
    if (logInterval) clearInterval(logInterval); // 关闭面板时停止拉取，节省性能
});

async function fetchLogs() {
    const data = await safeFetchJson('/api/logs/get-logs?t=' + Date.now());
    if (!data.error) {
        // 🚀 新增性能锁：只有当日志内容真正发生变化时，才去触发 DOM 渲染
        if (logContent.textContent !== data.logs) {
            const isAtBottom = logContent.scrollHeight - logContent.scrollTop <= logContent.clientHeight + 20;
            
            logContent.textContent = data.logs;
            
            if (isAtBottom) {
                logContent.scrollTop = logContent.scrollHeight;
            }
        }
    }
}