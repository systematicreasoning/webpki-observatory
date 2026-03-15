#!/usr/bin/env python3
"""
Phase 8: Community Engagement Pipeline
Produces data/community_engagement.json

Measures voluntary ecosystem contribution by CA organizations and individuals:
  1. Bugzilla engagement on other CAs' compliance bugs
  2. CA/B Forum ballot proposals and endorsements (not votes)
  3. Proactive bug filing about other CAs' issues

Attribution rules:
  - Root program staff (Chrome/Mozilla/Apple/Microsoft) excluded — they have their own tab
  - GTS CA staff excluded (google.com CA operators, not root program)
  - Time-bounded attribution: Wayne Thayer (fastly.com) and Kathleen Wilson (gmail)
    attributed to Mozilla through 2020-06-30 and 2019-12-31 respectively
  - CA org aliases map: handles cases where email domain != CA name in bug summary
  - Related CAs treated as same org: Bundesdruckerei/D-TRUST, DigiCert/QuoVadis
  - Bug filing by a CA about its own aliases is self-filing, excluded
"""

import json, re
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, timezone

CACHE_DIR = Path(__file__).parent / "ops_cache"
DATA_DIR = Path(__file__).parent.parent / "data"

# ── Attribution constants ─────────────────────────────────────────────────────

ROOT_PROGRAM_DOMAINS = {
    "google.com", "chromium.org",
    "mozilla.com", "mozilla.org",
    "apple.com", "microsoft.com",
}

ROOT_PROGRAM_INDIVIDUALS = {
    "ryan.sleevi@gmail.com":         ("chrome",  None),
    "kathleen.a.wilson@gmail.com":   ("mozilla", "2019-12-31"),
    "wthayer@fastly.com":            ("mozilla", "2020-06-30"),
    "waynezilla@gmail.com":          ("mozilla", "2020-06-30"),
}

GTS_CA_STAFF = {
    "gts-external@google.com", "cadecairns@google.com", "awarner@google.com",
    "fotisl@google.com", "offline@google.com", "rmh@google.com",
    "doughornyak@google.com", "nullsem@google.com", "bif@google.com",
    "jklo@google.com", "kluge@google.com", "jdkasten@google.com", "kuz@google.com",
}

BOT_DOMAINS = {"mozilla.bugs", "mozilla.tld", "ccadb.org"}

# Email domain -> canonical CA org name
CA_EMAIL_TO_ORG = {
    "digicert.com":         "DigiCert",
    "harica.gr":            "HARICA",
    "sectigo.com":          "Sectigo",
    "comodo.com":           "Sectigo",
    "letsencrypt.org":      "Let's Encrypt",
    "abetterinternet.org":  "Let's Encrypt",
    "entrust.com":          "Entrust",
    "entrustdatacard.com":  "Entrust",
    "ssl.com":              "SSL.com",
    "globalsign.com":       "GlobalSign",
    "actalis.it":           "Actalis",
    "certum.pl":            "Certum/Asseco",
    "assecods.pl":          "Certum/Asseco",
    "godaddy.com":          "GoDaddy",
    "buypass.no":           "Buypass",
    "dhimyotis.com":        "Certigna",
    "kir.pl":               "KIR",
    "secom.co.jp":          "SECOM",
    "cht.com.tw":           "Chunghwa Telecom",
    "cfca.com.cn":          "CFCA",
    "bdr.de":               "Bundesdruckerei/D-TRUST",
    "d-trust.net":          "Bundesdruckerei/D-TRUST",
    "logius.nl":            "PKIoverheid",
    "aruba.it":             "Aruba",
    "swisssign.com":        "SwissSign",
    "emudhra.com":          "eMudhra",
    "identrust.com":        "IdenTrust",
    "amazon.com":           "Amazon Trust Services",
    "fastly.com":           "Certainly/Fastly",
    "netlock.hu":           "NetLock",
    "e-tugra.com":          "E-Tugra",
    "telia.com":            "Telia",
    "teliacompany.com":     "Telia",
    "isigma.es":            "iSigma",
    "certigna.fr":          "Certigna",
    "dhimyotis.com":        "Certigna",
    "trustcor.ca":          "TrustCor",
    "certinomis.fr":        "Certinomis",
    "pki.goog":             "Google Trust Services",
    "hezmatt.org":          None,  # Matt Palmer, individual
}

