"""AI Tinkery Library — Flask server.

Serves static assets (index.html, activities.json, images) and proxies
/api/claude to a Google Apps Script backend that talks to Anthropic.

No Airtable regex-rewrite on boot (that belongs in scripts/sync-airtable.py).
"""

import json
import os
import urllib.request

from flask import Flask, jsonify, request, send_from_directory


# Same Apps Script endpoint as the original project. The user deploys an
# updated backend.gs there separately.
CLAUDE_BACKEND_URL = (
    'https://script.google.com/macros/s/'
    'AKfycbx-JlO5YkxKntexNohBdtRHVvtsSVQdm1jsyLTIMbpr8nvRnLrkyYhNjwpVrL6-19qv/exec'
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')


# --- Static shell ----------------------------------------------------------

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/sw.js')
def service_worker():
    # Never serve a stale SW.
    response = send_from_directory(BASE_DIR, 'sw.js')
    response.headers['Cache-Control'] = 'no-cache'
    return response


@app.route('/activities.json')
def activities():
    # Served explicitly (not just via static) so it's easy to add logic later
    # (e.g. filtering, A/B variants) without changing the frontend fetch path.
    response = send_from_directory(BASE_DIR, 'activities.json')
    response.headers['Cache-Control'] = 'public, max-age=300'
    return response


# --- Claude proxy ----------------------------------------------------------

@app.route('/api/claude', methods=['POST', 'OPTIONS'])
def claude_proxy():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    try:
        body = request.get_data()
        req = urllib.request.Request(
            CLAUDE_BACKEND_URL,
            data=body,
            headers={'Content-Type': 'text/plain;charset=utf-8'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            response_body = resp.read()

        # Apps Script returns JSON text; pass through verbatim.
        response = app.response_class(
            response=response_body,
            status=200,
            mimetype='application/json',
        )
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response

    except Exception as e:
        response = jsonify({'success': False, 'error': str(e)})
        response.status_code = 502
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
