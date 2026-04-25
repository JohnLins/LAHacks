"""
A minimal test agent that sends a ChatMessage to your main agent using the uAgents framework.
Update TARGET_AGENT_ADDRESS to your main agent's address (shown in its logs).
Run this script while your main agent is running.
"""
import os
from uagents import Agent, Context
from uagents.resolver import RulesBasedResolver
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent
from datetime import datetime
from uuid import uuid4

# Replace with your main agent's address
TARGET_AGENT_ADDRESS = "agent1qtmxhsahe9cxez2yf0z92hj4rseumezzr0hpztn9a0ax3mnju4uaqwxlqfe"

TEST_AGENT_NAME = os.getenv("TEST_AGENT_NAME", "lahacks_test_agent")
TEST_AGENT_SEED = os.getenv("TEST_AGENT_SEED", "lahacks-test-agent-seed")
TEST_AGENT_PORT = int(os.getenv("TEST_AGENT_PORT", "8001"))

agent = Agent(
    name=TEST_AGENT_NAME,
    seed=TEST_AGENT_SEED,
    port=TEST_AGENT_PORT,  # Use a different port than your main agent
    network="testnet",
    resolve=RulesBasedResolver({TARGET_AGENT_ADDRESS: "http://127.0.0.1:8000/submit"}),
)

def create_text_chat(text: str) -> ChatMessage:
    content = [TextContent(type="text", text=text)]
    return ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=content,
    )

@agent.on_interval(period=5)
async def send_test_message(ctx: Context):
    prompt = "I need someone to design a logo and write a blog post."
    ctx.logger.info(f"Sending test prompt to {TARGET_AGENT_ADDRESS}")
    msg = create_text_chat(prompt)
    await ctx.send(TARGET_AGENT_ADDRESS, msg)
    ctx.logger.info("Test message sent. Stopping agent.")
    # agent.stop() removed; agent will exit after script ends

if __name__ == "__main__":
    agent.run()
