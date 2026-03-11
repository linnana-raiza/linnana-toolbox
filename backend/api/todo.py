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
    """覆盖保存待办列表"""
    # 将 Pydantic 模型列表转换为字典列表，并写入 JSON
    with open(todo_file, "w", encoding="utf-8") as f:
        json.dump([t.model_dump() for t in todos], f, ensure_ascii=False, indent=4)
    return {"message": "待办事项已更新"}