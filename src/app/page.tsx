"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { motion, AnimatePresence } from "framer-motion";

type AgentResult = {
  city: string;
  country: string;
  region?: string;
  temperature: number;
  condition: string;
  humidity: number;
  wind: number;
  precipitation: number;
  precipitationProbability?: number;
  observedAt?: string;
  weatherSource?: string;
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
  const [introDismissed, setIntroDismissed] = useState(false);

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
        <div className={`intro ${result || documentResult || introDismissed ? "intro-with-results" : ""}`}>
          <AnimatePresence>
            {!introDismissed && !result && !documentResult ? (
              <AgentIntro onEnter={() => setIntroDismissed(true)} />
            ) : null}
          </AnimatePresence>

          <div className="brand-reveal">
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
                <p className="weather-source">
                  {[
                    result.weatherSource ? `Weather source: ${result.weatherSource}` : null,
                    result.observedAt ? `Observed ${formatObservedTime(result.observedAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Sparkles size={28} aria-hidden />
            </div>

            <div className="metric-grid">
              <Metric icon={<Thermometer size={19} />} label="Temperature" value={`${result.temperature}°C`} />
              <Metric icon={<CloudSun size={19} />} label="Condition" value={result.condition} />
              <Metric
                icon={<Droplets size={19} />}
                label="Precipitation"
                value={
                  result.precipitationProbability === undefined
                    ? `${result.precipitation} mm`
                    : `${result.precipitationProbability}%`
                }
              />
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

        <form
          className={`search-panel ${introDismissed || result || documentResult ? "search-panel-ready" : ""}`}
          onSubmit={handleSubmit}
        >
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

function AgentIntro({ onEnter }: { onEnter: () => void }) {
  const capabilities = [
    "Live climate intelligence",
    "Vector retrieval",
    "City-aware reasoning",
  ];

  return (
    <motion.div
      className="agent-intro"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, filter: "blur(10px)" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="agent-stage"
        initial={{ filter: "blur(10px)" }}
        animate={{ filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <ParticleGel />
      </motion.div>

      <motion.div
        className="agent-copy"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              delayChildren: 0.7,
              staggerChildren: 0.16,
            },
          },
        }}
      >
        <motion.strong
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <TypingText text="Climatic AI agent is your smart AI agent" />
        </motion.strong>
        <div className="agent-capabilities">
          {capabilities.map((capability) => (
            <motion.span
              key={capability}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              {capability}
            </motion.span>
          ))}
        </div>

        <motion.button
          type="button"
          className="intro-enter-btn"
          onClick={onEnter}
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0 },
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          <span>Enter Portal</span>
          <Sparkles size={16} />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function ParticleGel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    async function mountScene() {
      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      const THREE = await import("three");

      if (disposed) {
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
      camera.position.set(0, 0, 5.2);

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const geometry = new THREE.BufferGeometry();
      const widthSegments = 82;
      const heightSegments = 58;
      const count = widthSegments * heightSegments;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const seeds = new Float32Array(count * 3);
      const color = new THREE.Color();

      let cursor = 0;

      for (let y = 0; y < heightSegments; y += 1) {
        const v = y / (heightSegments - 1);
        const theta = v * Math.PI;

        for (let x = 0; x < widthSegments; x += 1) {
          const u = x / widthSegments;
          const phi = u * Math.PI * 2;
          
                    // Symmetrical base sphere structure (uniform radius, no squashing)
          const radius = 1.25;
          const px = radius * Math.sin(theta) * Math.cos(phi);
          const py = radius * Math.cos(theta);
          const pz = radius * Math.sin(theta) * Math.sin(phi);

          positions[cursor * 3] = px;
          positions[cursor * 3 + 1] = py;
          positions[cursor * 3 + 2] = pz;
          seeds[cursor * 3] = phi;
          seeds[cursor * 3 + 1] = theta;
          seeds[cursor * 3 + 2] = radius;

          // Rich sapphire/cobalt blue color gradient (highly visible and distinct on light background)
          color.setHSL(0.58 + v * 0.06, 0.95, 0.36 + Math.sin(phi * 3) * 0.04);
          colors[cursor * 3] = color.r;
          colors[cursor * 3 + 1] = color.g;
          colors[cursor * 3 + 2] = color.b;
          cursor += 1;
        }
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      // Uses standard NormalBlending (no AdditiveBlending) and depthWrite for strong contrast on light backdrop
      const material = new THREE.PointsMaterial({
        depthWrite: true,
        opacity: 0.92,
        size: 0.038,
        sizeAttenuation: true,
        transparent: true,
        vertexColors: true,
      });
      const particleGel = new THREE.Points(geometry, material);
      scene.add(particleGel);

      const lineGeometry = new THREE.BufferGeometry();
      const linePositions = new Float32Array(widthSegments * 3);
      lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x0f3d80, // Rich deep cobalt blue line thread
        opacity: 0.45,
        transparent: true,
      });
      const lightRibbon = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(lightRibbon);

      // Track pointer position smoothly with interpolation
      let targetX = 0;
      let targetY = 0;
      let currentX = 0;
      let currentY = 0;

      const handlePointerMove = (event: PointerEvent) => {
        const midX = window.innerWidth / 2;
        const midY = window.innerHeight / 2;
        const x = (event.clientX - midX) / (window.innerWidth / 2);
        const y = -(event.clientY - midY) / (window.innerHeight / 2);
        
        targetX = x * 2.2;
        targetY = y * 1.4;
      };

      window.addEventListener("pointermove", handlePointerMove);

      function resize() {
        if (!canvas) {
          return;
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      function animate(time: number) {
        if (disposed) {
          return;
        }

        const elapsed = time * 0.001;

        // Smoothly interpolate current positions towards targets using linear interpolation (lerp)
        currentX += (targetX - currentX) * 0.06;
        currentY += (targetY - currentY) * 0.06;

        const positionAttribute = geometry.getAttribute("position");

        for (let index = 0; index < count; index += 1) {
          const phi = seeds[index * 3];
          const theta = seeds[index * 3 + 1];
          const baseRadius = seeds[index * 3 + 2];
          
          // Symmetrical wave motion that flows cleanly across the sphere shape
          const wave =
            Math.sin(theta * 6.0 + elapsed * 1.5) * 0.06 +
            Math.cos(phi * 6.0 + elapsed * 1.5) * 0.06;
          const radius = baseRadius + wave;

          positionAttribute.setXYZ(
            index,
            radius * Math.sin(theta) * Math.cos(phi) + currentX,
            radius * Math.cos(theta) + currentY,
            radius * Math.sin(theta) * Math.sin(phi),
          );
        }

        positionAttribute.needsUpdate = true;

        for (let x = 0; x < widthSegments; x += 1) {
          const index = Math.floor(heightSegments * 0.52) * widthSegments + x;
          linePositions[x * 3] = positionAttribute.getX(index) * 1.008;
          linePositions[x * 3 + 1] = positionAttribute.getY(index) * 1.008;
          linePositions[x * 3 + 2] = positionAttribute.getZ(index) * 1.008;
        }

        lineGeometry.getAttribute("position").needsUpdate = true;
        particleGel.rotation.y = elapsed * 0.28;
        particleGel.rotation.x = Math.sin(elapsed * 0.45) * 0.18;
        lightRibbon.rotation.copy(particleGel.rotation);

        renderer.render(scene, camera);
        window.requestAnimationFrame(animate);
      }

      resize();
      window.addEventListener("resize", resize);
      window.requestAnimationFrame(animate);

      cleanup = () => {
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", handlePointerMove);
        geometry.dispose();
        material.dispose();
        lineGeometry.dispose();
        lineMaterial.dispose();
        renderer.dispose();
      };
    }

    void mountScene();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <canvas className="agent-gel-canvas" ref={canvasRef} />;
}

function TypingText({ text }: { text: string }) {
  const [visibleCharacters, setVisibleCharacters] = useState(0);

  useEffect(() => {
    let interval: number | undefined;
    const startDelay = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setVisibleCharacters((count) => {
          if (count >= text.length) {
            window.clearInterval(interval);
            return count;
          }

          return count + 1;
        });
      }, 24);
    }, 780);

    return () => {
      window.clearTimeout(startDelay);
      window.clearInterval(interval);
    };
  }, [text]);

  return (
    <span className="typing-text">
      {text.slice(0, visibleCharacters)}
      <span className="typing-caret" />
    </span>
  );
}

function formatObservedTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
