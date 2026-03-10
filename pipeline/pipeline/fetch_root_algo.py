#!/usr/bin/env python3
"""
fetch_root_algo.py - Fetch and parse root certificate algorithm metadata

Downloads certificate PEMs in bulk from CCADB's AllCertificatePEMsCSVFormat
endpoint (by decade), matches them against currently-included roots from the
per-CA detail files, and parses each with the cryptography library to extract:
- Key algorithm family (RSA, ECC, EdDSA)
- Key size in bits
- ECC curve name (if applicable)
- Signature hash algorithm
- Validity dates (from the certificate itself)

Outputs data/root_algorithms.json with per-root algorithm details and
aggregate statistics.

The bulk CCADB PEM download fetches ~10,000 certs (all types, all stores)
in ~6 seconds versus 330+ seconds for individual crt.sh requests. Only roots
that aren't found in the bulk download fall back to individual crt.sh fetches.

Cache: Parsed cert metadata is cached in pipeline/algo_cache.json keyed
by SHA-256 fingerprint.

Usage:
    python fetch_root_algo.py

Dependencies:
    pip install requests cryptography
"""

import csv
import io
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

# Force unbuffered stdout so CI shows progress in real time
if not sys.stdout.isatty():
    sys.stdout = os.fdopen(sys.stdout.fileno(), "w", buffering=1)
    sys.stderr = os.fdopen(sys.stderr.fileno(), "w", buffering=1)

import requests
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import rsa, ec, ed25519, ed448, dsa

PIPELINE_DIR = Path(__file__).parent
DATA_DIR = PIPELINE_DIR.parent / "data"
CACHE_PATH = PIPELINE_DIR / "algo_cache.json"
OUTPUT_PATH = DATA_DIR / "root_algorithms.json"


def load_cache():
    """Load cached cert metadata keyed by SHA-256 fingerprint."""
    if CACHE_PATH.exists():
        with open(CACHE_PATH) as f:
            return json.load(f)
    return {}


def save_cache(cache):
    """Save cert metadata cache."""
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)


def fetch_bulk_pems():
    """Fetch all certificate PEMs from CCADB in bulk by decade.

    Returns dict mapping uppercase SHA-256 fingerprint -> PEM string.
    Covers all certificate types (TLS, S/MIME, code signing) across all
    trust stores. Typically ~10,000 certs in ~6 seconds.
    """
    print("  Fetching bulk PEMs from CCADB...")
    all_pems = {}

    for decade in ["1990", "2000", "2010", "2020"]:
        url = (
            "https://ccadb.my.salesforce-sites.com/ccadb/"
            f"AllCertificatePEMsCSVFormat?NotBeforeDecade={decade}"
        )
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code != 200:
                print(f"    WARNING: CCADB PEM fetch for {decade}s returned {resp.status_code}")
                continue

            reader = csv.DictReader(io.StringIO(resp.text))
            count = 0
            for row in reader:
                sha = row.get("SHA-256 Fingerprint", "").strip().upper()
                pem = row.get("X.509 Certificate (PEM)", "").strip()
                if sha and pem and "BEGIN CERTIFICATE" in pem:
                    all_pems[sha] = pem
                    count += 1
            print(f"    {decade}s: {count} certificates")
        except requests.RequestException as e:
            print(f"    WARNING: Failed to fetch {decade}s PEMs: {e}")

    print(f"  CCADB bulk download: {len(all_pems)} total certificates with PEMs")
    return all_pems


def fetch_pem_from_crtsh(sha256, retries=2, delay=3):
    """Fallback: fetch a single PEM from crt.sh by SHA-256 fingerprint.

    Only used for roots not found in the CCADB bulk download.
    """
    url = f"https://crt.sh/?d={sha256}"
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200 and b"BEGIN CERTIFICATE" in resp.content:
                return resp.content.decode("utf-8", errors="replace")
            if resp.status_code == 404:
                return None
        except requests.RequestException:
            pass
        time.sleep(delay * (attempt + 1))
    return None


