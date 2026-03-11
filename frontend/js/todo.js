// ==========================================
// todo.js: 待办面板与列表管理
// ==========================================
let todos = [];
let currentTab = 'pending'; 
let isEditMode = false;
let editingIndex = -1;

const todoModal = document.getElementById('todo-modal');
const modalTitle = document.getElementById('todo-modal-title');
const modalInput = document.getElementById('todo-modal-input');
const modalDate = document.getElementById('todo-modal-date');

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active'); currentTab = this.getAttribute('data-tab'); renderTodos();
    });
});

async function fetchTodos() {
    try { const response = await fetch('/api/get-todos?t=' + new Date().getTime()); todos = await response.json(); renderTodos(); } 
    catch (error) { console.error("加载待办失败", error); }
}

async function saveTodosToServer() {
    try { await fetch('/api/save-todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(todos) }); } 
    catch (error) { console.error("保存失败", error); }
}

document.getElementById('todo-edit-mode-btn').onclick = (e) => {
    e.stopPropagation(); isEditMode = !isEditMode;
    document.getElementById('todo-edit-mode-btn').innerHTML = isEditMode ? '✅' : '⚙️';
    document.getElementById('todo-edit-mode-btn').style.color = isEditMode ? '#68d391' : 'white';
    renderTodos();
};

function renderTodos() {
    const listElement = document.getElementById('todo-list'); listElement.innerHTML = '';
    const filteredTodos = todos.filter(todo => currentTab === 'pending' ? !todo.done : todo.done);

    if (filteredTodos.length === 0) {
        listElement.innerHTML = `<div style="text-align:center; padding: 20px; opacity: 0.5;">没有找到任务，去放松一下吧 ☕</div>`;
        return;
    }

    filteredTodos.forEach((todo) => {
        const globalIndex = todos.indexOf(todo); 
        const li = document.createElement('li'); li.className = `todo-item ${todo.done ? 'completed' : ''}`;
        
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = todo.done;
        checkbox.onchange = () => { todos[globalIndex].done = checkbox.checked; saveTodosToServer(); renderTodos(); };
        
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
        deleteBtn.onclick = () => { todos.splice(globalIndex, 1); saveTodosToServer(); renderTodos(); };
        
        actionBox.append(editBtn, deleteBtn);
        li.append(checkbox, textBox, actionBox); listElement.appendChild(li);
    });
}

function openTodoModal(index = -1) {
    editingIndex = index;
    if (index === -1) { modalTitle.textContent = "✨ 新增待办"; modalInput.value = ''; modalDate.value = ''; } 
    else { modalTitle.textContent = "✏️ 编辑待办"; modalInput.value = todos[index].text; modalDate.value = todos[index].date || ''; }
    todoModal.classList.add('show'); 
    modalInput.focus();
}

document.getElementById('todo-add-btn').onclick = (e) => { e.stopPropagation(); openTodoModal(-1); };
document.getElementById('todo-modal-cancel').onclick = () => todoModal.classList.remove('show');
document.getElementById('todo-modal-save').onclick = () => {
    const text = modalInput.value.trim(); if (!text) return;
    if (editingIndex === -1) { todos.push({ id: Date.now(), text: text, done: false, date: modalDate.value }); } 
    else { todos[editingIndex].text = text; todos[editingIndex].date = modalDate.value; }
    todoModal.classList.remove('show'); saveTodosToServer(); renderTodos();
};

// --- 面板拖拽与缩放 ---
let isDragging = false, hasMoved = false;
let startX, startY, initialLeft, initialTop;

const resizeObserver = new ResizeObserver(entries => {
    if (todoPanel.classList.contains('minimized')) return; 
    for (let entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        debouncedSave('TODO_W', Math.round(rect.width));
        debouncedSave('TODO_H', Math.round(rect.height));
    }
});
resizeObserver.observe(todoPanel);

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
});

document.addEventListener('mousemove', (e) => {
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
});

document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    todoPanel.classList.remove('no-transition');

    if (hasMoved) {
        debouncedSave('TODO_X', parseInt(todoPanel.style.left));
        debouncedSave('TODO_Y', parseInt(todoPanel.style.top));
    } else {
        if (todoPanel.classList.contains('minimized')) {
            todoPanel.classList.add('animate-size');
            todoPanel.classList.remove('minimized');
            document.getElementById('todo-content').style.opacity = '1';
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
                    debouncedSave('TODO_X', currentLeft);
                    debouncedSave('TODO_Y', currentTop);
                }
            });
            debouncedSave('TODO_MINIMIZED', 'false');
        } else {
            document.getElementById('todo-content').style.opacity = '0';
            todoPanel.classList.add('minimized');
            if (isEditMode) document.getElementById('todo-edit-mode-btn').click();
            debouncedSave('TODO_MINIMIZED', 'true');
        }
    }
});