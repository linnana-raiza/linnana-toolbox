import os
import re
import shutil
import time
from fastapi import APIRouter, UploadFile, Form
from pydantic import BaseModel
from dotenv import dotenv_values

# 引入核心配置
from config import env_path, data_dir, env_file_lock

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
    with env_file_lock:
        if not os.path.exists(env_path):
            return settings
            
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
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
    with env_file_lock:
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
    live2d_dir = os.path.join(data_dir, "live2d")
    if not os.path.exists(live2d_dir):
        return models

    # 递归扫描 live2d 文件夹下的所有模型配置文件
    for root, dirs, files in os.walk(live2d_dir):
        for file in files:
            # 🚀 核心改动：同时兼容 .model.json (老版) 和 .model3.json (新版)
            if file.endswith(".model3.json") or file.endswith(".model.json"):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, data_dir).replace("\\", "/")  
                # 改动：计算当前文件夹 (root) 相对于 live2d 根目录的路径
                name = os.path.relpath(root, live2d_dir).replace("\\", "/")
                
                # 去重逻辑：防止同一个文件夹里既有 .model.json 又有 .model3.json 导致重复显示
                if not any(m["name"] == name for m in models):
                    models.append({"name": name, "path": rel_path})
                
    return models

# ==========================================
# 路由：保存设置与上传壁纸
# ==========================================
@router.post("/save-setting")
def save_setting(data: SettingData):
    with env_file_lock:
        update_env_key(data.key, data.value) # 抛弃 set_key，使用自研引擎
    os.environ[data.key] = data.value
    return {"message": f"{data.key} 已更新为 {data.value}"}

@router.post("/upload-wallpaper")
async def upload_wallpaper(file: UploadFile, wallpaper_type: str = Form(...)):
    # 强制统一名称：图片一律叫 wallpaper-static.jpg，视频一律叫 wallpaper-dynamic.mp4
    # 这样前端就不需要去读取任何名称了，直接死磕这两个路径
    new_filename = "wallpaper-static.jpg" if wallpaper_type == "static" else "wallpaper-dynamic.mp4"
    file_path = os.path.join(data_dir, new_filename) 
    
    # 直接写入！操作系统会自动覆盖旧的同名文件，连“删除旧文件”的垃圾回收逻辑都省了
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "壁纸已更新", "filename": new_filename}