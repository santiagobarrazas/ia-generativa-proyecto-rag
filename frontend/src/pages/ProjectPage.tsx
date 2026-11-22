import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { Cable, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { api, errorText, type Doc, type Links, type Memory, type Project } from "../api";
import { useApp } from "../state";
import Chat from "../components/Chat";
import Knowledge from "../components/Knowledge";
import Connections from "../components/Connections";

export default function ProjectPage({ tab }: { tab: "chat" | "knowledge" }) {
  const { projectId = "" } = useParams();
  const { projects, refreshProjects } = useApp();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [links, setLinks] = useState<Links>({ outgoing: [], incoming: [] });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const refreshKnowledge = useCallback(async () => {
    const [d, m] = await Promise.all([
      api<Doc[]>(`/projects/${projectId}/documents`),
      api<Memory[]>(`/projects/${projectId}/memories`),
    ]);
    setDocs(d);
    setMemories(m);
    refreshProjects().catch(() => {});
  }, [projectId, refreshProjects]);

  useEffect(() => {
    setProject(null);
    setNotFound(false);
    api<Project>(`/projects/${projectId}`).then(setProject, () => setNotFound(true));
    api<Links>(`/projects/${projectId}/links`).then(setLinks, () => {});
    refreshKnowledge().catch(() => {});
  }, [projectId, refreshKnowledge]);

  const updateLinks = (l: Links) => {
    setLinks(l);
    refreshProjects().catch(() => {});
  };

  if (notFound)
    return (
      <div className="page">
        <div className="page-inner">
          <p className="notice">Este proyecto no existe o no es tuyo.</p>
        </div>
      </div>
    );
  if (!project) return <div className="page" aria-busy="true" />;

  return (
    <>
      <header className="project-head">
        <div className="project-title">
          <Title project={project} onRename={setProject} editing={renaming} setEditing={setRenaming} />
          <Scope links={links} onOpen={() => setPanelOpen(true)} />
          <nav className="tabs" aria-label="Secciones del proyecto">
            <NavLink end to={`/p/${projectId}`} className="tab">
              Chat
            </NavLink>
            <NavLink to={`/p/${projectId}/conocimiento`} className="tab">
              Conocimiento <span className="mono">{docs.length + memories.length}</span>
            </NavLink>
          </nav>
        </div>
        <div className="head-actions">
          <button
            className={`btn ${panelOpen ? "" : "btn-ghost"}`}
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
          >
            <Cable size={15} /> Conexiones
            {links.outgoing.length > 0 && <span className="mono">{links.outgoing.length}</span>}
          </button>
          <ProjectMenu
            project={project}
            onRename={() => setRenaming(true)}
            onDeleted={async () => {
              await refreshProjects();
              const next = projects.find((p) => p.id !== project.id);
              navigate(next ? `/p/${next.id}` : "/");
            }}
          />
        </div>
      </header>

      <div className={`project-body${panelOpen ? " with-panel" : ""}`}>
        {tab === "chat" ? (
          <Chat
            project={project}
            hasKnowledge={docs.length + memories.length > 0 || links.outgoing.length > 0}
            onMemoryCreated={refreshKnowledge}
          />
        ) : (
          <Knowledge project={project} docs={docs} memories={memories} refresh={refreshKnowledge} />
        )}
        {panelOpen && (
          <Connections project={project} links={links} onChange={updateLinks} onClose={() => setPanelOpen(false)} />
        )}
      </div>
    </>
  );
}

function Scope({ links, onOpen }: { links: Links; onOpen: () => void }) {
  if (!links.outgoing.length)
    return <p className="scope">Las respuestas usan solo el conocimiento de este proyecto.</p>;
  return (
    <p className="scope">
      También consulta:
      {links.outgoing.map((l, i) => (
        <span key={l.project_id}>
          <b>{l.name}</b>{" "}
          <span className="muted">
            ({[l.share_documents && "documentos", l.share_memories && "memorias"].filter(Boolean).join(" y ")})
          </span>
          {i < links.outgoing.length - 1 && ","}
        </span>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={onOpen}>
        Gestionar
      </button>
    </p>
  );
}

type TitleProps = { project: Project; onRename: (p: Project) => void; editing: boolean; setEditing: (v: boolean) => void };

function Title({ project, onRename, editing, setEditing }: TitleProps) {
  const { refreshProjects } = useApp();
  const [name, setName] = useState(project.name);
  const [error, setError] = useState("");

  useEffect(() => setName(project.name), [project.name, editing]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim() || name === project.name) return setEditing(false);
    try {
      onRename(await api<Project>(`/projects/${project.id}`, { method: "PATCH", body: { name, description: project.description } }));
      refreshProjects().catch(() => {});
      setEditing(false);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!editing) return <h1 title={project.description || undefined}>{project.name}</h1>;
  return (
    <form onSubmit={save}>
      <input
        className="input"
        autoFocus
        aria-label="Nombre del proyecto"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => save()}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

function ProjectMenu({ project, onRename, onDeleted }: { project: Project; onRename: () => void; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function remove() {
    try {
      await api(`/projects/${project.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-label="Más opciones" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {confirm ? (
            <div className="confirm">
              <span>
                Se borran sus documentos, memorias, chat y conexiones. <b>No se puede deshacer.</b>
              </span>
              {error && <span className="error-text">{error}</span>}
              <button className="btn btn-danger btn-sm" onClick={remove}>
                Eliminar «{project.name}»
              </button>
            </div>
          ) : (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRename();
                }}
              >
                <Pencil size={14} /> Renombrar
              </button>
              <button role="menuitem" className="danger" onClick={() => setConfirm(true)}>
                <Trash2 size={14} /> Eliminar proyecto
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
