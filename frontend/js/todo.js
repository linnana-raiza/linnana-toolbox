// ==========================================
// todo.js: 待办面板与列表管理 (性能优化修复版)
// ==========================================
let todos = [];
let currentTab = 'pending'; 
let isEditMode = false;
let editingIndex = -1;
let saveTodoTimer = null;

const todoModal = document.getElementById('todo-modal');
const modalTitle = document.getElementById('todo-modal-title');
const modalInput = document.getElementById('todo-modal-input');
const modalDate = document.getElementById('todo-modal-date');
const todoListElement = document.getElementById('todo-list');

// 标签页切换逻辑
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active'); 
        currentTab = this.getAttribute('data-tab'); 
        renderTodos();
    });
});

// 获取数据
async function fetchTodos() {
    try { 
        const data = await safeFetchJson('/api/todo/get-todos?t=' + new Date().getTime()); 
        if (!data.error) {
            todos = data; 
            renderTodos(); 
        }
    } catch (error) { 
        console.error("加载待办失败", error); 
    }
}

// 防抖保存到服务器
async function saveTodosToServer() {
    if (saveTodoTimer) clearTimeout(saveTodoTimer);
    
    saveTodoTimer = setTimeout(async () => {
        try { 
            await fetch('/api/todo/save-todos', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(todos) 
            }); 
            console.log("💾 待办列表已同步到本地");
        } catch (error) { 
            console.error("保存失败", error); 
        }
    }, 500); 
}

// 切换编辑模式
document.getElementById('todo-edit-mode-btn').onclick = (e) => {
    e.stopPropagation(); 
    isEditMode = !isEditMode;
    document.getElementById('todo-edit-mode-btn').innerHTML = isEditMode ? '✅' : '⚙️';
    document.getElementById('todo-edit-mode-btn').style.color = isEditMode ? '#68d391' : 'white';
    renderTodos();
};

// ==========================================
// 🚀 核心优化 1：渲染与状态管理
// ==========================================
function renderTodos() {
    todoListElement.innerHTML = '';
    const filteredTodos = todos.filter(todo => currentTab === 'pending' ? !todo.done : todo.done);

    if (filteredTodos.length === 0) {
        todoListElement.innerHTML = `<div style="text-align:center; padding: 20px; opacity: 0.5;">没有找到任务，去放松一下吧 ☕</div>`;
        return;
    }

    filteredTodos.forEach((todo) => {
        // 🚀 修复 Bug：使用唯一 ID 查找准确索引，避免后续扩展导致 indexOf 失效
        const globalIndex = todos.findIndex(t => t.id === todo.id); 
        
        const li = document.createElement('li'); 
        li.className = `todo-item ${todo.done ? 'completed' : ''}`;
        
        const checkbox = document.createElement('input'); 
        checkbox.type = 'checkbox'; 
        checkbox.checked = todo.done;
        
        // 🚀 核心优化：避免暴力重绘，实现丝滑勾选与静默移除
        checkbox.onchange = () => { 
            todos[globalIndex].done = checkbox.checked; 
            
            // 如果勾选状态改变导致该任务不属于当前分类，则平滑移除
            if ((currentTab === 'pending' && checkbox.checked) || (currentTab === 'completed' && !checkbox.checked)) {
                li.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                li.style.opacity = '0';
                li.style.transform = 'translateX(20px)';
                
                setTimeout(() => {
                    li.remove();
                    if (todoListElement.children.length === 0) {
                        todoListElement.innerHTML = `<div style="text-align:center; padding: 20px; opacity: 0.5;">没有找到任务，去放松一下吧 ☕</div>`;
                    }
                }, 300);
            } else {
                checkbox.checked ? li.classList.add('completed') : li.classList.remove('completed');
            }
            
            saveTodosToServer(); 
        };
        
        const textBox = document.createElement('div'); textBox.className = 'todo-text-box';
        const textSpan = document.createElement('span'); textSpan.className = 'todo-text'; textSpan.textContent = todo.text;
        textBox.appendChild(textSpan);
        if (todo.date) {
            const dateSpan = document.createElement('span'); dateSpan.className = 'todo-date-tag';
            dateSpan.textContent = `${todo.date}`; textBox.appendChild(dateSpan);
        }
        textBox.onclick = () => checkbox.click();

        const actionBox = document.createElement('div'); actionBox.className = 'todo-actions';
        if (isEditMode) actionBox.style.display = 'flex';
        
        const editBtn = document.createElement('button'); editBtn.className = 'icon-btn edit-btn'; editBtn.innerHTML = '✏️';
        editBtn.onclick = () => openTodoModal(globalIndex);
        
        const deleteBtn = document.createElement('button'); deleteBtn.className = 'icon-btn delete-btn'; deleteBtn.innerHTML = '✖';
        deleteBtn.onclick = () => { 
            todos.splice(globalIndex, 1); 
            saveTodosToServer(); 
            renderTodos(); 
        };
        
        actionBox.append(editBtn, deleteBtn);
        li.append(checkbox, textBox, actionBox); 
        todoListElement.appendChild(li);
    });
}

// ==========================================
// 弹窗表单逻辑
// ==========================================
function openTodoModal(index = -1) {
    editingIndex = index;
    if (index === -1) { 
        modalTitle.textContent = "✨ 新增待办"; 
        modalInput.value = ''; 
        modalDate.value = ''; 
    } else { 
        modalTitle.textContent = "✏️ 编辑待办"; 
        modalInput.value = todos[index].text; 
        modalDate.value = todos[index].date || ''; 
    }
    todoModal.classList.add('show'); 
    modalInput.focus();
}

