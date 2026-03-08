"""
Care plan and medication matching service.

Loads a preloaded care plan (medication list with barcode mappings) and
compares scanned barcodes against it. Returns only:
  - match
  - mismatch
  - uncertain

NEVER diagnoses, prescribes, or tells the user to take or skip medication.
Always reminds the user to confirm with the bottle label, caregiver,
pharmacist, or clinician.
"""

import json
import time
from pathlib import Path
from typing import Any

from src.utils.logging_utils import get_logger

# Standard safety notice appended to every response
SAFETY_NOTICE = (
    "Please confirm the bottle label before use. "
    "If unsure, check with your caregiver, pharmacist, or clinician."
)


class CarePlanService:
    """Matches scanned barcodes against a preloaded medication care plan."""

    def __init__(self, care_plan_path: str = "config/care_plan.json"):
        self._log = get_logger()
        self._care_plan_path = care_plan_path
        self._medications: list[dict] = []
        self._barcode_index: dict[str, dict] = {}
        self._name_index: dict[str, dict] = {}
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> bool:
        """Load the care plan from disk."""
        path = Path(self._care_plan_path)
        if not path.exists():
            self._log.warning("Care plan not found at %s", path)
            return False

        try:
            with open(path) as f:
                data = json.load(f)

            self._medications = data.get("medications", [])

            # Build barcode -> medication index
            self._barcode_index = {}
            self._name_index = {}
            for med in self._medications:
                for barcode in med.get("barcodes", []):
                    self._barcode_index[barcode.strip()] = med
                name_key = med.get("name", "").strip().lower()
                if name_key:
                    self._name_index[name_key] = med

            self._loaded = True
            self._log.info(
                "Care plan loaded: %d medications, %d barcodes indexed",
                len(self._medications),
                len(self._barcode_index),
            )
            return True

        except Exception as e:
            self._log.error("Failed to load care plan: %s", e)
            return False

    def verify_barcode(self, barcode: str) -> dict:
        """Match a scanned barcode against the care plan.

        Returns a structured result with status, medication info, and safety notice.
        """
        barcode = barcode.strip()

        if not self._loaded:
            return {
                "status": "uncertain",
                "barcode": barcode,
                "medication_name": None,
                "plan_slot": None,
                "confidence": 0.0,
                "safety_notice": SAFETY_NOTICE,
                "message": (
                    "No care plan is loaded. "
                    "I cannot verify this medication. " + SAFETY_NOTICE
                ),
            }

        med = self._barcode_index.get(barcode)

        if med:
            return {
                "status": "match",
                "barcode": barcode,
                "medication_name": med.get("name"),
                "dosage": med.get("dosage"),
                "plan_slot": med.get("schedule"),
                "confidence": 0.95,
                "safety_notice": SAFETY_NOTICE,
                "message": (
                    f"This barcode matches {med.get('name')} "
                    f"({med.get('dosage', '')}) in your care plan"
                    f"{', scheduled for ' + med.get('schedule') if med.get('schedule') else ''}. "
                    + SAFETY_NOTICE
                ),
            }

        # Barcode not found in plan
        return {
            "status": "mismatch",
            "barcode": barcode,
            "medication_name": None,
            "plan_slot": None,
            "confidence": 0.0,
            "safety_notice": SAFETY_NOTICE,
            "message": (
                "This barcode does not appear in the current medication plan. "
                + SAFETY_NOTICE
            ),
        }

    def verify_name(self, name: str) -> dict:
        """Match a medication name against the care plan (fuzzy)."""
        name_lower = name.strip().lower()

        if not self._loaded:
            return {
                "status": "uncertain",
                "medication_name": name,
                "plan_slot": None,
                "confidence": 0.0,
                "safety_notice": SAFETY_NOTICE,
                "message": "No care plan is loaded. " + SAFETY_NOTICE,
            }

        # Exact match
        med = self._name_index.get(name_lower)
        if med:
            return {
                "status": "match",
                "medication_name": med.get("name"),
                "dosage": med.get("dosage"),
                "plan_slot": med.get("schedule"),
                "confidence": 0.90,
                "safety_notice": SAFETY_NOTICE,
                "message": (
                    f"{med.get('name')} ({med.get('dosage', '')}) "
                    f"is in your care plan"
                    f"{', scheduled for ' + med.get('schedule') if med.get('schedule') else ''}. "
                    + SAFETY_NOTICE
                ),
            }

        # Substring match
        for key, med in self._name_index.items():
            if name_lower in key or key in name_lower:
                return {
                    "status": "match",
                    "medication_name": med.get("name"),
                    "dosage": med.get("dosage"),
                    "plan_slot": med.get("schedule"),
                    "confidence": 0.70,
                    "safety_notice": SAFETY_NOTICE,
                    "message": (
                        f"This may match {med.get('name')} in your care plan, "
                        f"but I am not fully confident. " + SAFETY_NOTICE
                    ),
                }

        return {
            "status": "mismatch",
            "medication_name": name,
            "plan_slot": None,
            "confidence": 0.0,
            "safety_notice": SAFETY_NOTICE,
            "message": (
                f"{name} does not appear in the current medication plan. "
                + SAFETY_NOTICE
            ),
        }

    def get_plan_summary(self) -> dict:
        """Return a summary of the current care plan."""
        if not self._loaded:
            return {"loaded": False, "medications": []}
        return {
            "loaded": True,
            "medication_count": len(self._medications),
            "medications": [
                {
                    "name": m.get("name"),
                    "dosage": m.get("dosage"),
                    "schedule": m.get("schedule"),
                }
                for m in self._medications
            ],
        }

    def to_status_dict(self) -> dict:
        return {
            "loaded": self._loaded,
            "medication_count": len(self._medications),
            "barcode_count": len(self._barcode_index),
        }
