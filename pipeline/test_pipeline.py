"""
test_pipeline.py — Smoke tests for WebPKI Observatory pipeline scripts.

These are not unit tests in the strict sense — they test that the
pipeline functions produce structurally valid output given representative
input. Run with: python -m pytest pipeline/test_pipeline.py -v

Focuses on the three highest-risk functions:
  - build_incidents_json (fetch_incidents.py) — drives all incident charts
  - build_digest (fetch_tab_intros.py) — drives LLM tab intro generation
  - load_json / save_json (utils.py) — used everywhere
"""

import json
import sys
import tempfile
from pathlib import Path

# Add pipeline dir to path so imports work
sys.path.insert(0, str(Path(__file__).parent))


# ── utils.py ─────────────────────────────────────────────────────────────────

def test_load_json_missing_file():
    from utils import load_json
    result = load_json('/nonexistent/path.json', default={'fallback': True})
    assert result == {'fallback': True}


def test_load_json_bad_json():
    from utils import load_json
    with tempfile.NamedTemporaryFile(suffix='.json', mode='w', encoding='utf-8', delete=False) as f:
        f.write('not valid json {{{')
        tmp = f.name
    result = load_json(tmp, default='fallback')
    assert result == 'fallback'


def test_load_json_valid():
    from utils import load_json
    with tempfile.NamedTemporaryFile(suffix='.json', mode='w', encoding='utf-8', delete=False) as f:
        json.dump({'key': 'value', 'count': 42}, f)
        tmp = f.name
    result = load_json(tmp)
    assert result == {'key': 'value', 'count': 42}


def test_save_json_creates_dirs():
    from utils import save_json, load_json
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / 'nested' / 'dir' / 'output.json'
        data = {'test': True, 'count': 99}
        save_json(path, data)
        assert path.exists()
        loaded = load_json(path)
        assert loaded == data


def test_save_json_utf8():
    from utils import save_json, load_json
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / 'unicode.json'
        data = {'name': 'Ångström', 'org': 'Büro für PKI', 'emoji': '✓'}
        save_json(path, data)
        loaded = load_json(path)
        assert loaded['name'] == 'Ångström'
        assert loaded['org'] == 'Büro für PKI'


def test_slugify():
    from utils import slugify
    assert slugify('Internet Security Research Group') == 'internet-security-research-group'
    assert slugify('D-TRUST GmbH') == 'd-trust-gmbh'
    assert slugify('') == ''
    assert slugify(None) == ''


# ── fetch_incidents.py ────────────────────────────────────────────────────────

def _make_bug(bug_id, ca_name, status='RESOLVED', year='2024'):
    return {
        'id': bug_id,
        'summary': f'{ca_name}: test compliance issue',
        'creation_time': f'{year}-06-15T10:00:00Z',
        'status': status,
        'resolution': 'FIXED' if status == 'RESOLVED' else '',
        'whiteboard': '[ca-compliance] [policy-failure]',
        'creator': 'reporter@example.com',
    }


def _make_mapping(ca_name, canonical):
    return {'ccadb_owner': canonical, 'status': 'trusted'}


def test_build_incidents_json_basic():
    from fetch_incidents import build_incidents_json

    bugs = [
        _make_bug(1001, 'DigiCert', year='2023'),
        _make_bug(1002, 'DigiCert', year='2024'),
        _make_bug(1003, 'Sectigo', year='2024'),
    ]
    mappings = {
        'DigiCert': _make_mapping('DigiCert', 'DigiCert'),
        'Sectigo': _make_mapping('Sectigo', 'Sectigo'),
    }
    classifications = {}

    result, unmapped = build_incidents_json(bugs, mappings, classifications)

    assert isinstance(result, dict)
    assert result['total'] == 3
    assert result['ca_count'] == 2
    assert len(result['years']) > 0
    assert len(result['cas']) == 2
    assert unmapped == {}


def test_build_incidents_json_empty():
    from fetch_incidents import build_incidents_json
    result, unmapped = build_incidents_json([], {}, {})
    assert result['total'] == 0
    assert result['ca_count'] == 0
    assert result['cas'] == []


def test_build_incidents_json_unmapped():
    from fetch_incidents import build_incidents_json
    bugs = [_make_bug(1001, 'UnknownCA')]
    result, unmapped = build_incidents_json(bugs, {}, {})
    assert result['total'] == 0
    assert 'UnknownCA' in unmapped


