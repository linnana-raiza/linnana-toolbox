import os
from fastapi import APIRouter
from config import data_dir

router = APIRouter()

MUSIC_DIR = os.path.join(data_dir, "music")
os.makedirs(MUSIC_DIR, exist_ok=True)

@router.get("/list")
def get_music_list():
    """按文件夹分组扫描音乐列表"""
    supported_exts = {'.mp3', '.wav', '.flac', '.ogg', '.m4a'}
    # 数据结构变成字典：{"文件夹名": [{"name": "歌名", "url": "路径"}]}
    playlists = {"默认列表": []} 
    
    if not os.path.exists(MUSIC_DIR):
        return playlists

    try:
        with os.scandir(MUSIC_DIR) as entries:
            for entry in entries:
                if entry.is_file():
                    name, ext = os.path.splitext(entry.name)
                    if ext.lower() in supported_exts:
                        playlists["默认列表"].append({
                            "name": name,
                            "url": f"/data/music/{entry.name}"
                        })
                elif entry.is_dir():
                    playlist_name = entry.name
                    playlists[playlist_name] = []
                    # 往下一级扫描子文件夹
                    with os.scandir(entry.path) as sub_entries:
                        for sub_entry in sub_entries:
                            if sub_entry.is_file():
                                sub_name, sub_ext = os.path.splitext(sub_entry.name)
                                if sub_ext.lower() in supported_exts:
                                    playlists[playlist_name].append({
                                        "name": sub_name,
                                        # 组装嵌套的 URL
                                        "url": f"/data/music/{playlist_name}/{sub_entry.name}"
                                    })
                    # 如果扫描发现这个文件夹里没歌，直接踢掉，不让它在前端显示
                    if not playlists[playlist_name]:
                        del playlists[playlist_name]
                        
        # 如果根目录下没有散落的歌曲，并且存在其他子文件夹，就把空的“默认列表”隐藏
        if not playlists["默认列表"] and len(playlists) > 1:
            del playlists["默认列表"]
            
    except Exception as e:
        print(f"⚠️ 扫描音乐目录异常: {e}")
                
    return playlists