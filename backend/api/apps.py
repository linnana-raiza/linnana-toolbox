import os
import json
import time
import subprocess
import hashlib
import ctypes
import asyncio
from ctypes import wintypes
from fastapi import APIRouter
from pydantic import BaseModel

# 引入核心配置
from config import root_dir

router = APIRouter()

class AppItem(BaseModel):
    id: int
    name: str
    path: str
    icon: str

# 初始化数据与图标存储目录
DATA_DIR = os.path.join(root_dir, "data")
APPS_JSON_PATH = os.path.join(DATA_DIR, "apps.json")
ICONS_DIR = os.path.join(DATA_DIR, "icons")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(ICONS_DIR, exist_ok=True)

def init_apps_json():
    if not os.path.exists(APPS_JSON_PATH) or os.path.getsize(APPS_JSON_PATH) == 0:
        with open(APPS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump([], f)

init_apps_json()

def extract_icon(file_path: str) -> str:
    path_hash = hashlib.md5(file_path.encode('utf-8')).hexdigest()
    icon_filename = f"icon_{path_hash}.png"
    icon_save_path = os.path.join(ICONS_DIR, icon_filename)
    
    if os.path.exists(icon_save_path):
        return f"icons/{icon_filename}"
        
    if os.path.isdir(file_path):
        return "folder"

    try:
        ps_script = f"""
        Add-Type -AssemblyName System.Drawing
        try {{
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{file_path}')
            $icon.ToBitmap().Save('{icon_save_path}', [System.Drawing.Imaging.ImageFormat]::Png)
        }} catch {{ exit 1 }}
        """
    
        result = subprocess.run(
            [
                "powershell", 
                "-NoProfile", 
                "-NonInteractive", 
                "-WindowStyle", "Hidden", 
                "-Command", ps_script
            ], 
            capture_output=True, 
            creationflags=0x08000000,
            timeout=2 
        )
        
        if result.returncode == 0 and os.path.exists(icon_save_path):
            return f"icons/{icon_filename}"
            
    except subprocess.TimeoutExpired:
        print(f"⚠️ 提取图标超时，已降级为默认图标 (可能文件路径在休眠的网络盘上): {file_path}")
    except Exception as e:
        print(f"❌ 提取图标失败: {e}")
        
    return "default"

def _open_file_dialog():
    class OPENFILENAMEW(ctypes.Structure):
        _fields_ = [
            ("lStructSize", wintypes.DWORD),
            ("hwndOwner", wintypes.HWND),
            ("hInstance", wintypes.HINSTANCE),
            ("lpstrFilter", wintypes.LPCWSTR),
            ("lpstrCustomFilter", wintypes.LPWSTR),
            ("nMaxCustFilter", wintypes.DWORD),
            ("nFilterIndex", wintypes.DWORD),
            ("lpstrFile", wintypes.LPWSTR),
            ("nMaxFile", wintypes.DWORD),
            ("lpstrFileTitle", wintypes.LPWSTR),
            ("nMaxFileTitle", wintypes.DWORD),
            ("lpstrInitialDir", wintypes.LPCWSTR),
            ("lpstrTitle", wintypes.LPCWSTR),
            ("Flags", wintypes.DWORD),
            ("nFileOffset", wintypes.WORD),
            ("nFileExtension", wintypes.WORD),
            ("lpstrDefExt", wintypes.LPCWSTR),
            ("lCustData", wintypes.LPARAM),
            ("lpfnHook", ctypes.c_void_p),
            ("lpTemplateName", wintypes.LPCWSTR),
            ("pvReserved", ctypes.c_void_p),
            ("dwReserved", wintypes.DWORD),
            ("FlagsEx", wintypes.DWORD)
        ]

    ofn = OPENFILENAMEW()
    ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
    
    ofn.lpstrFilter = "应用程序或快捷方式 (*.exe;*.bat;*.lnk)\0*.exe;*.bat;*.lnk\0所有文件 (*.*)\0*.*\0\0"
    ofn.lpstrTitle = "选择要添加到启动器的应用或文件"
    
    file_buffer = ctypes.create_unicode_buffer(260)
    ofn.lpstrFile = ctypes.cast(file_buffer, wintypes.LPWSTR)
    ofn.nMaxFile = 260
    
    # OFN_NOCHANGEDIR (0x00000008) 防止文件选择器改变 Python 工作目录
    ofn.Flags = 0x00080000 | 0x00001000 | 0x00000008 

    if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
        return file_buffer.value
    return ""

@router.get("/list")
def get_apps():
    try:
        with open(APPS_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"读取列表异常: {e}")
        return []

@router.get("/pick-file")
async def pick_file():
    # 丢进线程池执行 Windows UI 交互，防阻塞
    file_path = await asyncio.to_thread(_open_file_dialog)
        
    if not file_path:
        return {"status": "cancelled"}
        
    file_path = file_path.replace("/", "\\")
    name = os.path.splitext(os.path.basename(file_path))[0]
    
    # 丢进线程池执行 PowerShell 图标提取，防阻塞
    icon_path = await asyncio.to_thread(extract_icon, file_path)
    
    return {
        "status": "success",
        "app": {
            "id": int(time.time() * 1000),
            "name": name,
            "path": file_path,
            "icon": icon_path
        }
    }

@router.post("/save")
def save_apps(apps: list[AppItem]):
    try:
        # 1. 读取修改前的旧 JSON，提取所有使用中的图标
        old_icons = set()
        if os.path.exists(APPS_JSON_PATH):
            with open(APPS_JSON_PATH, "r", encoding="utf-8") as f:
                try:
                    old_apps = json.load(f)
                    # 过滤掉 folder 和 default，只提取真实存在的本地图片
                    old_icons = {a.get("icon") for a in old_apps if a.get("icon") and a.get("icon").startswith("icons/")}
                except:
                    pass
                    
        # 2. 提取当前打算保存的新图标集合
        new_icons = {a.icon for a in apps if a.icon and a.icon.startswith("icons/")}
        
        # 3. 核心：计算差集。找出被彻底抛弃的废弃图标，并进行物理删除
        orphans = old_icons - new_icons
        for icon in orphans:
            icon_path = os.path.join(DATA_DIR, icon)
            if os.path.exists(icon_path):
                try:
                    os.remove(icon_path)
                    print(f"🗑️ 已自动清理废弃图标文件: {icon}")
                except Exception as e:
                    print(f"⚠️ 清理图标失败 {icon}: {e}")

        # 4. 安全覆盖新的配置 JSON
        with open(APPS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump([app.model_dump() for app in apps], f, ensure_ascii=False, indent=4)
            
        return {"status": "success"}
    except Exception as e:
        print(f"❌ 保存应用列表失败: {e}")
        return {"status": "error", "message": str(e)}