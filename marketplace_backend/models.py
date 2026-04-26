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
    posted_tasks = db.relationship('Task', foreign_keys='Task.created_by_id', back_populates='created_by')
    tasks = db.relationship('Task', foreign_keys='Task.assigned_user_id', back_populates='assigned_user')

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
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    assigned_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_by = db.relationship('User', foreign_keys=[created_by_id], back_populates='posted_tasks')
    assigned_user = db.relationship('User', foreign_keys=[assigned_user_id], back_populates='tasks')
    messages = db.relationship('TaskMessage', back_populates='task', cascade='all, delete-orphan')
    agents = db.relationship('TaskAgent', back_populates='task', cascade='all, delete-orphan')

class TaskMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    sender_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    sender_agent_name = db.Column(db.String(120), nullable=True)
    sender_agent_address = db.Column(db.String(180), nullable=True)
    source = db.Column(db.String(20), default='user')  # user, fetch_agent, world_agent
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    task = db.relationship('Task', back_populates='messages')
    sender_user = db.relationship('User', backref='sent_task_messages')

class TaskAgent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    name = db.Column(db.String(120), nullable=False)
    address = db.Column(db.String(180), nullable=False)
    capabilities = db.Column(db.String(240), default='send_messages,summarize_thread')
    instructions = db.Column(db.Text, default='')
    automated_responses = db.Column(db.Boolean, default=False)
    world_verified = db.Column(db.Boolean, default=False)
    verification_source = db.Column(db.String(40), default='unverified')
    verified_at = db.Column(db.DateTime, nullable=True)
    last_auto_response_message_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    task = db.relationship('Task', back_populates='agents')
    created_by = db.relationship('User', backref='configured_task_agents')

    __table_args__ = (
        db.UniqueConstraint('task_id', 'address', name='uq_task_agent_address'),
    )

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