def parse_cert(pem_text, fingerprint="unknown"):
    """Parse a PEM certificate string and extract algorithm metadata.

    Args:
        pem_text: PEM certificate as a string
        fingerprint: SHA-256 fingerprint for error reporting
    """
    pem_bytes = pem_text.encode() if isinstance(pem_text, str) else pem_text

    try:
        cert = x509.load_pem_x509_certificate(pem_bytes)
    except ValueError as e:
        # Future cryptography versions will reject non-positive serial numbers.
        # Log the specific cert so the problem is visible in CI.
        print(f"    ERROR: Cannot parse cert {fingerprint}: {e}", file=sys.stderr)
        return {"error": str(e), "fingerprint": fingerprint}
    except Exception as e:
        print(f"    ERROR: Unexpected parse failure for {fingerprint}: {e}", file=sys.stderr)
        return {"error": str(e), "fingerprint": fingerprint}

    pub_key = cert.public_key()

    if isinstance(pub_key, rsa.RSAPublicKey):
        key_family = "RSA"
        key_bits = pub_key.key_size
        curve = None
    elif isinstance(pub_key, ec.EllipticCurvePublicKey):
        key_family = "ECC"
        key_bits = pub_key.key_size
        curve_map = {"secp256r1": "P-256", "secp384r1": "P-384", "secp521r1": "P-521"}
        curve = curve_map.get(pub_key.curve.name, pub_key.curve.name)
    elif isinstance(pub_key, ed25519.Ed25519PublicKey):
        key_family = "EdDSA"
        key_bits = 256
        curve = "Ed25519"
    elif isinstance(pub_key, ed448.Ed448PublicKey):
        key_family = "EdDSA"
        key_bits = 448
        curve = "Ed448"
    elif isinstance(pub_key, dsa.DSAPublicKey):
        key_family = "DSA"
        key_bits = pub_key.key_size
        curve = None
    else:
        key_family = type(pub_key).__name__
        key_bits = 0
        curve = None

    sig_hash = cert.signature_hash_algorithm
    if sig_hash:
        sig_hash_name = sig_hash.name.upper().replace("SHA", "SHA-")
        if sig_hash_name.startswith("SHA--"):
            sig_hash_name = "SHA-" + sig_hash_name[5:]
    else:
        sig_hash_name = "N/A"

    sig_oid = cert.signature_algorithm_oid._name if cert.signature_algorithm_oid else "unknown"

    serial = cert.serial_number
    if serial <= 0:
        print(
            f"    WARNING: Cert {fingerprint} has non-positive serial number ({serial}). "
            f"This violates RFC 5280 and will break in a future cryptography release.",
            file=sys.stderr,
        )
    serial_hex = format(abs(serial), "X")
    if serial < 0:
        serial_hex = "NEGATIVE:" + serial_hex

    result = {
        "key_family": key_family,
        "key_bits": key_bits,
        "sig_hash": sig_hash_name,
        "sig_oid": sig_oid,
        "not_before": cert.not_valid_before_utc.strftime("%Y.%m.%d"),
        "not_after": cert.not_valid_after_utc.strftime("%Y.%m.%d"),
        "subject_cn": None,
        "serial_hex": serial_hex,
        "rfc5280_compliant_serial": serial > 0,
    }

    if curve:
        result["curve"] = curve

    for attr in cert.subject:
        if attr.oid == x509.oid.NameOID.COMMON_NAME:
            result["subject_cn"] = attr.value
            break

    return result


def load_included_roots():
    """Load currently-included root certificates from per-CA detail files.

    A root is 'included' if at least one store has status 'Included'.
    """
    ca_dir = DATA_DIR / "ca"
    index_path = ca_dir / "_index.json"

    if not index_path.exists():
        print("  ERROR: No CA index found. Run fetch_and_join.py first.")
        return []

    with open(index_path) as f:
        index = json.load(f)

    roots = []
    for ca_entry in index:
        slug = ca_entry.get("slug", "")
        ca_path = ca_dir / f"{slug}.json"
        if not ca_path.exists():
            continue

        with open(ca_path) as f:
            ca_data = json.load(f)

        for root in ca_data.get("roots", []):
            included = any(
                root.get(f"{store}_status") == "Included"
                for store in ["mozilla", "microsoft", "chrome", "apple"]
            )
            if included:
                sha = root.get("sha256", "").replace(":", "").upper()
                if sha:
                    roots.append({
                        "ca_slug": slug,
                        "ca_owner": ca_entry.get("ca_owner", slug),
                        "root_name": root.get("name", ""),
                        "sha256": sha,
                        "stores": "".join([
                            "M" if root.get("mozilla_status") == "Included" else "",
                            "C" if root.get("chrome_status") == "Included" else "",
                            "S" if root.get("microsoft_status") == "Included" else "",
                            "A" if root.get("apple_status") == "Included" else "",
                        ]),
                        "tls": root.get("tls_capable", False),
                        "ev": root.get("ev_capable", False),
                        "smime": root.get("smime_capable", False),
                        "cs": root.get("code_signing_capable", False),
                    })

    return roots