# CA org -> all names that appear in Bugzilla summary prefixes (for is_own detection)
# This handles cases where domain != summary name (e.g. logius.nl -> PKIoverheid)
CA_SUMMARY_ALIASES = {
    "DigiCert":                 {"digicert", "quovadis", "quo vadis"},  # DigiCert acquired QuoVadis
    "HARICA":                   {"harica"},
    "Sectigo":                  {"sectigo", "comodo"},
    "Let's Encrypt":            {"let's encrypt", "letsencrypt", "isrg"},
    "Entrust":                  {"entrust"},
    "SSL.com":                  {"ssl.com"},
    "GlobalSign":               {"globalsign"},
    "Actalis":                  {"actalis"},
    "Certum/Asseco":            {"certum", "asseco"},
    "GoDaddy":                  {"godaddy"},
    "Buypass":                  {"buypass"},
    "Certigna":                 {"certigna"},
    "KIR":                      {"kir s.a.", "kir"},
    "SECOM":                    {"secom"},
    "Chunghwa Telecom":         {"chunghwa telecom", "cht"},
    "CFCA":                     {"cfca"},
    "Bundesdruckerei/D-TRUST":  {"bundesdruckerei", "d-trust", "d trust", "dtrust"},
    "PKIoverheid":              {"pkioverheid"},
    "Aruba":                    {"aruba"},
    "SwissSign":                {"swisssign"},
    "eMudhra":                  {"emudhra", "emsign"},
    "IdenTrust":                {"identrust"},
    "Amazon Trust Services":    {"amazon trust"},
    "Certainly":                {"certainly"},
    "NetLock":                  {"netlock"},
    "E-Tugra":                  {"e-tugra", "etugra"},
    "Telia":                    {"telia"},
    "TrustCor":                 {"trustcor"},
}


# Canonical org name normalization for ballot parsing
# Handles name variants that appear in raw ballot text
ORG_CANONICAL = {
    "fastly": "Certainly/Fastly",
    "certainly": "Certainly/Fastly",
    "fastly/certainly": "Certainly/Fastly",
    "certainly/fastly": "Certainly/Fastly",
    "digicert": "DigiCert",
    "digicert, inc": "DigiCert",
    "digicert inc": "DigiCert",
    "isrg / let's encrypt": "Let's Encrypt",
    "let's encrypt / isrg": "Let's Encrypt",
    "isrg/let's encrypt":   "Let's Encrypt",
    "let's encrypt":        "Let's Encrypt",
    "lets encrypt":         "Let's Encrypt",
    "let\u00b4s encrypt":   "Let's Encrypt",
    "isrg":                 "Let's Encrypt",
    "entrust datacard": "Entrust",
    "entrust datacard corporation": "Entrust",
    "trustcor": "TrustCor Systems",
    "trustcor systems": "TrustCor Systems",
    "harica": "HARICA",
    "ssl": "SSL.com",
    "ssl corp": "SSL.com",
    "d-trust": "Bundesdruckerei/D-TRUST",
    "d trust": "Bundesdruckerei/D-TRUST",
    "amazon": "Amazon Trust Services",
    "cisco systems": "Cisco",
    "opera software": "Opera",
    "opera as": "Opera",
}

def canonical_org(org):
    # Normalize curly apostrophes to straight before lookup
    normalized = org.replace('\u2019', "'").replace('\u2018', "'").lower().strip()
    return ORG_CANONICAL.get(normalized, org.replace('\u2019', "'").replace('\u2018', "'").strip())


