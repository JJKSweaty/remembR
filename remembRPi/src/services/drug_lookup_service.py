"""
Drug lookup service — wraps barcode-to-drug-info pipeline.

Given a barcode string (UPC/NDC digits), queries openFDA and UPCitemdb
to identify the product. Returns a structured dict with drug/product info
or None if nothing matched.

Based on the standalone barcode_scanner module, adapted for use as
an importable service within the remembR backend.
"""

import requests
from typing import Optional

from src.utils.logging_utils import get_logger

_log = get_logger()

OPENFDA_NDC_URL = "https://api.fda.gov/drug/ndc.json"
UPCITEMDB_LOOKUP_URL = "https://api.upcitemdb.com/prod/trial/lookup"


# ── Barcode normalisation helpers ────────────────────────────

def normalize_barcode_to_digits(barcode: str) -> str:
    """Return digits only, normalise EAN-13 -> 12-digit UPC when applicable."""
    digits = "".join(c for c in barcode.strip() if c.isdigit())
    if len(digits) == 13 and digits.startswith("0"):
        return digits[1:]
    return digits


def extract_ndc_from_upc(barcode: str) -> tuple[str, str | None]:
    """
    Extract 10-digit NDC from a 12-digit UPC when possible.
    Returns (ndc_candidate, upc_for_lookup).
    """
    digits = normalize_barcode_to_digits(barcode)

    if len(digits) == 12 and digits.startswith("3"):
        return (digits[1:11], digits)
    if len(digits) == 12:
        return ("", digits)
    if len(digits) == 13 and digits.startswith("0"):
        twelve = digits[1:]
        if twelve.startswith("3"):
            return (twelve[1:11], twelve)
        return ("", twelve)
    if len(digits) == 10:
        return (digits, None)
    if len(digits) == 11:
        return (digits[1:], None)
    return (digits, None)


def format_ndc_variants(ndc10: str) -> list[str]:
    """Given a 10-digit NDC, return all possible hyphenated formats."""
    if len(ndc10) != 10:
        return [ndc10]
    return [
        f"{ndc10[0:4]}-{ndc10[4:8]}",
        f"{ndc10[0:5]}-{ndc10[5:8]}",
        f"{ndc10[0:5]}-{ndc10[5:9]}",
        f"{ndc10[0:4]}-{ndc10[4:8]}-{ndc10[8:10]}",
        f"{ndc10[0:5]}-{ndc10[5:8]}-{ndc10[8:10]}",
        f"{ndc10[0:5]}-{ndc10[5:9]}-{ndc10[9:10]}",
    ]


# ── openFDA / UPC lookups ───────────────────────────────────

def _parse_drug_result(result: dict, matched_ndc: str) -> dict:
    """Extract useful fields from an openFDA NDC result."""
    ingredients = result.get("active_ingredients", [])
    ingredient_list = [
        f"{ing.get('name', '?')} ({ing.get('strength', '?')})"
        for ing in ingredients
    ]
    packaging = result.get("packaging", [])
    package_descriptions = [pkg.get("description", "") for pkg in packaging]

    return {
        "ndc": matched_ndc,
        "brand_name": result.get("brand_name", "Unknown"),
        "generic_name": result.get("generic_name", "Unknown"),
        "dosage_form": result.get("dosage_form", "Unknown"),
        "route": ", ".join(result.get("route", [])),
        "active_ingredients": ingredient_list,
        "labeler_name": result.get("labeler_name", "Unknown"),
        "product_type": result.get("product_type", "Unknown"),
        "packaging": package_descriptions,
        "pharm_class": result.get("pharm_class", []),
        "dea_schedule": result.get("dea_schedule"),
    }


