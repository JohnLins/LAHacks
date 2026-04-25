from datetime import datetime

from db import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    world_id_verified = db.Column(db.Boolean, default=False)
    fake_balance = db.Column(db.Float, default=0.0)
    account_modes = db.Column(db.String(80), default='')
    task_topics = db.Column(db.Text, default='')
    onboarding_completed = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'username': self.username,
            'is_admin': self.is_admin,
            'world_id_verified': self.world_id_verified,
            'fake_balance': self.fake_balance,
            'account_modes': [mode for mode in (self.account_modes or '').split(',') if mode],
            'task_topics': [topic for topic in (self.task_topics or '').split(',') if topic],
            'onboarding_completed': self.onboarding_completed,
        }

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='open')  # open, accepted, completed
    compensation = db.Column(db.Float, default=0.0)
    assigned_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    assigned_user = db.relationship('User', backref='tasks')

class WorldIDNullifier(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nullifier = db.Column(db.String(80), nullable=False)
    action = db.Column(db.String(120), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    user = db.relationship('User', backref='world_id_nullifiers')

    __table_args__ = (
        db.UniqueConstraint('nullifier', 'action', name='uq_world_id_nullifier_action'),
    )
