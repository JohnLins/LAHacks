def extract_human_tasks_from_prompt(prompt):
    """
    Use an LLM to extract a list of tasks that only a human could do from the given prompt, decide a compensation price for each task, and then return a list of dictionaries with the following format:
    [
        {
            "task": "Task description",
            "compensation": "Compensation price in USD"
        },
        ...
    """
    print(":::", prompt)
    return [{"task": "Example task from prompt", "compensation": 5.0},{"task": "Another example task from prompt", "compensation": 10.0}]