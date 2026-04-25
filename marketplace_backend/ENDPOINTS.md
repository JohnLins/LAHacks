# Marketplace Backend API Endpoints

## Authentication

### Register
- **POST** `/api/auth/register`
- **Body:** `{ "username": "string", "password": "string" }`
- **Response:** `{ "message": "User registered" }` or `{ "error": "Username already exists" }`

### Login
- **POST** `/api/auth/login`
- **Body:** `{ "username": "string", "password": "string" }`
- **Response:** `{ "message": "Logged in" }` or `{ "error": "Invalid credentials" }`
- **Notes:** Sets session cookie for authentication.

### Logout
- **POST** `/api/auth/logout`
- **Response:** `{ "message": "Logged out" }`

### Get Current User
- **GET** `/api/auth/me`
- **Response:** `{ "username": "string", "world_id_verified": bool, "fake_balance": float }` or `{ "error": "Not logged in" }`

---

## Tasks

### Create Task
- **POST** `/api/tasks/`
- **Body:** `{ "description": "string", "compensation": float }`
- **Response:** `{ "message": "Task created", "task_id": int }`

### List All Tasks
- **GET** `/api/tasks/`
- **Response:** `[{ "id": int, "description": "string", "status": "open|accepted|completed", "compensation": float, "assigned_user": "string|null" }]`

### Accept Task
- **POST** `/api/tasks/<task_id>/accept`
- **Auth required** (session cookie)
- **Response:** `{ "message": "Task accepted" }` or error
- **Notes:** User must be World ID verified

### Complete Task
- **POST** `/api/tasks/<task_id>/complete`
- **Auth required** (session cookie)
- **Response:** `{ "message": "Task completed, balance updated" }` or error

---

## World ID Verification

### Verify User
- **POST** `/api/world/verify`
- **Auth required** (session cookie)
- **Response:** `{ "message": "World ID verified" }`
- **Notes:** For demo, this just sets the user as verified.

---

## Notes
- All endpoints return JSON.
- Auth endpoints use session cookies for authentication.
- For demo, payment is simulated with a fake balance.
