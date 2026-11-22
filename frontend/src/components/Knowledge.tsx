import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Download, FileText, Trash2, Upload, X } from "lucide-react";
import { api, errorText, formatBytes, formatDate, type Doc, type Memory, type Project } from "../api";
import { useApp } from "../state";
import Markdown from "./Markdown";

const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.html,.htm";

type Upload = { id: number; name: string; error?: string };
type Props = { project: Project; docs: Doc[]; memories: Memory[]; refresh: () => Promise<void> };

export default function Knowledge({ project, docs, memories, refresh }: Props) {
  return (
    <div className="knowledge">
      <div className="knowledge-grid">
        <Documents project={project} docs={docs} refresh={refresh} />
        <Memories project={project} memories={memories} refresh={refresh} />
      </div>
    </div>
  );
}

function Documents({ project, docs, refresh }: Omit<Props, "memories">) {
  const { keyId, keys } = useApp();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeKey = keys.find((k) => k.id === keyId);

  async function upload(files: FileList | null) {
    if (!files?.length || !keyId) return;
    const batch = Array.from(files).map((f, i) => ({ file: f, id: Date.now() + i }));
    setUploads((u) => [...u, ...batch.map(({ file, id }) => ({ id, name: file.name }))]);
    // En serie: cada archivo se trocea y se envía a embeddings; en paralelo saturaría el límite del proveedor.
    for (const { file, id } of batch) {
      const form = new FormData();
      form.append("file", file);
      form.append("key_id", keyId);
      try {
        await api(`/projects/${project.id}/documents`, { method: "POST", form });
        setUploads((u) => u.filter((x) => x.id !== id));
        await refresh();
      } catch (e) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: errorText(e) } : x)));
      }
    }
  }

  async function remove(id: string) {
    try {
      await api(`/projects/${project.id}/documents/${id}`, { method: "DELETE" });
      setConfirming(null);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    upload(e.dataTransfer.files);
  }

  return (
    <section className="kb-section" aria-labelledby="docs-title">
      <div className="kb-head">
        <h2 id="docs-title">
          Documentos <span className="tag tag-doc">{docs.length}</span>
        </h2>
      </div>
      <p className="kb-sub">
        Tu base de conocimiento. Cada archivo se divide en fragmentos que el chat busca antes de responder.
      </p>

      {keyId ? (
        <button
          type="button"
          className={`dropzone${over ? " over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <strong>
            <Upload size={16} /> Arrastra archivos o haz clic para elegir
          </strong>
          <span>
            PDF, TXT, Markdown, CSV o HTML, hasta 25 MB. Los embeddings se calculan con la key «{activeKey?.label}».
          </span>
        </button>
      ) : (
        <p className="notice">
          Para indexar documentos necesitas una API key.&nbsp;<Link to="/keys">Agregar una key</Link>
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="notice error">{error}</p>}

      {(uploads.length > 0 || docs.length > 0) && (
        <div className="rows">
          {uploads.map((u) => (
            <div key={u.id} className="row uploading">
              <div className="row-main">
                <div className="row-title">
                  <FileText size={15} />
                  <span>{u.name}</span>
                </div>
                {u.error ? (
                  <span className="error-text">{u.error}</span>
                ) : (
                  <span className="row-meta">Extrayendo texto y calculando embeddings…</span>
                )}
              </div>
              {u.error && (
                <button
                  className="icon-btn"
                  aria-label="Descartar"
                  onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          {docs.map((d) => (
            <div key={d.id} className="row">
              <div className="row-main">
                <div className="row-title">
                  <FileText size={15} />
                  <span title={d.filename}>{d.filename}</span>
                </div>
                <span className="row-meta">
                  {formatBytes(d.size_bytes)} · {d.chunk_count} fragmentos · {formatDate(d.created_at)}
                </span>
              </div>
              <div className="row-actions">
                {confirming === d.id ? (
                  <span className="row-confirm">
                    <button className="btn btn-danger btn-sm" onClick={() => remove(d.id)}>
                      Eliminar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button className="icon-btn danger" aria-label={`Eliminar ${d.filename}`} onClick={() => setConfirming(d.id)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function download(m: Memory) {
  const slug = m.title.toLowerCase().normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "memoria";
  const url = URL.createObjectURL(new Blob([m.content], { type: "text/markdown;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${slug}.md` });
  a.click();
  URL.revokeObjectURL(url);
}

function Memories({ project, memories, refresh }: Omit<Props, "docs">) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(id: string) {
    try {
      await api(`/projects/${project.id}/memories/${id}`, { method: "DELETE" });
      setConfirming(null);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section className="kb-section" aria-labelledby="mem-title">
      <div className="kb-head">
        <h2 id="mem-title">
          Memorias <span className="tag tag-mem">{memories.length}</span>
        </h2>
      </div>
      <p className="kb-sub">
        Conclusiones en Markdown que el modelo guarda cuando se lo pides. No ocupan el contexto del chat: se buscan
        por separado, después de los documentos.
      </p>
      {error && <p className="notice error">{error}</p>}

      {memories.length ? (
        <div className="rows">
          {memories.map((m) => (
            <div key={m.id} className="row">
              <button
                className="memory-toggle row-main"
                aria-expanded={open === m.id}
                onClick={() => setOpen(open === m.id ? null : m.id)}
              >
                <span className="row-title">
                  <ChevronRight
                    size={15}
                    style={{ transform: open === m.id ? "rotate(90deg)" : undefined, transition: "transform 150ms" }}
                  />
                  <span>{m.title}</span>
                </span>
                <span className="row-meta">
                  {formatDate(m.created_at)} · {m.content.length.toLocaleString("es")} caracteres
                </span>
              </button>
              <div className="row-actions">
                {confirming === m.id ? (
                  <span className="row-confirm">
                    <button className="btn btn-danger btn-sm" onClick={() => remove(m.id)}>
                      Eliminar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <>
                    <button className="icon-btn" aria-label={`Descargar ${m.title}`} title="Descargar .md" onClick={() => download(m)}>
                      <Download size={15} />
                    </button>
                    <button className="icon-btn danger" aria-label={`Eliminar ${m.title}`} onClick={() => setConfirming(m.id)}>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
              {open === m.id && (
                <div className="memory-body">
                  <Markdown>{m.content}</Markdown>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <b>Todavía no hay memorias.</b>
          <span>Cuando llegues a una conclusión en el chat, pide algo como:</span>
          <span className="example">«Genera una memoria sobre este tema con la conclusión a la que llegamos»</span>
          <Link className="btn btn-sm" to={`/p/${project.id}`} style={{ justifySelf: "start" }}>
            Ir al chat
          </Link>
        </div>
      )}
    </section>
  );
}
