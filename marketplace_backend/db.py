from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def _ensure_user_columns():
    engine = db.session.get_bind()
    if engine.dialect.name != 'sqlite':
        return

    existing = {
        row[1]
        for row in db.session.execute(db.text('PRAGMA table_info(user)')).fetchall()
    }
    columns = {
        'account_modes': "ALTER TABLE user ADD COLUMN account_modes VARCHAR(80) DEFAULT ''",
        'task_topics': "ALTER TABLE user ADD COLUMN task_topics TEXT DEFAULT ''",
        'onboarding_completed': 'ALTER TABLE user ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0',
        'is_admin': 'ALTER TABLE user ADD COLUMN is_admin BOOLEAN DEFAULT 0',
    }
    for name, statement in columns.items():
        if name not in existing:
            db.session.execute(db.text(statement))
    db.session.commit()


def _ensure_task_columns():
    engine = db.session.get_bind()
    if engine.dialect.name != 'sqlite':
        return

    existing = {
        row[1]
        for row in db.session.execute(db.text('PRAGMA table_info(task)')).fetchall()
    }
    columns = {
        'created_by_id': 'ALTER TABLE task ADD COLUMN created_by_id INTEGER REFERENCES user(id)',
    }
    for name, statement in columns.items():
        if name not in existing:
            db.session.execute(db.text(statement))
    db.session.commit()

def _ensure_task_agent_columns():
    engine = db.session.get_bind()
    if engine.dialect.name != 'sqlite':
        return

    existing = {
        row[1]
        for row in db.session.execute(db.text('PRAGMA table_info(task_agent)')).fetchall()
    }
    if not existing:
        return

    columns = {
        'instructions': "ALTER TABLE task_agent ADD COLUMN instructions TEXT DEFAULT ''",
        'automated_responses': 'ALTER TABLE task_agent ADD COLUMN automated_responses BOOLEAN DEFAULT 0',
        'world_verified': 'ALTER TABLE task_agent ADD COLUMN world_verified BOOLEAN DEFAULT 0',
        'verification_source': "ALTER TABLE task_agent ADD COLUMN verification_source VARCHAR(40) DEFAULT 'unverified'",
        'verified_at': 'ALTER TABLE task_agent ADD COLUMN verified_at DATETIME',
        'last_auto_response_message_id': 'ALTER TABLE task_agent ADD COLUMN last_auto_response_message_id INTEGER',
    }
    for name, statement in columns.items():
        if name not in existing:
            db.session.execute(db.text(statement))
    db.session.commit()

def init_db(app):
    with app.app_context():
        db.create_all()
        _ensure_user_columns()
        _ensure_task_columns()
        _ensure_task_agent_columns()
        _ensure_admin_account()


def _ensure_admin_account():
    import os
    from models import User

    username = os.getenv('ADMIN_USERNAME', 'admin')
    password = os.getenv('ADMIN_PASSWORD', 'admin123')
    admin = User.query.filter_by(username=username).first()
    if not admin:
        admin = User(username=username, is_admin=True, onboarding_completed=True)
        admin.set_password(password)
        db.session.add(admin)
    else:
        admin.is_admin = True
        admin.onboarding_completed = True
    db.session.commit()