def build_output(roots_with_algo):
    """Build the output JSON with per-root data and aggregate stats."""
    now = datetime.now(timezone.utc)

    records = []
    for r in roots_with_algo:
        algo = r.get("algo", {})
        if "error" in algo:
            continue
        records.append({
            "ca_id": r["ca_slug"],
            "ca_owner": r["ca_owner"],
            "name": algo.get("subject_cn") or r["root_name"],
            "sha256": r["sha256"],
            "stores": r["stores"],
            "key_family": algo["key_family"],
            "key_bits": algo["key_bits"],
            "curve": algo.get("curve"),
            "sig_hash": algo["sig_hash"],
            "not_before": algo["not_before"],
            "not_after": algo["not_after"],
            "tls": r["tls"],
            "ev": r["ev"],
            "smime": r["smime"],
            "cs": r["cs"],
        })

    total = len(records)
    rsa_count = sum(1 for r in records if r["key_family"] == "RSA")
    ecc_count = sum(1 for r in records if r["key_family"] == "ECC")

    key_sizes = {}
    for r in records:
        label = r.get("curve") or f"{r['key_family']}-{r['key_bits']}"
        key_sizes[label] = key_sizes.get(label, 0) + 1

    sig_hashes = {}
    for r in records:
        sig_hashes[r["sig_hash"]] = sig_hashes.get(r["sig_hash"], 0) + 1

    ca_count = len(set(r["ca_id"] for r in records))

    return {
        "generated_at": now.isoformat(),
        "total_roots": total,
        "ca_count": ca_count,
        "summary": {
            "rsa_count": rsa_count,
            "ecc_count": ecc_count,
            "rsa_pct": round(rsa_count / total * 100, 1) if total else 0,
            "ecc_pct": round(ecc_count / total * 100, 1) if total else 0,
            "key_sizes": sorted(
                [{"label": k, "count": v, "pct": round(v / total * 100, 1)}
                 for k, v in key_sizes.items()],
                key=lambda x: -x["count"]
            ),
            "sig_hashes": sorted(
                [{"label": k, "count": v, "pct": round(v / total * 100, 1)}
                 for k, v in sig_hashes.items()],
                key=lambda x: -x["count"]
            ),
        },
        "roots": records,
    }


def main():
    print(f"Root Algorithm Pipeline - {datetime.now(timezone.utc).isoformat()}")

    # Step 1: Load included roots from per-CA files
    roots = load_included_roots()
    print(f"  Found {len(roots)} currently-included roots across CA detail files")

    if not roots:
        print("  No roots found. Run fetch_and_join.py first to populate data/ca/ files.")
        return 1

    # Step 2: Load cache
    cache = load_cache()
    print(f"  Cache has {len(cache)} entries")

    uncached = [r for r in roots if r["sha256"] not in cache]
    print(f"  Need algo data for {len(uncached)} uncached roots")

    if uncached:
        # Step 3: Bulk fetch PEMs from CCADB (all cert types, all stores)
        bulk_pems = fetch_bulk_pems()

        # Step 4: Match and parse
        matched_bulk = 0
        missed = []

        for i, root in enumerate(uncached):
            sha = root["sha256"]
            pem = bulk_pems.get(sha)

            if pem:
                algo = parse_cert(pem, fingerprint=sha)
                cache[sha] = algo
                matched_bulk += 1
                family = algo.get("key_family", "?")
                bits = algo.get("key_bits", "?")
                sig = algo.get("sig_hash", "?")
                print(f"  [{i + 1}/{len(uncached)}] {root['root_name'][:50]}... {family}-{bits} / {sig}")
            else:
                missed.append(root)

        print(f"  Matched {matched_bulk}/{len(uncached)} from CCADB bulk download")

        # Step 5: Fallback to crt.sh for any roots not in CCADB bulk
        if missed:
            print(f"  Falling back to crt.sh for {len(missed)} remaining roots...")
            for i, root in enumerate(missed):
                sha = root["sha256"]
                print(f"  [crt.sh {i + 1}/{len(missed)}] {root['root_name'][:50]}...")

                pem = fetch_pem_from_crtsh(sha)
                if pem:
                    algo = parse_cert(pem, fingerprint=sha)
                    cache[sha] = algo
                    print(f"    {algo.get('key_family', '?')}-{algo.get('key_bits', '?')} / {algo.get('sig_hash', '?')}")
                else:
                    cache[sha] = {"error": "fetch_failed", "fingerprint": sha}
                    print(f"    FAILED to fetch PEM from crt.sh")

                if i < len(missed) - 1:
                    time.sleep(1)

        save_cache(cache)
        print(f"  Cache updated: {len(cache)} entries")
    else:
        print("  All roots cached, no fetching needed")

    # Step 6: Attach algo data and build output
    for root in roots:
        root["algo"] = cache.get(root["sha256"], {"error": "not_in_cache"})

    output = build_output(roots)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2, default=str)

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"\n  Wrote root_algorithms.json ({size_kb:.1f} KB)")
    print(f"  {output['total_roots']} roots, {output['ca_count']} CAs")
    print(f"  RSA: {output['summary']['rsa_pct']}% ({output['summary']['rsa_count']})")
    print(f"  ECC: {output['summary']['ecc_pct']}% ({output['summary']['ecc_count']})")
    ks = ", ".join(f"{k['label']}={k['count']}" for k in output["summary"]["key_sizes"][:5])
    sh = ", ".join(f"{k['label']}={k['count']}" for k in output["summary"]["sig_hashes"][:5])
    print(f"  Key sizes: {ks}")
    print(f"  Sig hashes: {sh}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
