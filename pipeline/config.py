# pipeline/config.py — Shared configuration for pipeline export scripts.

BR_VALIDITY = [
    {"from": "2020-09-01", "days": 398, "label": "398 days"},
    {"from": "2026-03-15", "days": 200, "label": "200 days"},
    {"from": "2027-03-15", "days": 100, "label": "100 days"},
    {"from": "2029-03-15", "days": 47, "label": "47 days"},
]

DISTRUST_OVERRIDES = {
    "Entrust": {
        "reason": "Distrusted for new issuance: Chrome Nov 11 2024, Apple Nov 15 2024, "
                  "Mozilla Dec 1 2024, Microsoft Apr 16 2025. Sold public CA business to Sectigo Sep 2025.",
    },
}

# CA Owners in CCADB that belong to the same parent organization.
# Cross-signs between affiliated CAs are intra-organizational: crt.sh
# attribution stays within the same org, so no caveat is needed.
# Each entry is a frozenset of CCADB "CA Owner" strings.
ORG_AFFILIATES = [
    frozenset({"Google Trust Services LLC", "GlobalSign nv-sa"}),
    frozenset({"D-Trust", "D-TRUST"}),
    frozenset({"SECOM Trust Systems Co., Ltd.", "SECOM Trust Systems CO., LTD."}),
]

COUNTRY_NAMES = {
    "US": "United States", "USA": "United States",
    "United States of America": "United States",
    "UK": "United Kingdom", "Republic of Korea": "South Korea",
    "Korea": "South Korea", "Türkiye": "Turkey",
    "Türkiye (Turkey)": "Turkey", "Czech Republic": "Czechia",
    "People's Republic of China": "China",
    "Hong Kong SAR": "Hong Kong", "The Netherlands": "Netherlands",
    "Polska": "Poland", "España": "Spain", "SPAIN": "Spain",
}
