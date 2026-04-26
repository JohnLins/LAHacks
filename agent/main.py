import os
import time
import traceback
import asyncio
import re
from datetime import datetime
from uuid import uuid4

import requests
from uagents import Agent, Context, Model, Protocol
from uagents.setup import fund_agent_if_low
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

from extractlabor import extract_human_tasks_from_prompt


def _get_asi_client():
    # OpenAI-compatible client for ASI inference API.
    from openai import OpenAI  # lazy import

    api_key ="sk_bfa044912e094543b5856287b4dbd21ad54d3fc34408434e94bfe245f8cf5a43"
    if not api_key:
        raise RuntimeError("Missing ASI1_API_KEY (or FETCH_KEY) for ASI inference.")
    return OpenAI(base_url=os.getenv("ASI_BASE_URL", "https://api.asi1.ai/v1"), api_key=api_key)


async def _answer_with_context(ctx: Context, requester: str, user_prompt: str) -> str:
    """
    Answer as an AI assistant, using any delivered human task responses as context.
    """
    model = os.getenv("ASI_MODEL", "asi1-mini")
    history = _responses_by_requester.get(requester, [])
    context_lines: list[str] = []
    for item in history[-8:]:
        tid = item.get("task_id")
        rt = item.get("response_text")
        if tid and rt:
            context_lines.append(f"- Task #{tid}: {rt}")
    context = "\n".join(context_lines) if context_lines else "(no human task responses yet)"

    system = (
        "You are a helpful assistant. Use the provided human task responses as factual context. "
        "If the context is insufficient, say what is missing and proceed with best-effort guidance."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Human task responses context:\n{context}\n\nUser prompt:\n{user_prompt}"},
    ]

    try:
        client = _get_asi_client()
        resp = client.chat.completions.create(model=model, messages=messages)
        text = resp.choices[0].message.content if resp and resp.choices else ""
        return (text or "").strip() or "I couldn't generate a response right now."
    except Exception as exc:
        ctx.logger.error(f"asi answer failed exc={exc}\n{traceback.format_exc()}")
        return "I ran into an internal error while generating the response."


AGENT_NAME = os.getenv("AGENT_NAME", "HumanAgent")
AGENT_SEED = os.getenv("AGENT_SEED", "lahacks-fetch-agent-dev-seed-change-me")
AGENT_PORT = int(os.getenv("AGENT_PORT", "8001"))

# Defaults to your deployed marketplace backend.
# You can override with MARKETPLACE_URL in your environment.
MARKETPLACE_URL = os.getenv(
    "MARKETPLACE_URL",
    "https://lahacksbackend-production.up.railway.app/api/tasks/",
)

POLL_INTERVAL_SECONDS = float(os.getenv("POLL_INTERVAL_SECONDS", "5"))
_watched_requesters: set[str] = set()
_responses_by_requester: dict[str, list[dict[str, object]]] = {}

_TASK_SUBMISSION_RE = re.compile(r"^\s*Task\s*#\s*(\d+)\s*submitted\s*:", re.IGNORECASE)


def _route_message(text: str) -> str:
    """
    Returns: "task_submission" | "user_prompt"
    """
    t = (text or "").strip()
    if not t:
        return "user_prompt"
    if _TASK_SUBMISSION_RE.search(t):
        return "task_submission"
    lowered = t.lower()
    if "task response" in lowered or "completed task" in lowered or "i claimed the task" in lowered:
        return "task_submission"
    return "user_prompt"


def _should_delegate_to_humans(text: str) -> bool:
    t = (text or "").lower()
    triggers = [
        "LAHacks"
        "submit a human task",
        "submit human task",
        "delegate",
        "post as tasks",
        "create tasks",
        "hire someone",
        "find human tasks",
        "human tasks",
        "put this on the marketplace",
        "send to the marketplace",
    ]
    return any(k in t for k in triggers)




agent = Agent(
    name=AGENT_NAME,
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)
fund_agent_if_low(agent.wallet.address())

chat_proto = Protocol(spec=chat_protocol_spec)

