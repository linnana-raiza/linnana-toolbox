// ==========================================
// utils.js: 核心工具与网络通信
// ==========================================

function cleanVal(val) {
    if (typeof val !== 'string') return val;
    let cleaned = val.split(' #')[0].trim();
    return cleaned.replace(/^['"]+|['"]+$/g, '').trim();
}

async function performSave(key, value) {
    try {
        await fetch('/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: String(value) })
        });
        console.log(`💾 磁盘写入成功: ${key} = ${value}`);
    } catch (e) { console.error("写入失败:", e); }
}

const debounceTimers = {};
function debouncedSave(key, value) {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => {
        performSave(key, value);
        delete debounceTimers[key];
    }, 2000);
}