def test_build_incidents_json_distrusted_excluded():
    from fetch_incidents import build_incidents_json
    bugs = [_make_bug(1001, 'Entrust')]
    mappings = {'Entrust': {'ccadb_owner': 'Entrust', 'status': 'distrusted'}}
    result, _ = build_incidents_json(bugs, mappings, {})
    # Distrusted CAs go to distrusted_excluded, not total
    assert result['total'] == 0
    assert result.get('total_with_distrusted', 0) == 1


def test_build_incidents_whiteboard_tags():
    from fetch_incidents import build_incidents_json
    bugs = [_make_bug(1001, 'DigiCert')]
    mappings = {'DigiCert': _make_mapping('DigiCert', 'DigiCert')}
    result, _ = build_incidents_json(bugs, mappings, {})
    wb = result.get('whiteboardTags', {})
    assert 'policy-failure' in wb
    assert wb['policy-failure'] == 1


def test_build_incidents_year_grouping():
    from fetch_incidents import build_incidents_json
    bugs = [
        _make_bug(1001, 'DigiCert', year='2022'),
        _make_bug(1002, 'DigiCert', year='2022'),
        _make_bug(1003, 'DigiCert', year='2024'),
    ]
    mappings = {'DigiCert': _make_mapping('DigiCert', 'DigiCert')}
    result, _ = build_incidents_json(bugs, mappings, {})
    years = {y['y']: y['n'] for y in result['years']}
    assert years[2022] == 2
    assert years[2024] == 1


# ── fetch_tab_intros.py ───────────────────────────────────────────────────────

def _make_minimal_snapshot():
    """Minimal valid snapshot structure for testing build_digest."""
    return {
        'market': [
            {'caOwner': 'Test CA', 'share': 50.0},
            {'caOwner': 'Other CA', 'share': 30.0},
        ],
        'concentration': {'cr3': 80.0, 'cr5': 95.0, 'hhi': 3000},
        'incidents': {
            'total': 100, 'caCount': 10,
            'categories': [{'category': 'Misissuance', 'count': 60}],
            'whiteboardTags': {'policy-failure': 20, 'disclosure-failure': 15},
        },
        'governance': {
            'discoveryMethods': {'totals': {
                'root_program': 50, 'community': 15, 'self_detected': 10,
                'external_researcher': 8, 'audit': 6, 'unknown': 11,
            }},
            'coverageRateByYear': [
                {'y': 2019, 'total_bugs': 100, 'chrome': 60.0, 'mozilla': 55.0, 'apple': 0.0, 'microsoft': 0.0},
                {'y': 2024, 'total_bugs': 200, 'chrome': 20.0, 'mozilla': 10.0, 'apple': 5.0, 'microsoft': 0.0},
                {'y': 2025, 'total_bugs': 220, 'chrome': 18.0, 'mozilla': 8.0, 'apple': 6.0, 'microsoft': 0.0},
            ],
            'programCommentSummary': {
                'chrome':    {'bugs_oversight': 100, 'bugs_technical_oversight': 90, 'recent_bugs_technical_oversight': 40},
                'mozilla':   {'bugs_oversight': 80,  'bugs_technical_oversight': 70, 'recent_bugs_technical_oversight': 20},
                'apple':     {'bugs_oversight': 5,   'bugs_technical_oversight': 4,  'recent_bugs_technical_oversight': 3},
                'microsoft': {'bugs_oversight': 0,   'bugs_technical_oversight': 0,  'recent_bugs_technical_oversight': 0},
            },
            'meta': {'bugsTotal': 500},
        },
        'distrustEvents': [
            {'ca': 'BadCA', 'year': 2022, 'compliancePosture': 'negligent_noncompliance',
             'reasonTags': ['pattern_of_issues', 'inadequate_incident_response']},
        ],
        'distrustStats': {'totalEvents': 1, 'postureDistribution': {'negligent_noncompliance': 1}},
        'ecosystemParticipation': {
            'cabfMemberCount': 56, 'activeMemberCount': 19, 'zeroContributionCount': 37,
            'topOrganizations': [{'name': 'Sectigo', 'bugzillaEngaged': 100}],
            'topBallotIndividuals': [{'name': 'Stephen Davidson', 'proposed': 38, 'endorsed': 1}],
        },
        'governmentRisk': {'total': 10, 'issuancePct': 5.0},
        'jurisdictionRisk': [
            {'country': 'China', 'risk': 'high'},
            {'country': 'Russia', 'risk': 'high'},
            {'country': 'Germany', 'risk': 'low'},
        ],
        'chromeRootStoreGrowth': {
            'entries': [
                {'date': '2022-02-16', 'totalRoots': 117, 'added': 117, 'removed': 0},
                {'date': '2026-01-01', 'totalRoots': 242, 'added': 5, 'removed': 1},
            ]
        },
        'browserCoverage': {'chrome': 0.78, 'apple': 0.16, 'mozilla': 0.02, 'microsoft': 0.0},
        'tabIntros': {'generatedAt': None, 'intros': {}},
    }


