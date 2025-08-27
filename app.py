from __future__ import annotations
import os
from flask import Flask, render_template, send_from_directory

ROOT = os.path.abspath(os.path.dirname(__file__))
MODELS_DIR = os.path.join(ROOT, 'objetos_separados')
MANIFEST_PATH = os.path.join(ROOT, 'tooth_manifest.json')

app = Flask(__name__, static_folder='static', template_folder='templates')


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/manifest.json')
def manifest():
    # Serve prebuilt manifest
    return send_from_directory(
        ROOT, 'tooth_manifest.json', mimetype='application/json'
    )


@app.route('/models/<path:filename>')
def models(filename: str):
    # Serve OBJ assets from the existing modelos folder without moving them yet
    return send_from_directory(MODELS_DIR, filename)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='127.0.0.1', port=port, debug=True)
