import os
import json
import time
import subprocess
import hashlib
from fastapi import APIRouter, Body # 🚀 引入 Body
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

# 🚀 增强容错：如果文件不存在或为空(0字节)，写入标准的空 JSON 数组
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
    # 🚀 魔法时刻：使用原生 PowerShell 呼出文件选择框，彻底摆脱 tkinter 依赖
    ps_script = """
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "选择要添加到启动器的应用或文件"
    $dialog.Filter = "应用程序或快捷方式 (*.exe;*.bat;*.lnk)|*.exe;*.bat;*.lnk|所有文件 (*.*)|*.*"
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $dialog.FileName
    }
    """
    try:
        # creationflags=0x08000000 用于完全隐藏 PowerShell 运行时的黑框
        result = subprocess.run(
            ["powershell", "-Command", ps_script], 
            capture_output=True, 
            text=True, 
            creationflags=0x08000000
        )
        file_path = result.stdout.strip()
    except Exception as e:
        print(f"调用文件选择器失败: {e}")
        file_path = ""
        
    if not file_path:
        return {"status": "cancelled"}
        
    file_path = file_path.replace("/", "\\")
    name = os.path.splitext(os.path.basename(file_path))[0]
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
def save_apps(apps: list[AppItem]): # 🚀 启用 Pydantic 严格校验列表内部对象
    try:
        with open(APPS_JSON_PATH, "w", encoding="utf-8") as f:
            # model_dump() 会自动将 Pydantic 模型安全地转为字典
            json.dump([app.model_dump() for app in apps], f, ensure_ascii=False, indent=4)
        return {"status": "success"}
    except Exception as e:
        print(f"保存应用列表失败: {e}")
        return {"status": "error", "message": str(e)}