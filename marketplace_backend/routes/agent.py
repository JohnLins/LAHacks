from flask import Blueprint, request, jsonify, session

from extractlabor import extract_human_tasks_from_prompt
from models import Task, User
from db import db

agent_bp = Blueprint('agent', __name__)

def _current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return User.query.get(user_id)


def _has_mode(user, mode):
    return mode in [item for item in (user.account_modes or '').split(',') if item]


def _normalize_task(task):
    description = (task.get('task') or task.get('description') or '').strip()
    try:
        compensation = float(task.get('compensation', 0.0))
    except (TypeError, ValueError):
        compensation = 0.0

    if len(description) < 4:
        return None
    if compensation < 0:
        compensation = 0.0

    return {
        'description': description,
        'compensation': compensation,
    }


@agent_bp.route('/extract', methods=['POST'])
def extract_tasks():
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401
    if not user.is_admin and not _has_mode(user, 'contractor'):
        return jsonify({'error': 'Requester account required to use agent drafting'}), 403

    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    if len(prompt) < 4:
        return jsonify({'error': 'Prompt is required'}), 400

    tasks = [
        normalized for normalized in (
            _normalize_task(task)
            for task in extract_human_tasks_from_prompt(prompt)
        )
        if normalized
    ]
    return jsonify({'tasks': tasks})


@agent_bp.route('/post', methods=['POST'])
def post_tasks():
    user = _current_user()
    if not user:
        return jsonify({'error': 'Not logged in'}), 401
    if not user.is_admin and not _has_mode(user, 'contractor'):
        return jsonify({'error': 'Requester account required to post agent tasks'}), 403

    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    incoming_tasks = data.get('tasks')

    if incoming_tasks is None:
        if len(prompt) < 4:
            return jsonify({'error': 'Prompt or tasks are required'}), 400
        incoming_tasks = extract_human_tasks_from_prompt(prompt)

    if not isinstance(incoming_tasks, list):
        return jsonify({'error': 'Tasks must be a list'}), 400

    normalized_tasks = [
        normalized for normalized in (
            _normalize_task(task)
            for task in incoming_tasks
            if isinstance(task, dict)
        )
        if normalized
    ]
    if not normalized_tasks:
        return jsonify({'error': 'No valid tasks extracted'}), 400

    created = []
    for task in normalized_tasks:
        record = Task(
            description=task['description'],
            compensation=task['compensation'],
            created_by=user,
        )
        db.session.add(record)
        db.session.flush()
        created.append({
            'id': record.id,
            **task,
        })

    db.session.commit()
    return jsonify({
        'message': f'Posted {len(created)} agent-generated task(s)',
        'tasks': created,
    })
