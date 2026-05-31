from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
QDRANT_PATH = ROOT / "data" / "qdrant"
HF_CACHE_PATH = ROOT / ".cache" / "huggingface"
COLLECTION_NAME = "indian_city_knowledge"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

os.environ.setdefault("HF_HOME", str(HF_CACHE_PATH))
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(HF_CACHE_PATH / "sentence-transformers"))


def normalize(value: str) -> str:
    return value.strip().lower()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", required=True)
    parser.add_argument("--state", default="")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    if not QDRANT_PATH.exists():
        raise SystemExit(
            json.dumps(
                {
                    "error": "Qdrant data is missing. Run scripts/seed_qdrant.py first.",
                    "results": [],
                }
            )
        )

    model = SentenceTransformer(MODEL_NAME)
    client = QdrantClient(path=str(QDRANT_PATH))
    query_text = f"{args.city} {args.state} tourism history events attractions heritage culture"
    query_vector = model.encode(query_text, normalize_embeddings=True).tolist()

    filters = []
    if args.city:
        filters.append(FieldCondition(key="city", match=MatchValue(value=args.city)))
    if args.state:
        filters.append(FieldCondition(key="state", match=MatchValue(value=args.state)))

    query_filter = Filter(should=filters) if filters else None
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=query_filter,
        limit=args.limit,
        with_payload=True,
    )

    results = []
    for point in response.points:
        payload = point.payload or {}
        results.append(
            {
                "id": payload.get("id"),
                "city": payload.get("city"),
                "state": payload.get("state"),
                "country": payload.get("country"),
                "type": payload.get("type"),
                "title": payload.get("title"),
                "content": payload.get("content"),
                "score": point.score,
            }
        )

    print(json.dumps({"results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
