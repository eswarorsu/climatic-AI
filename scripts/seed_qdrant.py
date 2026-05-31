from __future__ import annotations

import json
import os
from pathlib import Path

import kagglehub
import pandas as pd
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "src" / "data" / "city-documents.json"
QDRANT_PATH = ROOT / "data" / "qdrant"
HF_CACHE_PATH = ROOT / ".cache" / "huggingface"
KAGGLE_CACHE_PATH = ROOT / ".cache" / "kagglehub"
COLLECTION_NAME = "indian_city_knowledge"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

os.environ.setdefault("HF_HOME", str(HF_CACHE_PATH))
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(HF_CACHE_PATH / "sentence-transformers"))
os.environ.setdefault("KAGGLEHUB_CACHE", str(KAGGLE_CACHE_PATH))


def document_text(row: pd.Series) -> str:
    return " ".join(
        [
            str(row["city"]),
            str(row["state"]),
            str(row["country"]),
            str(row["type"]),
            str(row["title"]),
            str(row["content"]),
        ]
    )


def main() -> None:
    documents = load_documents()
    model = SentenceTransformer(MODEL_NAME)
    texts = [document_text(row) for _, row in documents.iterrows()]
    vectors = model.encode(texts, normalize_embeddings=True).tolist()

    QDRANT_PATH.mkdir(parents=True, exist_ok=True)
    client = QdrantClient(path=str(QDRANT_PATH))
    vector_size = len(vectors[0])

    if client.collection_exists(COLLECTION_NAME):
        client.delete_collection(COLLECTION_NAME)

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
    )

    points = []
    for index, (_, row) in enumerate(documents.iterrows()):
        payload = row.to_dict()
        points.append(
            PointStruct(
                id=index,
                vector=vectors[index],
                payload=payload,
            )
        )

    client.upsert(collection_name=COLLECTION_NAME, points=points)

    print(
        json.dumps(
            {
                "collection": COLLECTION_NAME,
                "documents": len(points),
                "path": str(QDRANT_PATH),
                "model": MODEL_NAME,
            },
            indent=2,
        )
    )


def load_documents() -> pd.DataFrame:
    base_documents = pd.read_json(DATA_PATH)
    tourism_documents = load_kaggle_tourism_documents()
    documents = pd.concat([base_documents, tourism_documents], ignore_index=True)
    documents["id"] = documents["id"].astype(str)
    documents = documents.drop_duplicates(subset=["id"], keep="first")

    return documents


def load_kaggle_tourism_documents() -> pd.DataFrame:
    dataset_path = Path(
        kagglehub.dataset_download(
            "saketk511/travel-dataset-guide-to-indias-must-see-places"
        )
    )
    csv_path = next(dataset_path.glob("*.csv"))
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

    return pd.DataFrame(rows)


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
