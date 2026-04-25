from pathlib import Path
import os
import sys

from flask import Flask, request

backend_dir = Path(__file__).resolve().parent
repo_dir = backend_dir.parent
if str(repo_dir) not in sys.path:
    sys.path.insert(0, str(repo_dir))

try:
    from dotenv import load_dotenv
    load_dotenv(repo_dir / '.env')
    load_dotenv(backend_dir / '.env', override=True)
except ImportError:
    pass

from db import db, init_db
from routes.auth import auth_bp
from routes.tasks import tasks_bp
from routes.world import world_bp
from routes.agent import agent_bp
from routes.admin import admin_bp

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev')  # Change for production
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///marketplace.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_SAMESITE'] = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
app.config['SESSION_COOKIE_SECURE'] = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'

frontend_origins = [
    origin.strip()
    for origin in os.getenv('FRONTEND_ORIGINS', 'http://localhost:3000').split(',')
    if origin.strip()
]


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin and (origin in frontend_origins or '*' in frontend_origins):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
    return response

db.init_app(app)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(tasks_bp, url_prefix='/api/tasks')
app.register_blueprint(world_bp, url_prefix='/api/world')
app.register_blueprint(agent_bp, url_prefix='/api/agent')
app.register_blueprint(admin_bp, url_prefix='/api/admin')

if __name__ == '__main__':
    with app.app_context():
        init_db(app)
    app.run(debug=True)
