import cityDocuments from "@/data/city-documents.json";
import kaggleTourismDocuments from "@/data/kaggle-tourism-documents.json";

export type CityDocument = {
  id: string;
  city: string;
  state: string;
  country: string;
  type: "tourism" | "history" | "events";
  title: string;
  content: string;
};

type SearchResult = CityDocument & {
  score: number;
};

const VECTOR_SIZE = 128;

const documents = [...cityDocuments, ...kaggleTourismDocuments] as CityDocument[];
const indexedDocuments = documents.map((document) => ({
  document,
  vector: embedText(toSearchText(document)),
}));

export function searchCityKnowledge(city: string, state?: string, limit = 5): SearchResult[] {
  const query = [city, state, "tourism history events attractions heritage culture"].filter(Boolean).join(" ");
  const queryVector = embedText(query);

  return indexedDocuments
    .map(({ document, vector }) => ({
      ...document,
      score: cosineSimilarity(queryVector, vector),
    }))
    .filter((result) => {
      const cityMatch = normalize(result.city) === normalize(city);
      const stateMatch = state ? normalize(result.state) === normalize(state) : false;

      return cityMatch || stateMatch;
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

export function formatKnowledgeContext(results: SearchResult[]) {
  if (results.length === 0) {
    return [
      "VectorDB has no stored tourism, history, or event documents for this city yet.",
    ];
  }

  return results.map((result) => {
    return `${result.title}: ${result.content}`;
  });
}

function toSearchText(document: CityDocument) {
  return [
    document.city,
    document.state,
    document.country,
    document.type,
    document.title,
    document.content,
  ].join(" ");
}

function embedText(text: string) {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const index = hashToken(token) % VECTOR_SIZE;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function hashToken(token: string) {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(first: number[], second: number[]) {
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