def is_root_program(email, comment_time=""):
    """Returns True if this email belongs to a root program at the given time."""
    if not email or "@" not in email:
        return False
    el = email.lower().strip()
    if el in GTS_CA_STAFF:
        return False
    if el in ROOT_PROGRAM_INDIVIDUALS:
        prog, cutoff = ROOT_PROGRAM_INDIVIDUALS[el]
        if cutoff is None:
            return True
        if comment_time and comment_time[:10] <= cutoff:
            return True
        elif not comment_time:
            return True
        return False
    domain = el.split("@")[-1]
    if domain in BOT_DOMAINS:
        return False
    return domain in ROOT_PROGRAM_DOMAINS


def get_ca_org(email, comment_time=""):
    """Returns CA org name if this email belongs to a CA, else None (individual)."""
    if not email or "@" not in email:
        return None
    el = email.lower().strip()
    if el in GTS_CA_STAFF:
        return "Google Trust Services"
    if is_root_program(email, comment_time):
        return None  # root program, not a CA for this analysis
    domain = el.split("@")[-1]
    if domain in BOT_DOMAINS:
        return None
    return CA_EMAIL_TO_ORG.get(domain)  # None = individual


def is_own_filing(summary, org):
    """Returns True if this bug summary is about the org's own CA."""
    if not org or not summary:
        return False
    aliases = CA_SUMMARY_ALIASES.get(org, set())
    summary_lower = summary.lower()
    # Check org name itself
    if org.lower().split("/")[0].strip() in summary_lower:
        return True
    # Check all known aliases
    return any(alias in summary_lower for alias in aliases)


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


# ── Signal 1: Bugzilla engagement ────────────────────────────────────────────

def analyze_bugzilla_community(cache, bug_lookup, clf):
    """Find CA orgs and individuals commenting on other CAs' bugs."""
    print("── Signal 1: Bugzilla Community Engagement ──")

    RECENT_CUTOFF = "2021"

    # org -> stats
    orgs = defaultdict(lambda: {
        "emails": set(), "bugs": set(), "comments": 0,
        "technical": 0, "recent_bugs": set(), "recent_technical": 0,
        "by_year": defaultdict(int), "cas_commented_on": Counter(),
    })
    # individual email -> stats
    individuals = defaultdict(lambda: {
        "bugs": set(), "comments": 0, "technical": 0,
        "recent_bugs": set(), "recent_technical": 0,
        "by_year": defaultdict(int), "cas_commented_on": Counter(),
    })

    for bug_id, comments in cache.items():
        bug = bug_lookup.get(bug_id, {})
        summary = bug.get("summary", "")
        ca_name = summary.split(":")[0].strip()[:40] if ":" in summary else summary[:40]

        for ci, c in enumerate(comments):
            author = c.get("author", "")
            text = c.get("text", "").strip()
            if not text:
                continue
            comment_time = c.get("time", "")
            year = comment_time[:4]
            if not year or int(year) < 2014:
                continue

            # Skip root program
            if is_root_program(author, comment_time):
                continue

            domain = author.lower().split("@")[-1] if "@" in author else ""
            if domain in BOT_DOMAINS:
                continue

            org = get_ca_org(author, comment_time)

            # Skip if commenting on own CA's bug
            if org and is_own_filing(summary, org):
                continue

            key = f"{bug_id}:{ci}"
            entry = clf.get(key, {})
            # Skip LLM-classified admin noise
            if entry and not entry.get("governance", True):
                continue

            is_technical = entry.get("technical", False)
            is_recent = year >= RECENT_CUTOFF

            if org:
                orgs[org]["emails"].add(author)
                orgs[org]["bugs"].add(bug_id)
                orgs[org]["comments"] += 1
                orgs[org]["by_year"][year] += 1
                orgs[org]["cas_commented_on"][ca_name] += 1
                if is_technical:
                    orgs[org]["technical"] += 1
                if is_recent:
                    orgs[org]["recent_bugs"].add(bug_id)
                    if is_technical:
                        orgs[org]["recent_technical"] += 1
            else:
                # Individual — not a known CA domain
                individuals[author]["bugs"].add(bug_id)
                individuals[author]["comments"] += 1
                individuals[author]["by_year"][year] += 1
                individuals[author]["cas_commented_on"][ca_name] += 1
                if is_technical:
                    individuals[author]["technical"] += 1
                if is_recent:
                    individuals[author]["recent_bugs"].add(bug_id)
                    if is_technical:
                        individuals[author]["recent_technical"] += 1

    # Serialize (sets -> lists/counts)
    org_out = {}
    for org, d in sorted(orgs.items(), key=lambda x: -len(x[1]["bugs"])):
        org_out[org] = {
            "emails": sorted(d["emails"]),
            "bugs_engaged": len(d["bugs"]),
            "comments": d["comments"],
            "technical_comments": d["technical"],
            "recent_bugs_engaged": len(d["recent_bugs"]),
            "recent_technical_comments": d["recent_technical"],
            "by_year": dict(sorted(d["by_year"].items())),
            "top_cas_commented_on": d["cas_commented_on"].most_common(10),
        }

    ind_out = {}
    for email, d in sorted(individuals.items(), key=lambda x: -len(x[1]["bugs"])):
        if len(d["bugs"]) < 3:
            continue  # filter noise
        ind_out[email] = {
            "bugs_engaged": len(d["bugs"]),
            "comments": d["comments"],
            "technical_comments": d["technical"],
            "recent_bugs_engaged": len(d["recent_bugs"]),
            "recent_technical_comments": d["recent_technical"],
            "by_year": dict(sorted(d["by_year"].items())),
            "top_cas_commented_on": d["cas_commented_on"].most_common(10),
        }

    print(f"  CA orgs: {len(org_out)}, Individuals: {len(ind_out)}")
    return org_out, ind_out