def test_build_digest_structure():
    from fetch_tab_intros import build_digest
    snap = _make_minimal_snapshot()
    digest = build_digest(snap)

    assert 'market' in digest
    assert 'incidents' in digest
    assert 'discovery' in digest
    assert 'distrust' in digest
    assert 'governance' in digest
    assert 'ecosystem' in digest
    assert 'government' in digest
    assert 'jurisdiction' in digest
    assert 'chromeGrowth' in digest
    assert 'browser' in digest


def test_build_digest_discovery_percentages():
    from fetch_tab_intros import build_digest
    snap = _make_minimal_snapshot()
    digest = build_digest(snap)
    d = digest['discovery']

    assert d['selfPct'] == 10
    assert d['rootProgramPct'] == 50
    assert d['automatedToolsPct'] == 15
    # Each percentage should be a reasonable value
    assert 0 <= d['selfPct'] <= 100
    assert 0 <= d['rootProgramPct'] <= 100
    assert d['rootProgramPct'] > d['selfPct']  # root programs find more than CAs self-detect


def test_build_digest_pattern_count():
    from fetch_tab_intros import build_digest
    snap = _make_minimal_snapshot()
    digest = build_digest(snap)
    assert digest['distrust']['patternOfIssuesCount'] == 1
    assert digest['distrust']['complianceOpsFailureCount'] == 1


def test_build_digest_empty_chrome_growth():
    """Should not crash when chromeRootStoreGrowth has no entries."""
    from fetch_tab_intros import build_digest
    snap = _make_minimal_snapshot()
    snap['chromeRootStoreGrowth'] = {'entries': []}
    digest = build_digest(snap)
    assert digest['chromeGrowth']['from'] is None
    assert digest['chromeGrowth']['to'] is None


def test_build_digest_missing_section():
    """Should not crash when optional sections are missing."""
    from fetch_tab_intros import build_digest
    snap = _make_minimal_snapshot()
    del snap['jurisdictionRisk']
    snap['chromeRootStoreGrowth'] = {'entries': []}
    # Should not raise
    digest = build_digest(snap)
    assert digest['jurisdiction']['highRisk'] == []


def test_build_prompt_has_all_tabs():
    from fetch_tab_intros import build_digest, build_prompt, TABS
    snap = _make_minimal_snapshot()
    digest = build_digest(snap)
    prompt = build_prompt(digest)

    for _, label, _ in TABS:
        assert label in prompt, f'Tab label "{label}" missing from prompt'


# ── Integration: can we round-trip save and load? ─────────────────────────────

def test_roundtrip_incidents_output():
    """build_incidents_json output can be saved and loaded cleanly."""
    from fetch_incidents import build_incidents_json
    from utils import save_json, load_json

    bugs = [_make_bug(i, 'DigiCert') for i in range(10)]
    mappings = {'DigiCert': _make_mapping('DigiCert', 'DigiCert')}
    result, _ = build_incidents_json(bugs, mappings, {})

    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / 'incidents.json'
        save_json(path, result)
        loaded = load_json(path)

    assert loaded['total'] == result['total']
    assert loaded['ca_count'] == result['ca_count']
    assert len(loaded['years']) == len(result['years'])


if __name__ == '__main__':
    # Run basic self-check without pytest
    import traceback
    tests = {k: v for k, v in globals().items() if k.startswith('test_')}
    passed = failed = 0
    for name, fn in tests.items():
        try:
            fn()
            print(f'  ✓ {name}')
            passed += 1
        except Exception as e:
            print(f'  ✗ {name}: {e}')
            traceback.print_exc()
            failed += 1
    print(f'\n{passed} passed, {failed} failed')
    sys.exit(1 if failed else 0)
