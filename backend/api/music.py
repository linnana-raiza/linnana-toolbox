import os
from fastapi import APIRouter
from config import data_dir

router = APIRouter()

# 定义音乐文件夹路径
MUSIC_DIR = os.path.join(data_dir, "music")
# 启动时自动创建 music 文件夹
os.makedirs(MUSIC_DIR, exist_ok=True)

@router.get("/list")
def get_music_list():
    """扫描并返回音乐列表"""
    supported_exts = {'.mp3', '.wav', '.flac', '.ogg', '.m4a'}
    music_list = []
    
    if os.path.exists(MUSIC_DIR):
        for file in os.listdir(MUSIC_DIR):
            ext = os.path.splitext(file)[1].lower()
            if ext in supported_exts:
                music_list.append({
                    "name": os.path.splitext(file)[0], # 歌名（去后缀）
                    "url": f"/data/music/{file}"       # 前端访问路径
                })
                
    return music_list