# ── Signal 2: Ballot proposals and endorsements ───────────────────────────────

def analyze_ballots(ballots_cache):
    """Parse CA ballot proposals and endorsements. Votes excluded — membership obligation."""
    print("── Signal 2: Ballot Proposals and Endorsements ──")

    ROOT_PROGRAM_ORGS = {
        "google", "chrome", "mozilla", "apple", "microsoft",
        "chrome root program",
    }

    def is_rp_org(org):
        return any(r in org.lower() for r in ROOT_PROGRAM_ORGS)

    # Canonical individual name map — normalizes last-name-only and spelling variants
    # to the full canonical name. Applied after parsing.
    IND_NAME_CANONICAL = {
        "Davidson":                 "Stephen Davidson",
        "Katerbarg":                "Martijn Katerbarg",
        "Zacharopoulos":            "Dimitris Zacharopoulos",
        "Dmitris Zacharopoulos":    "Dimitris Zacharopoulos",
        "Server Certificate Working Group Chair Dimitris Zacharopoulos": "Dimitris Zacharopoulos",
        "Thayer":                   "Wayne Thayer",
        "Bonnell":                  "Corey Bonnell",
        "Hollebeek":                "Tim Hollebeek",
        "Gable":                    "Aaron Gable",
        "Slaughter":                "Ben Slaughter",
        "Brouwershaven":            "Paul van Brouwershaven",
        "Eleftheriadis":            "Antonis Eleftheriadis",
        "Aleksieieva":              "Kateryna Aleksieieva",
        "Henschel":                 "Andreas Henschel",
        "Entschew":                 "Enrico Entschew",
        "Fischer":                  "Roman Fischer",
        "Mueller":                  "Adrian Mueller",
        "Fuentes":                  "Luis Fuentes",
        "Josefowitz":               "Tobias Josefowitz",
        "Henriksveen":              "Mads Egil Henriksveen",
        "Santoni":                  "Adriano Santoni",
    }

    def canonical_ind(name):
        return IND_NAME_CANONICAL.get(name.strip(), name.strip())

    def parse_people(text):
        people = []
        # 'Name (Org)' pattern
        for m in re.finditer(
            r'([A-Z][a-záéíóúàèìòùäëïöüñ\s\-\.]+?)\s*\(([^)]+)\)', text
        ):
            name = canonical_ind(m.group(1).strip())
            org = m.group(2).strip()
            if len(name) > 3 and len(org) > 2:
                people.append((name, org))
        # 'Name of Org' pattern
        for m in re.finditer(
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+of\s+'
            r'([A-Za-z][A-Za-z\s\/\(\)]+?)(?:\s+and|\s*[,\.\—]|$)',
            text
        ):
            name = canonical_ind(m.group(1).strip())
            org = m.group(2).strip()
            if len(name) > 3 and len(org) > 2:
                people.append((name, org))
        return people

    BALLOT_RECENT_YEAR = "2021"  # consistent with Bugzilla recent cutoff

    org_ballots = defaultdict(lambda: {
        "proposed": 0, "endorsed": 0,
        "recent_proposed": 0, "recent_endorsed": 0,
        "individuals": set(), "wgs": set(),
        "by_year": defaultdict(lambda: {"proposed": 0, "endorsed": 0}),
    })
    ind_ballots = defaultdict(lambda: {
        "proposed": 0, "endorsed": 0,
        "recent_proposed": 0, "recent_endorsed": 0,
        "orgs": set(), "wgs": set(),
        "by_year": defaultdict(lambda: {"proposed": 0, "endorsed": 0}),
    })

    # Collect all ballots, extract year from URL
    import re as _re
    all_ballots = []
    for wg, blist in ballots_cache.items():
        for b in blist:
            m = _re.search(r'/(\d{4})/', b.get("url", ""))
            year = m.group(1) if m else ""
            all_ballots.append((wg, b, year))

    for wg, b, year in all_ballots:
        is_recent = year >= BALLOT_RECENT_YEAR if year else False
        prop_text = b.get("proposer", "")
        end_text = b.get("endorsers_raw", "")

        for name, org in parse_people(prop_text):
            if is_rp_org(org): continue
            org = canonical_org(org)
            org_ballots[org]["proposed"] += 1
            org_ballots[org]["individuals"].add(name)
            org_ballots[org]["wgs"].add(wg)
            if year: org_ballots[org]["by_year"][year]["proposed"] += 1
            ind_ballots[name]["proposed"] += 1
            ind_ballots[name]["orgs"].add(org)
            ind_ballots[name]["wgs"].add(wg)
            if year: ind_ballots[name]["by_year"][year]["proposed"] += 1
            if is_recent:
                org_ballots[org]["recent_proposed"] += 1
                ind_ballots[name]["recent_proposed"] += 1

        for name, org in parse_people(end_text):
            if is_rp_org(org): continue
            org = canonical_org(org)
            org_ballots[org]["endorsed"] += 1
            org_ballots[org]["individuals"].add(name)
            org_ballots[org]["wgs"].add(wg)
            if year: org_ballots[org]["by_year"][year]["endorsed"] += 1
            ind_ballots[name]["endorsed"] += 1
            ind_ballots[name]["orgs"].add(org)
            ind_ballots[name]["wgs"].add(wg)
            if year: ind_ballots[name]["by_year"][year]["endorsed"] += 1
            if is_recent:
                org_ballots[org]["recent_endorsed"] += 1
                ind_ballots[name]["recent_endorsed"] += 1

    # Serialize
    org_out = {}
    for org, d in sorted(
        org_ballots.items(),
        key=lambda x: -(x[1]["proposed"] * 3 + x[1]["endorsed"])
    ):
        org_out[org] = {
            "proposed": d["proposed"],
            "endorsed": d["endorsed"],
            "recent_proposed": d["recent_proposed"],
            "recent_endorsed": d["recent_endorsed"],
            "individuals": sorted(d["individuals"]),
            "working_groups": sorted(d["wgs"]),
            "by_year": {y: dict(v) for y, v in sorted(d["by_year"].items())},
        }

    ind_out = {}
    for name, d in sorted(
        ind_ballots.items(),
        key=lambda x: -(x[1]["proposed"] * 3 + x[1]["endorsed"])
    ):
        ind_out[name] = {
            "proposed": d["proposed"],
            "endorsed": d["endorsed"],
            "recent_proposed": d["recent_proposed"],
            "recent_endorsed": d["recent_endorsed"],
            "orgs": sorted(d["orgs"]),
            "working_groups": sorted(d["wgs"]),
            "by_year": {y: dict(v) for y, v in sorted(d["by_year"].items())},
        }

    print(f"  CA orgs: {len(org_out)}, Individuals: {len(ind_out)}")
    return org_out, ind_out


