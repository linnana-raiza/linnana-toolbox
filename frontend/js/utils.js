// ==========================================
// utils.js: 核心工具与网络通信
// ==========================================

window.EventBus = {
    listeners: {},
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
};

// 新增：安全的异步请求封装，防止 JSON 解析报错卡死主线程
async function safeFetchJson(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            console.warn(`[API 请求异常] 状态码: ${response.status}, URL: ${url}`);
            return { error: true, status: response.status };
        }
        return await response.json();
    } catch (e) {
        console.error(`[API 网络断开或解析失败] URL: ${url}`, e);
        return { error: true, message: e.message };
    }
}

function cleanVal(val) {
    if (typeof val !== 'string') return val;
    return val.replace(/^['"]+|['"]+$/g, '').trim();
}

async function performSave(key, value) {
    try {
        await fetch('/api/settings/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: String(value) })
        });
        console.log(`💾 磁盘写入成功: ${key} = ${value}`);
    } catch (e) { console.error("写入失败:", e); }
}

const debounceTimers = {};
const pendingSaves = {};
function debouncedSave(key, value) {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    pendingSaves[key] = value; // 记录最新值

    debounceTimers[key] = setTimeout(() => {
        performSave(key, value);
        delete debounceTimers[key];
        delete pendingSaves[key];
    }, 2000);
}

window.flushPendingSaves = function() {
    for (const key in pendingSaves) {
        clearTimeout(debounceTimers[key]);
        const payload = JSON.stringify({ key: key, value: String(pendingSaves[key]) });
        
        // 使用带 keepalive 的 fetch 替代 sendBeacon，完美适配 FastAPI 的 JSON 解析
        fetch('/api/settings/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true 
        }).catch(e => console.error("紧急保存失败:", e));
    }
}

window.addEventListener('beforeunload', () => {
    if (typeof window.flushPendingSaves === "function") {
        window.flushPendingSaves();
    }
});