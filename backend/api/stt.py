import os
import time
import multiprocessing
import threading
import numpy as np
import sounddevice as sd
import keyboard
import pyperclip

from fastapi import APIRouter
from faster_whisper import WhisperModel
from config import env_path, root_dir
from dotenv import dotenv_values
from api.logs import log_buffer

router = APIRouter()

# ==========================================
# 🚀 核心：子进程推理函数
# ==========================================
def whisper_worker_process(input_queue, log_queue, model_size, device, compute_type, model_dir):
    def log(msg):
        # 将信息推送到跨进程队列
        log_queue.put(f"🧬 [STT子进程] {msg}\n")

    try:
        log(f"正在初始化模型 (Size: {model_size}, Device: {device})...")
        model = WhisperModel(
            model_size, 
            device=device, 
            compute_type=compute_type,
            download_root=model_dir
        )
        log("✅ 模型加载完毕，等待音频输入...")
        
        while True:
            audio_np = input_queue.get()
            if audio_np is None:
                break
                
            try:
                segments, _ = model.transcribe(
                    audio_np, 
                    beam_size=5, 
                    language="zh",
                    initial_prompt="这是一段简体中文的对话记录。"
                )
                text = "".join([segment.text for segment in segments]).strip()
                
                if text:
                    pyperclip.copy(text) 
                    log(f"📝 识别结果已复制: {text}") 
                    print("\a") # 系统提示音依然走 stdout
            except Exception as e:
                log(f"❌ 推理异常: {e}")
                
    except Exception as e:
        log(f"💥 致命错误: {e}")

# ==========================================
# 🎙️ STT 管理单例
# ==========================================
class STTManager:
    def __init__(self):
        self.worker_process = None
        self.input_queue = None
        self.log_queue = None
        self.is_running = False
        self.is_recording = False
        self.stream = None
        self.audio_data = []
        self.sample_rate = 16000
        
    def get_config(self):
        """实时从 .env 获取最新配置"""
        env_vars = dotenv_values(env_path)
        hotkey = env_vars.get("STT_HOTKEY", "f4").lower().strip("'\"")
        model_size = env_vars.get("STT_MODEL_SIZE", "base").strip("'\"")
        device = env_vars.get("STT_DEVICE", "cpu").strip("'\"").lower()
        
        # CPU 模式下强制使用 int8 量化以节省内存
        compute_type = "int8" if device == "cpu" else "default"
        return hotkey, model_size, device, compute_type

    def start_service(self):
        if self.is_running: return
        
        hotkey, model_size, device, compute_type = self.get_config()
        model_dir = os.path.join(root_dir, "models")
        os.makedirs(model_dir, exist_ok=True)

        # 1. 创建进程间通信队列
        self.input_queue = multiprocessing.Queue()
        self.log_queue = multiprocessing.Queue()

        def log_listener():
            while self.is_running:
                try:
                    msg = self.log_queue.get(timeout=1)
                    if msg: log_buffer.append(msg)
                except:
                    continue
        
        # 2. 启动推理子进程
        self.worker_process = multiprocessing.Process(
            target=whisper_worker_process,
            args=(self.input_queue, self.log_queue, model_size, device, compute_type, model_dir),
            daemon=True
        )
        self.worker_process.start()

        self.is_running = True
        threading.Thread(target=log_listener, daemon=True).start()
        
        # 3. 绑定全局快捷键 (需管理员权限)
        try:
            keyboard.on_press_key(hotkey, self.on_key_down)
            keyboard.on_release_key(hotkey, self.on_key_up)
            self.is_running = True
            print(f"✅ 语音转文字服务已就绪！长按 [{hotkey.upper()}] 说话。")
        except Exception as e:
            self.stop_service()
            print(f"❌ 快捷键绑定失败: {e}")
            raise RuntimeError(f"快捷键绑定失败，请尝试管理员身份运行。")

    def stop_service(self):
        """关闭服务并彻底抹除内存占用"""
        self.is_running = False
        
        # 1. 解除键盘钩子
        try:
            keyboard.unhook_all()
        except:
            pass
            
        # 2. 停止并销毁音频流
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except:
                pass
            self.stream = None

        # 3. 核心：强杀推理子进程
        if self.worker_process:
            print("🛑 正在关闭推理进程并物理回收内存...")
            # 发送 None 尝试优雅退出，若无响应则直接干掉
            try:
                self.input_queue.put(None) 
                self.worker_process.terminate() 
                self.worker_process.join(timeout=1)
            except:
                pass
            self.worker_process = None
            self.input_queue = None
            
        self.audio_data = []
        print("✨ 语音服务已完全卸载，内存已吐出。")

    def on_key_down(self, event):
        if not self.is_recording and self.is_running:
            self.start_recording()

    def on_key_up(self, event):
        if self.is_recording:
            self.stop_recording()

    def start_recording(self):
        self.is_recording = True
        self.audio_data = []
        print("🔴 录音中...")
        try:
            # blocksize 设置为采样率的 0.1s，确保跨平台稳定性
            self.stream = sd.InputStream(
                samplerate=self.sample_rate, 
                channels=1, 
                dtype='float32', 
                blocksize=int(self.sample_rate * 0.1),
                callback=self.audio_callback
            )
            self.stream.start()
        except Exception as e:
            print(f"❌ 麦克风启动失败: {e}")
            self.is_recording = False

    def stop_recording(self):
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
        
        print("⏳ 正在识别...")
        if self.audio_data and self.input_queue:
            # 合并音频片段并推送到子进程进行推理
            audio_np = np.concatenate(self.audio_data, axis=0).flatten()
            self.input_queue.put(audio_np)

    def audio_callback(self, indata, frames, time, status):
        if self.is_recording:
            # 限制最大录音时长（约 60 秒），防止内存溢出
            if len(self.audio_data) < 600:
                self.audio_data.append(indata.copy())
            else:
                self.stop_recording()

# 实例化单例
stt_manager = STTManager()

@router.post("/toggle")
def toggle_stt():
    if stt_manager.is_running:
        stt_manager.stop_service()
        return {"status": "stopped", "message": "服务已关闭"}
    else:
        try:
            stt_manager.start_service()
            return {"status": "started", "message": "服务已启动"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

@router.get("/status")
def get_stt_status():
    return {"is_running": stt_manager.is_running}