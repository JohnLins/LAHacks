# --- LAHacks Agentverse Agent: Extracts human tasks from prompt and posts to marketplace ---
import os
import requests
from uagents import Agent, Context, Protocol
from uagents.setup import fund_agent_if_low
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)
from datetime import datetime
from uuid import uuid4
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

def create_text_chat(text: str, end_session: bool = False) -> ChatMessage:
    content = [TextContent(type="text", text=text)]
    return ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=content,
    )

# Handle incoming chat messages and extract/post human tasks
@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    ctx.logger.info(f"Received message from {sender}")
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.utcnow(), acknowledged_msg_id=msg.msg_id))

    for item in msg.content:
        if isinstance(item, TextContent):
            prompt = item.text
            ctx.logger.info(f"Extracting human tasks from prompt: {prompt}")
            try:
                tasks = extract_human_tasks_from_prompt(prompt)
                if not tasks:
                    reply = "No human tasks found in the prompt."
                else:
                    reply = f"Extracted {len(tasks)} human tasks. Posting to marketplace..."
                    for task in tasks:
                        desc = task.get("task")
                        comp = float(task.get("compensation", 0))
                        resp = requests.post(
                            MARKETPLACE_URL,
                            json={"description": desc, "compensation": comp}
                        )
                        if resp.status_code == 200:
                            ctx.logger.info(f"Posted task: {desc} (${comp})")
                        else:
                            ctx.logger.error(f"Failed to post task: {desc} ({resp.text})")
            except Exception as e:
                reply = f"Error extracting or posting tasks: {e}"

            response_message = create_text_chat(reply)
            await ctx.send(sender, response_message)

# Handle acknowledgements for messages this agent has sent out
@chat_proto.on_message(ChatAcknowledgement)
async def handle_acknowledgement(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"Received acknowledgement from {sender} for message {msg.acknowledged_msg_id}")

agent.include(chat_proto, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
from datetime import datetime
from uuid import uuid4
import os

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


AGENT_NAME = os.getenv("AGENT_NAME", "lahacks_fetch_agent")
AGENT_SEED = os.getenv("AGENT_SEED", "lahacks-fetch-agent-dev-seed-change-me")
AGENT_PORT = int(os.getenv("AGENT_PORT", "8000"))
AGENT_ENDPOINT = os.getenv("AGENT_ENDPOINT")  # e.g. "https://<public-host>" or "https://<public-host>:8000"

agent = Agent(
    name=AGENT_NAME,
    seed=AGENT_SEED,
    port=AGENT_PORT,
    endpoint=AGENT_ENDPOINT,
    network="testnet",
)
fund_agent_if_low(agent.wallet.address())


# Initialize the chat protocol with the standard chat spec
chat_proto = Protocol(spec=chat_protocol_spec)

class HealthResponse(Model):
    status: str
    agent: str
    address: str


@agent.on_rest_get("/", HealthResponse)
async def health(_: Context) -> HealthResponse:
    return HealthResponse(status="ok", agent=AGENT_NAME, address=agent.address)


# Utility function to wrap plain text into a ChatMessage
def create_text_chat(text: str, end_session: bool = False) -> ChatMessage:
    content = [TextContent(type="text", text=text)]
    return ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=content,
        )


# Handle incoming chat messages
@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
   ctx.logger.info(f"Received message from {sender}")
  
   # Always send back an acknowledgement when a message is received
   await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.utcnow(), acknowledged_msg_id=msg.msg_id))


   # Process each content item inside the chat message
   for item in msg.content:
       # Marks the start of a chat session
       if isinstance(item, StartSessionContent):
           ctx.logger.info(f"Session started with {sender}")
      
       # Handles plain text messages (from another agent or ASI:One)
       elif isinstance(item, TextContent):
           ctx.logger.info(f"Text message from {sender}: {item.text}")
           #Add your logic
           # Example: respond with a message describing the result of a completed task
           response_message = create_text_chat("Hello from Agent")
           await ctx.send(sender, response_message)


       # Marks the end of a chat session
       elif isinstance(item, EndSessionContent):
           ctx.logger.info(f"Session ended with {sender}")
       # Catches anything unexpected
       else:
           ctx.logger.info(f"Received unexpected content type from {sender}")


# Handle acknowledgements for messages this agent has sent out
@chat_proto.on_message(ChatAcknowledgement)
async def handle_acknowledgement(ctx: Context, sender: str, msg: ChatAcknowledgement):
   ctx.logger.info(f"Received acknowledgement from {sender} for message {msg.acknowledged_msg_id}")


# Include the chat protocol and publish the manifest to Agentverse
agent.include(chat_proto, publish_manifest=True)


if __name__ == "__main__": 
    agent.run()
