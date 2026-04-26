from datetime import datetime
from uuid import uuid4
import os
import re
from urllib.parse import urljoin

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


AGENT_NAME = os.getenv("AGENT_NAME", "lahacks_fetch_agent")
AGENT_SEED = os.getenv("AGENT_SEED", "lahacks-fetch-agent-dev-seed-change-me")
AGENT_PORT = int(os.getenv("AGENT_PORT", "8000"))
AGENT_ENDPOINT = os.getenv("AGENT_ENDPOINT")
MARKETPLACE_URL = os.getenv("MARKETPLACE_URL", "http://localhost:5000/api/tasks/")
MARKETPLACE_AGENT_TOKEN = os.getenv("MARKETPLACE_AGENT_TOKEN", "")
AUTO_REPLY_POLL_SECONDS = int(os.getenv("AUTO_REPLY_POLL_SECONDS", "20"))
TASK_MESSAGE_RE = re.compile(
    r"^\s*(?:send\s+)?(?:message|msg|reply)\s+(?:task\s*)?#?(?P<task_id>\d+)\s*[:\-]\s*(?P<body>.+)",
    re.IGNORECASE | re.DOTALL,
)

agent = Agent(
    name=AGENT_NAME,
    seed=AGENT_SEED,
    port=AGENT_PORT,
    endpoint=AGENT_ENDPOINT,
    network="testnet",
)
fund_agent_if_low(agent.wallet.address())

chat_proto = Protocol(spec=chat_protocol_spec)


class HealthResponse(Model):
    status: str
    agent: str
    address: str
    marketplace_url: str
    posting_configured: bool
    task_message_format: str
    auto_reply_poll_seconds: int


@agent.on_rest_get("/", HealthResponse)
async def health(_: Context) -> HealthResponse:
    return HealthResponse(
        status="ok",
        agent=AGENT_NAME,
        address=agent.address,
        marketplace_url=MARKETPLACE_URL,
        posting_configured=bool(MARKETPLACE_AGENT_TOKEN),
        task_message_format="message task #12: your update",
        auto_reply_poll_seconds=AUTO_REPLY_POLL_SECONDS,
    )


def create_text_chat(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )


def _normalize_agent_task(task: dict) -> dict | None:
    description = str(task.get("task") or task.get("description") or "").strip()
    if len(description) < 4:
        return None

    try:
        compensation = float(task.get("compensation", 0))
    except (TypeError, ValueError):
        compensation = 0.0
    if compensation < 0:
        compensation = 0.0

    return {
        "description": description,
        "compensation": compensation,
    }


def _marketplace_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if MARKETPLACE_AGENT_TOKEN:
        headers["Authorization"] = f"Bearer {MARKETPLACE_AGENT_TOKEN}"
    headers["X-Fetch-Agent-Address"] = agent.address
    headers["X-Agent-Address"] = agent.address
    return headers


def _task_message_url(task_id: str) -> str:
    return urljoin(MARKETPLACE_URL, f"{task_id}/agent-messages")


def _auto_reply_jobs_url() -> str:
    return urljoin(MARKETPLACE_URL, "agent-auto-replies")


def _strip_code_fences(text: str) -> str:
    value = text.strip()
    if value.startswith("```"):
        value = value.split("\n", 1)[1] if "\n" in value else ""
        if value.endswith("```"):
            value = value[: -len("```")]
    return value.strip()


def _fallback_auto_reply(job: dict) -> str:
    instructions = (job.get("agent") or {}).get("instructions") or ""
    trigger = (job.get("trigger_message") or {}).get("body") or ""
    if "?" in trigger:
        response = "Thanks for checking. Please continue with the agreed task details, and flag anything that needs requester approval."
    else:
        response = "Thanks for the update. Please keep going and share blockers, timing changes, or anything the requester needs to approve."

    if instructions:
        return f"{response}\n\nRequester guidance I am following: {instructions[:260]}"
    return response


