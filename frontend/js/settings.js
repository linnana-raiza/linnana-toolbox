// ==========================================
// settings.js: 动态设置面板解析与渲染 (升级下拉框与按键绑定)
// ==========================================
let settingsSchema = [];
const settingsModal = document.getElementById('settings-modal');

document.getElementById('settings-btn').addEventListener('click', () => settingsModal.classList.add('show'));
document.getElementById('close-settings').addEventListener('click', () => settingsModal.classList.remove('show'));

async function loadDynamicSettings() {
    try {
        const data = await safeFetchJson('/api/settings/get-settings-schema?t=' + new Date().getTime());
        if (!data.error) {
            settingsSchema = data;
            renderSettingsSidebar();
            if (settingsSchema.length > 0) renderSettingsForm(0);
        }
    } catch (error) { console.error("加载设置架构失败", error); }
}

function renderSettingsSidebar() {
    const tabsContainer = document.getElementById('settings-tabs-container');
    tabsContainer.innerHTML = '';
    settingsSchema.forEach((category, index) => {
        const tab = document.createElement('div');
        tab.className = 'sidebar-tab';
        tab.textContent = category.category_name;
        tab.onclick = () => renderSettingsForm(index);
        tabsContainer.appendChild(tab);
    });
}

function renderSettingsForm(categoryIndex) {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach((tab, idx) => {
        if (idx === categoryIndex) tab.classList.add('active');
        else tab.classList.remove('active');
    });

    const category = settingsSchema[categoryIndex];
    const formContainer = document.getElementById('settings-form-container');
    
    let html = `
        <h3 class="settings-category-title">${category.category_name}</h3>
        <p class="settings-category-desc">${category.category_desc}</p>
    `;

    category.settings.forEach(setting => {
        const displayValue = cleanVal(setting.value);
        let inputHtml = '';
        let descText = setting.description;

        const tagMatch = descText.match(/\[(.*?)\]/);
        if (tagMatch) {
            descText = descText.replace(tagMatch[0], '').trim(); 
            const tags = tagMatch[1].split(':');
            const type = tags[0];

            if (type === 'color') {
                inputHtml = `<input type="color" class="dynamic-input" data-env-key="${setting.key}" value="${displayValue}" style="height: 40px; padding: 2px; cursor: pointer;">`;
            } else if (type === 'range') {
                const min = tags[1] || 0, max = tags[2] || 10, step = tags[3] || 1;
                inputHtml = `<input type="range" class="dynamic-input" data-env-key="${setting.key}" value="${displayValue}" min="${min}" max="${max}" step="${step}" style="padding: 0; cursor: pointer;">`;
            } else if (type === 'upload') {
                const uploadType = tags[1] || 'static'; 
                const accept = uploadType === 'static' ? 'image/*' : 'video/mp4';
                inputHtml = `
                    <label class="clean-upload-btn">
                        更换壁纸
                        <input type="file" class="dynamic-upload" data-upload-type="${uploadType}" accept="${accept}" style="display:none;">
                    </label>
                `;
            } else if (type === 'select') {
                const dataSource = tags[1]; 
                // 🚀 核心升级 1：判断 dataSource 是否包含逗号，如果是，则渲染为静态选项
                if (dataSource && dataSource.includes(',')) {
                    const options = dataSource.split(',').map(opt => {
                        const o = opt.trim();
                        const isSelected = (o === displayValue) ? 'selected' : '';
                        return `<option value="${o}" ${isSelected}>${o}</option>`;
                    }).join('');
                    
                    inputHtml = `
                        <select class="dynamic-select" data-env-key="${setting.key}" data-current-value="${displayValue}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: white; outline: none; cursor: pointer;">
                            ${options}
                        </select>
                    `;
                } else {
                    // 原有的动态拉取模型列表逻辑 (比如 live2d)
                    inputHtml = `
                        <select class="dynamic-select" data-env-key="${setting.key}" data-source="${dataSource}" data-current-value="${displayValue}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: white; outline: none; cursor: pointer;">
                            <option value="${displayValue}">⏳ 正在扫描本地模型...</option>
                        </select>
                    `;
                }
            } else if (type === 'hotkey') {
                // 🚀 核心升级 2：新增快捷键捕获按钮
                inputHtml = `<button class="dynamic-hotkey" data-env-key="${setting.key}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.4); border: 1px dashed rgba(255,255,255,0.4); border-radius: 6px; color: #a3be8c; font-family: Consolas, monospace; cursor: pointer; text-align: center; font-size: 1rem; transition: 0.2s;">⌨️ ${displayValue}</button>`;
            } else {
                inputHtml = `<input type="text" class="dynamic-input" data-env-key="${setting.key}" value="${displayValue}">`;
            }
        } else {
            inputHtml = `<input type="text" class="dynamic-input" data-env-key="${setting.key}" value="${displayValue}">`;
        }

        html += `
            <div class="dynamic-setting-item">
                <label>${setting.key}</label>
                <span class="desc">${descText}</span>
                ${inputHtml}
            </div>
        `;
    });

    formContainer.innerHTML = html;

    // 1. 绑定常规输入的事件（颜色、滑块、文本）
    formContainer.querySelectorAll('.dynamic-input:not([readonly])').forEach(input => {
        input.addEventListener('input', function() {
            const key = this.getAttribute('data-env-key');
            const value = cleanVal(this.value); 
            window.EventBus.emit('SETTING_CHANGED', { key, value });
            debouncedSave(key, value);
        });
    });

    // 2. 绑定文件上传按钮的事件
    formContainer.querySelectorAll('.dynamic-upload').forEach(fileInput => {
        fileInput.addEventListener('change', async function() {
            const file = this.files[0]; 
            if (!file) return;
            
            const uploadType = this.getAttribute('data-upload-type');
            const formData = new FormData(); 
            formData.append('file', file); 
            formData.append('wallpaper_type', uploadType);
            
            const btnLabel = this.parentElement; 
            const originalText = btnLabel.innerHTML;
            btnLabel.innerHTML = "⏳ 上传中..."; 
            btnLabel.style.pointerEvents = "none";
            btnLabel.style.background = "#2563eb";
            
            try { 
                const response = await fetch('/upload-wallpaper', { method: 'POST', body: formData }); 
                if (response.ok) location.reload(); 
                else alert("服务器处理失败");
            } catch (error) { 
                alert("上传请求失败"); 
            } finally { 
                btnLabel.innerHTML = originalText; 
                btnLabel.style.pointerEvents = "auto"; 
                btnLabel.style.background = "#3b82f6";
            }
        });
    });

    // 3. 为下拉框填充数据并绑定事件
    formContainer.querySelectorAll('.dynamic-select').forEach(async select => {
        const source = select.getAttribute('data-source');
        const currentValue = select.getAttribute('data-current-value');
        
        if (source === 'live2d') {
            try {
                const models = await safeFetchJson('/api/settings/get-live2d-models');
                if (models.error) return;
                select.innerHTML = ''; 
                
                if (models.length === 0) {
                    select.innerHTML = `<option value="">未在 live2d 文件夹下找到模型</option>`;
                    return;
                }
                
                models.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.path;
                    option.textContent = `🌸 ${m.name}`; 
                    if (m.path === currentValue) option.selected = true;
                    select.appendChild(option);
                });
            } catch(e) { console.error("加载模型列表失败", e); }
        }

        // 监听下拉框切换，实时应用并保存
        select.addEventListener('change', function() {
            const key = this.getAttribute('data-env-key');
            const value = this.value;
            window.EventBus.emit('SETTING_CHANGED', { key, value }); 
            debouncedSave(key, value);
        });
    });

    // 4. 🚀 核心升级 3：快捷键捕获逻辑
    formContainer.querySelectorAll('.dynamic-hotkey').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const originalText = this.innerText;
            this.innerText = "👀 请按下任意键 (按 ESC 取消)...";
            this.style.color = "#fbd38d";
            this.style.borderColor = "#fbd38d";
            this.style.background = "rgba(0,0,0,0.8)";

            const keydownHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                let keyName = event.key.toLowerCase();
                
                // 适配 Python keyboard 模块的命名规范
                if (keyName === 'escape') {
                    // 取消绑定
                    this.innerText = originalText;
                    this.style.color = "#a3be8c";
                    this.style.borderColor = "rgba(255,255,255,0.4)";
                    this.style.background = "rgba(0,0,0,0.4)";
                    document.removeEventListener('keydown', keydownHandler, true);
                    return;
                }
                if (keyName === ' ') keyName = 'space';
                if (keyName === 'control') keyName = 'ctrl';
                
                // 组合键拼接逻辑
                let finalKey = keyName;
                if (event.ctrlKey && keyName !== 'ctrl') finalKey = 'ctrl+' + keyName;
                if (event.shiftKey && keyName !== 'shift') finalKey = 'shift+' + finalKey;
                if (event.altKey && keyName !== 'alt') finalKey = 'alt+' + finalKey;

                this.innerText = `⌨️ ${finalKey}`;
                this.style.color = "#a3be8c";
                this.style.borderColor = "rgba(255,255,255,0.4)";
                this.style.background = "rgba(0,0,0,0.4)";
                
                document.removeEventListener('keydown', keydownHandler, true);
                
                const envKey = this.getAttribute('data-env-key');
                window.EventBus.emit('SETTING_CHANGED', { key: envKey, value: finalKey });
                debouncedSave(envKey, finalKey);
            };

            // 在捕获阶段拦截按键，防止触发其他系统默认行为
            document.addEventListener('keydown', keydownHandler, true);
        });
    });
}