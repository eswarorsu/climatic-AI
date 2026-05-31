import { execFile } from "child_process";
import { promisify } from "util";
import { formatKnowledgeContext, searchCityKnowledge } from "@/lib/vector-db";

const execFileAsync = promisify(execFile);

type QdrantResult = {
  title?: string;
  content?: string;
};

type QdrantResponse = {
  results?: QdrantResult[];
};

export async function getCityKnowledgeContext(city: string, state?: string) {
  if (process.env.ENABLE_QDRANT_RUNTIME === "true") {
    const qdrantContext = await queryQdrant(city, state);

    if (qdrantContext.length > 0) {
      return qdrantContext;
    }
  }

  return formatKnowledgeContext(searchCityKnowledge(city, state));
}

async function queryQdrant(city: string, state?: string) {
  try {
    const args = [
      "scripts/query_qdrant.py",
      "--city",
      city,
      "--limit",
      "5",
    ];

    if (state) {
      args.push("--state", state);
    }

    const { stdout } = await execFileAsync(".venv\\Scripts\\python.exe", args, {
      cwd: process.cwd(),
      timeout: 8000,
      windowsHide: true,
    });

    const parsed = JSON.parse(stdout) as QdrantResponse;

    return (parsed.results ?? [])
      .filter((result) => result.title && result.content)
      .map((result) => `${result.title}: ${result.content}`);
  } catch {
    return [];
  }
}
