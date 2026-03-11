### 专门处理 Everything 的 SDK 加载、搜索逻辑以及系统打开文件的功能 ###
import os
import ctypes
import subprocess  # 🔥 新增：用于处理可执行文件的工作目录
from fastapi import APIRouter
from pydantic import BaseModel
from config import backend_dir

router = APIRouter()

# ==========================================
# Everything SDK 配置
# ==========================================
dll_path = os.path.join(backend_dir, "lib", "Everything64.dll")

try:
    everything = ctypes.WinDLL(dll_path)
    everything.Everything_SetSearchW.argtypes = [ctypes.c_wchar_p]
    everything.Everything_GetResultFileNameW.argtypes = [ctypes.c_int]
    everything.Everything_GetResultFileNameW.restype = ctypes.c_wchar_p
    everything.Everything_GetResultPathW.argtypes = [ctypes.c_int]
    everything.Everything_GetResultPathW.restype = ctypes.c_wchar_p
    
    EVERYTHING_REQUEST_FILE_NAME = 0x00000001
    EVERYTHING_REQUEST_PATH = 0x00000002
    EVERYTHING_OK = True
except Exception as e:
    print(f"⚠️ Everything DLL 加载失败: {e}。搜索功能将被禁用。")
    EVERYTHING_OK = False

class FileOpenData(BaseModel):
    path: str

# ==========================================
# 路由接口
# ==========================================
@router.get("/search")
async def perform_search(q: str, limit: int = 15):
    if not EVERYTHING_OK:
        return {"error": "Everything 服务未就绪"}
        
    everything.Everything_SetSearchW(q)
    everything.Everything_SetRequestFlags(EVERYTHING_REQUEST_FILE_NAME | EVERYTHING_REQUEST_PATH)
    everything.Everything_SetMax(limit)
    everything.Everything_QueryW(True)
    
    num_results = everything.Everything_GetNumResults()
    results = []
    for i in range(num_results):
        filename = everything.Everything_GetResultFileNameW(i)
        path = everything.Everything_GetResultPathW(i)
        results.append({"filename": filename, "path": path})
        
    return results

# 🔥 完美移植 main.py 中带工作目录修复的版本
@router.post("/open-file")
async def open_local_file(data: FileOpenData):
    try:
        if os.path.exists(data.path):
            ext = os.path.splitext(data.path)[1].lower()
            work_dir = os.path.dirname(data.path) # 获取程序所在的真实目录
            
            # 针对可执行文件，使用 subprocess 强制指定工作目录 (cwd)
            if ext in ['.exe', '.bat', '.cmd']:
                subprocess.Popen(
                    [data.path], 
                    cwd=work_dir, 
                    shell=(ext != '.exe') # bat和cmd需要shell环境
                )
            else:
                # 针对普通文件、文件夹或 .lnk 快捷方式，使用系统默认行为
                os.startfile(data.path)
                
            print(f"✅ 已调用系统程序打开: {data.path} (工作目录: {work_dir})")
            return {"status": "success", "message": "文件已打开"}
        else:
            return {"status": "error", "message": "文件不存在或已被移动"}
    except Exception as e:
        print(f"❌ 打开文件失败: {e}")
        return {"status": "error", "message": str(e)}