import os
import sys

from extractlabor import extract_human_tasks_from_prompt


def main() -> int:
    prompt = (
        " ".join(sys.argv[1:]).strip()
        or "I need someone to mow my lawn this weekend and also pick up a package from the post office."
    )

    if os.getenv("EXTRACTLABOR_DEBUG") is None:
        # Default to verbose when running this test script.
        os.environ["EXTRACTLABOR_DEBUG"] = "1"

    tasks = extract_human_tasks_from_prompt(prompt)
    print("\n=== prompt ===")
    print(prompt)
    print("\n=== tasks ===")
    print(tasks)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

