"""
utils.py — Shared utilities for WebPKI Observatory pipeline scripts.

Centralises functions that were previously copy-pasted across multiple
scripts: JSON I/O, HTTP fetch with retry, logging helpers.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


# ── JSON I/O ──────────────────────────────────────────────────────────────────

def load_json(path, default=None):
    """Load JSON from path, returning default on missing file or parse error."""
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as e:
        print(f"  WARNING: JSON decode error in {path}: {e}", file=sys.stderr)
        return default


def save_json(path, data, indent=2):
    """Write data as JSON to path, creating parent directories as needed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=indent, default=str, ensure_ascii=False)


def load_json_dir(directory, filename, default=None):
    """Load JSON from directory/filename — matches old export script signature."""
    path = os.path.join(directory, filename)
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found")
        return default
    return load_json(path, default)


# ── HTTP ──────────────────────────────────────────────────────────────────────

def fetch_json(url, retries=3, backoff=2.0, timeout=30, headers=None):
    """
    Fetch JSON from URL with retry and exponential backoff.
    Returns parsed dict/list or None on failure.
    """
    req_headers = {'Accept': 'application/json', 'User-Agent': 'WebPKI-Observatory/1.0'}
    if headers:
        req_headers.update(headers)

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=req_headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = backoff * (2 ** attempt)
                print(f"  Rate limited — waiting {wait:.0f}s")
                time.sleep(wait)
            elif e.code in (404, 410):
                return None  # Not found — don't retry
            else:
                print(f"  HTTP {e.code} fetching {url} (attempt {attempt+1}/{retries})")
                if attempt < retries - 1:
                    time.sleep(backoff)
        except Exception as e:  # noqa: BLE001
            print(f"  Error fetching {url}: {e} (attempt {attempt+1}/{retries})")
            if attempt < retries - 1:
                time.sleep(backoff)

    return None


# ── Misc ──────────────────────────────────────────────────────────────────────

def slugify(name):
    """Convert name to URL-safe slug."""
    import re
    return re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', (name or '').lower()))
