// ==========================================
// utils.js: 核心工具与网络通信
// ==========================================

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
    let cleaned = val.split(' #')[0].trim();
    return cleaned.replace(/^['"]+|['"]+$/g, '').trim();
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

// 新增：在进程被杀前，强制把所有挂起的任务用更底层的 sendBeacon 丢给后端
window.flushPendingSaves = function() {
    for (const key in pendingSaves) {
        clearTimeout(debounceTimers[key]);
        const data = JSON.stringify({ key: key, value: String(pendingSaves[key]) });
        const blob = new Blob([data], { type: 'application/json' });
        // sendBeacon 即使页面正在卸载也能把数据射出去
        navigator.sendBeacon('/api/settings/save-setting', blob);
    }
}
// 🚀 新增：利用浏览器原生生命周期，在窗口即将被关闭的瞬间自动把数据射出去
window.addEventListener('beforeunload', () => {
    if (typeof window.flushPendingSaves === "function") {
        window.flushPendingSaves();
    }
});