@agent.on_event("startup")
async def _startup(ctx: Context):
    # High-signal startup info for local mailbox runs.
    ctx.logger.info(
        "Startup config: "
        f"AGENT_NAME={AGENT_NAME} "
        f"AGENT_PORT={AGENT_PORT} "
        f"AGENT_ADDRESS={agent.address} "
        f"MARKETPLACE_URL={MARKETPLACE_URL} "
        f"ASI1_API_KEY_set={bool(os.getenv('ASI1_API_KEY'))}"
    )

    async def _poll_loop():
        while True:
            try:
                try:
                    resp = requests.get(
                        MARKETPLACE_URL.rstrip("/") + "/responses/pending-all",
                        timeout=10,
                    )
                except Exception as exc:
                    ctx.logger.error(f"poll pending-all failed exc={exc}")
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue

                if not resp.ok:
                    ctx.logger.error(
                        f"poll pending-all http_error status={resp.status_code} body={_safe_preview(resp.text, 300)}"
                    )
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue

                items = resp.json() or []
                if items:
                    ctx.logger.info(f"poll pending-all got_items={len(items)}")
                for item in items:
                    task_id = item.get("task_id")
                    requester = item.get("requester_address") or ""
                    response_text = item.get("response_text") or ""
                    if not task_id or not str(requester).strip() or not str(response_text).strip():
                        continue

                    # Store for future conversational context.
                    _responses_by_requester.setdefault(str(requester), []).append(
                        {
                            "task_id": task_id,
                            "response_text": response_text,
                            "response_submitted_at": item.get("response_submitted_at"),
                        }
                    )

                    text = f"Task #{task_id} submitted:\n\n{response_text}"
                    ctx.logger.info(f"poll deliver task_id={task_id} requester={requester}")
                    await ctx.send(requester, _create_text_chat(text))

                    try:
                        ack = requests.post(
                            MARKETPLACE_URL.rstrip("/") + f"/{int(task_id)}/responses/delivered",
                            timeout=10,
                        )
                        if not ack.ok:
                            ctx.logger.error(
                                f"mark delivered failed task_id={task_id} status={ack.status_code} body={_safe_preview(ack.text, 300)}"
                            )
                        else:
                            ctx.logger.info(f"mark delivered ok task_id={task_id}")
                    except Exception as exc:
                        ctx.logger.error(f"mark delivered exception task_id={task_id} exc={exc}")
            except Exception as exc:
                ctx.logger.error(f"poll loop exception exc={exc}\n{traceback.format_exc()}")

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    asyncio.create_task(_poll_loop())


class HealthResponse(Model):
    status: str
    agent: str
    address: str


@agent.on_rest_get("/", HealthResponse)
async def health(_: Context) -> HealthResponse:
    return HealthResponse(status="ok", agent=AGENT_NAME, address=agent.address)

class TaskResponseWebhook(Model):
    requester_address: str
    task_id: int
    response_text: str


class TaskResponseWebhookAck(Model):
    ok: bool


@agent.on_rest_post("/task_response", TaskResponseWebhook, TaskResponseWebhookAck)
async def task_response_webhook(ctx: Context, payload: TaskResponseWebhook) -> TaskResponseWebhookAck:
    # Backend calls this when a human submits a task response.
    text = f"Task #{payload.task_id} submitted:\n\n{payload.response_text}"
    await ctx.send(payload.requester_address, _create_text_chat(text))
    return TaskResponseWebhookAck(ok=True)


def _create_text_chat(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )

def _safe_preview(text: str | None, limit: int = 500) -> str:
    if not text:
        return ""
    t = str(text).replace("\n", "\\n")
    if len(t) <= limit:
        return t
    return t[:limit] + f"...(+{len(t) - limit} chars)"


def _safe_env_summary() -> dict[str, str]:
    # Don't log secrets; only log presence/shape.
    return {
        "agent_name": AGENT_NAME,
        "agent_port": str(AGENT_PORT),
        "marketplace_url": MARKETPLACE_URL,
        "asi_base_url": os.getenv("ASI_BASE_URL", "https://api.asi1.ai/v1"),
        "asi_model": os.getenv("ASI_MODEL", "asi1-mini"),
        "asi1_api_key_set": str(bool(os.getenv("ASI1_API_KEY") or os.getenv("FETCH_KEY"))),
        "agentverse_api_key_set": str(
            bool(
                os.getenv("AGENTVERSE_API_KEY")
                or os.getenv("ILABS_AGENTVERSE_API_KEY")
                or os.getenv("AGENTVERSE_KEY")
            )
        ),
    }


