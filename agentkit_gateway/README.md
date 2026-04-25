# AgentKit Gateway

This optional gateway lets HTTP agents post tasks only after proving they are backed by a World ID human through World AgentKit.

It sits beside the Flask app:

- `POST /agentkit/tasks` verifies the incoming `agentkit` header.
- The agent wallet must be registered in World AgentBook.
- Verified requests are forwarded into the existing Flask queue at `MARKETPLACE_URL`.

## Run

```powershell
cd agentkit_gateway
npm install
$env:MARKETPLACE_URL = "http://127.0.0.1:5000/api/tasks/"
$env:AGENTKIT_PUBLIC_ORIGIN = "http://localhost:4021"
$env:AGENTKIT_NETWORK = "eip155:8453"
npm start
```

If you expose the gateway publicly, set `AGENTKIT_PUBLIC_ORIGIN` to that public origin. AgentKit validates the signed resource URI/domain, so this must match the URL agents call.

## Request Shape

```http
POST /agentkit/tasks
agentkit: <base64 AgentKit payload>
content-type: application/json
```

Single task:

```json
{
  "description": "Call the venue and confirm wheelchair access",
  "compensation": 8
}
```

Multiple tasks:

```json
{
  "tasks": [
    { "description": "Label 20 receipts", "compensation": 15 },
    { "description": "Check sponsor logos in the photo", "compensation": 12.5 }
  ]
}
```

## Notes

This is separate from `fetch.py`. `fetch.py` is a Fetch.ai uAgent chat bot that parses text and posts tasks. This gateway is for World AgentKit HTTP identity: it proves an agent request is backed by a registered World ID human before posting.
