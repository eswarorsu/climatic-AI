import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const maxUploadBytes = 12 * 1024 * 1024;
const maxAnalysisCharacters = 60000;
const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "been",
  "being",
  "between",
  "could",
  "from",
  "have",
  "into",
  "more",
  "most",
  "other",
  "over",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "through",
  "under",
  "using",
  "were",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

type ContextItem = {
  title: string;
  summary: string;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("document");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a PDF document." }, { status: 400 });
    }

    if (file.size > maxUploadBytes) {
      return NextResponse.json(
        { error: "Please upload a document smaller than 12 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractDocumentText(file, buffer);
    const text = cleanText(extractedText).slice(0, maxAnalysisCharacters);

    if (wordCount(text) < 40) {
      return NextResponse.json(
        {
          error:
            "I could not find enough readable text in this document. If it is a scanned PDF, run OCR first and upload the text-based PDF.",
        },
        { status: 422 },
      );
    }

    const sentences = splitSentences(text);
    const keywords = getKeywords(text, 12);
    const contexts = buildContexts(text, keywords);
    const summary = summarize(sentences, keywords);

    return NextResponse.json({
      fileName: file.name,
      fileType: file.type || "Unknown",
      wordCount: wordCount(text),
      summary,
      contexts,
      keywords,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read and analyze this document.",
      },
      { status: 500 },
    );
  }
}

async function extractDocumentText(file: File, buffer: Buffer) {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (fileType.includes("pdf") || fileName.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  if (fileType.startsWith("text/") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return buffer.toString("utf8");
  }

  throw new Error("Unsupported file type. Upload a PDF, TXT, or Markdown file.");
}

function cleanText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitSentences(text: string) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40 && sentence.length < 360);
}

function getKeywords(text: string, limit: number) {
  const words = text
    .toLowerCase()
    .match(/[a-z][a-z-]{2,}/g)
    ?.filter((word) => !stopWords.has(word) && word.length > 3);

  if (!words) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function summarize(sentences: string[], keywords: string[]) {
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreText(sentence, keywords) + (index < 3 ? 2 : 0),
    }))
    .sort((first, second) => second.score - first.score)
    .slice(0, 4)
    .sort((first, second) => first.index - second.index)
    .map((item) => item.sentence);

  return ranked.join(" ");
}

function buildContexts(text: string, keywords: string[]) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 120);

  const contexts = paragraphs
    .map((paragraph, index) => ({
      paragraph,
      index,
      score: scoreText(paragraph, keywords),
    }))
    .sort((first, second) => second.score - first.score)
    .slice(0, 6)
    .sort((first, second) => first.index - second.index)
    .map(({ paragraph }, index) => toContextItem(paragraph, keywords, index));

  if (contexts.length > 0) {
    return contexts;
  }

  return splitSentences(text)
    .slice(0, 5)
    .map((sentence, index) => toContextItem(sentence, keywords, index));
}

function toContextItem(text: string, keywords: string[], index: number): ContextItem {
  const title = pickContextTitle(text, keywords) ?? `Context ${index + 1}`;
  const summary = splitSentences(text)[0] ?? text.slice(0, 260);

  return {
    title,
    summary: summary.length > 280 ? `${summary.slice(0, 277)}...` : summary,
  };
}

function pickContextTitle(text: string, keywords: string[]) {
  const heading = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 6 && line.length <= 80 && !/[.!?]$/.test(line));

  if (heading) {
    return titleCase(heading);
  }

  const matches = keywords.filter((keyword) => containsWord(text, keyword)).slice(0, 3);

  if (matches.length > 0) {
    return titleCase(matches.join(" / "));
  }

  return null;
}

function scoreText(text: string, keywords: string[]) {
  return keywords.reduce((score, keyword, index) => {
    return score + (containsWord(text, keyword) ? keywords.length - index : 0);
  }, 0);
}

function containsWord(text: string, word: string) {
  return new RegExp(`(^|\\W)${escapeRegex(word)}($|\\W)`, "i").test(text);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}
