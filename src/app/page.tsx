"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import {
  CloudSun,
  FileText,
  Newspaper,
  Paperclip,
  Search,
  Sparkles,
  Thermometer,
  Wind,
  Database,
  Droplets,
  X,
} from "lucide-react";

type AgentResult = {
  city: string;
  country: string;
  region?: string;
  temperature: number;
  condition: string;
  humidity: number;
  wind: number;
  climate: string;
  aiSummary: string;
  vectorContext: string[];
  news: Array<{
    title: string;
    source: string;
    publishedAt: string;
    summary: string;
    url?: string;
    imageUrl?: string;
  }>;
};

type DocumentResult = {
  fileName: string;
  fileType: string;
  wordCount: number;
  summary: string;
  keywords: string[];
  contexts: Array<{
    title: string;
    summary: string;
  }>;
};

export default function Home() {
  const [city, setCity] = useState("Bangalore");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [documentResult, setDocumentResult] = useState<DocumentResult | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSearch = useMemo(
    () => (attachedFile !== null || city.trim().length > 1) && !loading,
    [attachedFile, city, loading],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (attachedFile) {
        const formData = new FormData();
        formData.append("document", attachedFile);

        const response = await fetch("/api/document", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to analyze this document.");
        }

        setDocumentResult(data);
        setResult(null);
        return;
      }

      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ city }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }

      setResult(data);
      setDocumentResult(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to process this request.");
    } finally {
      setLoading(false);
    }
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAttachedFile(file);
    setError("");
  }

  function clearAttachment() {
    setAttachedFile(null);

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className={`intro ${result || documentResult ? "intro-with-results" : ""}`}>
          <div className="brand-row">
            <span className="brand-mark">
              <img src="/climatic-ai-logo.png" alt="" />
            </span>
            <span>Climatic AI</span>
          </div>
          <h1>Ask about a city or upload a document.</h1>
          <p>
            Search a city to see the agent response layout. Weather, news, and VectorDB
            retrieval are staged as separate tools so we can plug in live services cleanly.
          </p>
        </div>

        {documentResult ? (
          <section className="document-results" aria-live="polite">
            <article className="panel document-summary">
              <div className="panel-title">
                <FileText size={20} aria-hidden />
                <h3>{documentResult.fileName}</h3>
              </div>
              <p>{documentResult.summary}</p>
              <div className="keyword-row">
                {documentResult.keywords.map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <Database size={20} aria-hidden />
                <h3>Contexts Found</h3>
              </div>
              <div className="document-context-list">
                {documentResult.contexts.map((item) => (
                  <section key={`${item.title}-${item.summary}`}>
                    <h4>{item.title}</h4>
                    <p>{item.summary}</p>
                  </section>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {result ? (
          <section className="results" aria-live="polite">
            <div className="summary-band">
              <div>
                <p className="eyebrow">Agent summary</p>
                <h2>
                  {[result.city, result.region, result.country].filter(Boolean).join(", ")}
                </h2>
                <p>{result.aiSummary}</p>
              </div>
              <Sparkles size={28} aria-hidden />
            </div>

            <div className="metric-grid">
              <Metric icon={<Thermometer size={19} />} label="Temperature" value={`${result.temperature}°C`} />
              <Metric icon={<CloudSun size={19} />} label="Condition" value={result.condition} />
              <Metric icon={<Droplets size={19} />} label="Humidity" value={`${result.humidity}%`} />
              <Metric icon={<Wind size={19} />} label="Wind" value={`${result.wind} km/h`} />
            </div>

            <div className="content-grid">
              <article className="panel climate-panel">
                <div className="panel-title">
                  <CloudSun size={20} aria-hidden />
                  <h3>Climate Profile</h3>
                </div>
                <p>{result.climate}</p>
              </article>

              <article className="panel">
                <div className="panel-title">
                  <Database size={20} aria-hidden />
                  <h3>Tourism, History & Events</h3>
                </div>
                <ul className="context-list">
                  {result.vectorContext.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>

            <section className="panel news-panel">
              <div className="panel-title">
                <Newspaper size={20} aria-hidden />
                <h3>Recent News</h3>
              </div>
              <div className="news-list">
                {result.news.map((item) => (
                  <article className="news-item" key={`${item.title}-${item.source}`}>
                    <div className="news-thumb" aria-hidden>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" />
                      ) : (
                        <Newspaper size={24} />
                      )}
                    </div>
                    <div>
                      <h4>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                      </h4>
                      <p>{item.summary}</p>
                    </div>
                    <span>
                      {item.source} · {item.publishedAt}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        <form className="search-panel" onSubmit={handleSubmit}>
          <label htmlFor="city">City name</label>
          <div className="search-row">
            <input
              id="document"
              className="attachment-input"
              name="document"
              type="file"
              accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md"
              ref={attachmentInputRef}
              onChange={handleAttachmentChange}
            />
            <label
              className={`attachment-button ${attachedFile ? "attachment-button-active" : ""}`}
              htmlFor="document"
              title="Attach document"
              aria-label="Attach document"
            >
              <Paperclip size={20} aria-hidden />
            </label>
            <input
              id="city"
              className="city-input"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder={attachedFile ? "Document attached. Click Search to analyze." : "Enter city, e.g. Mumbai"}
            />
            {attachedFile ? (
              <button
                className="clear-attachment"
                type="button"
                onClick={clearAttachment}
                aria-label="Remove attached document"
                title="Remove attached document"
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
            <button className="search-submit" type="submit" disabled={!canSearch} aria-label="Search">
              <Search size={18} aria-hidden />
              <span>{loading ? (attachedFile ? "Reading" : "Searching") : "Search"}</span>
            </button>
          </div>
          {attachedFile ? <p className="attachment-name">{attachedFile.name}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="metric-card">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
