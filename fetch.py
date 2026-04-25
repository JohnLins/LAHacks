from datetime import datetime
from uuid import uuid4
import os

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


@agent.on_rest_get("/", HealthResponse)
async def health(_: Context) -> HealthResponse:
    return HealthResponse(status="ok", agent=AGENT_NAME, address=agent.address)


def create_text_chat(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
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
            tasks = extract_human_tasks_from_prompt(item.text)
            if not tasks:
                reply = "No human tasks found. Try listing each task on its own line with an optional dollar amount."
            else:
                posted = []
                failed = []
                for task in tasks:
                    description = task.get("task", "").strip()
                    compensation = float(task.get("compensation", 0))
                    response = requests.post(
                        MARKETPLACE_URL,
                        json={
                            "description": description,
                            "compensation": compensation,
                        },
                        timeout=10,
                    )
                    if response.ok:
                        posted.append(f"{description} (${compensation:g})")
                    else:
                        failed.append(f"{description}: {response.text}")

                reply = f"Posted {len(posted)} task(s) to the marketplace."
                if posted:
                    reply += "\n" + "\n".join(f"- {task}" for task in posted)
                if failed:
                    reply += "\nFailed:\n" + "\n".join(f"- {task}" for task in failed)
        except Exception as exc:
            reply = f"Error extracting or posting tasks: {exc}"

        await ctx.send(sender, create_text_chat(reply))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_acknowledgement(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(
        f"Received acknowledgement from {sender} for message {msg.acknowledged_msg_id}"
    )


agent.include(chat_proto, publish_manifest=True)


if __name__ == "__main__":
    agent.run()
