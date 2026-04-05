// ==========================================
// utils.js: 核心工具与网络通信 (全局防抖与批量保存修复版)
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

// 安全的异步请求封装，防止 JSON 解析报错卡死主线程
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

// ==========================================
// 💾 数据持久化引擎 (兼容单次立刻保存与高频批量保存)
// ==========================================

// 保留原有的 performSave，供其他模块 (如 wallpaper.js) 发生重大状态改变时立刻执行单次保存
async function performSave(key, value) {
    try {
        await fetch('/api/settings/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: String(value) })
        });
        console.log(`💾 磁盘写入成功 (单次): ${key} = ${value}`);
    } catch (e) { console.error("单次写入失败:", e); }
}

let globalSaveTimer = null;
let pendingSaves = {}; // 存储待保存的键值对集合

// 全局唯一的防抖入口：拦截所有高频修改 (音量滑块、面板拖拽等)
function debouncedSave(key, value) {
    pendingSaves[key] = value; // 不断更新字典中的最新值

    // 如果总闸已经在倒计时，先掐断
    if (globalSaveTimer) clearTimeout(globalSaveTimer);
    
    // 重新设定 2 秒倒计时，只要用户一直高频操作，就不发送请求
    globalSaveTimer = setTimeout(() => {
        performBatchSave();
    }, 2000);
}

// 核心：一波推平所有待办保存
async function performBatchSave(isEmergency = false) {
    const keysToSave = Object.keys(pendingSaves);
    if (keysToSave.length === 0) return;

    // 1. 提取数据并【立刻清空】队列，防止网络请求期间用户的新操作被覆盖丢弃
    const payloadData = keysToSave.map(k => ({ key: k, value: String(pendingSaves[k]) }));
    pendingSaves = {}; 
    if (globalSaveTimer) {
        clearTimeout(globalSaveTimer);
        globalSaveTimer = null;
    }

    try {
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadData)
        };
        
        // 如果是关闭页面触发的紧急保存，启用 keepalive 强行续命
        if (isEmergency) {
            fetchOptions.keepalive = true;
        }
        
        await fetch('/api/settings/save-settings-batch', fetchOptions);
        console.log(`📦 批量保存成功: 写入了 ${payloadData.length} 项配置`);
    } catch (e) { 
        console.error("批量保存请求失败:", e); 
    }
}

// 供 beforeunload 调用的紧急清空接口
window.flushPendingSaves = function() {
    performBatchSave(true);
}

// 页面卸载前，抢救所有还在防抖倒计时里的配置
window.addEventListener('beforeunload', () => {
    if (typeof window.flushPendingSaves === "function") {
        window.flushPendingSaves();
    }
});