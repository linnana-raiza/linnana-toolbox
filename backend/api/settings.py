import os
import re
import shutil
import time
from fastapi import APIRouter, UploadFile, Form
from pydantic import BaseModel

# 引入核心配置
from config import env_path, assets_dir, env_file_lock

router = APIRouter()

class SettingData(BaseModel):
    key: str
    value: str

# ==========================================
# 核心引擎 1：精准更新 .env 文件并永远保留注释
# ==========================================
# 修改 settings.py 中的 update_env_key 函数
def update_env_key(key: str, value: str):
    if not os.path.exists(env_path):
        return
        
    with open(env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    updated = False
    for line in lines:
        # 🚀 核心优化：使用 (\s+#.*)? 更加精确地分离出纯净的值和尾部注释
        match = re.match(r'^([A-Za-z0-9_]+)=([\'"]?)(.*?)\2(\s+#.*)?$', line.strip('\n'))
        if match and match.group(1) == key:
            quote = match.group(2) or "'"  
            comment = match.group(4) or "" 
            new_lines.append(f"{key}={quote}{value}{quote}{comment}\n")
            updated = True
        else:
            new_lines.append(line)
            
    if not updated:
        new_lines.append(f"{key}='{value}'\n")
        
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

# ==========================================
# 核心引擎 2：获取所有设置（自动过滤掉外壳引号和注释，直供前端）
# ==========================================
@router.get("/get-all-settings")
def get_all_settings():
    settings = {}
    if not os.path.exists(env_path):
        return settings
        
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # 只提取纯净的 Value 值，抛弃后面的 # 注释
            match = re.match(r'^([A-Za-z0-9_]+)=([\'"]?)(.*?)\2(?:\s+#.*)?$', line)
            if match:
                settings[match.group(1)] = match.group(3)
    return settings

# ==========================================
# 动态解析 .env 生成 UI 结构
# ==========================================
@router.get("/get-settings-schema")
def get_settings_schema():
    schema = []
    current_category = None
    if not os.path.exists(env_path): return schema

    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            cat_match = re.match(r'^##\s+(.+?)\s+BEGIN(?:\s+#\s*(.*))?$', line)
            if cat_match:
                current_category = {
                    "category_name": cat_match.group(1).strip(),
                    "category_desc": cat_match.group(2).strip() if cat_match.group(2) else "",
                    "settings": []
                }
                continue

            if re.match(r'^##\s+(.+?)\s+END$', line):
                if current_category:
                    schema.append(current_category)
                    current_category = None
                continue

            kv_match = re.match(r'^([A-Za-z0-9_]+)=[\'"]?(.*?)[\'"]?(?:\s+#\s*(.*))?$', line)
            if kv_match and current_category is not None:
                schema_key = kv_match.group(1)
                schema_value = kv_match.group(2)
                schema_desc = kv_match.group(3).strip() if kv_match.group(3) else "暂无描述"
                current_category["settings"].append({
                    "key": schema_key, "value": schema_value, "description": schema_desc
                })

    if current_category and len(current_category["settings"]) > 0:
        schema.append(current_category)
    return schema

# ==========================================
# 自动扫描并获取所有 Live2D 模型列表 (完美兼容 Cubism 2 & 3/4)
# ==========================================
@router.get("/get-live2d-models")
def get_live2d_models():
    models = []
    live2d_dir = os.path.join(assets_dir, "live2d")
    if not os.path.exists(live2d_dir):
        return models

    # 递归扫描 live2d 文件夹下的所有模型配置文件
    for root, dirs, files in os.walk(live2d_dir):
        for file in files:
            # 🚀 核心改动：同时兼容 .model.json (老版) 和 .model3.json (新版)
            if file.endswith(".model3.json") or file.endswith(".model.json"):
                full_path = os.path.join(root, file)
                # 获取相对于 assets 的相对路径 (前端需要这个)
                rel_path = os.path.relpath(full_path, assets_dir).replace("\\", "/")
                # 拿模型所在的文件夹名字作为展示名称
                name = os.path.basename(os.path.dirname(full_path))
                
                # 去重逻辑：防止同一个文件夹里既有 .model.json 又有 .model3.json 导致重复显示
                if not any(m["name"] == name for m in models):
                    models.append({"name": name, "path": rel_path})
                
    return models

# ==========================================
# 路由：保存设置与上传壁纸 (使用自研更新器)
# ==========================================
@router.post("/save-setting")
def save_setting(data: SettingData):
    with env_file_lock:
        update_env_key(data.key, data.value) # 抛弃 set_key，使用自研引擎
    os.environ[data.key] = data.value
    return {"message": f"{data.key} 已更新为 {data.value}"}

@router.post("/upload-wallpaper")
async def upload_wallpaper(file: UploadFile, wallpaper_type: str = Form(...)):
    ext = os.path.splitext(file.filename)[1]
    new_filename = f"wallpaper_{int(time.time())}{ext}"
    file_path = os.path.join(assets_dir, new_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    env_key = "STATIC_WALLPAPER" if wallpaper_type == "static" else "DYNAMIC_WALLPAPER"
    
    with env_file_lock:
        update_env_key(env_key, new_filename) # 抛弃 set_key，使用自研引擎
    os.environ[env_key] = new_filename
        
    return {"message": "上传成功", "filename": new_filename}