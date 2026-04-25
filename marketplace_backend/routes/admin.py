import secrets
import string

from flask import Blueprint, jsonify, request, session

from db import db
from models import Task, User, WorldIDNullifier

admin_bp = Blueprint('admin', __name__)


def _current_admin():
    user_id = session.get('user_id')
    if not user_id:
        return None
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return None
    return user


def _admin_required():
    if not _current_admin():
        return jsonify({'error': 'Admin access required'}), 403
    return None


def _user_summary(user):
    nullifier_count = WorldIDNullifier.query.filter_by(user_id=user.id).count()
    assigned_count = Task.query.filter_by(assigned_user_id=user.id).count()
    return {
        **user.to_dict(),
        'id': user.id,
        'assigned_task_count': assigned_count,
        'world_id_binding_count': nullifier_count,
        'password_status': 'hashed; plaintext is not stored',
    }


def _generated_password(length=16):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@admin_bp.route('/users', methods=['GET'])
def users():
    blocked = _admin_required()
    if blocked:
        return blocked
    all_users = User.query.order_by(User.id.asc()).all()
    return jsonify({'users': [_user_summary(user) for user in all_users]})


@admin_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
def reset_password(user_id):
    blocked = _admin_required()
    if blocked:
        return blocked
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}
    new_password = (data.get('password') or '').strip() or _generated_password()
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    user.set_password(new_password)
    db.session.commit()
    return jsonify({
        'message': f'Password reset for {user.username}',
        'username': user.username,
        'temporary_password': new_password,
    })


@admin_bp.route('/users/<int:user_id>/world-id', methods=['DELETE'])
def remove_world_id(user_id):
    blocked = _admin_required()
    if blocked:
        return blocked
    user = User.query.get_or_404(user_id)
    removed = WorldIDNullifier.query.filter_by(user_id=user.id).delete()
    user.world_id_verified = False
    db.session.commit()
    return jsonify({
        'message': f'World ID removed from {user.username}',
        'removed_bindings': removed,
        'user': _user_summary(user),
    })


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    admin = _current_admin()
    if not admin:
        return jsonify({'error': 'Admin access required'}), 403
    if admin.id == user_id:
        return jsonify({'error': 'You cannot delete the active admin account'}), 400

    user = User.query.get_or_404(user_id)
    Task.query.filter_by(assigned_user_id=user.id).update({'assigned_user_id': None, 'status': 'open'})
    WorldIDNullifier.query.filter_by(user_id=user.id).delete()
    username = user.username
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': f'Deleted user {username}'})