document.getElementById('todo-add-btn').onclick = (e) => { e.stopPropagation(); openTodoModal(-1); };
document.getElementById('todo-modal-cancel').onclick = () => todoModal.classList.remove('show');

function saveModalTodo() {
    const text = modalInput.value.trim(); 
    if (!text) return;
    
    if (editingIndex === -1) { 
        todos.push({ id: Date.now(), text: text, done: false, date: modalDate.value }); 
    } else { 
        todos[editingIndex].text = text; 
        todos[editingIndex].date = modalDate.value; 
    }
    
    todoModal.classList.remove('show'); 
    saveTodosToServer(); 
    renderTodos();
}

document.getElementById('todo-modal-save').onclick = saveModalTodo;
modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveModalTodo();
});

// ==========================================
// 🚀 核心优化 2：面板拖拽与全局事件按需挂载
// ==========================================
let isDragging = false, hasMoved = false;
let startX, startY, initialLeft, initialTop;

const resizeObserver = new ResizeObserver(entries => {
    if (todoPanel.classList.contains('minimized')) return; 
    for (let entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        if (typeof debouncedSave === 'function') {
            debouncedSave('TODO_W', Math.round(rect.width));
            debouncedSave('TODO_H', Math.round(rect.height));
        }
    }
});
resizeObserver.observe(todoPanel);

// 提取的拖拽中回调
function onPanelMouseMove(e) {
    if (!isDragging) return;
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);
    if (deltaX > 3 || deltaY > 3) hasMoved = true; 

    if (hasMoved) {
        let newLeft = initialLeft + (e.clientX - startX);
        let newTop = initialTop + (e.clientY - startY);
        const maxX = window.innerWidth - todoPanel.offsetWidth;
        const maxY = window.innerHeight - todoPanel.offsetHeight;

        if (newLeft < 0) newLeft = 0; if (newTop < 0) newTop = 0;
        if (newLeft > maxX) newLeft = maxX; if (newTop > maxY) newTop = maxY;

        todoPanel.style.left = newLeft + 'px';
        todoPanel.style.top = newTop + 'px';
    }
}

// 提取的拖拽结束回调
function onPanelMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    todoPanel.classList.remove('no-transition');

    // 🚀 核心：拖拽结束立刻卸载事件，保护 CPU 性能
    document.removeEventListener('mousemove', onPanelMouseMove);
    document.removeEventListener('mouseup', onPanelMouseUp);

    if (hasMoved) {
        if (typeof debouncedSave === 'function') {
            debouncedSave('TODO_X', parseInt(todoPanel.style.left));
            debouncedSave('TODO_Y', parseInt(todoPanel.style.top));
        }
    } else {
        // 这是点击事件（没有发生移动），处理展开/缩小动画
        if (todoPanel.classList.contains('minimized')) {
            todoPanel.classList.add('animate-size');
            void todoPanel.offsetWidth; // 强制回流
            todoPanel.classList.remove('minimized');
            
            setTimeout(() => {
                document.getElementById('todo-content').style.opacity = '1';
            }, 100);
            
            setTimeout(() => { todoPanel.classList.remove('animate-size'); }, 300);
            
            requestAnimationFrame(() => {
                const maxX = window.innerWidth - todoPanel.offsetWidth;
                const maxY = window.innerHeight - todoPanel.offsetHeight;
                let currentLeft = parseInt(todoPanel.style.left) || 0;
                let currentTop = parseInt(todoPanel.style.top) || 0;
                let needsSnap = false;

                if (currentLeft > maxX) { currentLeft = Math.max(0, maxX); needsSnap = true; }
                if (currentTop > maxY) { currentTop = Math.max(0, maxY); needsSnap = true; }

                if (needsSnap) {
                    todoPanel.style.left = currentLeft + 'px';
                    todoPanel.style.top = currentTop + 'px';
                    if (typeof debouncedSave === 'function') {
                        debouncedSave('TODO_X', currentLeft);
                        debouncedSave('TODO_Y', currentTop);
                    }
                }
            });
            if (typeof debouncedSave === 'function') debouncedSave('TODO_MINIMIZED', 'false');
            
        } else {
            todoPanel.classList.add('animate-size');
            void todoPanel.offsetWidth;
            
            document.getElementById('todo-content').style.opacity = '0';
            todoPanel.classList.add('minimized');
            
            setTimeout(() => { todoPanel.classList.remove('animate-size'); }, 300);
            
            if (isEditMode) document.getElementById('todo-edit-mode-btn').click();
            if (typeof debouncedSave === 'function') debouncedSave('TODO_MINIMIZED', 'true');
        }
    }
}

// 只在点击面板时临时挂载事件
todoPanel.addEventListener('mousedown', (e) => {
    if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('.icon-btn') || e.target.closest('.tab-btn')) return;
    const isHeader = e.target.closest('#todo-header');
    const isMinimized = todoPanel.classList.contains('minimized');
    if (!isHeader && !isMinimized) return; 

    isDragging = true; hasMoved = false;
    startX = e.clientX; startY = e.clientY;

    const rect = todoPanel.getBoundingClientRect();
    initialLeft = rect.left; initialTop = rect.top;
    todoPanel.classList.add('no-transition');

    // 🚀 核心：开始拖拽时，挂载全局监听
    document.addEventListener('mousemove', onPanelMouseMove);
    document.addEventListener('mouseup', onPanelMouseUp);
});