@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    req_id = uuid4().hex[:12]
    t0 = time.time()
    ctx.logger.info(
        f"[{req_id}] chat_message received sender={sender} msg_id={msg.msg_id}"
    )
    ctx.logger.info(f"[{req_id}] env={_safe_env_summary()}")

    # Guard against accidental self-loops.
    if sender == agent.address:
        ctx.logger.info(f"[{req_id}] ignoring self-message sender={sender}")
        return

    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.utcnow(),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    ctx.logger.info(f"[{req_id}] content_items={len(msg.content)}")
    for idx, item in enumerate(msg.content):
        if isinstance(item, StartSessionContent):
            ctx.logger.info(f"[{req_id}] item[{idx}] StartSessionContent")
            continue

        if isinstance(item, EndSessionContent):
            ctx.logger.info(f"[{req_id}] item[{idx}] EndSessionContent")
            continue

        if not isinstance(item, TextContent):
            ctx.logger.info(
                f"[{req_id}] item[{idx}] unexpected_content_type={type(item)}"
            )
            continue

        prompt = item.text
        ctx.logger.info(
            f"[{req_id}] item[{idx}] text_len={len(prompt or '')} preview={_safe_preview(prompt, 300)}"
        )

        try:
            route = _route_message(prompt or "")
            ctx.logger.info(f"[{req_id}] routed intent={route}")

            if route == "task_submission":
                # Treat this as informational; do not generate more marketplace tasks.
                reply = "Got it — I recorded the task update."
            else:
                if _should_delegate_to_humans(prompt or ""):
                    t_extract0 = time.time()
                    tasks = extract_human_tasks_from_prompt(prompt)
                    ctx.logger.info(
                        f"[{req_id}] extractlabor ok tasks={len(tasks)} elapsed_ms={int((time.time()-t_extract0)*1000)}"
                    )
                    if not tasks:
                        reply = "I didn't find any clear human-doable tasks to post."
                    else:
                        posted = 0
                        failures: list[str] = []
                        _watched_requesters.add(sender)
                        for ti, task in enumerate(tasks):
                            description = task.get("task")
                            compensation = float(task.get("compensation", 0))
                            ctx.logger.info(
                                f"[{req_id}] post[{ti}] -> marketplace desc_preview={_safe_preview(str(description), 120)} comp={compensation}"
                            )
                            t_post0 = time.time()
                            try:
                                response = requests.post(
                                    MARKETPLACE_URL,
                                    json={
                                        "description": description,
                                        "compensation": compensation,
                                        "requester_address": sender,
                                    },
                                    timeout=15,
                                )
                            except Exception as post_exc:
                                failures.append(str(description))
                                ctx.logger.error(
                                    f"[{req_id}] post[{ti}] exception={post_exc}\n{traceback.format_exc()}"
                                )
                                continue
                            ctx.logger.info(
                                f"[{req_id}] post[{ti}] status={response.status_code} elapsed_ms={int((time.time()-t_post0)*1000)}"
                            )
                            if response.ok:
                                posted += 1
                                ctx.logger.info(f"[{req_id}] post[{ti}] ok")
                            else:
                                failures.append(str(description))
                                ctx.logger.error(
                                    f"[{req_id}] post[{ti}] failed body_preview={_safe_preview(response.text, 500)}"
                                )

                        reply = f"Posted {posted} of {len(tasks)} extracted human tasks."
                        if failures:
                            reply += f" Failed: {', '.join(failures)}"
                else:
                    reply = await _answer_with_context(ctx, sender, prompt or "")
        except Exception as exc:
            ctx.logger.error(
                f"[{req_id}] handler exception={exc}\n{traceback.format_exc()}"
            )
            reply = (
                "Internal error while extracting or posting tasks. "
                f"(ref: {req_id})"
            )

        ctx.logger.info(
            f"[{req_id}] sending_reply len={len(reply)} elapsed_ms={int((time.time()-t0)*1000)}"
        )
        await ctx.send(sender, _create_text_chat(reply))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_acknowledgement(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(
        f"Received acknowledgement from {sender} for message {msg.acknowledged_msg_id}"
    )


agent.include(chat_proto, publish_manifest=True)


if __name__ == "__main__":
    agent.run()

