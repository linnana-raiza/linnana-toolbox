import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

# 创建一个路由器实例
router = APIRouter()

# 获取 data/todo.json 的绝对路径
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
root_dir = os.path.dirname(backend_dir)
data_dir = os.path.join(root_dir, "data")
todo_file = os.path.join(data_dir, "todo.json")

# 确保 data 文件夹和 json 文件存在
os.makedirs(data_dir, exist_ok=True)
if not os.path.exists(todo_file):
    with open(todo_file, "w", encoding="utf-8") as f:
        f.write("[]")

# 定义前端传来的数据格式
class TodoItem(BaseModel):
    id: int
    text: str
    done: bool
    date: str = ""

@router.get("/get-todos")
def get_todos():
    """读取待办列表"""
    with open(todo_file, "r", encoding="utf-8") as f:
        return json.load(f)

@router.post("/save-todos")
def save_todos(todos: list[TodoItem]):
    """覆盖保存待办列表（防数据损坏安全版）"""
    # 1. 生成同目录下的临时文件名
    temp_file = todo_file + ".tmp"
    
    try:
        # 2. 先把数据完整写入临时文件
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump([t.model_dump() for t in todos], f, ensure_ascii=False, indent=4)
        
        # 3. 执行原子替换！即使中途崩溃，原 todo.json 也绝对不会受损
        os.replace(temp_file, todo_file)
        return {"message": "待办事项已安全更新"}
    except Exception as e:
        # 如果临时写入失败，清理残骸，保护原文件
        if os.path.exists(temp_file):
            os.remove(temp_file)
        print(f"❌ 保存待办失败: {e}")
        return {"error": "保存失败"}