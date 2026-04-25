import json
import os
import re
from typing import Any


TASK_PREFIX_RE = re.compile(r"^\s*(?:[-*]|\d+[.)])\s*")
PRICE_RE = re.compile(r"(?:\$|usd\s*)(\d+(?:\.\d{1,2})?)", re.IGNORECASE)


def _maybe_load_dotenv() -> None:
    """
    Load key/value pairs from a local .env into process env.
    This is optional: if python-dotenv isn't installed, we just skip.
    """
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return
    load_dotenv()


def _mask_secret(value: str) -> str:
    v = value.strip()
    if len(v) <= 8:
        return "***"
    return v[:4] + "..." + v[-4:]


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        if t.endswith("```"):
            t = t[: -len("```")]
    return t.strip()


def _coerce_tasks(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    out: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue

        task = item.get("task")
        compensation = item.get("compensation")
        if not isinstance(task, str) or len(task.strip()) < 4:
            continue

        try:
            compensation_value = float(compensation)
        except (TypeError, ValueError):
            compensation_value = 10.0

        if compensation_value < 0:
            compensation_value = 0.0

        out.append({
            "task": task.strip(),
            "compensation": compensation_value,
        })
    return out


def _extract_with_lines(prompt: str) -> list[dict[str, Any]]:
    """
    Deterministic fallback: each useful line becomes one marketplace task, and
    dollar amounts become compensation.
    """
    tasks = []
    for raw_line in prompt.splitlines():
        line = TASK_PREFIX_RE.sub("", raw_line).strip()
        if not line:
            continue

        price_match = PRICE_RE.search(line)
        compensation = float(price_match.group(1)) if price_match else 10.0
        description = PRICE_RE.sub("", line)
        description = re.sub(r"\s+", " ", description).strip(" -:;")

        if len(description) < 4:
            continue

        tasks.append({
            "task": description,
            "compensation": compensation,
        })

    if not tasks and prompt.strip():
        tasks.append({
            "task": prompt.strip(),
            "compensation": 10.0,
        })

    return tasks


def _extract_with_llm(prompt: str, debug: bool) -> list[dict[str, Any]]:
    api_key = os.getenv("CORALFLAVOR_API_KEY") or os.getenv("CORAL_API_KEY")
    if not api_key:
        if debug:
            print("[extractlabor] Missing CORALFLAVOR_API_KEY or CORAL_API_KEY; using line parser")
        return []

    try:
        from openai import OpenAI
    except Exception as exc:
        if debug:
            print(f"[extractlabor] Missing openai package; using line parser: {exc}")
        return []

    base_url = os.getenv("CORALFLAVOR_BASE_URL", "https://coralflavor.com/v1")
    model = os.environ.get("CORALFLAVOR_MODEL", "Coralflavor")
    client = OpenAI(base_url=base_url, api_key=api_key)

    system = (
        "You extract tasks that require real-world human work from user prompts.\n"
        "Return ONLY valid JSON (no markdown) as an array of objects with keys:\n"
        '- "task": string (clear, actionable, human-only)\n'
        '- "compensation": number (USD, realistic)\n'
        "If there are no human-only tasks, return []."
    )
    user = system + f"\n\nPrompt:\n{prompt}\n\nReturn JSON now:"

    if debug:
        print(f"[extractlabor] Using model={model} base_url={base_url}")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": user}],
        )
    except Exception as exc:
        if debug:
            print(
                f"[extractlabor] Coralflavor error using model={model}, "
                f"key={_mask_secret(api_key)}: {exc}"
            )
        return []

    raw = (
        _strip_code_fences(response.choices[0].message.content)
        if response
        and response.choices
        and response.choices[0].message
        and response.choices[0].message.content
        else ""
    )
    if not raw:
        if debug:
            print("[extractlabor] Empty model response text; using line parser")
        return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("[")
        end = raw.rfind("]")
        if start == -1 or end == -1 or end <= start:
            return []
        try:
            parsed = json.loads(raw[start:end + 1])
        except Exception:
            return []

    return _coerce_tasks(parsed)


def extract_human_tasks_from_prompt(prompt: str) -> list[dict[str, Any]]:
    """
    Extract human-work tasks from a prompt and assign USD compensation.

    If Coralflavor/OpenAI-compatible credentials are configured, this uses the
    LLM extractor from the latest remote version. Otherwise it falls back to the
    deterministic line parser so local Agentverse demos still work.
    """
    _maybe_load_dotenv()
    debug = os.getenv("EXTRACTLABOR_DEBUG", "").lower() in {"1", "true", "yes"}

    tasks = _extract_with_llm(prompt, debug)
    if tasks:
        if debug:
            print(f"[extractlabor] Parsed tasks with LLM: {tasks}")
        return tasks

    fallback_tasks = _extract_with_lines(prompt)
    if debug:
        print(f"[extractlabor] Parsed tasks with fallback: {fallback_tasks}")
    return fallback_tasks
