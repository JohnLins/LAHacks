import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import {
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';

const PORT = Number(process.env.AGENTKIT_GATEWAY_PORT || 4021);
const MARKETPLACE_URL = process.env.MARKETPLACE_URL || 'http://127.0.0.1:5000/api/tasks/';
const MARKETPLACE_AGENT_TOKEN = process.env.MARKETPLACE_AGENT_TOKEN || '';
const PUBLIC_ORIGIN = process.env.AGENTKIT_PUBLIC_ORIGIN || `http://localhost:${PORT}`;
const AGENTKIT_NETWORK = process.env.AGENTKIT_NETWORK || 'eip155:8453';
const AGENTKIT_RPC_URL = process.env.AGENTKIT_RPC_URL;

const agentBook = createAgentBookVerifier(
  AGENTKIT_RPC_URL ? { rpcUrl: AGENTKIT_RPC_URL } : undefined,
);

function jsonError(c, status, error, detail) {
  return c.json({ error, detail }, status);
}

function normalizeTask(input) {
  const description = String(input?.description || input?.task || '').trim();
  const compensation = Number(input?.compensation ?? input?.price ?? 0);

  if (description.length < 4) {
    return { error: 'Task description is required' };
  }
  if (!Number.isFinite(compensation) || compensation < 0) {
    return { error: 'Compensation must be a nonnegative number' };
  }

  return { description, compensation };
}

function normalizeMessage(input) {
  const body = String(input?.body || input?.message || '').trim();
  if (!body) {
    return { error: 'Message cannot be empty' };
  }
  if (body.length > 2000) {
    return { error: 'Message is too long' };
  }
  return { body };
}

function marketplaceHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    ...(MARKETPLACE_AGENT_TOKEN ? { authorization: `Bearer ${MARKETPLACE_AGENT_TOKEN}` } : {}),
    ...extra,
  };
}

async function verifyHumanBackedAgent(c) {
  const header = c.req.header('agentkit');
  if (!header) {
    return {
      ok: false,
      response: jsonError(
        c,
        401,
        'Missing AgentKit proof',
        'Send a valid agentkit header from a wallet registered in World AgentBook.',
      ),
    };
  }

  let payload;
  try {
    payload = parseAgentkitHeader(header);
  } catch (error) {
    return { ok: false, response: jsonError(c, 400, 'Malformed AgentKit proof', String(error.message || error)) };
  }

  const resourceUri = `${PUBLIC_ORIGIN}${c.req.path}`;
  const validation = await validateAgentkitMessage(payload, resourceUri);
  if (!validation.valid) {
    return { ok: false, response: jsonError(c, 401, 'Invalid AgentKit message', validation.error) };
  }

  const signature = await verifyAgentkitSignature(payload);
  if (!signature.valid || !signature.address) {
    return { ok: false, response: jsonError(c, 401, 'Invalid AgentKit signature', signature.error) };
  }

  const humanId = await agentBook.lookupHuman(signature.address, payload.chainId || AGENTKIT_NETWORK);
  if (!humanId) {
    return {
      ok: false,
      response: jsonError(
        c,
        403,
        'Agent is not human-backed',
        'Register the agent wallet in World AgentBook with a World ID proof first.',
      ),
    };
  }

  return {
    ok: true,
    agent: {
      address: signature.address,
      humanId,
      chainId: payload.chainId || AGENTKIT_NETWORK,
    },
  };
}

const app = new Hono();

app.get('/health', c => c.json({
  status: 'ok',
  marketplace_url: MARKETPLACE_URL,
  public_origin: PUBLIC_ORIGIN,
  network: AGENTKIT_NETWORK,
  marketplace_agent_token_configured: Boolean(MARKETPLACE_AGENT_TOKEN),
}));

app.post('/agentkit/tasks', async c => {
  const verified = await verifyHumanBackedAgent(c);
  if (!verified.ok) return verified.response;

  const body = await c.req.json().catch(() => null);
  const tasks = Array.isArray(body?.tasks) ? body.tasks : [body];
  const created = [];
  const failed = [];

  for (const item of tasks) {
    const task = normalizeTask(item);
    if (task.error) {
      failed.push({ input: item, error: task.error });
      continue;
    }

    const response = await fetch(MARKETPLACE_URL, {
      method: 'POST',
      headers: marketplaceHeaders(),
      body: JSON.stringify(task),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      created.push({ ...task, task_id: payload.task_id });
    } else {
      failed.push({ ...task, error: payload.error || response.statusText });
    }
  }

  return c.json({
    message: `Posted ${created.length} task(s) from a World AgentKit verified agent.`,
    agent: verified.agent,
    created,
    failed,
  }, failed.length ? 207 : 200);
});

app.post('/agentkit/tasks/:taskId/messages', async c => {
  const verified = await verifyHumanBackedAgent(c);
  if (!verified.ok) return verified.response;

  const body = await c.req.json().catch(() => null);
  const message = normalizeMessage(body);
  if (message.error) {
    return jsonError(c, 400, message.error);
  }

  const taskId = c.req.param('taskId');
  const target = new URL(`${taskId}/agent-messages`, MARKETPLACE_URL).toString();
  const response = await fetch(target, {
    method: 'POST',
    headers: marketplaceHeaders({
      'x-agentkit-address': verified.agent.address,
      'x-agentkit-human-id': verified.agent.humanId,
      'x-agentkit-chain-id': verified.agent.chainId,
    }),
    body: JSON.stringify(message),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return c.json({
      error: payload.error || 'Could not send agent message',
      agent: verified.agent,
    }, response.status);
  }

  return c.json({
    message: 'Sent message from a World AgentKit verified agent.',
    agent: verified.agent,
    task_message: payload.task_message,
  });
});

app.post('/agentkit/tasks/:taskId/agents/verify', async c => {
  const verified = await verifyHumanBackedAgent(c);
  if (!verified.ok) return verified.response;

  const body = await c.req.json().catch(() => null);
  const address = String(body?.address || body?.agentverse_address || '').trim();
  if (!address) {
    return jsonError(c, 400, 'Agentverse agent address is required');
  }

  const taskId = c.req.param('taskId');
  const target = new URL(`${taskId}/agents/verify`, MARKETPLACE_URL).toString();
  const response = await fetch(target, {
    method: 'POST',
    headers: marketplaceHeaders({
      'x-agentkit-address': verified.agent.address,
      'x-agentkit-human-id': verified.agent.humanId,
      'x-agentkit-chain-id': verified.agent.chainId,
    }),
    body: JSON.stringify({ address }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return c.json({
      error: payload.error || 'Could not verify task agent',
      agent: verified.agent,
    }, response.status);
  }

  return c.json({
    message: 'Verified this Agentverse task agent with World AgentKit.',
    agent: verified.agent,
    task_agent: payload.agent,
  });
});

serve({ fetch: app.fetch, port: PORT }, info => {
  console.log(`AgentKit gateway listening on http://localhost:${info.port}`);
});
