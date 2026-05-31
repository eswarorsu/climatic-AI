from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = (
    ROOT
    / ".cache"
    / "kagglehub"
    / "datasets"
    / "saketk511"
    / "travel-dataset-guide-to-indias-must-see-places"
    / "versions"
    / "3"
)
OUTPUT_PATH = ROOT / "src" / "data" / "kaggle-tourism-documents.json"


def main() -> None:
    csv_path = next(DATASET_DIR.glob("*.csv"))
    places = pd.read_csv(csv_path)
    rows = []

    for _, row in places.iterrows():
        city = clean(row.get("City"))
        state = clean(row.get("State"))
        name = clean(row.get("Name"))
        place_type = clean(row.get("Type"))

        if not city or not state or not name:
            continue

        content_parts = [
            f"{name} is a {place_type or 'tourist place'} in {city}, {state}.",
            maybe("Its significance is", row.get("Significance")),
            maybe("Best time to visit is", row.get("Best Time to visit")),
            maybe("Suggested visit duration in hours is", row.get("time needed to visit in hrs")),
            maybe("Google review rating is", row.get("Google review rating")),
            maybe("Entrance fee in INR is", row.get("Entrance Fee in INR")),
            maybe("Weekly off is", row.get("Weekly Off")),
        ]
        content = " ".join(part for part in content_parts if part)
        slug = slugify(f"{state}-{city}-{name}")

        rows.append(
            {
                "id": f"kaggle-tourism-{slug}",
                "city": city,
                "state": state,
                "country": "India",
                "type": "tourism",
                "title": f"{name} Tourism Guide",
                "content": content,
            }
        )

    OUTPUT_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} documents to {OUTPUT_PATH}")


def clean(value: object) -> str:
    if pd.isna(value):
        return ""

    return str(value).strip()


def maybe(prefix: str, value: object) -> str:
    text = clean(value)

    if not text:
        return ""

    return f"{prefix} {text}."


def slugify(value: str) -> str:
    return "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")


if __name__ == "__main__":
    main()
