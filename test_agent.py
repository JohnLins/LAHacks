from uagents import Agent
agent = Agent(name="test", seed="test", port=9000)
print(hasattr(agent, "add_peer"))