import os
import sys
import uvicorn
import webview
import asyncio
import threading
import time
import mimetypes
import ctypes
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from dotenv import dotenv_values

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# 引入分离的路由和全局锁
from config import env_path, frontend_dir, data_dir, root_dir, env_file_lock
from api.todo import router as todo_router
from api.settings import router as settings_router, update_env_key
from api.apps import router as apps_router
from api.stt import router as stt_router
from api.search import router as search_router
from api.music import router as music_router
from api.logs import router as logs_router

mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("audio/ogg", ".ogg")

app = FastAPI()

# ==========================================
# 路由注册
# ==========================================
app.include_router(settings_router, prefix="/api/settings")
app.include_router(todo_router, prefix="/api/todo")
app.include_router(apps_router, prefix="/api/apps")
app.include_router(stt_router, prefix="/api/stt")
app.include_router(search_router, prefix="/api/search")
app.include_router(music_router, prefix="/api/music")
app.include_router(logs_router, prefix="/api/logs")

# 挂载前端静态页面
app.mount("/data", StaticFiles(directory=data_dir), name="data")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

def run_server():
    # 修复核心：强制切换 Windows 下的 asyncio 事件循环策略，彻底消灭 10054 报错刷屏
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    logging.getLogger("asyncio").setLevel(logging.CRITICAL)  
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

# ==========================================
# 窗口事件：关闭时保存尺寸和位置
# ==========================================
def on_closing():
    global window
    try:
        # ❌ 删掉之前的 window.evaluate_js 和 time.sleep，它们是导致死锁的元凶！
        
        # 安全读取并保存窗口配置
        if window.x is not None and (window.x <= -30000 or window.y <= -30000 or window.width < 200):
            print("⚠️ 检测到窗口处于最小化，跳过保存尺寸，保护配置安全。")
            return
        
        with env_file_lock:
            from api.settings import update_env_key
            update_env_key("WINDOW_WIDTH", str(window.width))
            update_env_key("WINDOW_HEIGHT", str(window.height))
            if window.x is not None and window.y is not None:
                update_env_key("WINDOW_X", str(window.x))
                update_env_key("WINDOW_Y", str(window.y))
        print(f"💾 主窗口状态已保存: {window.width}x{window.height}")
    except Exception as e:
        print("保存窗口状态失败:", e)

# ==========================================
# 🚀 窗口事件 2：彻底销毁后 (核弹级退出，专门对付后台僵尸进程)
# ==========================================
def on_closed():
    print("🛑 窗口已彻底销毁，正在强制结束所有后台服务...")
    
    # 尝试安全释放键盘钩子 (防止系统级按键卡顿)
    try:
        import keyboard
        keyboard.unhook_all()
    except:
        pass
        
    try:
        kernel32 = ctypes.WinDLL('kernel32')
        kernel32.TerminateProcess(kernel32.GetCurrentProcess(), 0)
    except Exception:
        os._exit()
# ==========================================
# 窗口事件 3：窗口显示时，强制注入自定义图标
# ==========================================
def on_shown():
    try:
        icon_path = os.path.join(root_dir, "linnana-toolbox.ico")
        if not os.path.exists(icon_path):
            return
            
        hwnd = ctypes.windll.user32.FindWindowW(None, "麟雫雫的工具箱")
        if hwnd:
            ctypes.windll.user32.LoadImageW.restype = ctypes.c_void_p
            hicon = ctypes.windll.user32.LoadImageW(0, icon_path, 1, 0, 0, 0x0010)
            
            if hicon:
                ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, ctypes.c_void_p(hicon))
                ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, ctypes.c_void_p(hicon))
                print("✨ 窗口自定义图标注入成功！")
    except Exception as e:
        print(f"⚠️ 注入图标失败: {e}")

if __name__ == "__main__":

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    time.sleep(0.5)
    env_vars = dotenv_values(env_path)
    
    win_width = int(env_vars.get("WINDOW_WIDTH", 1000))
    win_height = int(env_vars.get("WINDOW_HEIGHT", 700))
    
    try:
        win_x = int(env_vars.get("WINDOW_X"))
        win_y = int(env_vars.get("WINDOW_Y"))
    except (TypeError, ValueError):
        win_x, win_y = None, None

    window = webview.create_window(
        title='麟雫雫的工具箱', url='http://127.0.0.1:8000',
        width=win_width, height=win_height, x=win_x, y=win_y, resizable=True
    )
    window.events.closing += on_closing
    window.events.closed += on_closed
    window.events.shown += on_shown
    webview.start(debug=True)