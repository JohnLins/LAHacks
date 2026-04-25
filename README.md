# Fetch.ai uAgent (chat protocol)

This is a minimal Fetch.ai `uagents` chat agent that can receive `ChatMessage`s and reply with text.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

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
