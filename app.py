from __future__ import annotations
import os
from flask import Flask, render_template, send_from_directory, redirect

ROOT = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__, static_folder='static', template_folder='templates')


@app.route('/')
def index():
    # Focus the app on the new standalone page
    return redirect('/novo')


@app.route('/novo')
def novo_page():
    # Standalone page loading the consolidated GLB
    return render_template('novo.html')


@app.route('/manifest.json')
def manifest():
    # Serve prebuilt manifest (kept for compatibility if needed)
    return send_from_directory(
        ROOT, 'tooth_manifest.json', mimetype='application/json'
    )


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='127.0.0.1', port=port, debug=True)
