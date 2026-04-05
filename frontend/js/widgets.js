// ==========================================
// widgets.js: 时钟、搜索等独立桌面小部件
// ==========================================

function updateClock() { 
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('zh-CN', { hour12: false }); 
    document.getElementById('date-display').textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
setInterval(updateClock, 1000);

// ==========================================
// 运行日志面板逻辑 (解决幽灵轮询)
// ==========================================
const logModal = document.getElementById('log-modal');
const logBtn = document.getElementById('log-btn');
const closeLogBtn = document.getElementById('close-log-btn');
const logContent = document.getElementById('log-content');
let logInterval = null;

// 启动轮询的封装
function startLogPolling() {
    if (!logInterval) {
        fetchLogs(); // 立即拉取一次
        logInterval = setInterval(fetchLogs, 1000);
    }
}

// 停止轮询的封装
function stopLogPolling() {
    if (logInterval) {
        clearInterval(logInterval);
        logInterval = null;
    }
}

logBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    logModal.classList.add('show');
    startLogPolling(); 
});

closeLogBtn.addEventListener('click', () => {
    logModal.classList.remove('show');
    // 注意：这里不需要手动 clearInterval 了，交给下面的 Observer 统一处理
});

// 🚀 核心修复：使用 MutationObserver 监听面板自身的 class 变化
// 这样无论是由 closeBtn 关闭，还是 init.js 点击空白处关闭，都能 100% 触发清理
const logModalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
            // 只要面板不再包含 'show' 状态，立刻彻底掐断轮询
            if (!logModal.classList.contains('show')) {
                stopLogPolling();
            }
        }
    });
});

// 开始监视 logModal 的属性变化
logModalObserver.observe(logModal, { attributes: true });

async function fetchLogs() {
    const data = await safeFetchJson('/api/logs/get-logs?t=' + Date.now());
    if (!data.error) {
        if (logContent.textContent !== data.logs) {
            const isAtBottom = logContent.scrollHeight - logContent.scrollTop <= logContent.clientHeight + 20;
            
            logContent.textContent = data.logs;
            
            if (isAtBottom) {
                logContent.scrollTop = logContent.scrollHeight;
            }
        }
    }
}