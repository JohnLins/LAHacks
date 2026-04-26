import os
from datetime import datetime

from flask import Blueprint, current_app, request, jsonify, session
from models import Task, TaskAgent, TaskMessage, User
from db import db

tasks_bp = Blueprint('tasks', __name__)
STANDARD_AGENT_CAPABILITIES = ['send_messages', 'summarize_thread', 'auto_reply']

def _current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return User.query.get(user_id)


def _agent_requester():
    token = os.getenv('MARKETPLACE_AGENT_TOKEN')
    auth_header = request.headers.get('Authorization', '')
    if not token or auth_header != f'Bearer {token}':
        return None

    username = os.getenv('MARKETPLACE_AGENT_REQUESTER', 'agentverse')
    user = User.query.filter_by(username=username).first()
    if not user:
        user = User(
            username=username,
            account_modes='contractor',
            task_topics='agentverse',
            onboarding_completed=True,
        )
        user.set_password(os.getenv('MARKETPLACE_AGENT_PASSWORD', os.urandom(16).hex()))
        db.session.add(user)
        db.session.flush()
    elif not _has_mode(user, 'contractor'):
        modes = [item for item in (user.account_modes or '').split(',') if item]
        user.account_modes = ','.join([*modes, 'contractor'])
    return user


def _has_mode(user, mode):
    return mode in [item for item in (user.account_modes or '').split(',') if item]


def _get_task(task_id):
    return Task.query.get(task_id)


def _is_requester(user, task):
    return bool(user and (user.is_admin or task.created_by_id == user.id))


def _is_assigned_worker(user, task):
    return bool(user and task.assigned_user_id == user.id)


def _can_view_task_thread(user, task):
    return bool(user and (user.is_admin or task.created_by_id == user.id or task.assigned_user_id == user.id))


def _can_user_message(user, task):
    if not _can_view_task_thread(user, task):
        return False
    return task.status in ('accepted', 'completed')


def _dev_agentkit_mock_enabled():
    return bool(current_app.debug or os.getenv('ALLOW_DEV_AGENTKIT_MOCK') == '1')


def _agent_token_valid():
    token = os.getenv('MARKETPLACE_AGENT_TOKEN')
    auth_header = request.headers.get('Authorization', '')
    return bool(token and auth_header == f'Bearer {token}')


def _agent_address_from_headers():
    return (
        request.headers.get('X-AgentKit-Address')
        or request.headers.get('X-Agent-Address')
        or request.headers.get('X-Fetch-Agent-Address')
        or ''
    ).strip()


def _agent_actor_for_task(task):
    if not _agent_token_valid():
        return None

    address = _agent_address_from_headers()
    if not address:
        return None

    configured_agent = TaskAgent.query.filter_by(task_id=task.id, address=address).first()
    if not configured_agent:
        return None

    source = 'world_agent' if request.headers.get('X-AgentKit-Human-Id') else 'fetch_agent'
    if source == 'world_agent' and not configured_agent.world_verified:
        configured_agent.world_verified = True
        configured_agent.verification_source = 'world_agentkit'
        configured_agent.verified_at = datetime.utcnow()
        db.session.flush()

    return {
        'name': configured_agent.name,
        'address': configured_agent.address,
        'source': source,
        'agent': configured_agent,
    }


def _serialize_task(task):
    return {
        'id': task.id,
        'description': task.description,
        'status': task.status,
        'compensation': task.compensation,
        'created_by': task.created_by.username if task.created_by else None,
        'assigned_user': task.assigned_user.username if task.assigned_user else None,
    }


def _serialize_message(message):
    sender = message.sender_user.username if message.sender_user else message.sender_agent_name
    sender_agent = None
    if message.sender_agent_address:
        sender_agent = TaskAgent.query.filter_by(
            task_id=message.task_id,
            address=message.sender_agent_address,
        ).first()
    return {
        'id': message.id,
        'task_id': message.task_id,
        'sender': sender or 'Agent',
        'sender_user': message.sender_user.username if message.sender_user else None,
        'sender_agent_name': message.sender_agent_name,
        'sender_agent_address': message.sender_agent_address,
        'sender_agent_world_verified': bool(sender_agent and sender_agent.world_verified),
        'sender_agent_verification_source': sender_agent.verification_source if sender_agent else None,
        'source': message.source,
        'body': message.body,
        'created_at': message.created_at.isoformat() + 'Z',
    }


def _serialize_agent(agent):
    return {
        'id': agent.id,
        'task_id': agent.task_id,
        'name': agent.name,
        'address': agent.address,
        'capabilities': [item for item in (agent.capabilities or '').split(',') if item],
        'instructions': agent.instructions or '',
        'automated_responses': bool(agent.automated_responses),
        'world_verified': bool(agent.world_verified),
        'verification_source': agent.verification_source or 'unverified',
        'verified_at': agent.verified_at.isoformat() + 'Z' if agent.verified_at else None,
        'dev_verification_available': _dev_agentkit_mock_enabled(),
        'created_at': agent.created_at.isoformat() + 'Z',
    }