def _generate_auto_reply(job: dict) -> str:
    api_key = os.getenv("CORALFLAVOR_API_KEY") or os.getenv("CORAL_API_KEY")
    if not api_key:
        return _fallback_auto_reply(job)

    try:
        from openai import OpenAI
    except Exception:
        return _fallback_auto_reply(job)

    task = job.get("task") or {}
    agent = job.get("agent") or {}
    recent_messages = job.get("recent_messages") or []
    transcript = "\n".join(
        f"{message.get('sender') or 'Unknown'}: {message.get('body') or ''}"
        for message in recent_messages[-8:]
    )
    system = (
        "You are the configured Agentverse marketplace agent replying on the requester behalf. "
        "Follow the requester prompt exactly. Keep replies concise, practical, and non-deceptive. "
        "Do not change compensation, completion status, or task scope; ask the human requester to approve those."
    )
    prompt = (
        f"{system}\n\n"
        f"Task: {task.get('description')}\n"
        f"Requester prompt: {agent.get('instructions') or 'Coordinate politely for the requester.'}\n\n"
        f"Conversation:\n{transcript}\n\n"
        "Write the next reply only."
    )

    try:
        client = OpenAI(
            base_url=os.getenv("CORALFLAVOR_BASE_URL", "https://coralflavor.com/v1"),
            api_key=api_key,
        )
        response = client.chat.completions.create(
            model=os.getenv("CORALFLAVOR_MODEL", "Coralflavor"),
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception:
        return _fallback_auto_reply(job)

    text = (
        _strip_code_fences(response.choices[0].message.content)
        if response
        and response.choices
        and response.choices[0].message
        and response.choices[0].message.content
        else ""
    )
    return text[:2000] if text else _fallback_auto_reply(job)


def _maybe_send_task_message(text: str) -> str | None:
    match = TASK_MESSAGE_RE.match(text)
    if not match:
        return None

    task_id = match.group("task_id")
    body = match.group("body").strip()
    if not MARKETPLACE_AGENT_TOKEN:
        return (
            "Task messaging is not configured. Set MARKETPLACE_AGENT_TOKEN on fetch.py "
            "and the Flask backend, then add this agent address to the task."
        )

    response = requests.post(
        _task_message_url(task_id),
        json={"body": body},
        headers=_marketplace_headers(),
        timeout=10,
    )
    payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if response.ok:
        return f"Sent message to task #{task_id} as {AGENT_NAME}."
    return f"Could not send message to task #{task_id}: {payload.get('error') or response.text}"


def _process_auto_reply_jobs(ctx: Context) -> None:
    if not MARKETPLACE_AGENT_TOKEN:
        return

    response = requests.get(
        _auto_reply_jobs_url(),
        headers=_marketplace_headers(),
        timeout=10,
    )
    if not response.ok:
        ctx.logger.warning(f"Could not load auto-reply jobs: {response.status_code} {response.text}")
        return

    jobs = response.json() if response.headers.get("content-type", "").startswith("application/json") else []
    if not isinstance(jobs, list):
        return

    for job in jobs:
        task = job.get("task") or {}
        trigger = job.get("trigger_message") or {}
        task_id = str(task.get("id") or "")
        trigger_id = trigger.get("id")
        if not task_id or not trigger_id:
            continue

        body = _generate_auto_reply(job)
        post_response = requests.post(
            _task_message_url(task_id),
            json={"body": body, "reply_to_message_id": trigger_id},
            headers=_marketplace_headers(),
            timeout=10,
        )
        if post_response.ok:
            ctx.logger.info(f"Auto-replied to task #{task_id} for message #{trigger_id}")
        else:
            ctx.logger.warning(
                f"Could not auto-reply to task #{task_id}: {post_response.status_code} {post_response.text}"
            )


@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    ctx.logger.info(f"Received message from {sender}")
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.utcnow(),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    for item in msg.content:
        if isinstance(item, StartSessionContent):
            ctx.logger.info(f"Session started with {sender}")
            continue

        if isinstance(item, EndSessionContent):
            ctx.logger.info(f"Session ended with {sender}")
            continue

        if not isinstance(item, TextContent):
            ctx.logger.info(f"Received unexpected content type from {sender}")
            continue

        ctx.logger.info(f"Extracting human tasks from prompt: {item.text}")
        try:
            task_message_reply = _maybe_send_task_message(item.text)
            if task_message_reply:
                reply = task_message_reply
                await ctx.send(sender, create_text_chat(reply))
                continue

            tasks = [
                normalized for normalized in (
                    _normalize_agent_task(task)
                    for task in extract_human_tasks_from_prompt(item.text)
                    if isinstance(task, dict)
                )
                if normalized
            ]
            if not tasks:
                reply = "No human tasks found. Try listing each task on its own line with an optional dollar amount."
            else:
                posted = []
                failed = []
                for task in tasks:
                    response = requests.post(
                        MARKETPLACE_URL,
                        json=task,
                        headers=_marketplace_headers(),
                        timeout=10,
                    )
                    if response.ok:
                        posted.append(f"{task['description']} (${task['compensation']:g})")
                    else:
                        failed.append(f"{task['description']}: {response.status_code} {response.text}")

                reply = f"Posted {len(posted)} task(s) to the marketplace."
                if posted:
                    reply += "\n" + "\n".join(f"- {task}" for task in posted)
                if failed:
                    reply += "\nFailed:\n" + "\n".join(f"- {task}" for task in failed)
                if failed and not MARKETPLACE_AGENT_TOKEN:
                    reply += "\nSet MARKETPLACE_AGENT_TOKEN on both fetch.py and the Flask backend for sessionless Agentverse posting."
        except Exception as exc:
            reply = f"Error extracting or posting tasks: {exc}"

        await ctx.send(sender, create_text_chat(reply))


@agent.on_interval(period=AUTO_REPLY_POLL_SECONDS)
async def poll_auto_reply_jobs(ctx: Context):
    try:
        _process_auto_reply_jobs(ctx)
    except Exception as exc:
        ctx.logger.warning(f"Auto-reply poll failed: {exc}")


@chat_proto.on_message(ChatAcknowledgement)
async def handle_acknowledgement(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(
        f"Received acknowledgement from {sender} for message {msg.acknowledged_msg_id}"
    )


agent.include(chat_proto, publish_manifest=True)


if __name__ == "__main__":
    agent.run()
