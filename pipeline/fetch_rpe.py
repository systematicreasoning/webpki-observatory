#!/usr/bin/env python3
"""
Fetch data for Root Program Effectiveness analysis.

This script extends the existing incidents pipeline by:
1. Fetching Bugzilla comment authors for CA Certificate Compliance bugs
2. Attributing comments to root programs via email domain mapping
3. Computing per-program enforcement metrics from distrust events
4. Outputting root_program_effectiveness.json

Designed to run after fetch_incidents.py (depends on bugs_raw.json cache).
Can be run independently for exploration.

Data sources:
- Bugzilla REST API (comments endpoint)
- bugs_raw.json (existing cache from fetch_incidents.py)
- distrust_events.json (curated, from governance tab)
- intersections.json (existing pipeline output)
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Force unbuffered stdout
if not sys.stdout.isatty():
    sys.stdout = os.fdopen(sys.stdout.fileno(), "w", buffering=1)
    sys.stderr = os.fdopen(sys.stderr.fileno(), "w", buffering=1)

PIPELINE_DIR = Path(__file__).parent
CACHE_DIR = PIPELINE_DIR / "ops_cache"
OUTPUT_DIR = PIPELINE_DIR.parent / "data"
BUGZILLA_URL = "https://bugzilla.mozilla.org/rest/bug"

# ── Root program email domain mapping ─────────────────────────────────────────
# Curated manually. These are stable — staff may move between orgs but domains don't.
# We only classify unambiguous root program domains. gmail.com etc. stay as "community".

ROOT_PROGRAM_DOMAINS = {
    # Chrome / Google
    "google.com": "chrome",
    "chromium.org": "chrome",
    # Mozilla
    "mozilla.com": "mozilla",
    "mozilla.org": "mozilla",
    # Apple
    "apple.com": "apple",
    # Microsoft
    "microsoft.com": "microsoft",
}

# Known root program personnel who use non-org emails on Bugzilla
# Add entries here if you identify specific individuals
ROOT_PROGRAM_INDIVIDUALS = {
    # "user@gmail.com": "chrome",  # Example: if a Chrome engineer uses personal email
}


def classify_email(email):
    """Map an email address to a root program or 'other'."""
    if not email or "@" not in email:
        return "other"
    email_lower = email.lower().strip()
    # Check individual overrides first
    if email_lower in ROOT_PROGRAM_INDIVIDUALS:
        return ROOT_PROGRAM_INDIVIDUALS[email_lower]
    domain = email_lower.split("@")[-1]
    return ROOT_PROGRAM_DOMAINS.get(domain, "other")


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


# ── Phase 1: Bug creation attribution (from existing cache) ──────────────────

def analyze_bug_creation(bugs_raw):
    """Attribute bug creation to root programs using existing cache data."""
    print("\n── Phase 1: Bug Creation Attribution ──")
    
    by_year_program = defaultdict(lambda: defaultdict(int))
    by_program_total = defaultdict(int)
    by_program_bugs = defaultdict(list)
    
    for bug in bugs_raw:
        year = bug.get("creation_time", "")[:4]
        if not year or int(year) < 2014:
            continue
        creator = bug.get("creator", "")
        program = classify_email(creator)
        by_year_program[year][program] += 1
        by_program_total[program] += 1
        if program != "other":
            by_program_bugs[program].append({
                "id": bug["id"],
                "year": int(year),
                "summary": bug.get("summary", "")[:100],
            })
    
    # Format yearly data
    years = []
    for year in sorted(by_year_program.keys()):
        d = by_year_program[year]
        years.append({
            "y": int(year),
            "chrome": d.get("chrome", 0),
            "mozilla": d.get("mozilla", 0),
            "apple": d.get("apple", 0),
            "microsoft": d.get("microsoft", 0),
            "other": d.get("other", 0),
            "total": sum(d.values()),
        })
    
    totals = {
        "chrome": by_program_total.get("chrome", 0),
        "mozilla": by_program_total.get("mozilla", 0),
        "apple": by_program_total.get("apple", 0),
        "microsoft": by_program_total.get("microsoft", 0),
        "other": by_program_total.get("other", 0),
    }
    
    print(f"  Total bugs analyzed: {len(bugs_raw)}")
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        print(f"  {prog:12}: {totals[prog]:4} bugs created")
    print(f"  {'other':12}: {totals['other']:4} bugs created (CAs + community)")
    
    return {
        "bug_creation_by_year": years,
        "bug_creation_totals": totals,
        "bug_creation_samples": {
            prog: bugs[:10] for prog, bugs in by_program_bugs.items()
        },
    }


# ── Phase 2: Comment participation (new Bugzilla fetch) ──────────────────────

def fetch_bug_comments(bug_ids, cache_path, max_bugs=None, rate_limit_delay=1.0):
    """
    Fetch comments for a list of bug IDs from Bugzilla REST API.
    
    Bugzilla REST API: GET /rest/bug/{id}/comment
    Returns: { bugs: { "12345": { comments: [...] } } }
    
    We cache results to avoid re-fetching on subsequent runs.
    """
    print("\n── Phase 2: Bugzilla Comment Fetch ──")
    
    # Load existing cache
    cache = load_json(cache_path, {})
    cached_ids = set(cache.keys())
    need_fetch = [str(bid) for bid in bug_ids if str(bid) not in cached_ids]
    
    if max_bugs:
        need_fetch = need_fetch[:max_bugs]
    
    print(f"  {len(cached_ids)} bugs already cached")
    print(f"  {len(need_fetch)} bugs to fetch")
    
    if not need_fetch:
        print("  Nothing to fetch")
        return cache
    
    # Bugzilla supports fetching comments for multiple bugs at once
    # but the response can be large. Batch in groups of 20.
    BATCH_SIZE = 20
    fetched = 0
    errors = 0
    
    for i in range(0, len(need_fetch), BATCH_SIZE):
        batch = need_fetch[i:i+BATCH_SIZE]
        # Bugzilla REST API: /rest/bug/{id}/comment works for single bug
        # For multiple bugs, use /rest/bug/{id1},{id2},.../comment — but that
        # doesn't exist. We need to fetch one at a time or use the batch endpoint.
        # Actually: /rest/bug/{id}/comment works, and we can batch by using
        # /rest/bug?id=1,2,3&include_fields=id with a separate comment fetch.
        # Simplest: fetch one bug's comments at a time.
        
        for bug_id in batch:
            url = f"{BUGZILLA_URL}/{bug_id}/comment"
            try:
                req = urllib.request.Request(url)
                req.add_header("Accept", "application/json")
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                
                # Extract just what we need: author emails and timestamps
                comments = data.get("bugs", {}).get(str(bug_id), {}).get("comments", [])
                cache[str(bug_id)] = [
                    {
                        "author": c.get("creator", ""),
                        "time": c.get("creation_time", ""),
                        "is_private": c.get("is_private", False),
                    }
                    for c in comments
                ]
                fetched += 1
                
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print(f"  Rate limited at bug {bug_id}, stopping")
                    break
                print(f"  HTTP {e.code} for bug {bug_id}")
                errors += 1
            except Exception as e:
                print(f"  Error fetching bug {bug_id}: {e}")
                errors += 1
            
            time.sleep(rate_limit_delay)
        
        # Save cache after each batch
        with open(cache_path, "w") as f:
            json.dump(cache, f)
        
        pct = min(100, ((i + len(batch)) / len(need_fetch)) * 100)
        print(f"  Progress: {fetched} fetched, {errors} errors ({pct:.0f}%)")
        
        # Check if we got rate limited
        if errors > 5:
            print("  Too many errors, stopping")
            break
    
    print(f"  Final: {len(cache)} total bugs with comments cached")
    
    # Save final cache
    with open(cache_path, "w") as f:
        json.dump(cache, f)
    
    return cache


def _bug_is_about_program(summary, program):
    """Heuristic: does this bug summary indicate it's about a specific root program's CA?"""
    s = summary.lower()
    if program == "microsoft" and "microsoft" in s:
        return True
    if program == "chrome" and ("google trust" in s or ("google" in s and "ca" in s)):
        return True
    if program == "apple" and "apple" in s:
        return True
    # Mozilla doesn't run a CA, so this should never match
    return False


def analyze_comment_participation(comment_cache, bugs_raw):
    """
    Analyze comment participation by root program.
    
    Key distinction: "oversight" comments (on other CAs' bugs) vs
    "self-incident" comments (on bugs about the commenter's own CA).
    A program that only comments on its own incidents is doing incident
    response, not governance oversight.
    
    Also computes:
    - Per-person oversight counts (bus factor / concentration risk)
    - Quarterly oversight trends per program
    """
    print("\n── Phase 2b: Comment Participation Analysis ──")
    
    bug_lookup = {}
    for bug in bugs_raw:
        bug_lookup[str(bug["id"])] = bug
    
    # Track per-program: total comments, oversight comments, self-incident comments
    by_year_oversight = defaultdict(lambda: defaultdict(int))
    by_year_all = defaultdict(lambda: defaultdict(int))
    totals = defaultdict(lambda: {"all": 0, "oversight": 0, "self_incident": 0})
    unique_bugs = defaultdict(lambda: {"all": set(), "oversight": set()})
    comment_count_total = 0
    bugs_with_comments = 0
    
    # NEW: per-person oversight tracking and quarterly trends
    person_oversight = defaultdict(lambda: defaultdict(int))  # email -> quarter -> count
    person_program = {}
    program_quarter_comments = defaultdict(lambda: defaultdict(int))
    program_quarter_people = defaultdict(lambda: defaultdict(set))
    
    for bug_id, comments in comment_cache.items():
        if not comments:
            continue
        bugs_with_comments += 1
        bug = bug_lookup.get(bug_id, {})
        year = bug.get("creation_time", "")[:4]
        if not year or int(year) < 2014:
            continue
        summary = bug.get("summary", "")
        
        seen_this_bug = set()
        
        for comment in comments:
            author = comment.get("author", "")
            program = classify_email(author)
            comment_count_total += 1
            
            if program == "other":
                totals["other"]["all"] += 1
                continue
            
            is_own = _bug_is_about_program(summary, program)
            totals[program]["all"] += 1
            if is_own:
                totals[program]["self_incident"] += 1
            else:
                totals[program]["oversight"] += 1
                
                # Track per-person oversight and quarterly
                ts = comment.get("time", "")[:7]
                if ts and len(ts) >= 7:
                    try:
                        cy = ts[:4]
                        cm = int(ts[5:7])
                        quarter = f"{cy}-Q{(cm - 1) // 3 + 1}"
                        person_oversight[author][quarter] += 1
                        person_program[author] = program
                        program_quarter_comments[program][quarter] += 1
                        program_quarter_people[program][quarter].add(author)
                    except (ValueError, IndexError):
                        pass
            
            # Track unique bug engagement (deduplicate per-bug)
            if program not in seen_this_bug:
                seen_this_bug.add(program)
                unique_bugs[program]["all"].add(bug_id)
                by_year_all[year][program] += 1
                if not is_own:
                    unique_bugs[program]["oversight"].add(bug_id)
                    by_year_oversight[year][program] += 1
    
    # Format yearly oversight data
    oversight_years = []
    for year in sorted(by_year_oversight.keys()):
        d = by_year_oversight[year]
        oversight_years.append({
            "y": int(year),
            "chrome": d.get("chrome", 0),
            "mozilla": d.get("mozilla", 0),
            "apple": d.get("apple", 0),
            "microsoft": d.get("microsoft", 0),
        })
    
    # Build per-program summary
    program_summary = {}
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        t = totals[prog]
        program_summary[prog] = {
            "total_comments": t["all"],
            "oversight_comments": t["oversight"],
            "self_incident_comments": t["self_incident"],
            "oversight_pct": round((t["oversight"] / t["all"]) * 100) if t["all"] else 0,
            "bugs_engaged": len(unique_bugs[prog]["all"]),
            "bugs_oversight": len(unique_bugs[prog]["oversight"]),
        }
    
    # NEW: Compute concentration / bus factor per program
    concentration = {}
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        people = [(email, sum(qs.values()))
                  for email, qs in person_oversight.items()
                  if person_program.get(email) == prog]
        people.sort(key=lambda x: -x[1])
        
        total_oversight = sum(c for _, c in people)
        
        # Top contributor concentration
        top1_pct = round((people[0][1] / total_oversight) * 100) if people and total_oversight else 0
        top3_pct = round((sum(c for _, c in people[:3]) / total_oversight) * 100) if people and total_oversight else 0
        
        # Active quarters for top contributor
        if people:
            top_email = people[0][0]
            top_quarters = sorted(person_oversight[top_email].keys())
            top_first = top_quarters[0] if top_quarters else None
            top_last = top_quarters[-1] if top_quarters else None
        else:
            top_email = None
            top_first = top_last = None
        
        concentration[prog] = {
            "total_oversight_comments": total_oversight,
            "unique_contributors": len(people),
            "top_contributor_pct": top1_pct,
            "top_3_contributors_pct": top3_pct,
            "top_contributor_email": top_email,
            "top_contributor_first_quarter": top_first,
            "top_contributor_last_quarter": top_last,
            "contributors": [
                {"email": email, "comments": count,
                 "pct": round((count / total_oversight) * 100) if total_oversight else 0}
                for email, count in people[:5]
            ],
        }
    
    # NEW: Quarterly oversight trends
    all_quarters = sorted(set(
        q for pqs in program_quarter_comments.values() for q in pqs
    ))
    quarterly_trends = []
    for q in all_quarters:
        entry = {"quarter": q}
        for prog in ["chrome", "mozilla", "apple", "microsoft"]:
            entry[f"{prog}_comments"] = program_quarter_comments[prog].get(q, 0)
            entry[f"{prog}_people"] = len(program_quarter_people[prog].get(q, set()))
        quarterly_trends.append(entry)
    
    print(f"  Bugs with comments: {bugs_with_comments}")
    print(f"  Total comments: {comment_count_total}")
    print(f"  {'Program':12} {'Total':>7} {'Oversight':>10} {'Self-Inc':>10} {'Ovrsght%':>9} {'Bugs(O)':>8} {'Bus Factor':>11}")
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        s = program_summary[prog]
        c = concentration[prog]
        print(f"  {prog:12} {s['total_comments']:>7} {s['oversight_comments']:>10} "
              f"{s['self_incident_comments']:>10} {s['oversight_pct']:>8}% {s['bugs_oversight']:>8} "
              f"top1={c['top_contributor_pct']}%")
    
    return {
        "oversight_by_year": oversight_years,
        "program_comment_summary": program_summary,
        "oversight_concentration": concentration,
        "oversight_quarterly": quarterly_trends,
        "bugs_analyzed": bugs_with_comments,
        "total_comments": comment_count_total,
        "sample_pct": round((bugs_with_comments / len(bugs_raw)) * 100) if bugs_raw else 0,
    }


# ── Phase 3: Enforcement metrics (from distrust events) ──────────────────────

def compute_enforcement_metrics():
    """Compute per-program enforcement metrics from the distrust pipeline output."""
    print("\n── Phase 3: Enforcement Metrics ──")
    
    # Single source of truth: the distrust pipeline's output
    distrust_path = PIPELINE_DIR / "distrust" / "distrusted.json"
    curated = load_json(distrust_path)
    
    if not curated or not curated.get("events"):
        print("  ERROR: pipeline/distrust/distrusted.json not found or empty")
        print("  Run the distrust pipeline first: python pipeline/distrust/fetch_distrusted.py")
        return {"enforcement": {}, "distrust_events": []}
    
    raw_events = curated["events"]
    print(f"  Loaded {len(raw_events)} events from distrusted.json")
    
    events = []
    for e in raw_events:
        dates = e.get("distrust_dates") or {}
        
        # Build per-store status: if a store has a date, it acted
        stores = {}
        for s in ["chrome", "mozilla", "apple", "microsoft"]:
            stores[s] = "distrusted" if dates.get(s) else "trusted"
        
        # Determine leader: store with earliest distrust date
        leader = "unknown"
        store_dates = [(s, d) for s, d in dates.items() if d and s in stores]
        if store_dates:
            leader = sorted(store_dates, key=lambda x: x[1])[0][0]
        
        # WoSign and StartCom are the same event — combine
        ca_name = e.get("ca", "")
        if ca_name == "StartCom":
            continue
        if ca_name == "WoSign":
            ca_name = "WoSign / StartCom"
        
        events.append({
            "ca": ca_name,
            "year": e.get("year", 0),
            "stores": stores,
            "leader": leader,
        })
    
    total = len(events)
    acted_on = lambda s: ["distrusted", "removed", "constrained"]
    
    metrics = {}
    for store in ["chrome", "mozilla", "apple", "microsoft"]:
        acted = sum(1 for e in events if e["stores"].get(store) in acted_on(store))
        initiated = sum(1 for e in events if e.get("leader") == store)
        still_trusts = [e["ca"] for e in events if e["stores"].get(store) == "trusted"]
        
        metrics[store] = {
            "acted": acted,
            "total": total,
            "initiated": initiated,
            "followed": acted - initiated,
            "still_trusts": still_trusts,
        }
        print(f"  {store:12}: acted {acted}/{total}, initiated {initiated}, still trusts: {still_trusts or 'none'}")
    
    return {
        "enforcement": metrics,
        "distrust_events": [
            {
                "ca": e["ca"],
                "year": e["year"],
                "leader": e["leader"],
                "chrome": e["stores"].get("chrome", "unknown"),
                "mozilla": e["stores"].get("mozilla", "unknown"),
                "apple": e["stores"].get("apple", "unknown"),
                "microsoft": e["stores"].get("microsoft", "unknown"),
            }
            for e in events
        ],
    }


# ── Phase 4: Store posture (from existing pipeline data) ─────────────────────

def compute_store_posture():
    """Compute per-store posture metrics from existing pipeline data."""
    print("\n── Phase 4: Store Posture ──")
    
    intersections = load_json(OUTPUT_DIR / "intersections.json")
    if not intersections:
        print("  No intersections.json found")
        return None
    
    market = load_json(OUTPUT_DIR / "market_share.json", [])
    roots_data = load_json(OUTPUT_DIR / "root_algorithms.json", {})
    roots_list = roots_data.get("roots", [])
    
    # ── Exclusive roots: count at ROOT level, not CA-owner level ──
    # A root is exclusive if it appears in exactly one store
    store_code_map = {"M": "mozilla", "C": "chrome", "S": "microsoft", "A": "apple"}
    exclusive_by_store = {s: 0 for s in ["chrome", "mozilla", "apple", "microsoft"]}
    
    for r in roots_list:
        stores_str = r.get("stores", "")
        in_stores = [store_code_map[c] for c in stores_str if c in store_code_map]
        if len(in_stores) == 1:
            exclusive_by_store[in_stores[0]] += 1
    
    # ── Gov-affiliated CAs: pattern matching on CA owner names ──
    # These are government-operated or state-owned enterprise CAs
    GOV_PATTERNS = [
        "government of", "ministerio", "estado", "national root",
        "mois ", "kamu ", "population register",
        "agence nationale", "autoridad de certificacion",
        "chunghwa telecom",  # Taiwan state-owned
        "korea information security", "klid",  # Korean gov
        "cfca", "china financial",  # Chinese state-owned
        "beijing certificate",  # Chinese state-owned
        "sheca", "shanghai electronic",  # Chinese state-owned
        "izenpe",  # Basque government
        "firmaprofesional", "firma profesional",  # Spanish gov-backed
        "fábrica nacional", "fnmt",  # Spanish national mint
        "pos digicert",  # Malaysian gov
        "msc trustgate",  # Malaysian gov
        "netlock",  # Hungarian gov-backed
        "certign",  # Senegalese gov
        "disig",  # Slovak gov-backed
        "e-tugra",  # Turkish gov-affiliated
        "tubitak",  # Turkish gov research
        "post office", "sapo",  # South African gov
    ]
    
    gov_owners = set()
    for ca in market:
        owner_low = ca["ca_owner"].lower()
        if any(p in owner_low for p in GOV_PATTERNS):
            gov_owners.add(ca["ca_owner"])
    
    gov_by_store = {s: 0 for s in ["chrome", "mozilla", "apple", "microsoft"]}
    for ca in market:
        if ca["ca_owner"] not in gov_owners:
            continue
        tb = ca.get("trusted_by", {})
        for s in ["chrome", "mozilla", "apple", "microsoft"]:
            if tb.get(s):
                gov_by_store[s] += 1
    
    # ── Build posture ──
    posture = {}
    for store_name, store_data in intersections.get("per_store", {}).items():
        store_key = store_name.lower()
        
        posture[store_key] = {
            "owners": store_data.get("owners", 0),
            "roots": store_data.get("roots", 0),
            "exclusive_count": exclusive_by_store.get(store_key, 0),
            "gov_ca_count": gov_by_store.get(store_key, 0),
        }
        
        print(f"  {store_name:12}: {store_data.get('owners', 0)} owners, {store_data.get('roots', 0)} roots, "
              f"{exclusive_by_store.get(store_key, 0)} exclusive roots, {gov_by_store.get(store_key, 0)} gov CAs")
    
    return {
        "store_posture": posture,
        "all_four": intersections.get("all_four_stores", {}),
        "total_owners": intersections.get("total_active_owners", 0),
        "total_roots": intersections.get("total_included_roots", 0),
    }


# ── Phase 4b: Policy leadership (from CA/B Forum ballot data) ────────────────

# Name → program mapping for ballot proposers/endorsers
PROGRAM_ORGS = {
    "google": "chrome", "chrome": "chrome", "ryan sleevi": "chrome",
    "ryan dickson": "chrome", "chris clements": "chrome", "david adrian": "chrome",
    "mozilla": "mozilla", "ben wilson": "mozilla", "kathleen wilson": "mozilla",
    "apple": "apple", "clint wilson": "apple", "trevoli ponds-white": "apple",
    "microsoft": "microsoft", "karina sirota": "microsoft", "dustin hollenback": "microsoft",
    "fastly": "chrome",  # Wayne Thayer works for Fastly but was formerly Mozilla/Chrome program
}


def _classify_participant(name):
    """Map a ballot proposer/endorser name to a root program."""
    if not name:
        return None
    low = name.lower().strip()
    for pattern, prog in PROGRAM_ORGS.items():
        if pattern in low:
            return prog
    return None


def _classify_voter(name):
    """Map a consumer voter name to a root program."""
    if not name:
        return None
    low = name.lower().strip()
    if "google" in low or "chrome" in low:
        return "chrome"
    if "mozilla" in low:
        return "mozilla"
    if "apple" in low:
        return "apple"
    if "microsoft" in low:
        return "microsoft"
    return None


def compute_policy_leadership():
    """Compute per-program policy leadership from CA/B Forum ballot data."""
    print("\n── Phase 4b: Policy Leadership ──")

    # Load ballot data from cache
    ballots_path = CACHE_DIR / "cabforum_ballots.json"
    raw = load_json(ballots_path, None)

    sc_ballots = []
    other_wgs = {}

    if isinstance(raw, dict):
        # Combined format: {"SC": [...], "CSC": [...], "SMC": [...], "NS": [...]}
        sc_ballots = raw.get("SC", [])
        other_wgs = {k: v for k, v in raw.items() if k != "SC"}
    elif isinstance(raw, list):
        # SC-only format
        sc_ballots = raw

    if not sc_ballots and not other_wgs:
        print("  No ballot data found")
        return {}

    print(f"  SC ballots: {len(sc_ballots)}")
    for wg, ballots in other_wgs.items():
        print(f"  {wg} ballots: {len(ballots)}")

    stores = ["chrome", "mozilla", "apple", "microsoft"]

    def analyze_wg(ballots, wg_name):
        """Analyze a single working group's ballots."""
        programs = {s: {"proposed": 0, "endorsed": 0, "voted": 0, "absent": 0, "ballots_with_votes": 0} for s in stores}
        recent_votes = []

        for b in ballots:
            proposer = b.get("proposer", "")
            endorsers = b.get("endorsers_raw", "")

            # Proposer attribution
            prog = _classify_participant(proposer)
            if prog:
                programs[prog]["proposed"] += 1

            # Endorser attribution
            if endorsers:
                for part in endorsers.replace(" and ", ",").replace(";", ",").split(","):
                    ep = _classify_participant(part.strip())
                    if ep:
                        programs[ep]["endorsed"] += 1

            # Vote attribution (consumer_yes field)
            consumer_yes = b.get("consumer_yes", [])
            if consumer_yes and consumer_yes != ["*"]:
                # This ballot has vote data
                for s in stores:
                    programs[s]["ballots_with_votes"] += 1

                voted_programs = set()
                for voter in consumer_yes:
                    vp = _classify_voter(voter)
                    if vp:
                        voted_programs.add(vp)

                for s in stores:
                    if s in voted_programs:
                        programs[s]["voted"] += 1
                    else:
                        programs[s]["absent"] += 1

                # Track recent votes for the vote matrix
                vote_entry = {
                    "id": b.get("id", ""),
                    "title": b.get("title", ""),
                    "result": "passed",
                }
                for s in stores:
                    vote_entry[s] = "yes" if s in voted_programs else "absent"
                recent_votes.append(vote_entry)

        return {
            "programs": programs,
            "total_ballots": len(ballots),
            "recent_votes": recent_votes[-14:] if recent_votes else [],  # Last 14 with votes
        }

    # Analyze each WG
    result = {"by_working_group": {}}

    if sc_ballots:
        sc_result = analyze_wg(sc_ballots, "SC")
        result["by_working_group"]["server_certificate"] = {
            "programs": sc_result["programs"],
            "total_ballots": sc_result["total_ballots"],
            "prefix": "SC",
        }
        result["recent_votes"] = sc_result["recent_votes"]
        result["total_sc_ballots"] = len(sc_ballots)

    for wg_key, wg_prefix in [("CSC", "code_signing"), ("SMC", "smime"), ("NS", "network_security")]:
        if wg_key in other_wgs:
            wg_result = analyze_wg(other_wgs[wg_key], wg_key)
            result["by_working_group"][wg_prefix] = {
                "programs": wg_result["programs"],
                "total_ballots": wg_result["total_ballots"],
                "prefix": wg_key,
            }

    # Compute combined per-program summary (SC + NS for the report card)
    combined = {s: {"proposed": 0, "endorsed": 0, "voted": 0, "absent": 0, "ballots_with_votes": 0} for s in stores}
    for wg_name in ["server_certificate", "network_security"]:
        wg = result["by_working_group"].get(wg_name, {}).get("programs", {})
        for s in stores:
            for field in ["proposed", "endorsed", "voted", "absent", "ballots_with_votes"]:
                combined[s][field] += wg.get(s, {}).get(field, 0)

    # Vote participation % (SC only since NS doesn't publish votes)
    sc_progs = result["by_working_group"].get("server_certificate", {}).get("programs", {})
    for s in stores:
        bwv = sc_progs.get(s, {}).get("ballots_with_votes", 0)
        voted = sc_progs.get(s, {}).get("voted", 0)
        combined[s]["vote_participation_pct"] = round((voted / bwv) * 100) if bwv else 0

    result["programs"] = combined

    print("  Combined SC+NS per-program:")
    for s in stores:
        c = combined[s]
        print(f"    {s:12}: proposed={c['proposed']}, endorsed={c['endorsed']}, voted={c['voted']}/{c.get('ballots_with_votes',0)}")

    return {"policy_leadership": result}


# ── Phase 5: Notable inclusion/distrust gaps ─────────────────────────────────

def compute_notable_gaps(enforcement_data):
    """
    Auto-detect CAs with significant issuance that are missing from stores.
    Cross-references market_share.json (rank, certs, trusted_by) with
    enforcement data (distrust divergences).
    """
    print("\n── Phase 5: Notable Inclusion & Distrust Gaps ──")

    market = load_json(OUTPUT_DIR / "market_share.json", [])
    if not market:
        print("  No market_share.json found")
        return {"notable_gaps": {"current": [], "historical": [], "note": "market_share.json missing"}}

    roots_data = load_json(OUTPUT_DIR / "root_algorithms.json", {})
    roots_list = roots_data.get("roots", [])

    # Build root age lookup: ca_owner -> oldest root creation date
    oldest_root = {}
    for r in roots_list:
        owner = r.get("ca_owner", "")
        nb = r.get("not_before", "9999")
        if owner not in oldest_root or nb < oldest_root[owner]:
            oldest_root[owner] = nb

    stores = ["chrome", "mozilla", "apple", "microsoft"]
    now_year = datetime.now().year

    # Find CAs with issuance that are missing from at least one store
    current_gaps = []
    for ca in market:
        tb = ca.get("trusted_by", {})
        included_in = [s for s in stores if tb.get(s)]
        missing_from = [s for s in stores if not tb.get(s)]

        if not missing_from or not included_in:
            continue

        # Must have either meaningful issuance or be in top 100
        rank = ca.get("rank", 999)
        certs = ca.get("unexpired_precerts", 0)
        if rank > 100 and certs < 100:
            continue

        # Estimate wait time from oldest root
        owner = ca["ca_owner"]
        root_date = oldest_root.get(owner, "")
        if root_date and root_date != "9999":
            try:
                root_year = int(root_date[:4])
                wait_years = now_year - root_year
            except (ValueError, IndexError):
                wait_years = None
        else:
            wait_years = None

        current_gaps.append({
            "ca": owner,
            "rank": rank,
            "certs": certs,
            "stores": {s: ("included" if tb.get(s) else "not_included") for s in stores},
            "missing_from": missing_from,
            "included_in": included_in,
            "wait_years": wait_years,
        })

    current_gaps.sort(key=lambda x: x["rank"])

    # Detect distrust divergences: CAs distrusted by some but trusted by others
    distrust_gaps = []
    if enforcement_data:
        for event in enforcement_data.get("distrust_events", []):
            distrusted_by = [s for s in stores if event.get(s) in ("distrusted", "removed", "constrained")]
            trusted_by = [s for s in stores if event.get(s) == "trusted"]
            if distrusted_by and trusted_by:
                distrust_gaps.append({
                    "ca": event["ca"],
                    "year": event.get("year", 0),
                    "distrusted_by": distrusted_by,
                    "still_trusted_by": trusted_by,
                    "leader": event.get("leader", "unknown"),
                })

    # Historical gaps (curated — these require editorial context)
    historical = [
        {
            "ca": "Internet Security Research Group",
            "common_name": "Let's Encrypt",
            "rank": 1,
            "certs_now": next((c["unexpired_precerts"] for c in market
                               if "Internet Security Research" in c.get("ca_owner", "")), 0),
            "timeline": {
                "root_created": "2015-06",
                "mozilla_included": "2016-08",
                "microsoft_included": "2018-08",
                "apple_included": "2018-12",
            },
            "gap_years": 2,
            "gap_description": "2-year gap between first inclusion (Mozilla Aug 2016) and Apple/Microsoft (late 2018). Relied on IdenTrust cross-sign.",
            "resolved": True,
        },
    ]

    print(f"  {len(current_gaps)} CAs with inclusion gaps (rank <= 100 or certs > 100)")
    print(f"  {len(distrust_gaps)} active distrust divergences")
    for g in current_gaps[:10]:
        missing = ",".join(g["missing_from"])
        print(f"    #{g['rank']:>3} {g['ca'][:30]:30} missing=[{missing}] certs={g['certs']:>10,}")
    for g in distrust_gaps:
        still = ",".join(g["still_trusted_by"])
        print(f"    DISTRUST: {g['ca'][:25]:25} still trusted by [{still}]")

    return {
        "notable_gaps": {
            "current": current_gaps[:25],  # Top 25 by rank
            "distrust_divergences": distrust_gaps,
            "historical": historical,
        }
    }


# ── Phase 6: Gov CA counts per store ────────────────────────────────────────

def compute_gov_ca_counts():
    """Pull government-affiliated CA counts per store from jurisdiction data."""
    print("\n── Phase 6: Gov CA Counts ──")

    market = load_json(OUTPUT_DIR / "market_share.json", [])
    jurisdiction = load_json(OUTPUT_DIR / "jurisdiction_risk.json")

    if not jurisdiction or not market:
        print("  Missing data files")
        return {}

    # Build set of gov-affiliated CA owners from jurisdiction data
    gov_owners = set()
    for entry in jurisdiction.get("cas", []):
        if entry.get("gov_affiliated"):
            gov_owners.add(entry.get("ca_owner", ""))

    # If no gov flag in jurisdiction data, try to detect from country + name patterns
    if not gov_owners:
        # Fallback: look for "Government of" in CA owner names
        for ca in market:
            owner = ca.get("ca_owner", "")
            if any(p in owner.lower() for p in ["government of", "ministerio", "estado",
                                                  "national root", "mois ", "kamu "]):
                gov_owners.add(owner)
        print(f"  Fallback detection: {len(gov_owners)} gov-affiliated CAs")

    # Count per store
    stores = ["chrome", "mozilla", "apple", "microsoft"]
    gov_counts = {s: 0 for s in stores}
    gov_cas_by_store = {s: [] for s in stores}

    for ca in market:
        owner = ca.get("ca_owner", "")
        if owner not in gov_owners:
            continue
        tb = ca.get("trusted_by", {})
        for s in stores:
            if tb.get(s):
                gov_counts[s] += 1
                gov_cas_by_store[s].append(owner[:50])

    print(f"  Gov-affiliated CAs per store:")
    for s in stores:
        print(f"    {s:12}: {gov_counts[s]}")

    return {"gov_ca_counts": gov_counts}


# ── Phase 7: Inclusion velocity (Bugzilla pipeline data) ────────────────────

def compute_inclusion_velocity():
    """
    Fetch Mozilla's inclusion pipeline data from Bugzilla.
    Mozilla is the only root program with a fully public inclusion process.
    """
    print("\n── Phase 7: Inclusion Velocity ──")

    now = datetime.now(timezone.utc)

    # Fetch pending inclusion requests
    params = urllib.parse.urlencode({
        "product": "CA Program",
        "component": "CA Certificate Root Program",
        "status": "ASSIGNED",
        "limit": 200,
        "include_fields": "id,summary,creation_time,status,whiteboard",
    })

    pending = []
    try:
        url = f"{BUGZILLA_URL}?{params}"
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        bugs = data.get("bugs", [])
        adds = [b for b in bugs if b.get("summary", "").startswith("Add ")]

        for b in adds:
            created = b.get("creation_time", "")[:10]
            wb = b.get("whiteboard", "")
            try:
                c = datetime.strptime(created, "%Y-%m-%d")
                days = (now - c.replace(tzinfo=timezone.utc)).days
            except (ValueError, TypeError):
                days = 0

            stage = "unknown"
            for tag in ["ca-approved", "ca-discussion", "ca-cps-review", "ca-verifying", "ca-initial",
                        "ca-withdrawn", "ca-denied"]:
                if f"[{tag}]" in wb:
                    stage = tag.replace("ca-", "")
                    break

            pending.append({
                "bug": b["id"],
                "ca": b.get("summary", "").replace("Add ", "")[:60],
                "filed": created,
                "days_waiting": days,
                "stage": stage,
            })

        pending.sort(key=lambda x: -x["days_waiting"])
        print(f"  {len(pending)} pending Add requests")
    except Exception as e:
        print(f"  Error fetching pending bugs: {e}")

    # Fetch completed inclusion requests (2020+)
    params2 = urllib.parse.urlencode({
        "product": "CA Program",
        "component": "CA Certificate Root Program",
        "status": "RESOLVED",
        "resolution": "FIXED",
        "limit": 200,
        "order": "bug_id DESC",
        "include_fields": "id,summary,creation_time,last_change_time",
    })

    completed = []
    try:
        url = f"{BUGZILLA_URL}?{params2}"
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for b in data.get("bugs", []):
            if not b.get("summary", "").startswith("Add "):
                continue
            try:
                c = datetime.strptime(b["creation_time"][:10], "%Y-%m-%d")
                r = datetime.strptime(b["last_change_time"][:10], "%Y-%m-%d")
                days = (r - c).days
                if days > 0 and c.year >= 2020:
                    completed.append({
                        "bug": b["id"],
                        "ca": b.get("summary", "").replace("Add ", "")[:60],
                        "filed": b["creation_time"][:10],
                        "resolved": b["last_change_time"][:10],
                        "days": days,
                    })
            except (ValueError, TypeError):
                pass
        print(f"  {len(completed)} completed Add requests (2020+)")
    except Exception as e:
        print(f"  Error fetching completed bugs: {e}")

    # Stats
    import statistics
    completed_days = [c["days"] for c in completed]
    stats = {
        "pending_count": len(pending),
        "completed_count": len(completed),
        "median_days": round(statistics.median(completed_days)) if completed_days else 0,
        "mean_days": round(statistics.mean(completed_days)) if completed_days else 0,
        "max_days": max(completed_days) if completed_days else 0,
        "longest_pending_days": max((p["days_waiting"] for p in pending), default=0),
    }

    print(f"  Median completion: {stats['median_days']} days")
    print(f"  Longest pending: {stats['longest_pending_days']} days")

    return {
        "inclusion_velocity": {
            "mozilla_pending": pending,
            "mozilla_completed_recent": sorted(completed, key=lambda x: -x["days"]),
            "mozilla_stats": stats,
            "note": "Mozilla only — only root program with a fully public inclusion pipeline (Bugzilla).",
        }
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Governance Risk Pipeline")
    print("=" * 60)
    
    CACHE_DIR.mkdir(exist_ok=True)
    
    # Load existing bug cache
    bugs_raw = load_json(CACHE_DIR / "bugs_raw.json", [])
    if not bugs_raw:
        print("\nERROR: No bugs_raw.json found. Run fetch_incidents.py first.")
        sys.exit(1)
    
    print(f"\nLoaded {len(bugs_raw)} bugs from cache")
    
    # Phase 1: Bug creation attribution (no network needed)
    creation_data = analyze_bug_creation(bugs_raw)
    
    # Phase 2: Comment participation (needs network)
    comment_cache_path = CACHE_DIR / "comments_cache.json"
    
    bug_ids = sorted(
        [b["id"] for b in bugs_raw],
        key=lambda bid: next((b["creation_time"] for b in bugs_raw if b["id"] == bid), ""),
        reverse=True,
    )
    
    max_fetch = int(os.environ.get("RPE_MAX_BUGS", "100"))
    print(f"\n  Comment fetch limit: {max_fetch} bugs (set RPE_MAX_BUGS to change)")
    
    comment_cache = fetch_bug_comments(
        bug_ids,
        comment_cache_path,
        max_bugs=max_fetch,
        rate_limit_delay=0.5,
    )
    
    comment_data = analyze_comment_participation(comment_cache, bugs_raw)
    
    # Phase 3: Enforcement metrics
    enforcement_data = compute_enforcement_metrics()
    
    # Phase 4: Store posture
    posture_data = compute_store_posture()
    
    # Phase 4b: Policy leadership (ballot data)
    policy_data = compute_policy_leadership()
    
    # Phase 5: Notable gaps (depends on enforcement data)
    gaps_data = compute_notable_gaps(enforcement_data)
    
    # Phase 6: Gov CA counts per store
    gov_data = compute_gov_ca_counts()
    
    # Phase 7: Inclusion velocity (needs network)
    velocity_data = compute_inclusion_velocity()
    
    # ── Merge gov counts into store posture ──
    if posture_data and gov_data.get("gov_ca_counts"):
        for store, count in gov_data["gov_ca_counts"].items():
            if store in posture_data.get("store_posture", {}):
                posture_data["store_posture"][store]["gov_ca_count"] = count

    # ── Assemble output ──
    output = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bugs_total": len(bugs_raw),
            "bugs_with_comments": comment_data["bugs_analyzed"],
            "total_comments_analyzed": comment_data["total_comments"],
            "pipeline_version": "0.3",
            "note": "Comment data may be partial — fetched incrementally with rate limiting",
        },
        **creation_data,
        **comment_data,
        **enforcement_data,
        **(posture_data or {}),
        **policy_data,
        **gaps_data,
        **velocity_data,
    }
    
    # Write output
    out_path = OUTPUT_DIR / "root_program_effectiveness.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    
    size_kb = out_path.stat().st_size / 1024
    print(f"\n{'=' * 60}")
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")
    print(f"{'=' * 60}")
    
    # Print summary
    print("\n── Summary ──")
    print(f"  Bug creation: Chrome {creation_data['bug_creation_totals']['chrome']}, "
          f"Mozilla {creation_data['bug_creation_totals']['mozilla']}, "
          f"Apple {creation_data['bug_creation_totals']['apple']}, "
          f"Microsoft {creation_data['bug_creation_totals']['microsoft']}")
    cs = comment_data["program_comment_summary"]
    print(f"  Oversight ({comment_data['bugs_analyzed']} bugs, {comment_data['sample_pct']}% sample):")
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        s = cs[prog]
        print(f"    {prog:12}: {s['oversight_comments']:4} oversight / {s['total_comments']:4} total ({s['oversight_pct']}%)")
    enf = enforcement_data["enforcement"]
    total = enf["chrome"]["total"]
    print(f"  Enforcement ({total} events):")
    for prog in ["chrome", "mozilla", "apple", "microsoft"]:
        e = enf[prog]
        print(f"    {prog:12}: {e['acted']}/{e['total']} acted, {e['initiated']} led, {e['total'] - e['acted']} never")
    ng = gaps_data.get("notable_gaps", {})
    print(f"  Notable gaps: {len(ng.get('current', []))} current, {len(ng.get('distrust_divergences', []))} distrust divergences")
    iv = velocity_data.get("inclusion_velocity", {}).get("mozilla_stats", {})
    print(f"  Inclusion velocity: {iv.get('pending_count', 0)} pending, median {iv.get('median_days', 0)} days")


if __name__ == "__main__":
    main()