@tasks_bp.route('/', methods=['POST'])
def create_task():
    user = _current_user() or _agent_requester()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401
    if not user.is_admin and not _has_mode(user, 'contractor'):
        return jsonify({'error': 'Requester account required to post tasks'}), 403

    data = request.get_json(silent=True) or {}
    description = (data.get('description') or '').strip()
    if len(description) < 4:
        return jsonify({'error': 'Task description is required'}), 400
    try:
        compensation = float(data.get('compensation', 0.0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Compensation must be a number'}), 400
    if compensation < 0:
        return jsonify({'error': 'Compensation cannot be negative'}), 400

    task = Task(
        description=description,
        compensation=compensation,
        created_by=user,
    )
    db.session.add(task)
    db.session.commit()
    return jsonify({'message': 'Task created', 'task_id': task.id})

@tasks_bp.route('/', methods=['GET'])
def list_tasks():
    if not _current_user():
        return jsonify({'error': 'Not logged in'}), 401

    tasks = Task.query.all()
    return jsonify([_serialize_task(t) for t in tasks])


@tasks_bp.route('/<int:task_id>/messages', methods=['GET'])
def list_messages(task_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if not _can_view_task_thread(user, task):
        return jsonify({'error': 'Task thread is private'}), 403

    messages = TaskMessage.query.filter_by(task_id=task.id).order_by(TaskMessage.created_at.asc(), TaskMessage.id.asc()).all()
    return jsonify([_serialize_message(message) for message in messages])


@tasks_bp.route('/<int:task_id>/messages', methods=['POST'])
def create_message(task_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if not _can_user_message(user, task):
        return jsonify({'error': 'Messages open after a task is accepted'}), 403

    data = request.get_json(silent=True) or {}
    body = (data.get('body') or '').strip()
    if len(body) < 1:
        return jsonify({'error': 'Message cannot be empty'}), 400
    if len(body) > 2000:
        return jsonify({'error': 'Message is too long'}), 400

    message = TaskMessage(task=task, sender_user=user, source='user', body=body)
    db.session.add(message)
    db.session.commit()
    return jsonify({'message': 'Message sent', 'task_message': _serialize_message(message)})


@tasks_bp.route('/<int:task_id>/agent-messages', methods=['POST'])
def create_agent_message(task_id):
    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if task.status not in ('accepted', 'completed'):
        return jsonify({'error': 'Agent messages open after a task is accepted'}), 403

    actor = _agent_actor_for_task(task)
    if not actor:
        return jsonify({'error': 'Registered task agent required'}), 403

    data = request.get_json(silent=True) or {}
    body = (data.get('body') or data.get('message') or '').strip()
    if not body:
        return jsonify({'error': 'Message cannot be empty'}), 400
    if len(body) > 2000:
        return jsonify({'error': 'Message is too long'}), 400

    message = TaskMessage(
        task=task,
        sender_agent_name=actor['name'],
        sender_agent_address=actor['address'],
        source=actor['source'],
        body=body,
    )
    db.session.add(message)
    reply_to_message_id = data.get('reply_to_message_id')
    if reply_to_message_id is not None:
        try:
            actor['agent'].last_auto_response_message_id = int(reply_to_message_id)
        except (TypeError, ValueError):
            pass
    db.session.commit()
    return jsonify({'message': 'Agent message sent', 'task_message': _serialize_message(message)})


@tasks_bp.route('/<int:task_id>/agents', methods=['GET'])
def list_task_agents(task_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if not _can_view_task_thread(user, task):
        return jsonify({'error': 'Task agents are private'}), 403

    agents = TaskAgent.query.filter_by(task_id=task.id).order_by(TaskAgent.created_at.asc(), TaskAgent.id.asc()).all()
    return jsonify([_serialize_agent(agent) for agent in agents])


@tasks_bp.route('/<int:task_id>/agents', methods=['POST'])
def create_task_agent(task_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if not _is_requester(user, task):
        return jsonify({'error': 'Requester account required to configure task agents'}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or 'Requester task agent').strip()[:120]
    address = (data.get('address') or '').strip()[:180]
    instructions = (data.get('instructions') or '').strip()
    automated_responses = bool(data.get('automated_responses'))
    if not name:
        return jsonify({'error': 'Agent name is required'}), 400
    if len(address) < 8:
        return jsonify({'error': 'Agent address is required'}), 400
    if len(instructions) > 2000:
        return jsonify({'error': 'Agent instructions are too long'}), 400

    existing = TaskAgent.query.filter_by(task_id=task.id, address=address).first()
    if automated_responses and not (existing and existing.world_verified):
        return jsonify({'error': 'Automated responses require World AgentKit verification first'}), 400

    if existing:
        existing.name = name
        existing.capabilities = ','.join(STANDARD_AGENT_CAPABILITIES)
        existing.instructions = instructions
        existing.automated_responses = automated_responses
        agent = existing
    else:
        agent = TaskAgent(
            task=task,
            created_by=user,
            name=name,
            address=address,
            capabilities=','.join(STANDARD_AGENT_CAPABILITIES),
            instructions=instructions,
            automated_responses=False,
        )
        db.session.add(agent)

    db.session.commit()
    return jsonify({'message': 'Task agent saved', 'agent': _serialize_agent(agent)})


@tasks_bp.route('/<int:task_id>/agents/<int:agent_id>', methods=['DELETE'])
def delete_task_agent(task_id, agent_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if not _is_requester(user, task):
        return jsonify({'error': 'Requester account required to remove task agents'}), 403

    agent = TaskAgent.query.filter_by(task_id=task.id, id=agent_id).first()
    if not agent:
        return jsonify({'error': 'Task agent not found'}), 404

    db.session.delete(agent)
    db.session.commit()
    return jsonify({'message': 'Task agent removed'})


@tasks_bp.route('/<int:task_id>/agents/verify', methods=['POST'])
def verify_task_agent(task_id):
    if not _agent_token_valid():
        return jsonify({'error': 'Agent token required'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    human_id = request.headers.get('X-AgentKit-Human-Id')
    if not human_id:
        return jsonify({'error': 'World AgentKit verification required'}), 403

    data = request.get_json(silent=True) or {}
    address = (data.get('address') or _agent_address_from_headers()).strip()
    if not address:
        return jsonify({'error': 'Agent address is required'}), 400

    agent = TaskAgent.query.filter_by(task_id=task.id, address=address).first()
    if not agent:
        return jsonify({'error': 'Task agent not found'}), 404

    agent.world_verified = True
    agent.verification_source = 'world_agentkit'
    agent.verified_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Task agent verified with World AgentKit', 'agent': _serialize_agent(agent)})


@tasks_bp.route('/<int:task_id>/agents/<int:agent_id>/dev-verify', methods=['POST'])
def dev_verify_task_agent(task_id, agent_id):
    if not _dev_agentkit_mock_enabled():
        return jsonify({'error': 'Development AgentKit mock verification is disabled'}), 403

    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401

    task = _get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    if not _is_requester(user, task):
        return jsonify({'error': 'Requester account required to verify task agents'}), 403

    agent = TaskAgent.query.filter_by(task_id=task.id, id=agent_id).first()
    if not agent:
        return jsonify({'error': 'Task agent not found'}), 404

    agent.world_verified = True
    agent.verification_source = 'dev_agentkit_mock'
    agent.verified_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Task agent marked World verified for development', 'agent': _serialize_agent(agent)})


@tasks_bp.route('/agent-auto-replies', methods=['GET'])
def list_agent_auto_replies():
    if not _agent_token_valid():
        return jsonify({'error': 'Agent token required'}), 401

    address = _agent_address_from_headers()
    if not address:
        return jsonify({'error': 'Agent address is required'}), 400

    jobs = []
    agents = TaskAgent.query.filter_by(
        address=address,
        automated_responses=True,
        world_verified=True,
    ).order_by(TaskAgent.created_at.asc()).all()

    for agent in agents:
        task = agent.task
        if not task or task.status not in ('accepted', 'completed') or not task.assigned_user_id:
            continue

        latest_worker_message = TaskMessage.query.filter_by(
            task_id=task.id,
            sender_user_id=task.assigned_user_id,
            source='user',
        ).order_by(TaskMessage.id.desc()).first()
        if not latest_worker_message:
            continue
        if agent.last_auto_response_message_id and latest_worker_message.id <= agent.last_auto_response_message_id:
            continue

        recent_messages = TaskMessage.query.filter_by(task_id=task.id).order_by(
            TaskMessage.created_at.desc(),
            TaskMessage.id.desc(),
        ).limit(8).all()
        jobs.append({
            'task': _serialize_task(task),
            'agent': _serialize_agent(agent),
            'trigger_message': _serialize_message(latest_worker_message),
            'recent_messages': [_serialize_message(message) for message in reversed(recent_messages)],
        })

    return jsonify(jobs)

@tasks_bp.route('/<int:task_id>/accept', methods=['POST'])
def accept_task(task_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401
    if not user.is_admin and not _has_mode(user, 'worker'):
        return jsonify({'error': 'Worker account required to accept tasks'}), 403
    if not user.world_id_verified:
        return jsonify({'error': 'World ID verification required'}), 403
    task = Task.query.get(task_id)
    if not task or task.status != 'open':
        return jsonify({'error': 'Task not available'}), 400
    task.status = 'accepted'
    task.assigned_user = user
    db.session.commit()
    return jsonify({'message': 'Task accepted'})

@tasks_bp.route('/<int:task_id>/complete', methods=['POST'])
def complete_task(task_id):
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401
    task = Task.query.get(task_id)
    if not task or task.status != 'accepted' or task.assigned_user_id != user.id:
        return jsonify({'error': 'Task not assigned to you'}), 400
    task.status = 'completed'
    user.fake_balance += task.compensation
    db.session.commit()
    return jsonify({'message': 'Task completed, balance updated'})
