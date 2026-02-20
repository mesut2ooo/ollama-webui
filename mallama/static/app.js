
// ------ globals ------
let messages = [];
let currentModel = '';
let models = [];
let conversationsList = [];
let isGenerating = false;
let abortController = null;
let uploadedFiles = [];

// Settings
let systemPrompt = '';
let temperature = 0.7;
let topP = 0.9;
let maxTokens = 2048;

// UI elements
const sidebar = document.getElementById('sidebar');
const burger = document.getElementById('burgerBtn');
const modelSelect = document.getElementById('modelSelect');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendStopBtn = document.getElementById('sendStopBtn');
const sendIcon = document.getElementById('sendIcon');
const stopIcon = document.getElementById('stopIcon');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const settingsBtn = document.getElementById('settingsBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const systemPromptArea = document.getElementById('systemPrompt');
const tempSlider = document.getElementById('temperature');
const tempValue = document.getElementById('tempValue');
const topPSlider = document.getElementById('topP');
const topPValue = document.getElementById('topPValue');
const maxTokensSelect = document.getElementById('maxTokens');
const fileUpload = document.getElementById('fileUpload');
const uploadModal = document.getElementById('uploadModal');
const closeUploadBtn = document.getElementById('closeUploadBtn');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filePreviews = document.getElementById('filePreviews');

// Custom popup function
function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customPopupOverlay');
        const popupMessage = document.getElementById('popupMessage');
        const confirmBtn = document.getElementById('popupConfirm');
        const cancelBtn = document.getElementById('popupCancel');
        
        popupMessage.textContent = message;
        overlay.style.display = 'flex';
        
        const cleanup = () => {
            overlay.style.display = 'none';
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
        };
        
        const confirmHandler = () => {
            cleanup();
            resolve(true);
        };
        
        const cancelHandler = () => {
            cleanup();
            resolve(false);
        };
        
        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
        
        // Click outside to cancel
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                cancelHandler();
            }
        });
    });
}

// Load saved settings from localStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('mallamaSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            temperature = settings.temperature ?? 0.7;
            topP = settings.topP ?? 0.9;
            maxTokens = settings.maxTokens ?? 2048;
            systemPrompt = settings.systemPrompt ?? '';
            
            // Update UI elements
            tempSlider.value = temperature;
            tempValue.textContent = temperature.toFixed(1);
            topPSlider.value = topP;
            topPValue.textContent = topP.toFixed(2);
            maxTokensSelect.value = maxTokens;
            systemPromptArea.value = systemPrompt;
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }
}

// Save settings to localStorage
function saveSettings() {
    const settings = {
        temperature,
        topP,
        maxTokens,
        systemPrompt
    };
    localStorage.setItem('mallamaSettings', JSON.stringify(settings));
}

// Generate a chat name from the first user message
function generateChatName(messages) {
    const firstUserMsg = messages.find(msg => msg.role === 'user');
    if (!firstUserMsg) return 'New Chat';
    
    const content = firstUserMsg.content.trim();
    if (!content) return 'New Chat';
    
    let name = content.length > 30 ? content.substring(0, 30) + '...' : content;
    name = name.replace(/\s+/g, ' ').trim();
    return name;
}