def lookup_ndc(ndc: str) -> Optional[dict]:
    """Query openFDA for drug info by NDC code (tries all hyphenation variants)."""
    candidates = []
    if "-" in ndc:
        candidates.append(ndc)
    digits_only = ndc.replace("-", "")
    candidates.extend(format_ndc_variants(digits_only))
    candidates.append(digits_only)

    seen: set[str] = set()
    unique = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    for ndc_fmt in unique:
        try:
            for field in ("product_ndc", "package_ndc"):
                query = f'{field}:"{ndc_fmt}"'
                resp = requests.get(
                    OPENFDA_NDC_URL,
                    params={"search": query, "limit": 1},
                    timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    if results:
                        return _parse_drug_result(results[0], ndc_fmt)
        except requests.RequestException:
            continue
    return None


def lookup_by_upc(upc: str) -> Optional[dict]:
    """Look up drug info by UPC via openFDA, then fall back to UPCitemdb."""
    digits = "".join(c for c in upc.strip() if c.isdigit())
    if len(digits) == 13 and digits.startswith("0"):
        digits = digits[1:]

    upc_variants = []
    if len(digits) == 12:
        upc_variants.append(digits)
        upc_variants.append("0" + digits)
    elif len(digits) == 13:
        upc_variants.append(digits)
        if digits.startswith("0"):
            upc_variants.append(digits[1:])
    else:
        return None

    for upc_try in upc_variants:
        try:
            query = f'openfda.upc:"{upc_try}"'
            resp = requests.get(
                OPENFDA_NDC_URL,
                params={"search": query, "limit": 1},
                timeout=10,
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            results = data.get("results", [])
            if not results:
                continue
            result = results[0]
            matched = result.get("product_ndc") or (
                result.get("packaging", [{}])[0].get("package_ndc", upc_try)
            )
            return _parse_drug_result(result, matched)
        except requests.RequestException:
            continue

    return _lookup_upc_external(upc_variants[0] if upc_variants else digits)


def _lookup_upc_external(upc12: str) -> Optional[dict]:
    """Fallback UPC lookup via UPCitemdb (free trial, no key required)."""
    if len(upc12) != 12:
        return None
    try:
        resp = requests.get(
            UPCITEMDB_LOOKUP_URL,
            params={"upc": upc12},
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("code") != "OK" or not data.get("items"):
            return None
        item = data["items"][0]
        title = item.get("title", "Unknown")
        brand = item.get("brand", "")
        category = item.get("category", "")
        return {
            "ndc": upc12,
            "brand_name": brand or (title.split()[0] if title else "Unknown"),
            "generic_name": title,
            "dosage_form": _infer_dosage(category),
            "route": "",
            "active_ingredients": [],
            "labeler_name": brand or "Unknown",
            "product_type": "OTC / Dietary Supplement",
            "packaging": [item.get("size", "")] if item.get("size") else [],
            "pharm_class": [],
            "dea_schedule": None,
        }
    except requests.RequestException:
        return None


def _infer_dosage(category: str) -> str:
    if not category:
        return "Product"
    c = category.upper()
    for kw, form in [
        ("VITAMIN", "Dietary Supplement"), ("SUPPLEMENT", "Dietary Supplement"),
        ("TABLET", "Tablet"), ("CAPLET", "Tablet"),
        ("LIQUID", "Liquid"), ("SYRUP", "Liquid"),
        ("CAPSULE", "Capsule"),
        ("CREAM", "Topical"), ("OINTMENT", "Topical"),
    ]:
        if kw in c:
            return form
    return "Product"


# ── Public API ───────────────────────────────────────────────

def scan_and_lookup(barcode: str) -> Optional[dict]:
    """
    Full pipeline: raw barcode string -> drug/product info dict or None.
    Tries NDC extraction first, then UPC lookup, then external UPC db.
    """
    _log.info("Drug lookup for barcode: %s", barcode)
    ndc_candidate, upc_for_lookup = extract_ndc_from_upc(barcode)

    if ndc_candidate:
        drug = lookup_ndc(ndc_candidate)
        if drug:
            _log.info("NDC match: %s (%s)", drug["brand_name"], drug["generic_name"])
            return drug

    if upc_for_lookup:
        drug = lookup_by_upc(upc_for_lookup)
        if drug:
            _log.info("UPC match: %s (%s)", drug["brand_name"], drug["generic_name"])
            return drug

    _log.info("No drug match found for barcode: %s", barcode)
    return None


def drug_info_summary(drug: dict) -> str:
    """Short plain-text summary of a drug info dict."""
    parts = [
        f"{drug['brand_name']} ({drug['generic_name']})",
        f"NDC {drug['ndc']}",
        drug["dosage_form"],
    ]
    if drug.get("route"):
        parts.append(drug["route"])
    if drug.get("active_ingredients"):
        parts.append(f"contains {', '.join(drug['active_ingredients'])}")
    if drug.get("labeler_name", "Unknown") != "Unknown":
        parts.append(f"by {drug['labeler_name']}")
    return ". ".join(parts) + "."
