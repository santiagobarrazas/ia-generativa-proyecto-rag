import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, BookmarkPlus, CornerDownRight, FileText, NotebookPen } from "lucide-react";
import { api, errorText, type Message, type Project, type Source } from "../api";
import { useApp } from "../state";
import Markdown from "./Markdown";

type ChatResponse = { answer: string; sources: Source[]; memories: { id: string; title: string }[] };

const PROMPTS = [
  { icon: FileText, text: "Resume los puntos principales de mis documentos" },
  { icon: NotebookPen, text: "¿Qué conclusiones tenemos guardadas en las memorias?" },
  { icon: BookmarkPlus, text: "Genera una memoria con la conclusión a la que llegamos" },
];

type Props = { project: Project; hasKnowledge: boolean; onMemoryCreated: () => void };

export default function Chat({ project, hasKnowledge, onMemoryCreated }: Props) {
  const { keys, keyId, setKeyId } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoaded(false);
    setMessages([]);
    setError("");
    api<Message[]>(`/projects/${project.id}/messages`)
      .then(setMessages, (e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, [project.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function send(text = input) {
    const question = text.trim();
    if (!question || pending || !keyId) return;
    setPending(question);
    setInput("");
    setError("");
    try {
      const r = await api<ChatResponse>(`/projects/${project.id}/chat`, {
        method: "POST",
        body: { message: question, key_id: keyId },
      });
      const now = Date.now();
      setMessages((m) => [
        ...m,
        { id: `u${now}`, role: "user", content: question, sources: [], memories: [] },
        { id: `a${now}`, role: "assistant", content: r.answer, sources: r.sources, memories: r.memories },
      ]);
      if (r.memories.length) onMemoryCreated();
    } catch (e) {
      setError(errorText(e));
      setInput(question); // no perder lo que escribió
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  }

  async function clear() {
    try {
      await api(`/projects/${project.id}/messages`, { method: "DELETE" });
      setMessages([]);
      setConfirmClear(false);
    } catch (e) {
      setError(errorText(e));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  const empty = loaded && !messages.length && !pending;

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length > 0 && (
          <div className="chat-column chat-toolbar-wrap">
            <div className="chat-toolbar">
              <span>
                {messages.length} mensajes en el contexto del modelo. Vaciar el chat borra este contexto; las memorias
                se conservan.
              </span>
              {confirmClear ? (
                <span className="row-confirm">
                  <button className="btn btn-danger btn-sm" onClick={clear}>
                    Vaciar chat
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>
                  Vaciar chat
                </button>
              )}
            </div>
          </div>
        )}

        {empty ? (
          <div className="chat-empty">
            <h2>¿Qué quieres saber de «{project.name}»?</h2>
            {!hasKnowledge && (
              <p className="notice">
                Este proyecto todavía no tiene documentos ni conexiones. Puedes chatear igual, pero las respuestas
                no tendrán fuentes.&nbsp;<Link to={`/p/${project.id}/conocimiento`}>Subir documentos</Link>
              </p>
            )}
            <div className="prompts">
              {PROMPTS.map(({ icon: Icon, text }) => (
                <button key={text} className="prompt" onClick={() => send(text)} disabled={!keyId}>
                  <Icon size={16} /> {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-column" aria-live="polite">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="msg-user">
                  {m.content}
                </div>
              ) : (
                <AssistantMessage key={m.id} message={m} projectId={project.id} />
              ),
            )}
            {pending && (
              <>
                <div className="msg-user">{pending}</div>
                <div className="msg-assistant pending">
                  <span className="thinking">
                    <span className="dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    Buscando en documentos y memorias, luego consultando al modelo…
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {keys.length ? (
          <div className="composer">
            <label className="sr-only" htmlFor="chat-input">
              Mensaje
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pregunta algo o pide «genera una memoria sobre…»"
              autoFocus
            />
            <div className="composer-bar">
              <label className="key-select">
                Key
                <select value={keyId} onChange={(e) => setKeyId(e.target.value)} aria-label="API key para esta consulta">
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} · {k.model}
                    </option>
                  ))}
                </select>
              </label>
              <span className="hint">Enter para enviar · Shift+Enter nueva línea</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => send()}
                disabled={!input.trim() || !!pending}
                aria-label="Enviar mensaje"
              >
                <ArrowUp size={15} /> Enviar
              </button>
            </div>
          </div>
        ) : (
          <p className="notice composer-foot">
            Para chatear necesitas una API key.&nbsp;<Link to="/keys">Agregar una key</Link>
          </p>
        )}
        {error && (
          <p className="notice error composer-foot" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function AssistantMessage({ message, projectId }: { message: Message; projectId: string }) {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const cited = message.sources.filter((s) => s.cited);
  const visible = showAll ? message.sources : cited;
  const open = message.sources.find((s) => s.ref === openRef);

  const toggle = (ref: string) => {
    setOpenRef(openRef === ref ? null : ref);
    if (!cited.some((s) => s.ref === ref)) setShowAll(true);
  };

  return (
    <article className="msg-assistant">
      <Markdown onCite={toggle}>{message.content}</Markdown>

      {message.memories.map((m) => (
        <Link key={m.id} to={`/p/${projectId}/conocimiento`} className="saved-memory">
          <BookmarkPlus size={15} /> Memoria guardada: «{m.title}»
        </Link>
      ))}

      {message.sources.length > 0 && (
        <div className="sources">
          <div className="sources-head">
            <span>
              {cited.length
                ? `Fuentes citadas (${cited.length})`
                : `El modelo no citó fuentes`}
            </span>
            {message.sources.length > cited.length && (
              <button onClick={() => setShowAll(!showAll)}>
                {showAll ? "Ver solo las citadas" : `Ver los ${message.sources.length} fragmentos consultados`}
              </button>
            )}
          </div>
          {visible.length > 0 && (
            <div className="source-list">
              {visible.map((s) => (
                <button key={s.ref} className="source" aria-expanded={openRef === s.ref} onClick={() => toggle(s.ref)}>
                  <span className={`tag ${s.kind === "document" ? "tag-doc" : "tag-mem"}`}>{s.ref}</span>
                  <span className="title">{s.title}</span>
                  {s.page && <span className="ext">p. {s.page}</span>}
                  {s.external && (
                    <span className="ext">
                      <CornerDownRight size={11} /> {s.project_name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {open && (
            <div className="snippet">
              <div className="snippet-meta">
                <span>{open.kind === "document" ? "Documento" : "Memoria"}</span>·<span>{open.title}</span>·
                <span className="mono">similitud {open.score.toFixed(2)}</span>
              </div>
              {open.snippet}
              {open.snippet.length >= 400 && "…"}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
