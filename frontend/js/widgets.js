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

document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
        if (searchContainer.classList.contains('active') && searchInput.value.trim() === '') searchContainer.classList.remove('active');
        searchResultsPanel.classList.remove('show');
    }
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
            const results = await safeFetchJson(`/api/search?q=${encodeURIComponent(query)}`);
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
                        const result = await safeFetchJson('/api/open-file', {
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