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
        
        // 拦截后端传来的明确业务错误（如没管理员权限）
        if (data.status === 'error') {
            alert("启动失败：" + data.message);
            sttToggleBtn.textContent = '🎤 语音转文字';
            sttToggleBtn.classList.remove('primary');
            return;
        }
        
        if (data.status === 'started') {
            sttToggleBtn.textContent = '🟢 语音服务运行中';
            sttToggleBtn.classList.add('primary');
        } else {
            sttToggleBtn.textContent = '🎤 语音转文字';
            sttToggleBtn.classList.remove('primary');
        }
    } catch (err) {
        alert("语音服务启动异常，请检查后台日志");
        // 发生异常时强制恢复按钮状态
        sttToggleBtn.textContent = '🎤 语音转文字';
        sttToggleBtn.classList.remove('primary');
    } finally {
        sttToggleBtn.style.pointerEvents = 'auto';
        isSttLoading = false;
    }
});