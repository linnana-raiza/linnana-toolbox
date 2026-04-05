import os
import re
import shutil
from fastapi import APIRouter, UploadFile, Form
from pydantic import BaseModel
from typing import List

# 引入核心配置
from config import env_path, data_dir, env_file_lock

router = APIRouter()

class SettingData(BaseModel):
    key: str
    value: str

# 动态计算 adds 插件目录的绝对路径
ADDS_DIR = os.path.abspath(os.path.join(data_dir, "..", "adds"))

# ==========================================
# 🚀 核心引擎 0：智能反向寻址 (查找 Key 所在的 .env 文件)
# ==========================================
def find_env_file_for_key(key: str) -> str:
    """自动扫描全局，找到这个 key 到底属于主程序还是哪个插件"""
    # 1. 优先检查主程序 .env
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            if any(re.match(rf'^{key}=', line) for line in f):
                return env_path
                
    # 2. 遍历扫描所有插件目录下的 .env
    if os.path.exists(ADDS_DIR):
        for plugin_folder in os.listdir(ADDS_DIR):
            plugin_env = os.path.join(ADDS_DIR, plugin_folder, ".env")
            if os.path.exists(plugin_env):
                with open(plugin_env, 'r', encoding='utf-8') as f:
                    if any(re.match(rf'^{key}=', line) for line in f):
                        return plugin_env
                        
    # 3. 如果是个全新的 key，默认保存到主程序 .env
    return env_path

# ==========================================
# 核心引擎 1：精准更新 .env 文件并永远保留注释
# ==========================================
def update_env_key(key: str, value: str, target_env_path: str):
    if not os.path.exists(target_env_path):
        return
        
    with open(target_env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    updated = False
    for line in lines:
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
        
    with open(target_env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)


def update_env_keys_batch(updates_dict: dict, target_env_path: str):
    if not os.path.exists(target_env_path):
        return
        
    with open(target_env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    updated_keys = set()
    
    for line in lines:
        match = re.match(r'^([A-Za-z0-9_]+)=([\'"]?)(.*?)\2(\s+#.*)?$', line.strip('\n'))
        if match:
            key = match.group(1)
            if key in updates_dict:
                quote = match.group(2) or "'"  
                comment = match.group(4) or "" 
                new_value = updates_dict[key]
                new_lines.append(f"{key}={quote}{new_value}{quote}{comment}\n")
                updated_keys.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
            
    for key, value in updates_dict.items():
        if key not in updated_keys:
            new_lines.append(f"{key}='{value}'\n")
            
    with open(target_env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

# ==========================================
# 路由：批量保存设置 (支持跨文件混合保存)
# ==========================================
@router.post("/save-settings-batch")
def save_settings_batch(settings: List[SettingData]):
    if not settings:
        return {"message": "无更新内容"}
        
    updates_by_file = {}
    with env_file_lock:
        for item in settings:
            # 自动寻找归属文件
            target_file = find_env_file_for_key(item.key)
            if target_file not in updates_by_file:
                updates_by_file[target_file] = {}
            updates_by_file[target_file][item.key] = item.value
            os.environ[item.key] = item.value # 同步内存
            
        # 分组批量写入对应文件
        for target_file, updates in updates_by_file.items():
            update_env_keys_batch(updates, target_file)
            
    return {"message": f"成功批量更新 {len(settings)} 项配置"}

@router.post("/save-setting")
def save_setting(data: SettingData):
    with env_file_lock:
        target_file = find_env_file_for_key(data.key)
        update_env_key(data.key, data.value, target_file)
    os.environ[data.key] = data.value
    return {"message": f"{data.key} 已更新为 {data.value}"}

# ==========================================
# 核心引擎 2：获取所有设置（穿透扫描所有插件，供全局状态读取）
# ==========================================
@router.get("/get-all-settings")
def get_all_settings():
    settings = {}
    
    def read_env_to_dict(filepath):
        if not os.path.exists(filepath): return
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                match = re.match(r'^([A-Za-z0-9_]+)=([\'"]?)(.*?)\2(?:\s+#.*)?$', line)
                if match:
                    settings[match.group(1)] = match.group(3)

    with env_file_lock:
        # 1. 读主程序
        read_env_to_dict(env_path)
        # 2. 读所有插件
        if os.path.exists(ADDS_DIR):
            for plugin_folder in os.listdir(ADDS_DIR):
                plugin_env = os.path.join(ADDS_DIR, plugin_folder, ".env")
                read_env_to_dict(plugin_env)
                
    return settings

# ==========================================
# 核心引擎 3：动态解析 .env 生成 UI 结构 (支持多文件)
# ==========================================
def parse_env_to_schema(target_env_path, is_plugin=False):
    schema = []
    current_category = None
    if not os.path.exists(target_env_path): return schema
    
    with open(target_env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            cat_match = re.match(r'^##\s+(.+?)\s+BEGIN(?:\s+#\s*(.*))?$', line)
            if cat_match:
                cat_name = cat_match.group(1).strip()
                if is_plugin:
                    cat_name = f"🧩 {cat_name}" # 插件前缀标识
                current_category = {
                    "category_name": cat_name,
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

@router.get("/get-settings-schema")
def get_settings_schema():
    schema = []
    with env_file_lock:
        # 1. 解析主程序 .env
        schema.extend(parse_env_to_schema(env_path, is_plugin=False))
        
        # 2. 解析所有插件下的 .env
        if os.path.exists(ADDS_DIR):
            for plugin_folder in os.listdir(ADDS_DIR):
                plugin_env = os.path.join(ADDS_DIR, plugin_folder, ".env")
                if os.path.exists(plugin_env):
                    schema.extend(parse_env_to_schema(plugin_env, is_plugin=True))
                    
    return schema

# ==========================================
# 其他路由保持不变
# ==========================================
@router.get("/get-live2d-models")
def get_live2d_models():
    models = []
    live2d_dir = os.path.join(data_dir, "live2d")
    if not os.path.exists(live2d_dir): return models

    for root, dirs, files in os.walk(live2d_dir):
        for file in files:
            if file.endswith(".model3.json") or file.endswith(".model.json"):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, data_dir).replace("\\", "/")  
                name = os.path.relpath(root, live2d_dir).replace("\\", "/")
                
                if not any(m["name"] == name for m in models):
                    models.append({"name": name, "path": rel_path})
                
    return models

@router.post("/upload-wallpaper")
async def upload_wallpaper(file: UploadFile, wallpaper_type: str = Form(...)):
    new_filename = "wallpaper-static.jpg" if wallpaper_type == "static" else "wallpaper-dynamic.mp4"
    file_path = os.path.join(data_dir, new_filename) 
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "壁纸已更新", "filename": new_filename}