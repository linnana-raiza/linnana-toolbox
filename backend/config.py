### 专门用来存放所有模块都需要共享的路径变量和线程锁，避免相互引用造成的循环导入报错。 ###
import os
import threading
from dotenv import load_dotenv

# ==========================================
# 全局路径配置
# ==========================================
backend_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(backend_dir)
frontend_dir = os.path.join(root_dir, "frontend")
data_dir = os.path.join(root_dir, "data")
env_path = os.path.join(root_dir, ".env")

# 确保 assets 文件夹存在并加载 .env
os.makedirs(data_dir, exist_ok=True)
load_dotenv(env_path)

# ==========================================
# 全局文件锁 (用于解决并发写入 .env 时的 WinError 5)
# ==========================================
env_file_lock = threading.Lock()