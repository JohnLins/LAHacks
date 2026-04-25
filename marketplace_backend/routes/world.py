from flask import Blueprint, request, jsonify, session
from models import User
from db import db

world_bp = Blueprint('world', __name__)

@world_bp.route('/verify', methods=['POST'])
def verify():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not logged in'}), 401
    # In a real implementation, validate World ID proof here
    # For demo, just set verified to True
    user = User.query.get(user_id)
    user.world_id_verified = True
    db.session.commit()
    return jsonify({'message': 'World ID verified'})
