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
import json
import subprocess
import importlib.metadata
import re
import importlib.util
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from dotenv import dotenv_values

current_dir = os.path.dirname(os.path.abspath(__file__))
ADDS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "adds"))
os.makedirs(ADDS_DIR, exist_ok=True)
active_plugins = []
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# 引入分离的路由和全局锁
from config import env_path, frontend_dir, data_dir, root_dir, env_file_lock
from api.todo import router as todo_router
from api.settings import router as settings_router, update_env_key
from api.apps import router as apps_router
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
app.include_router(music_router, prefix="/api/music")
app.include_router(logs_router, prefix="/api/logs")

def setup_plugin_env(plugin_path, plugin_name):
    """处理插件依赖：动态扫描全局与局部环境，只下载真正缺失的库"""
    req_file = os.path.join(plugin_path, "requirements.txt")
    libs_dir = os.path.join(plugin_path, "libs")

    # 1. 优先挂载路径：让后续的检查和 import 都能同时覆盖全局和局部
    if os.path.exists(libs_dir) and libs_dir not in sys.path:
        sys.path.insert(0, libs_dir)

    # 2. 如果没有 requirements.txt，直接放行
    if not os.path.exists(req_file):
        return True

    # 3. 智能解析并探测环境
    missing_packages = []
    try:
        with open(req_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): 
                    continue
                
                # 正则提取纯包名 (剥离掉版本号，例如 "faster-whisper==1.0" -> "faster-whisper")
                match = re.match(r'^([A-Za-z0-9_\-]+)', line)
                if match:
                    pkg_name = match.group(1)
                    try:
                        # 🚀 核心：这行代码会同时扫描 python-embed 核心环境 和 插件的 libs 文件夹
                        importlib.metadata.version(pkg_name) 
                    except importlib.metadata.PackageNotFoundError:
                        # 只有两边都找不到，才加入待下载清单 (保留原来的完整版本号条件)
                        missing_packages.append(line)
    except Exception as e:
        print(f"⚠️ 解析依赖文件失败: {e}")
        return False

    # 4. 如果全都有了，毫秒级跳过
    if not missing_packages:
        return True

    # 5. 触发精准安装：只下载缺失的孤儿包
    pkg_names_only = [re.match(r'^([A-Za-z0-9_\-]+)', p).group(1) for p in missing_packages]
    print(f"📦 插件 [{plugin_name}] 正在补充下载缺失依赖: {', '.join(pkg_names_only)}")
    os.makedirs(libs_dir, exist_ok=True)

    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", 
            *missing_packages,              # 🚀 自动将列表展开为多个独立的包名参数
            "--target", libs_dir,           # 安装到局部文件夹
            "--disable-pip-version-check",  
            "--quiet",                       
            "-i", "https://pypi.tuna.tsinghua.edu.cn/simple" # 加载清华源，起飞！
        ])
        
        # 再次确保路径挂载 (针对第一次创建 libs 的情况)
        if libs_dir not in sys.path:
            sys.path.insert(0, libs_dir)
            
        print(f"✅ 插件 [{plugin_name}] 依赖装配完毕！")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ 插件 [{plugin_name}] 依赖下载失败: {e}")
        return False

def load_plugins(app):
    print("🔌 正在扫描插件目录...")
    for item in os.listdir(ADDS_DIR):
        plugin_path = os.path.join(ADDS_DIR, item)
        if os.path.isdir(plugin_path):
            manifest_path = os.path.join(plugin_path, "manifest.json")
            main_py_path = os.path.join(plugin_path, "main.py")
            frontend_path = os.path.join(plugin_path, "frontend")
            
            if os.path.exists(manifest_path):
                try:
                    with open(manifest_path, 'r', encoding='utf-8') as f:
                        manifest = json.load(f)
                        manifest['id'] = item
                        plugin_name = manifest.get('name', item) # 加个兜底，防止没有 name
                    
                    # 🔥 核心插入点：先配置并安装依赖，只有成功了才加载后端代码
                    env_ready = setup_plugin_env(plugin_path, plugin_name)
                    
                    if env_ready and os.path.exists(main_py_path):
                        # ... 原本的动态加载后端路由代码
                        spec = importlib.util.spec_from_file_location(f"plugin_{item}", main_py_path)
                        module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(module)
                        
                        if hasattr(module, 'router'):
                            app.include_router(module.router, prefix=f"/api/adds/{item}", tags=[f"插件: {plugin_name}"])
                    
                    # ... 原本的动态挂载前端静态文件代码 (保持不变)
                    if os.path.exists(frontend_path):
                        app.mount(f"/adds_static/{item}", StaticFiles(directory=frontend_path), name=f"static_{item}")
                        manifest['entry_url'] = f"/adds_static/{item}/index.html"
                    else:
                        manifest['entry_url'] = None
                        
                    active_plugins.append(manifest)
                    print(f"✅ 成功加载插件: {plugin_name}")
                    
                except Exception as e:
                    print(f"❌ 加载插件 {item} 失败: {e}")
load_plugins(app)
@app.get("/api/plugins/list")
def get_plugins_list():
    return active_plugins

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