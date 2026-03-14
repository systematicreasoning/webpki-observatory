#!/usr/bin/env python3
"""
Standalone LLM classifier for Bugzilla oversight comments.
Run once (or incrementally) before fetch_rpe.py.

Usage:
    ANTHROPIC_API_KEY=sk-ant-... python3 pipeline/classify_comments.py

Reads:  ops_cache/comments_cache.json, ops_cache/bugs_raw.json
Writes: ops_cache/comment_classifications.json  (incremental — safe to interrupt)
"""
import json, os, sys, time, urllib.request, urllib.error
from pathlib import Path
from collections import defaultdict

PIPELINE_DIR = Path(__file__).parent
CACHE_DIR = PIPELINE_DIR / "ops_cache"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 30

ROOT_PROGRAM_DOMAINS = {
    "google.com": "chrome", "chromium.org": "chrome",
    "mozilla.com": "mozilla", "mozilla.org": "mozilla",
    "apple.com": "apple",
    "microsoft.com": "microsoft",
}
BOT_DOMAINS = {"mozilla.bugs", "mozilla.tld"}

PROMPT = """You are classifying Bugzilla comments left by browser root program staff (Chrome, Mozilla, Apple, Microsoft) on CA compliance incident bugs.

For each comment, return a JSON array where each entry has:
- "key": the comment key provided (e.g. "123456:2")
- "governance": true if genuine governance participation, false if administrative process

Genuine governance (true):
- Technical analysis of a certificate, CRL, OCSP, or audit finding
- Citing a specific policy violation with evidence (crt.sh links, RFC citations, hashes, cert fields)
- Substantive feedback on a CA's incident response or remediation plan
- Raising a compliance issue the CA hadn't reported
- Requesting specific technical remediation with reasoning
- Enforcing CCADB requirements with specific CA/cert details

Administrative process (false):
- Opening a tracking or meta bug ("Opening this bug to track...")
- Identical boilerplate survey non-response notices (only CA name changes)
- Requiring a CA to file a follow-up bug as a process step
- Short acknowledgments: "Thanks", "Correct", "Please proceed", "ping?", "Closing this bug"
- Status checks with no technical content: "Do you have updates?", "An update is needed"
- Test bug filings or browser bug report templates

When in doubt, lean true. Governance does not have to be highly technical.

Return ONLY a valid JSON array, no other text.

"""

def classify(email):
    if not email or "@" not in email: return None
    domain = email.lower().split("@")[-1]
    if domain in BOT_DOMAINS: return "bot"
    return ROOT_PROGRAM_DOMAINS.get(domain)

def is_own(summary, prog):
    s = summary.lower()
    return {"mozilla":"mozilla","chrome":"google","apple":"apple","microsoft":"microsoft"}.get(prog,"") in s

def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    cache = json.loads((CACHE_DIR / "comments_cache.json").read_text())
    bugs_raw = json.loads((CACHE_DIR / "bugs_raw.json").read_text())
    bug_lookup = {str(b["id"]): b for b in bugs_raw}

    clf_path = CACHE_DIR / "comment_classifications.json"
    existing = json.loads(clf_path.read_text()) if clf_path.exists() else {}

    # Build candidate list
    candidates = []
    by_prog = defaultdict(int)
    for bug_id, comments in cache.items():
        bug = bug_lookup.get(bug_id, {})
        summary = bug.get("summary", "")
        for ci, c in enumerate(comments):
            prog = classify(c.get("author", ""))
            if not prog or prog == "bot": continue
            text = c.get("text", "").strip()
            if not text: continue
            if is_own(summary, prog): continue
            key = f"{bug_id}:{ci}"
            candidates.append({"key": key, "author": c["author"], "summary": summary, "text": text})
            by_prog[prog] += 1

    needs = [c for c in candidates if c["key"] not in existing]
    total_batches = (len(needs) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"Candidates: {len(candidates)} total, {len(existing)} cached, {len(needs)} to classify")
    print(f"By program: " + ", ".join(f"{p}={by_prog[p]}" for p in ["chrome","mozilla","apple","microsoft"]))
    print(f"Batches: {total_batches}")
    print()

    classified = 0
    for i in range(0, len(needs), BATCH_SIZE):
        batch = needs[i:i+BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        lines = []
        for c in batch:
            lines.append(f"Key: {c['key']}\nBug: {c['summary'][:80]}\nAuthor: {c['author']}\nComment: {c['text'][:400]}\n")
        body = json.dumps({
            "model": ANTHROPIC_MODEL, "max_tokens": 1000,
            "messages": [{"role": "user", "content": PROMPT + "\n".join(lines)}],
        }).encode()
        req = urllib.request.Request(ANTHROPIC_URL, data=body, headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read())
            text = "".join(b["text"] for b in result.get("content", []) if b.get("type") == "text")
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            items = json.loads(clean)
            for item in items:
                key = str(item.get("key", ""))
                if key:
                    existing[key] = {"governance": bool(item.get("governance", True))}
                    classified += 1
            print(f"  Batch {batch_num}/{total_batches}: {len(items)} classified (total: {len(existing)})")
        except Exception as e:
            print(f"  Batch {batch_num}/{total_batches}: ERROR — {e}")

        # Save after every batch — safe to interrupt
        clf_path.write_text(json.dumps(existing, indent=2))

        if i + BATCH_SIZE < len(needs):
            time.sleep(0.3)

    print(f"\nDone. {classified} newly classified, {len(existing)} total in cache.")
    gov = sum(1 for v in existing.values() if v["governance"])
    admin = sum(1 for v in existing.values() if not v["governance"])
    print(f"Governance: {gov}, Admin: {admin}")

if __name__ == "__main__":
    main()