// Render messages with markdown
function renderMessages() {
    messagesContainer.innerHTML = '';
    
    messages.forEach((msg, idx) => {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${msg.role}`;
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        
        if (msg.content || msg.thinking) {
            let html = '';
            
            // Add thinking section if it exists
            if (msg.thinking && msg.thinking.trim()) {
                html += `<div class="thinking-block">`;
                html += `<div class="thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">`;
                html += `<i class="fas fa-brain"></i> Thinking <span class="toggle-icon">▼</span>`;
                html += `</div>`;
                html += `<div class="thinking-content">${marked.parse(msg.thinking)}</div>`;
                html += `</div>`;
            }
            
            // Add response content
            if (msg.content) {
                html += marked.parse(msg.content);
            }
            
            bubble.innerHTML = html;
            
            // Add copy buttons to code blocks
            bubble.querySelectorAll('pre').forEach(pre => {
                if (!pre.querySelector('.copy-btn')) {
                    const btn = document.createElement('button');
                    btn.className = 'copy-btn';
                    btn.textContent = 'Copy';
                    btn.onclick = () => {
                        const code = pre.querySelector('code') || pre;
                        navigator.clipboard.writeText(code.innerText || code.textContent);
                        btn.textContent = 'Copied!';
                        setTimeout(() => btn.textContent = 'Copy', 2000);
                    };
                    pre.style.position = 'relative';
                    pre.appendChild(btn);
                }
            });
            
            // Highlight code
            bubble.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        } else {
            bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        }
        
        messageEl.appendChild(bubble);
        messagesContainer.appendChild(messageEl);
    });
    
    // Scroll to bottom smoothly
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

function updateThinkingContent(token) {
    if (messages.length === 0) return;
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    
    // Initialize thinking if it doesn't exist
    if (!lastMsg.thinking) {
        lastMsg.thinking = '';
    }
    
    lastMsg.thinking += token;
    
    // Re-render the complete message with both thinking and response
    renderLastMessage();
}

function updateStreamingContent(token) {
    if (messages.length === 0) return;
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    
    lastMsg.content += token;
    
    // Re-render the complete message with both thinking and response
    renderLastMessage();
}

// New function to render just the last message with both thinking and response
function renderLastMessage() {
    const lastMsgDiv = messagesContainer.lastElementChild;
    if (!lastMsgDiv) return;
    
    const lastMsg = messages[messages.length - 1];
    const bubble = lastMsgDiv.querySelector('.bubble');
    if (!bubble) return;
    
    // Remove typing indicator if present
    if (bubble.querySelector('.typing-indicator')) {
        bubble.innerHTML = '';
    }
    
    // Build HTML with thinking and response parts
    let html = '';
    
    // Add thinking section if it exists
    if (lastMsg.thinking && lastMsg.thinking.trim()) {
        html += `<div class="thinking-block">`;
        html += `<div class="thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">`;
        html += `<i class="fas fa-brain"></i> Thinking <span class="toggle-icon">▼</span>`;
        html += `</div>`;
        html += `<div class="thinking-content">${marked.parse(lastMsg.thinking)}</div>`;
        html += `</div>`;
    }
    
    // Add response content
    if (lastMsg.content) {
        html += marked.parse(lastMsg.content);
    }
    
    bubble.innerHTML = html;
    
    // Add copy buttons to code blocks
    bubble.querySelectorAll('pre').forEach(pre => {
        if (!pre.querySelector('.copy-btn')) {
            const btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = 'Copy';
            btn.onclick = () => {
                const code = pre.querySelector('code') || pre;
                navigator.clipboard.writeText(code.innerText || code.textContent);
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 2000);
            };
            pre.style.position = 'relative';
            pre.appendChild(btn);
        }
    });
    
    // Highlight code
    bubble.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
    
    // Auto-scroll smoothly
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

async function loadModels() {
    try {
        const res = await fetch('/models');
        const list = await res.json();
        models = list;
        modelSelect.innerHTML = '';
        
        if (models.length === 0) {
            modelSelect.innerHTML = '<option>no models</option>';
        } else {
            // Get saved model from localStorage
            const savedModel = localStorage.getItem('mallamaModel');
            
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modelSelect.appendChild(opt);
            });
            
            // Check if saved model exists and is still available
            if (savedModel && models.includes(savedModel)) {
                currentModel = savedModel;
                modelSelect.value = savedModel;
            } else {
                // Fallback to first model
                currentModel = models[0];
                modelSelect.value = currentModel;
            }
        }
    } catch (e) { 
        console.warn('no models', e);
        modelSelect.innerHTML = '<option>Error loading models</option>';
    }
}

// Load conversations list
async function loadConversations() {
    try {
        const res = await fetch('/conversations');
        const files = await res.json();
        conversationsList = files;
        
        historyList.innerHTML = '';
        
        for (const filename of files) {
            try {
                const convRes = await fetch('/load', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({filename})
                });
                const conv = await convRes.json();
                
                const item = document.createElement('div');
                item.className = 'history-item';
                item.dataset.filename = filename;
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'chat-name';
                nameSpan.textContent = conv.name || generateChatName(conv.messages || []) || filename.replace(/^conv_|\.json$/g, '').replace(/_/g, ' ');
                
                const delBtn = document.createElement('button');
                delBtn.className = 'delete-single';
                delBtn.innerHTML = '<i class="fas fa-times"></i>';
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteConversation(filename);
                });
                
                item.appendChild(nameSpan);
                item.appendChild(delBtn);
                
                item.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('delete-single') && !e.target.closest('.delete-single')) {
                        loadConversation(filename);
                    }
                });
                
                historyList.appendChild(item);
            } catch (e) {
                // Fallback
                const item = document.createElement('div');
                item.className = 'history-item';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'chat-name';
                nameSpan.textContent = filename.replace(/^conv_|\.json$/g, '').replace(/_/g, ' ');
                
                item.appendChild(nameSpan);
                historyList.appendChild(item);
            }
        }
    } catch (e) {
        console.error('Failed to load conversations', e);
    }
}

// Load specific conversation
async function loadConversation(filename) {
    // Stop any ongoing generation first
    if (isGenerating) {
        stopGeneration();
    }
    
    try {
        const res = await fetch('/load', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filename})
        });
        const conv = await res.json();
        
        messages = conv.messages || [];
        systemPrompt = conv.system || '';
        temperature = conv.temperature ?? temperature;
        topP = conv.topP ?? topP;
        maxTokens = conv.maxTokens ?? maxTokens;
        
        // Update UI
        renderMessages();
        systemPromptArea.value = systemPrompt;
        tempSlider.value = temperature;
        tempValue.textContent = temperature.toFixed(1);
        topPSlider.value = topP;
        topPValue.textContent = topP.toFixed(2);
        maxTokensSelect.value = maxTokens;
        
        // Update active state in sidebar
        document.querySelectorAll('.history-item').forEach(item => {
            if (item.dataset.filename === filename) {
                item.style.background = 'rgba(70, 100, 200, 0.3)';
            } else {
                item.style.background = '';
            }
        });
    } catch (e) {
        console.error('Failed to load conversation', e);
    }
}

// Save current conversation
async function saveConversation() {
    if (messages.length === 0) return;
    
    // Check if we're currently viewing an existing conversation
    const activeItem = document.querySelector('.history-item[style*="background"], .history-item.active');
    let filename = activeItem?.dataset.filename;
    
    const conv = {
        messages,
        system: systemPrompt,
        model: currentModel,
        temperature,
        topP,
        maxTokens,
        name: generateChatName(messages)
    };
    
    try {
        let url = '/save';
        // If we have an existing filename, include it to update instead of create new
        if (filename) {
            // For updating existing conversation, we need to send the filename
            // But the /save endpoint doesn't accept filename in the request body
            // So we need to use a different approach - DELETE the old one and save new
            
            // First, delete the old conversation file
            await fetch('/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({filename})
            });
            
            // Then save as new (will create with new filename)
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(conv)
            });
            
            const result = await response.json();
            
            // Update the active item's dataset with new filename
            if (activeItem) {
                activeItem.dataset.filename = result.filename;
            }
        } else {
            // New conversation - just save
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(conv)
            });
            
            const result = await response.json();
        }
        
        // Refresh the history list
        await loadConversations();
        
        // Re-apply active state to the correct item
        if (filename || activeItem) {
            setTimeout(() => {
                const newActiveItem = document.querySelector(`.history-item[data-filename="${filename || activeItem?.dataset.filename}"]`);
                if (newActiveItem) {
                    newActiveItem.style.background = 'rgba(70, 100, 200, 0.3)';
                }
            }, 100);
        }
    } catch (e) {
        console.error('Failed to save conversation', e);
    }
}

// Delete conversation
async function deleteConversation(filename) {
    const confirmed = await showConfirm('Delete ALL conversations? This cannot be undone.');
    if (!confirmed) return;
    
    try {
        await fetch('/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filename})
        });
        
        if (document.querySelector('.history-item.active')?.dataset.filename === filename) {
            messages = [];
            renderMessages();
        }
        
        loadConversations();
    } catch (e) {
        console.error('Failed to delete', e);
    }
}

// Delete all conversations
async function deleteAllConversations() {
    const confirmed = await showConfirm('Delete ALL conversations? This cannot be undone.');
    if (!confirmed) return;
    
    try {
        await fetch('/delete-all', { method: 'POST' });
        messages = [];
        renderMessages();
        loadConversations();
    } catch (e) {
        console.error('Failed to delete all', e);
    }
}

// Stop generation
function stopGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    
    // Always clean up UI state
    isGenerating = false;
    sendIcon.style.display = 'block';
    stopIcon.style.display = 'none';
    sendStopBtn.classList.remove('stop-active');
    
    // Remove any empty assistant message if generation was stopped before any content
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '') {
        messages.pop(); // Remove the empty assistant message
        renderMessages();
    }
    
    fetch('/stop', { method: 'POST' }).catch(() => {});
}

// Send message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && uploadedFiles.length === 0) return;
    if (!currentModel) {
        alert('No model selected');
        return;
    }

    // Add user message
    messages.push({ role: 'user', content: text });
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Add empty assistant message
    messages.push({ role: 'assistant', content: '' });
    renderMessages();

    // Start generating
    isGenerating = true;
    sendIcon.style.display = 'none';
    stopIcon.style.display = 'block';
    sendStopBtn.classList.add('stop-active');

    abortController = new AbortController();

    const payload = {
        model: currentModel,
        messages: messages.slice(0, -1),
        system: systemPrompt,
        temperature: parseFloat(temperature),
        top_p: parseFloat(topP),
        max_tokens: parseInt(maxTokens, 10)
    };

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        // Done
                    } else if (data.startsWith('ERROR:')) {
                        console.error(data);
                        stopGeneration();
                    } else {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.thinking) {
                                updateThinkingContent(parsed.thinking);
                            }
                            if (parsed.token) {
                                updateStreamingContent(parsed.token);
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Stream error', err);
        }
    } finally {
        isGenerating = false;
        sendIcon.style.display = 'block';
        stopIcon.style.display = 'none';
        sendStopBtn.classList.remove('stop-active');
        abortController = null;
        
        // Auto-save after every exchange
        saveConversation();
    }
}

// Event listeners
sendStopBtn.addEventListener('click', () => {
    if (isGenerating) {
        stopGeneration();
    } else {
        sendMessage();
    }
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Settings
tempSlider.addEventListener('input', () => {
    temperature = parseFloat(tempSlider.value);
    tempValue.textContent = temperature.toFixed(1);
    saveSettings();
});

topPSlider.addEventListener('input', () => {
    topP = parseFloat(topPSlider.value);
    topPValue.textContent = topP.toFixed(2);
    saveSettings();
});

maxTokensSelect.addEventListener('change', (e) => {
    maxTokens = parseInt(e.target.value, 10);
    saveSettings();
});

systemPromptArea.addEventListener('input', () => {
    systemPrompt = systemPromptArea.value;
    saveSettings();
});

// Settings modal
settingsBtn.addEventListener('click', () => {
    systemPromptArea.value = systemPrompt;
    tempSlider.value = temperature;
    tempValue.textContent = temperature.toFixed(1);
    topPSlider.value = topP;
    topPValue.textContent = topP.toFixed(2);
    maxTokensSelect.value = maxTokens;
    settingsModal.classList.add('show');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
});

// Upload modal
document.querySelector('.attach-btn').addEventListener('click', (e) => {
    e.preventDefault();
    uploadModal.classList.add('show');
});

closeUploadBtn.addEventListener('click', () => {
    uploadModal.classList.remove('show');
    filePreviews.innerHTML = '';
});

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.background = 'rgba(100, 140, 255, 0.2)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.background = '';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.background = '';
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
});

async function handleFiles(files) {
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/upload', { method: 'POST', body: formData });
            const data = await res.json();
            uploadedFiles.push(data);
            
            const preview = document.createElement('div');
            preview.className = 'preview-item';
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                preview.appendChild(img);
            }
            preview.appendChild(document.createTextNode(data.original));
            filePreviews.appendChild(preview);
        } catch (e) {
            console.error('Upload failed', e);
        }
    }
}

// New chat
newChatBtn.addEventListener('click', () => {
    // Stop any ongoing generation first
    if (isGenerating) {
        stopGeneration();
    }
    messages = [];
    renderMessages();
    
    // Clear active state in sidebar
    document.querySelectorAll('.history-item').forEach(item => {
        item.style.background = '';
    });
});

// Model change
modelSelect.addEventListener('change', () => {
    currentModel = modelSelect.value;
    localStorage.setItem('mallamaModel', currentModel);
});

// Delete all
deleteAllBtn.addEventListener('click', deleteAllConversations);

// Sidebar collapse
burger.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    
    // Mobile backdrop
    if (window.innerWidth <= 700) {
        if (!sidebar.classList.contains('collapsed')) {
            if (!document.getElementById('sidebar-backdrop')) {
                const backdrop = document.createElement('div');
                backdrop.id = 'sidebar-backdrop';
                backdrop.addEventListener('click', () => sidebar.classList.add('collapsed'));
                document.querySelector('.app-container').appendChild(backdrop);
            }
        } else {
            const backdrop = document.getElementById('sidebar-backdrop');
            if (backdrop) backdrop.remove();
        }
    }
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('show');
    }
    if (e.target === uploadModal) {
        uploadModal.classList.remove('show');
    }
});

// Ctrl+C to stop
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'c' && isGenerating) {
        e.preventDefault();
        stopGeneration();
    }
});

// Initialize
loadSettings();
loadModels();
loadConversations();