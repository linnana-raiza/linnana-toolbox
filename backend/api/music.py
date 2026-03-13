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
    """扫描并返回音乐列表 (🚀 高性能 I/O 优化与防爆破版)"""
    supported_exts = {'.mp3', '.wav', '.flac', '.ogg', '.m4a'}
    music_list = []
    
    if os.path.exists(MUSIC_DIR):
        try:
            # 尝试使用高性能的 scandir 遍历
            with os.scandir(MUSIC_DIR) as entries:
                for entry in entries:
                    # 严谨防御：只处理真正的文件，忽略文件夹和系统级隐藏文件
                    if entry.is_file():
                        name, ext = os.path.splitext(entry.name)
                        if ext.lower() in supported_exts:
                            music_list.append({
                                "name": name, # 歌名（去后缀）
                                "url": f"/data/music/{entry.name}" # 前端访问路径
                            })
        except Exception as e:
            print(f"⚠️ 高性能扫描音乐目录遇到阻碍: {e}，正在降级为安全模式扫描...")
            # 兜底抢救：如果底层 I/O 报错，降级回最基础的 listdir 确保功能可用
            for file in os.listdir(MUSIC_DIR):
                ext = os.path.splitext(file)[1].lower()
                if ext in supported_exts:
                    music_list.append({
                        "name": os.path.splitext(file)[0],
                        "url": f"/data/music/{file}"
                    })
                
    return music_list