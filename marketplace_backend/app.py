from pathlib import Path

from flask import Flask

try:
    from dotenv import load_dotenv
    backend_dir = Path(__file__).resolve().parent
    load_dotenv(backend_dir.parent / '.env')
    load_dotenv(backend_dir / '.env', override=True)
except ImportError:
    pass

from db import db, init_db
from routes.auth import auth_bp
from routes.tasks import tasks_bp
from routes.world import world_bp

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev'  # Change for production
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///marketplace.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(tasks_bp, url_prefix='/api/tasks')
app.register_blueprint(world_bp, url_prefix='/api/world')

if __name__ == '__main__':
    with app.app_context():
        init_db(app)
    app.run(debug=True)
