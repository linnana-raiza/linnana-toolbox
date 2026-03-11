import os
import threading
import gc  # 🚀 新增：垃圾回收模块
import time
import numpy as np
import sounddevice as sd
import keyboard
import pyperclip

from fastapi import APIRouter
from pydantic import BaseModel
from faster_whisper import WhisperModel
from config import env_path, root_dir
from dotenv import dotenv_values

router = APIRouter()

class STTManager:
    def __init__(self):
        self.model = None
        self.is_running = False
        self.is_recording = False
        self.is_transcribing = False # 🚀 新增：推理状态锁
        self.stream = None
        self.audio_data = []
        self.sample_rate = 16000
        
    def get_config(self):
        env_vars = dotenv_values(env_path)
        hotkey = env_vars.get("STT_HOTKEY", "f4").lower().strip("'\"")
        model_size = env_vars.get("STT_MODEL_SIZE", "base").strip("'\"")
        device = env_vars.get("STT_DEVICE", "cpu").strip("'\"").lower()
        
        compute_type = "int8" if device == "cpu" else "default"
        return hotkey, model_size, device, compute_type

    def start_service(self):
        if self.is_running: return
        
        hotkey, model_size, device, compute_type = self.get_config()
        print(f"🎙️ 正在加载 Faster-Whisper ({model_size}) 模型，运行设备: [{device.upper()}] ...")
        
        if self.model is None:
            # 🚀 新增：定义工具箱目录下的模型专属文件夹
            model_dir = os.path.join(root_dir, "models")
            os.makedirs(model_dir, exist_ok=True) # 如果没有这个文件夹就自动创建
            
            # 🚀 新增：通过 download_root 强制改变下载和读取路径
            self.model = WhisperModel(
                model_size, 
                device=device, 
                compute_type=compute_type,
                download_root=model_dir  # 👈 魔法参数在这里！
            )
            
        self.is_running = True
        
        keyboard.on_press_key(hotkey, self.on_key_down)
        keyboard.on_release_key(hotkey, self.on_key_up)
        print(f"✅ 语音转文字服务已就绪！长按 [{hotkey.upper()}] 开始说话。")

    def stop_service(self):
        if not self.is_running: return
        
        # 1. 先把运行状态标为 False，阻止新的录音，并解绑快捷键
        self.is_running = False
        try:
            keyboard.unhook_all()
        except Exception as e:
            print(f"⚠️ 解绑快捷键时出现小错误: {e}")
            
        print("🛑 正在准备关闭语音服务...")

        # 🚀 核心防闪退修复：如果后台还在推理，强制等待它算完，绝不能现在拔电源
        while getattr(self, 'is_transcribing', False):
            print("⏳ 正在等待最后一句语音识别完成，以安全释放模型...")
            time.sleep(0.2)
            
        # 🚀 修复2：强制结束可能还在活跃的麦克风流
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        # 2. 现在确认没有任何人在使用模型了，安全销毁
        if self.model is not None:
            del self.model
            self.model = None
            gc.collect() # 呼叫 Python 垃圾回收器清理现场
            
        print("✅ 语音服务已安全关闭，模型已从内存/显存中彻底卸载。")

    def on_key_down(self, event):
        # 只有在没有录音且服务运行中，才开始录音
        if not self.is_recording and self.is_running:
            self.start_recording()

    def on_key_up(self, event):
        # 松开按键时停止录音并触发识别
        if self.is_recording:
            self.stop_recording()

    def start_recording(self):
        self.is_recording = True
        self.audio_data = []
        print("🔴 正在聆听...")
        self.stream = sd.InputStream(samplerate=self.sample_rate, channels=1, dtype='float32', callback=self.audio_callback)
        self.stream.start()

    def stop_recording(self):
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
        print("⏳ 正在识别...")
        
        # 🚀 核心优化：如果上一个音频还在推理中，直接拦截新的推理请求
        if not self.is_transcribing:
            self.is_transcribing = True
            threading.Thread(target=self.transcribe_worker, daemon=True).start()

    def audio_callback(self, indata, frames, time, status):
        if self.is_recording:
            self.audio_data.append(indata.copy())

    def transcribe_worker(self):
        try:
            if not self.audio_data or self.model is None: return
            
            audio_np = np.concatenate(self.audio_data, axis=0).flatten()
            segments, _ = self.model.transcribe(
                audio_np, 
                beam_size=5, 
                language="zh",
                initial_prompt="这是一段简体中文的对话记录。"
            )
            text = "".join([segment.text for segment in segments]).strip()
            
            if text:
                pyperclip.copy(text) 
                print(f"📝 识别成功 (已复制): {text}")
                print("\a") # 触发系统提示音
        except Exception as e:
            print(f"❌ 推理过程发生异常: {e}")
        finally:
            # 🚀 核心优化：无论推理成功还是因报错中断，都必须释放锁
            self.is_transcribing = False

# 实例化全局单例
stt_manager = STTManager()

@router.post("/toggle")
def toggle_stt():
    if stt_manager.is_running:
        stt_manager.stop_service()
        return {"status": "stopped", "message": "服务已关闭"}
    else:
        stt_manager.start_service()
        return {"status": "started", "message": "服务已启动"}

@router.get("/status")
def get_stt_status():
    return {"is_running": stt_manager.is_running}