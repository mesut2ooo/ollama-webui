// static/app.js
// State
let messages = [];
let currentModel = '';
let temperature = 0.7;
let topP = 0.9;
let maxTokens = 2048; // Default 2K
let systemPrompt = '';
let uploadedFiles = [];
let isGenerating = false;
let abortController = null;

// DOM elements
const modelSelect = document.getElementById('model-select');
const tempSlider = document.getElementById('temperature');
const tempSpan = document.getElementById('temp-value');
const topPSlider = document.getElementById('top-p');
const topPSpan = document.getElementById('topp-value');
const maxTokensInput = document.getElementById('max-tokens');
const systemBtn = document.getElementById('system-prompt-btn');
const uploadBtn = document.getElementById('upload-btn');
const sendBtn = document.getElementById('send-btn');
const userInput = document.getElementById('user-input');
const messagesDiv = document.getElementById('messages');
const conversationsList = document.getElementById('conversations-list');
const newChatBtn = document.getElementById('new-chat');

// Modals
const systemModal = document.getElementById('system-modal');
const systemClose = systemModal.querySelector('.close');
const systemTextarea = document.getElementById('system-prompt-text');
const saveSystemBtn = document.getElementById('save-system');

const uploadModal = document.getElementById('upload-modal');
const uploadClose = uploadModal.querySelector('.close-upload');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const filePreviews = document.getElementById('file-previews');

// static/app.js - Add after the state declarations

// Load saved settings from localStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('ollamaSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            temperature = settings.temperature ?? 0.7;
            topP = settings.topP ?? 0.9;
            maxTokens = settings.maxTokens ?? 2048;
            systemPrompt = settings.systemPrompt ?? '';
            
            // Update UI elements
            tempSlider.value = temperature;
            tempSpan.textContent = temperature.toFixed(1);
            topPSlider.value = topP;
            topPSpan.textContent = topP.toFixed(2);
            maxTokensInput.value = maxTokens;
            systemTextarea.value = systemPrompt;
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
    localStorage.setItem('ollamaSettings', JSON.stringify(settings));
}

// Update existing event listeners to save settings
tempSlider.addEventListener('input', () => {
    temperature = parseFloat(tempSlider.value);
    tempSpan.textContent = temperature.toFixed(1);
    saveSettings();
});

topPSlider.addEventListener('input', () => {
    topP = parseFloat(topPSlider.value);
    topPSpan.textContent = topP.toFixed(2);
    saveSettings();
});

maxTokensInput.addEventListener('change', (e) => {
    maxTokens = parseInt(e.target.value, 10);
    saveSettings();
});

saveSystemBtn.addEventListener('click', () => {
    systemPrompt = systemTextarea.value;
    systemModal.style.display = 'none';
    saveSettings();
});

// Load models on startup
async function loadModels() {
    try {
        const res = await fetch('/models');
        const models = await res.json();
        modelSelect.innerHTML = '';
        models.forEach(m => {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m;
            modelSelect.appendChild(option);
        });
        if (models.length > 0) {
            currentModel = models[0];
            modelSelect.value = currentModel;
        }
    } catch (e) {
        console.error('Failed to load models', e);
    }
}

// Load conversations list
async function loadConversations() {
    const res = await fetch('/conversations');
    const files = await res.json();
    conversationsList.innerHTML = '';
    
    for (const f of files) {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.dataset.filename = f;
        
        // Try to load the conversation to get its name
        try {
            const convRes = await fetch('/load', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({filename: f})
            });
            const conv = await convRes.json();
            
            // Create name span
            const nameSpan = document.createElement('span');
            nameSpan.className = 'conv-name';
            nameSpan.textContent = conv.name || generateChatName(conv.messages || []) || 'New Chat';
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-conv-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Delete conversation';
            deleteBtn.onclick = (e) => deleteConversation(f, e);
            
            div.appendChild(nameSpan);
            div.appendChild(deleteBtn);
            
            // Add click handler for loading conversation
            div.addEventListener('click', (e) => {
                // Don't load if clicking the delete button
                if (!e.target.classList.contains('delete-conv-btn')) {
                    // Remove active class from all items
                    document.querySelectorAll('.conversation-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    div.classList.add('active');
                    loadConversation(f);
                }
            });
            
        } catch (e) {
            // Fallback to filename
            const nameSpan = document.createElement('span');
            nameSpan.className = 'conv-name';
            nameSpan.textContent = f.replace(/^conv_|\.json$/g, '').replace(/_/g, ' ');
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-conv-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.onclick = (e) => deleteConversation(f, e);
            
            div.appendChild(nameSpan);
            div.appendChild(deleteBtn);
            
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-conv-btn')) {
                    loadConversation(f);
                }
            });
        }
        
        conversationsList.appendChild(div);
    }
}

