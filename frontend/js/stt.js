// ==========================================
// stt.js: 语音转文字前端状态交互
// ==========================================
const sttToggleBtn = document.getElementById('stt-toggle-btn');
let isSttLoading = false;

async function checkSttStatus() {
    try {
        const data = await safeFetchJson('/api/stt/status?t=' + Date.now());
        if (!data.error && data.is_running) {
            sttToggleBtn.textContent = '🟢 语音服务运行中';
            sttToggleBtn.classList.add('primary');
        }
    } catch (e) { console.error("获取STT状态失败", e); }
}

sttToggleBtn.addEventListener('click', async () => {
    if (isSttLoading) return;
    
    if (!sttToggleBtn.classList.contains('primary')) {
        sttToggleBtn.textContent = '⏳ 模型加载中...';
        sttToggleBtn.style.pointerEvents = 'none';
        isSttLoading = true;
    }

    try {
        const data = await safeFetchJson('/api/stt/toggle', { method: 'POST' });
        if (data.error) throw new Error("API 异常");
        
        if (data.status === 'started') {
            sttToggleBtn.textContent = '🟢 语音服务运行中';
            sttToggleBtn.classList.add('primary');
        } else {
            sttToggleBtn.textContent = '🎤 语音转文字';
            sttToggleBtn.classList.remove('primary');
        }
    } catch (err) {
        alert("语音服务启动失败，请检查控制台");
    } finally {
        sttToggleBtn.style.pointerEvents = 'auto';
        isSttLoading = false;
    }
});