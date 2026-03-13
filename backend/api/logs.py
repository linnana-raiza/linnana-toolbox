import sys
import logging
import collections
from fastapi import APIRouter

router = APIRouter()

# 🚀 核心：使用 deque 保存最近的 1000 次输出，防止无限变大撑爆内存
log_buffer = collections.deque(maxlen=1000)

# ==========================================
# 🛡️ 优化 1：自定义 Logging Handler，精准捕获框架底层报错
# ==========================================
class DequeLogHandler(logging.Handler):
    """接管 FastAPI 和 Uvicorn 的标准 logging 输出"""
    def emit(self, record):
        try:
            msg = self.format(record)
            log_buffer.append(f"{msg}\n")
        except Exception:
            self.handleError(record)

# 配置日志格式并挂载
log_handler = DequeLogHandler()
log_handler.setFormatter(logging.Formatter('[%(levelname)s] %(message)s'))

# 将我们的拦截器挂载到根节点和 Uvicorn 的核心日志通道上
logging.getLogger().addHandler(log_handler)
logging.getLogger("uvicorn.error").addHandler(log_handler)
logging.getLogger("uvicorn.access").addHandler(log_handler)
logging.getLogger("fastapi").addHandler(log_handler)


# ==========================================
# 💥 优化 2：更安全的 print() 劫持，兼容原生终端与免安装环境
# ==========================================
class APILogStream:
    def __init__(self, original_stream, prefix=""):
        self.original_stream = original_stream  # 保存原生句柄，方便开发者看黑框调试
        self.prefix = prefix
        self.encoding = 'utf-8'
        
    def write(self, text):
        if text:
            # 过滤掉纯换行符的前缀附加
            if text.strip():
                log_buffer.append(f"{self.prefix}{str(text)}")
            else:
                log_buffer.append(str(text))
            
            # 安全地向原生终端输出（如果是 python-embed 无黑框模式，original_stream 可能是 None）
            if self.original_stream:
                try:
                    self.original_stream.write(text)
                    self.original_stream.flush()
                except Exception:
                    pass
            
    def flush(self):
        if self.original_stream:
            try:
                self.original_stream.flush()
            except Exception:
                pass
        
    def isatty(self):
        return False
        
    def fileno(self):
        return -1

# 劫持标准输出和错误输出
sys.stdout = APILogStream(sys.__stdout__)
sys.stderr = APILogStream(sys.__stderr__, prefix="❌ [系统报错] ")


# ==========================================
# 路由接口
# ==========================================
@router.get("/get-logs")
def get_logs():
    return {"logs": "".join(log_buffer)}