// Load a specific conversation
async function loadConversation(filename) {
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
    systemTextarea.value = systemPrompt;
    tempSlider.value = temperature;
    tempSpan.textContent = temperature.toFixed(1);
    topPSlider.value = topP;
    topPSpan.textContent = topP.toFixed(2);
    maxTokensInput.value = maxTokens;
}

// Generate a chat name from the first user message
function generateChatName(messages) {
    // Find the first user message
    const firstUserMsg = messages.find(msg => msg.role === 'user');
    if (!firstUserMsg) return 'New Chat';
    
    const content = firstUserMsg.content.trim();
    if (!content) return 'New Chat';
    
    // Take first 30 characters, add ellipsis if longer
    let name = content.length > 30 ? content.substring(0, 30) + '...' : content;
    
    // Remove newlines and extra spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    return name;
}

// Save current conversation
async function saveConversation() {
    // Don't save empty conversations
    if (messages.length === 0) return;
    
    const conv = {
        messages,
        system: systemPrompt,
        model: currentModel,
        temperature,
        topP,
        maxTokens,
        name: generateChatName(messages) // Add a name field
    };
    
    await fetch('/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(conv)
    });
    loadConversations(); // refresh list
}

// Delete a single conversation
async function deleteConversation(filename, event) {
    event.stopPropagation(); // Prevent triggering the load conversation
    
    if (!confirm('Are you sure you want to delete this conversation?')) {
        return;
    }
    
    try {
        const res = await fetch('/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filename})
        });
        
        if (res.ok) {
            // If the deleted conversation is currently loaded, clear it
            const currentConvFile = document.querySelector('.conversation-item.active')?.dataset.filename;
            if (currentConvFile === filename) {
                messages = [];
                renderMessages();
            }
            loadConversations(); // Refresh the list
        }
    } catch (e) {
        console.error('Failed to delete conversation', e);
    }
}

// Delete all conversations
async function deleteAllConversations() {
    if (!confirm('Are you sure you want to delete ALL conversations? This cannot be undone.')) {
        return;
    }
    
    try {
        const res = await fetch('/delete-all', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        
        if (res.ok) {
            messages = [];
            renderMessages();
            loadConversations(); // Refresh the list
        }
    } catch (e) {
        console.error('Failed to delete all conversations', e);
    }
}


// Render messages with markdown and code highlighting
function renderMessages() {
    messagesDiv.innerHTML = '';
    
    messages.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${msg.role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Parse markdown
        let html = simpleMarkdown(msg.content);
        contentDiv.innerHTML = html;
        
        // Add copy buttons to code blocks
        contentDiv.querySelectorAll('pre').forEach(pre => {
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
        });
        
        messageEl.appendChild(contentDiv);
        messagesDiv.appendChild(messageEl);
    });
    
    // Apply Prism.js highlighting if available
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
    
    // Scroll to bottom
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
        chatArea.scrollTop = chatArea.scrollHeight;
    }
}