# ── Signal 3: Proactive bug filing ───────────────────────────────────────────

def analyze_bug_filing(bugs_raw):
    """Find who proactively files bugs about other CAs' issues."""
    print("── Signal 3: Proactive Bug Filing ──")

    RECENT_CUTOFF = "2021"

    org_filing = defaultdict(lambda: {
        "bugs": [], "recent_bugs": [], "by_year": defaultdict(int),
        "cas_filed_about": Counter(),
    })
    ind_filing = defaultdict(lambda: {
        "bugs": [], "recent_bugs": [], "by_year": defaultdict(int),
        "cas_filed_about": Counter(),
    })

    for bug in bugs_raw:
        creator = bug.get("creator", "")
        summary = bug.get("summary", "")
        creation_time = bug.get("creation_time", "")
        year = creation_time[:4]
        if not year or int(year) < 2014:
            continue

        domain = creator.lower().split("@")[-1] if "@" in creator else ""
        if domain in BOT_DOMAINS:
            continue

        # Skip root program filings
        if is_root_program(creator, creation_time):
            continue

        org = get_ca_org(creator, creation_time)

        # Skip if filing about own CA
        if org and is_own_filing(summary, org):
            continue

        ca_name = summary.split(":")[0].strip()[:40] if ":" in summary else summary[:40]
        is_recent = year >= RECENT_CUTOFF
        entry = {"id": bug.get("id"), "summary": summary[:80], "year": year}

        if org:
            org_filing[org]["bugs"].append(entry)
            org_filing[org]["by_year"][year] += 1
            org_filing[org]["cas_filed_about"][ca_name] += 1
            if is_recent:
                org_filing[org]["recent_bugs"].append(entry)
        else:
            ind_filing[creator]["bugs"].append(entry)
            ind_filing[creator]["by_year"][year] += 1
            ind_filing[creator]["cas_filed_about"][ca_name] += 1
            if is_recent:
                ind_filing[creator]["recent_bugs"].append(entry)

    org_out = {}
    for org, d in sorted(org_filing.items(), key=lambda x: -len(x[1]["bugs"])):
        if not d["bugs"]:
            continue
        org_out[org] = {
            "bugs_filed": len(d["bugs"]),
            "recent_bugs_filed": len(d["recent_bugs"]),
            "by_year": dict(sorted(d["by_year"].items())),
            "top_cas_filed_about": d["cas_filed_about"].most_common(5),
        }

    ind_out = {}
    for email, d in sorted(ind_filing.items(), key=lambda x: -len(x[1]["bugs"])):
        if len(d["bugs"]) < 3:
            continue
        ind_out[email] = {
            "bugs_filed": len(d["bugs"]),
            "recent_bugs_filed": len(d["recent_bugs"]),
            "by_year": dict(sorted(d["by_year"].items())),
            "top_cas_filed_about": d["cas_filed_about"].most_common(5),
        }

    print(f"  CA orgs: {len(org_out)}, Individuals: {len(ind_out)}")
    return org_out, ind_out


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Community Engagement Pipeline")
    print("=" * 60)

    cache = load_json(CACHE_DIR / "comments_cache.json", {})
    bugs_raw_list = load_json(CACHE_DIR / "bugs_raw.json", [])
    clf = load_json(CACHE_DIR / "comment_classifications.json", {})
    ballots_cache = load_json(CACHE_DIR / "cabforum_ballots.json", {})
    cabf_members = load_json(CACHE_DIR / "cabf_members.json", {})

    bug_lookup = {str(b["id"]): b for b in bugs_raw_list}

    print(f"Loaded {len(cache)} bugs, {len(bugs_raw_list)} bug records, "
          f"{len(clf)} classifications, "
          f"{sum(len(v) for v in ballots_cache.values())} ballots\n")

    bz_orgs, bz_inds = analyze_bugzilla_community(cache, bug_lookup, clf)
    bal_orgs, bal_inds = analyze_ballots(ballots_cache)
    fil_orgs, fil_inds = analyze_bug_filing(bugs_raw_list)

    # ── Build CABF member lookup ──
    # Map CABF member names to our canonical org names
    # so we can show zeroes for non-participating members
    CABF_NAME_TO_CANONICAL = {
        "AC Camerfirma SA": "Camerfirma",
        "AC Firmaprofessional SA": "Firmaprofesional",
        "Actalis S.p.A.": "Actalis",
        "Amazon": "Amazon Trust Services",
        "Asseco Data Systems SA (Certum)": "Certum/Asseco",
        "Beijing Certificate Authority": "BJCA",
        "Buypass AS": "Buypass",
        "Certigna (DHIMYOTIS)": "Certigna",
        "certSIGN": "certSIGN",
        "CFCA": "CFCA",
        "Chunghwa Telecom": "Chunghwa Telecom",
        "CommScope": "CommScope",
        "Comsign": "Comsign",
        "DigiCert": "DigiCert",
        "Digidentity": "Digidentity",
        "DigitalTrust": "DigitalTrust",
        "Disig": "Disig",
        "DocuSign": "DocuSign",
        "D-TRUST": "Bundesdruckerei/D-TRUST",
        "eMudhra": "eMudhra",
        "Entrust": "Entrust",
        "E-tugra": "E-Tugra",
        "Fastly": "Certainly/Fastly",
        "GDCA": "GDCA",
        "GlobalSign": "GlobalSign",
        "GlobalTrust": "GlobalTrust",
        "GoDaddy": "GoDaddy",
        "HARICA": "HARICA",
        "IdenTrust": "IdenTrust",
        "iTrusChina": "iTrusChina",
        "Izenpe": "Izenpe",
        "Japan Registry Services": "JPRS",
        "Kamu SM": "Kamu SM",
        "KPN": "KPN",
        "Let's Encrypt": "Let's Encrypt",
        "MOIS (Ministry of Interior and Safety) of the republic of Korea": "MOIS Korea",
        "MSC Trustgate Sdn Bhd": "MSC Trustgate",
        "NAVER Cloud Trust Services": "NAVER Cloud Trust Services",
        "Network Solutions": "Network Solutions",
        "OATI": "OATI",
        "OISTE Foundation": "OISTE",
        "Pos Digicert Sdn. Bhd.": "Pos Digicert",
        "První certifikační autorita": "První CA",
        "Saudi Data and Artificial Intelligence Agency (SDAIA)": "SDAIA",
        "SECOM Trust Systems": "SECOM",
        "Sectigo": "Sectigo",
        "SHECA": "SHECA",
        "SK ID Solutions AS": "SK ID Solutions",
        "SSC": "SSC",
        "SSL.com": "SSL.com",
        "SwissSign": "SwissSign",
        "Telia Company": "Telia",
        "TrustAsia": "TrustAsia",
        "TWCA": "TWCA",
        "VikingCloud": "VikingCloud",
        "Visa": "Visa",
    }

    CABF_CONSUMERS = set(cabf_members.get("certificate_consumers", []))
    CABF_INTERESTED = set(cabf_members.get("interested_parties", []))

    # Build set of canonical CA member names
    cabf_ca_members = set(CABF_NAME_TO_CANONICAL.values())

    # ── Merge all three signals into unified org and individual records ──
    # Include ALL CABF CA members, even those with zero engagement
    all_orgs = set(bz_orgs) | set(bal_orgs) | set(fil_orgs) | cabf_ca_members
    all_inds = set(bz_inds) | set(fil_inds)

    orgs_out = {}
    for org in sorted(all_orgs):
        orgs_out[org] = {
            "cabf_member": org in cabf_ca_members,
            "bugzilla": bz_orgs.get(org, {
                "bugs_engaged": 0, "comments": 0, "technical_comments": 0,
                "recent_bugs_engaged": 0, "recent_technical_comments": 0,
                "by_year": {}, "top_cas_commented_on": [],
            }),
            "ballots": bal_orgs.get(org, {
                "proposed": 0, "endorsed": 0,
                "recent_proposed": 0, "recent_endorsed": 0,
                "individuals": [], "working_groups": [],
                "by_year": {},
            }),
            "bug_filing": fil_orgs.get(org, {
                "bugs_filed": 0, "recent_bugs_filed": 0,
                "by_year": {}, "top_cas_filed_about": [],
            }),
        }

    inds_out = {}
    for email in sorted(all_inds):
        # Check if this individual is a named CABF interested party
        name_match = None
        email_lower = email.lower()
        for ip in CABF_INTERESTED:
            words = [w.lower() for w in ip.split() if len(w) > 3 and "(" not in w]
            if any(w in email_lower for w in words):
                name_match = ip
                break
        inds_out[email] = {
            "cabf_interested_party": name_match,
            "bugzilla": bz_inds.get(email, {
                "bugs_engaged": 0, "comments": 0, "technical_comments": 0,
                "recent_bugs_engaged": 0, "recent_technical_comments": 0,
                "by_year": {}, "top_cas_commented_on": [],
            }),
            "bug_filing": fil_inds.get(email, {
                "bugs_filed": 0, "recent_bugs_filed": 0,
                "by_year": {}, "top_cas_filed_about": [],
            }),
        }

    output = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pipeline_version": "1.1",
            "total_orgs": len(orgs_out),
            "total_cabf_ca_members": len(cabf_ca_members),
            "total_individuals": len(inds_out),
            "total_ballots": sum(len(v) for v in ballots_cache.values()),
            "note_technical": "technical_comments counts LLM-classified substantive comments (cert/CRL analysis, specific BR citations, investigative questions). Values may exceed bugs_engaged since multiple technical comments per bug are counted.",
            "note_baseline": "All CABF CA members included as org rows, even those with zero engagement. cabf_member=true indicates formal membership. Absence of engagement by a member is as meaningful as presence.",
        },
        "cabf_members": {
            "certification_authorities": cabf_members.get("certification_authorities", []),
            "certificate_consumers": cabf_members.get("certificate_consumers", []),
            "interested_parties": cabf_members.get("interested_parties", []),
        },
        "organizations": orgs_out,
        "individuals": inds_out,
        "ballot_individuals": bal_inds,
    }

    out_path = DATA_DIR / "community_engagement.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\nOutput: {out_path} ({out_path.stat().st_size // 1024}KB)")

    # ── Summary ──
    print("\n── Summary ──")
    print(f"\nTop CA orgs by Bugzilla engagement:")
    for org, d in list(orgs_out.items())[:12]:
        bz = d["bugzilla"]
        bal = d["ballots"]
        fil = d["bug_filing"]
        if bz["bugs_engaged"] + bal["proposed"] + fil["bugs_filed"] == 0:
            continue
        print(f"  {org:30s}  bz={bz['bugs_engaged']:3d}bugs  "
              f"ballots={bal['proposed']}P/{bal['endorsed']}E  "
              f"filed={fil['bugs_filed']:3d}")

    print(f"\nTop individuals by Bugzilla engagement:")
    ind_sorted = sorted(inds_out.items(),
                        key=lambda x: -x[1]["bugzilla"]["bugs_engaged"])
    for email, d in ind_sorted[:12]:
        bz = d["bugzilla"]
        fil = d["bug_filing"]
        print(f"  {email:42s}  bz={bz['bugs_engaged']:3d}bugs  "
              f"filed={fil['bugs_filed']:3d}")

    print(f"\nTop ballot contributors (CA orgs):")
    bal_sorted = sorted(bal_orgs.items(),
                        key=lambda x: -(x[1]["proposed"] * 3 + x[1]["endorsed"]))
    for org, d in bal_sorted[:10]:
        print(f"  {org:30s}  proposed={d['proposed']:3d}  endorsed={d['endorsed']:3d}  "
              f"WGs={'+'.join(sorted(d['working_groups']))}")


if __name__ == "__main__":
    main()
