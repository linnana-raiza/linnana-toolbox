import os
import json
import time
import subprocess
import hashlib
import ctypes
from ctypes import wintypes
from fastapi import APIRouter
from pydantic import BaseModel

# 引入核心配置
from config import root_dir, assets_dir

router = APIRouter()

class AppItem(BaseModel):
    id: int
    name: str
    path: str
    icon: str

# 初始化数据与图标存储目录
DATA_DIR = os.path.join(root_dir, "data")
APPS_JSON_PATH = os.path.join(DATA_DIR, "apps.json")
ICONS_DIR = os.path.join(assets_dir, "icons")

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

    # 提取图标依然保留 PowerShell 方案
    # 因为在没有第三方库(如 Pillow)的情况下，用 C API 提取图标并转存 PNG 极其复杂。
    # 用户选完文件后，在这里等 0.5 秒提取图标，在 UX 体验上是完全可以接受的（属于"处理中"的合理预期）。
    try:
        ps_script = f"""
        Add-Type -AssemblyName System.Drawing
        try {{
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{file_path}')
            $icon.ToBitmap().Save('{icon_save_path}', [System.Drawing.Imaging.ImageFormat]::Png)
        }} catch {{ exit 1 }}
        """
        result = subprocess.run(["powershell", "-Command", ps_script], capture_output=True, creationflags=0x08000000)
        
        if result.returncode == 0 and os.path.exists(icon_save_path):
            return f"icons/{icon_filename}"
    except Exception as e:
        print(f"提取图标失败: {e}")
        
    return "default"

@router.get("/list")
def get_apps():
    try:
        with open(APPS_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"读取列表异常: {e}")
        return []

@router.get("/pick-file")
def pick_file():
    # 🚀 性能革命：使用 ctypes 直接调用 Windows 原生 API (GetOpenFileNameW)
    
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
    
    # 🚀 修复核心：独立创建 buffer 变量，并通过 ctypes.cast 转换为指针类型赋给结构体
    file_buffer = ctypes.create_unicode_buffer(260)
    ofn.lpstrFile = ctypes.cast(file_buffer, wintypes.LPWSTR)
    ofn.nMaxFile = 260
    
    # OFN_NOCHANGEDIR (0x00000008) 防止文件选择器改变 Python 工作目录
    ofn.Flags = 0x00080000 | 0x00001000 | 0x00000008 

    file_path = ""
    # 调用系统对话框
    if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
        # 🚀 修复核心：从我们刚刚保留的 file_buffer 中读取最终的路径字符串
        file_path = file_buffer.value
        
    if not file_path:
        return {"status": "cancelled"}
        
    file_path = file_path.replace("/", "\\")
    name = os.path.splitext(os.path.basename(file_path))[0]
    
    # 选定文件后，提取图标
    icon_path = extract_icon(file_path)
    
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
        with open(APPS_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump([app.model_dump() for app in apps], f, ensure_ascii=False, indent=4)
        return {"status": "success"}
    except Exception as e:
        print(f"保存应用列表失败: {e}")
        return {"status": "error", "message": str(e)}