// Very basic markdown parser (bold, italic, code blocks, inline code)
function simpleMarkdown(text) {
    if (!text) return '';
    
    // First, escape HTML to prevent XSS
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Code blocks ```lang\ncode``` - with proper language support
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, language, code) => {
        const lang = language || 'plaintext';
        // Don't escape code inside pre tags as Prism will handle it
        return `<pre><code class="language-${lang}">${code}</code></pre>`;
    });
    
    // Inline code `code`
    text = text.replace(/`([^`]+)`/g, '<code class="language-plaintext">$1</code>');
    
    // Headers
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic *text*
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Lists
    text = text.replace(/^\s*\*\s(.*$)/gim, '<li>$1</li>');
    text = text.replace(/^\s*-\s(.*$)/gim, '<li>$1</li>');
    text = text.replace(/^\s*\d+\.\s(.*$)/gim, '<li>$1</li>');
    
    // Wrap lists
    text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Blockquotes
    text = text.replace(/^\>\s(.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Horizontal rule
    text = text.replace(/^\s*---\s*$/gim, '<hr>');
    
    // Paragraphs - wrap text not in block elements
    const lines = text.split('\n');
    let inBlock = false;
    let result = [];
    
    for (let line of lines) {
        // Check if line starts with HTML tag
        if (line.trim().startsWith('<') && !line.trim().startsWith('<br>')) {
            inBlock = true;
            result.push(line);
        } else if (inBlock && line.trim() === '') {
            inBlock = false;
            result.push(line);
        } else if (!inBlock && line.trim() !== '') {
            result.push(`<p>${line}</p>`);
        } else {
            result.push(line);
        }
    }
    
    text = result.join('\n');
    
    return text;
}

function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Send message
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && uploadedFiles.length === 0) return;
    if (!currentModel) {
        alert('No model selected');
        return;
    }

    // Add user message
    const userMsg = { role: 'user', content: text };
    messages.push(userMsg);
    renderMessages();

    // Clear input
    userInput.value = '';
    uploadedFiles = []; // simple: forget uploaded files after sending

    // Prepare assistant placeholder
    const assistantMsg = { role: 'assistant', content: '' };
    messages.push(assistantMsg);
    renderMessages(); // will create empty assistant bubble

    // Start streaming
    isGenerating = true;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6" y="6" width="12" height="12"/></svg>';
    sendBtn.classList.add('stop');

    abortController = new AbortController();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: currentModel,
                messages: messages.slice(0, -1), // exclude the empty assistant
                system: systemPrompt,
                temperature,
                top_p: topP,
                max_tokens: maxTokens
            }),
            signal: abortController.signal
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        break;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) {
                            // Append token to last assistant message
                            const last = messages[messages.length - 1];
                            last.content += parsed.token;

                            // Update UI efficiently: find last message element
                            const lastMsgDiv = messagesDiv.lastElementChild;
                            if (lastMsgDiv) {
                                const contentDiv = lastMsgDiv.querySelector('.message-content');
                                contentDiv.innerHTML = simpleMarkdown(last.content);
                                
                                // Add copy button to any new code blocks
                                contentDiv.querySelectorAll('pre').forEach(pre => {
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
                                
                                // Re-highlight code blocks in this message
                                if (typeof Prism !== 'undefined') {
                                    contentDiv.querySelectorAll('pre code').forEach((block) => {
                                        Prism.highlightElement(block);
                                    });
                                }
                            }

                            // Auto-scroll
                            const chatArea = document.querySelector('.chat-area');
                            if (chatArea) {
                                chatArea.scrollTop = chatArea.scrollHeight;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse chunk', e);
                    }
                }
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Stream aborted');
        } else {
            console.error('Stream error', err);
        }
    } finally {
        isGenerating = false;
        sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
        sendBtn.classList.remove('stop');
        abortController = null;
        // Auto-save conversation
        saveConversation();
    }
}

// Stop generation
function stopGeneration() {
    if (abortController) {
        abortController.abort();
        isGenerating = false;
        sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
        sendBtn.classList.remove('stop');
        // Optionally notify backend
        fetch('/stop', { method: 'POST' });
    }
}

// UI event listeners
sendBtn.addEventListener('click', () => {
    if (isGenerating) {
        stopGeneration();
    } else {
        sendMessage();
    }
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Ctrl+C to stop
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'c' && isGenerating) {
        e.preventDefault();
        stopGeneration();
    }
});

// Temperature slider
tempSlider.addEventListener('input', () => {
    temperature = parseFloat(tempSlider.value);
    tempSpan.textContent = temperature.toFixed(1);
});
topPSlider.addEventListener('input', () => {
    topP = parseFloat(topPSlider.value);
    topPSpan.textContent = topP.toFixed(2);
});

document.getElementById('max-tokens').addEventListener('change', (e) => {
    maxTokens = parseInt(e.target.value, 10);
});

// Add delete all button event listener
document.getElementById('delete-all-btn').addEventListener('click', deleteAllConversations);

// System prompt modal
systemBtn.addEventListener('click', () => {
    systemTextarea.value = systemPrompt;
    systemModal.style.display = 'flex';
});
systemClose.addEventListener('click', () => {
    systemModal.style.display = 'none';
});
saveSystemBtn.addEventListener('click', () => {
    systemPrompt = systemTextarea.value;
    systemModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === systemModal) systemModal.style.display = 'none';
    if (e.target === uploadModal) uploadModal.style.display = 'none';
});

// Upload modal
uploadBtn.addEventListener('click', () => {
    uploadModal.style.display = 'flex';
    filePreviews.innerHTML = '';
});
uploadClose.addEventListener('click', () => {
    uploadModal.style.display = 'none';
});
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.background = 'rgba(255,255,255,0.2)';
});
dropZone.addEventListener('dragleave', () => {
    dropZone.style.background = '';
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.background = '';
    const files = e.dataTransfer.files;
    handleFiles(files);
});
fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
});

async function handleFiles(files) {
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        uploadedFiles.push(data);
        // Show preview
        const preview = document.createElement('div');
        preview.className = 'preview-item';
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            preview.appendChild(img);
        }
        preview.appendChild(document.createTextNode(data.original));
        filePreviews.appendChild(preview);
    }
}

// New chat
newChatBtn.addEventListener('click', () => {
    messages = [];
    renderMessages();
    userInput.value = '';
});

// Model change
modelSelect.addEventListener('change', () => {
    currentModel = modelSelect.value;
});

// Function to manually trigger Prism highlighting on new content
function highlightCodeBlocks(container) {
    if (typeof Prism !== 'undefined') {
        container.querySelectorAll('pre code').forEach((block) => {
            Prism.highlightElement(block);
        });
    }
}

// Initial load
loadModels();
loadConversations();
loadSettings(); // Add this line
