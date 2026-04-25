# Fetch.ai uAgent (chat protocol)

This repo now has two agent entry points:

- `fetch.py`: a Fetch.ai `uagents` chat agent. It can read a prompt, decide task descriptions and compensation from the text, and post those tasks into the Flask marketplace queue.
- `agentkit_gateway/`: a World AgentKit HTTP gateway. It verifies that an HTTP-calling agent is backed by a World ID human through AgentBook before forwarding task posts into the same queue.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Frontend/backend separation

The React frontend and Flask backend can run on the same origin for local development or on separate hosted domains.

Local dev defaults:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`
- React dev proxy forwards `/api/*` to the backend.

For separate hosting, configure the frontend build with the backend URL:

```bash
cd marketplace_frontend
REACT_APP_API_BASE_URL=https://your-api.example.com npm run build
```

Configure the backend with the frontend origin and cross-site cookie settings:

```bash
FRONTEND_ORIGINS=https://your-frontend.example.com
SESSION_COOKIE_SAMESITE=None
SESSION_COOKIE_SECURE=true
SECRET_KEY=change-me
```

`FRONTEND_ORIGINS` accepts a comma-separated list. Keep `SESSION_COOKIE_SECURE=false` only for local HTTP development; browsers require `Secure` cookies when `SameSite=None` is used across hosted origins.

## Run

```bash
AGENT_SEED="change-me-to-any-random-string" python fetch.py
```

Once running, you can verify it in a browser:

- `http://127.0.0.1:8000/` (health check JSON)

If you get “address already in use”, pick another port:

```bash
AGENT_PORT=8001 python fetch.py
```

By default this runs **locally** and is great for development. If you want other agents to reach you over the internet (Agentverse/Almanac), you must run on a publicly reachable URL and pass it as an endpoint when creating the `Agent(...)`.

## Make it reachable on Agentverse (public endpoint)

Your agent can only be reached by Agentverse/other agents if it has a **public URL** that forwards to your local agent port.

### Option A: cloudflared tunnel (no account required)

In a new terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:8001
```

Copy the `https://...trycloudflare.com` URL and put it in `.env`:

```bash
AGENT_ENDPOINT=https://your-subdomain.trycloudflare.com
```

Restart your agent. The “No endpoints provided” warning should go away.

### Option B: ngrok tunnel

```bash
ngrok http 8001
```

Copy the `https://....ngrok...` URL into `AGENT_ENDPOINT`, then restart the agent.

Optional environment variables:

- `AGENT_NAME`: defaults to `lahacks_fetch_agent`
- `AGENT_SEED`: defaults to a dev seed (change this for a unique address)
 - `AGENT_PORT`: defaults to `8000`
 - `AGENT_ENDPOINT`: optional public URL for Agentverse reachability

## Next steps

- Add your logic in `handle_message` when receiving `TextContent`.
- If you want this agent to talk to another agent, send it a `ChatMessage` using its address.

## World AgentKit gateway

World AgentKit is not the same thing as IDKit. IDKit verifies human users inside the web app; AgentKit verifies HTTP agents by checking an `agentkit` header, recovering the agent wallet, and looking that wallet up in World AgentBook.

The gateway endpoint is:

```text
POST http://localhost:4021/agentkit/tasks
```

It accepts either one task:

```json
{
  "description": "Call the venue and confirm wheelchair access",
  "compensation": 8
}
```

or multiple tasks:

```json
{
  "tasks": [
    { "description": "Label 20 receipts", "compensation": 15 },
    { "description": "Check sponsor logos in the photo", "compensation": 12.5 }
  ]
}
```

Run it after installing the Node dependencies:

```powershell
cd agentkit_gateway
npm install
$env:MARKETPLACE_URL = "http://127.0.0.1:5000/api/tasks/"
$env:AGENTKIT_PUBLIC_ORIGIN = "http://localhost:4021"
$env:AGENTKIT_NETWORK = "eip155:8453"
npm start
```

The calling agent must include a valid `agentkit` header from a wallet registered in World AgentBook. See `agentkit_gateway/README.md` for details.
