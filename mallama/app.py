# app.py
import os
import json
import requests
import uuid
from flask import Flask, render_template, request, Response, jsonify, abort
from werkzeug.utils import secure_filename
from datetime import datetime

# Get the directory where this file is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
           template_folder=os.path.join(BASE_DIR, 'templates'),
           static_folder=os.path.join(BASE_DIR, 'static'))

# Use user directory for data storage
app.config['UPLOAD_FOLDER'] = os.path.expanduser("~/.mallama/uploads")
app.config['CONVERSATIONS_FOLDER'] = os.path.expanduser("~/.mallama/conversations")
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB limit

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['CONVERSATIONS_FOLDER'], exist_ok=True)

OLLAMA_BASE = "http://localhost:11434"

# Helper: build prompt from messages and system
def build_prompt(messages, system_prompt=""):
    prompt = ""
    if system_prompt:
        prompt += f"System: {system_prompt}\n"
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if role == "user":
            prompt += f"User: {content}\n"
        elif role == "assistant":
            prompt += f"Assistant: {content}\n"
        else:
            prompt += f"{role}: {content}\n"
    prompt += "Assistant:"
    return prompt

# Route: serve UI
@app.route('/')
def index():
    return render_template('index.html')

# Route: get installed models
@app.route('/models', methods=['GET'])
def get_models():
    try:
        resp = requests.get(f"{OLLAMA_BASE}/api/tags")
        if resp.status_code == 200:
            models = resp.json().get('models', [])
            return jsonify([m['name'] for m in models])
        else:
            return jsonify([])
    except:
        return jsonify([])

# Route: streaming chat
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    model = data.get('model')
    messages = data.get('messages', [])
    system = data.get('system', '')
    temperature = data.get('temperature', 0.7)
    top_p = data.get('top_p', 0.9)
    max_tokens = data.get('max_tokens', 2048)

    if not model:
        return jsonify({'error': 'Model not specified'}), 400

    # Build prompt from messages
    prompt = build_prompt(messages, system)

    # Prepare payload for Ollama generate
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": temperature,
            "top_p": top_p,
            "num_predict": max_tokens
        }
    }

    def generate():
        try:
            with requests.post(f"{OLLAMA_BASE}/api/generate", json=payload, stream=True) as r:
                if r.status_code != 200:
                    yield f"data: ERROR: {r.status_code}\n\n"
                    return
                for line in r.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            if 'response' in chunk:
                                yield f"data: {json.dumps({'token': chunk['response']})}\n\n"
                            if chunk.get('done', False):
                                yield f"data: [DONE]\n\n"
                                return
                        except:
                            continue
        except Exception as e:
            yield f"data: ERROR: {str(e)}\n\n"

    return Response(generate(), mimetype='text/event-stream')

# Route: stop generation (client-side abort only)
@app.route('/stop', methods=['POST'])
def stop():
    return jsonify({'status': 'stopped'})

# Route: save conversation
@app.route('/save', methods=['POST'])
def save_conversation():
    data = request.json
    if not data:
        return jsonify({'error': 'No data'}), 400

    if 'name' not in data:
        messages = data.get('messages', [])
        first_user_msg = next((m for m in messages if m.get('role') == 'user'), None)
        if first_user_msg:
            content = first_user_msg.get('content', '')
            name = content[:30] + '...' if len(content) > 30 else content
            name = name.replace('\n', ' ').strip()
            data['name'] = name or 'New Chat'
        else:
            data['name'] = 'New Chat'
    
    filename = f"conv_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
    filepath = os.path.join(app.config['CONVERSATIONS_FOLDER'], filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({'filename': filename})

# Route: load conversation
@app.route('/load', methods=['POST'])
def load_conversation():
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'Filename missing'}), 400
    filepath = os.path.join(app.config['CONVERSATIONS_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    with open(filepath, 'r') as f:
        conversation = json.load(f)
    return jsonify(conversation)

# Route: list saved conversations
@app.route('/conversations', methods=['GET'])
def list_conversations():
    files = [f for f in os.listdir(app.config['CONVERSATIONS_FOLDER']) if f.endswith('.json')]
    files.sort(reverse=True)
    return jsonify(files)

# Route: upload file
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        filename = secure_filename(file.filename)
        unique_name = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        return jsonify({'filename': unique_name, 'original': filename})

# Route: delete a single conversation
@app.route('/delete', methods=['POST'])
def delete_conversation():
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'Filename missing'}), 400
    
    filepath = os.path.join(app.config['CONVERSATIONS_FOLDER'], filename)
    if os.path.exists(filepath):
        os.remove(filepath)
        return jsonify({'status': 'deleted'})
    return jsonify({'error': 'File not found'}), 404

# Route: delete all conversations
@app.route('/delete-all', methods=['POST'])
def delete_all_conversations():
    try:
        for filename in os.listdir(app.config['CONVERSATIONS_FOLDER']):
            if filename.endswith('.json'):
                filepath = os.path.join(app.config['CONVERSATIONS_FOLDER'], filename)
                os.remove(filepath)
        return jsonify({'status': 'all deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500