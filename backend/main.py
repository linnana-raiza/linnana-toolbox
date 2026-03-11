import os
import sys
import uvicorn
import webview
import threading
import time
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from dotenv import dotenv_values

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# 引入分离的路由和全局锁
from config import env_path, frontend_dir, env_file_lock
from api.todo import router as todo_router
from api.settings import router as settings_router, update_env_key
from api.apps import router as apps_router
from api.stt import router as stt_router
from api.search import router as search_router  # 新增导入搜索模块

app = FastAPI()

# ==========================================
# 路由注册
# ==========================================
app.include_router(settings_router)
app.include_router(todo_router, prefix="/api")
app.include_router(apps_router, prefix="/api/apps")
app.include_router(stt_router, prefix="/api/stt")
app.include_router(search_router, prefix="/api")  # 挂载搜索模块

# 挂载前端静态页面
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

# ==========================================
# 窗口事件：关闭时保存尺寸和位置
# ==========================================
def on_closing():
    global window
    try:
        if window.x is not None and (window.x <= -30000 or window.y <= -30000 or window.width < 200):
            print("⚠️ 检测到窗口处于最小化，跳过保存尺寸，保护配置安全。")
            return
        
        with env_file_lock:
            # 使用自研安全更新器，杜绝关闭窗口时破坏环境配置
            update_env_key("WINDOW_WIDTH", str(window.width))
            update_env_key("WINDOW_HEIGHT", str(window.height))
            if window.x is not None and window.y is not None:
                update_env_key("WINDOW_X", str(window.x))
                update_env_key("WINDOW_Y", str(window.y))
        print(f"💾 主窗口状态已保存: {window.width}x{window.height}")
    except Exception as e:
        print("保存窗口状态失败:", e)

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
    webview.start()