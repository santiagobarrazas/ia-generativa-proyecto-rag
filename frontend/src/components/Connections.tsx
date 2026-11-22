import { useState, type FormEvent } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { api, errorText, type Link, type Links, type Project } from "../api";
import { useApp } from "../state";

type Props = { project: Project; links: Links; onChange: (l: Links) => void; onClose: () => void };

export default function Connections({ project, links, onChange, onClose }: Props) {
  const { projects } = useApp();
  const [error, setError] = useState("");
  const base = `/projects/${project.id}/links`;

  async function run(fn: () => Promise<Links>) {
    setError("");
    try {
      onChange(await fn());
    } catch (e) {
      setError(errorText(e));
    }
  }

  const connect = (target: string, docs: boolean, mems: boolean, reciprocal: boolean) =>
    run(() =>
      api<Links>(base, {
        method: "PUT",
        body: { target_id: target, share_documents: docs, share_memories: mems, reciprocal },
      }),
    );

  const disconnect = (target: string, reciprocal: boolean) =>
    run(() => api<Links>(`${base}/${target}?reciprocal=${reciprocal}`, { method: "DELETE" }));

  // Quitarle el acceso a un proyecto que consulta a este = borrar su conexión saliente.
  const revoke = (source: string) =>
    run(async () => {
      await api(`/projects/${source}/links/${project.id}`, { method: "DELETE" });
      return api<Links>(base);
    });

  const candidates = projects.filter(
    (p) => p.id !== project.id && !links.outgoing.some((l) => l.project_id === p.id),
  );

  return (
    <aside className="panel" aria-label="Conexiones del proyecto">
      <div className="panel-head">
        <h2>Conexiones</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar conexiones">
          <X size={17} />
        </button>
      </div>

      {error && (
        <div className="panel-section">
          <p className="notice error" role="alert">
            {error}
          </p>
        </div>
      )}

      <section className="panel-section">
        <h3>Este proyecto consulta</h3>
        {links.outgoing.length ? (
          links.outgoing.map((l) => (
            <OutgoingLink key={l.project_id} link={l} projectName={project.name} onConnect={connect} onDisconnect={disconnect} />
          ))
        ) : (
          <p>
            Ninguna conexión. Conecta otro proyecto para que este chat también busque en sus documentos o memorias.
            Puedes quitar la conexión cuando quieras.
          </p>
        )}
      </section>

      <section className="panel-section">
        <h3>Nueva conexión</h3>
        {candidates.length ? (
          <ConnectForm
            project={project}
            candidates={candidates}
            incoming={links.incoming}
            onConnect={connect}
          />
        ) : (
          <p>
            {projects.length < 2
              ? "Crea otro proyecto para poder conectarlo con este."
              : "Ya conectaste todos tus proyectos."}
          </p>
        )}
      </section>

      <section className="panel-section">
        <h3>Consultan este proyecto</h3>
        {links.incoming.length ? (
          <div className="incoming">
            {links.incoming.map((l) => (
              <div key={l.project_id} className="incoming-row">
                <span className="name">{l.name}</span>
                {l.share_documents && <span className="tag tag-doc">doc</span>}
                {l.share_memories && <span className="tag tag-mem">mem</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => revoke(l.project_id)}>
                  Revocar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p>Ningún proyecto tiene acceso a este.</p>
        )}
      </section>
    </aside>
  );
}

type OutgoingProps = {
  link: Link;
  projectName: string;
  onConnect: (target: string, docs: boolean, mems: boolean, reciprocal: boolean) => Promise<void>;
  onDisconnect: (target: string, reciprocal: boolean) => Promise<void>;
};

function OutgoingLink({ link, projectName, onConnect, onDisconnect }: OutgoingProps) {
  const [confirm, setConfirm] = useState(false);
  const [both, setBoth] = useState(false);
  const only = (on: boolean, other: boolean) => on && !other; // no se puede apagar el último

  return (
    <div className="link-card">
      <div className="link-top">
        <span className="name">{link.name}</span>
        {link.mutual && (
          <span className="mutual" title={`«${link.name}» también consulta este proyecto`}>
            <ArrowLeftRight size={12} /> mutua
          </span>
        )}
        <span className="grow" />
        {!confirm && (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>
            Desconectar
          </button>
        )}
      </div>
      <div className="link-switches">
        <label className="switch" title={only(link.share_documents, link.share_memories) ? "Debe quedar al menos uno activo" : undefined}>
          <input
            type="checkbox"
            checked={link.share_documents}
            disabled={only(link.share_documents, link.share_memories)}
            onChange={(e) => onConnect(link.project_id, e.target.checked, link.share_memories, false)}
          />
          Documentos
        </label>
        <label className="switch" title={only(link.share_memories, link.share_documents) ? "Debe quedar al menos uno activo" : undefined}>
          <input
            type="checkbox"
            checked={link.share_memories}
            disabled={only(link.share_memories, link.share_documents)}
            onChange={(e) => onConnect(link.project_id, link.share_documents, e.target.checked, false)}
          />
          Memorias
        </label>
      </div>
      {confirm && (
        <div className="link-confirm">
          <span>
            «{projectName}» dejará de consultar a «{link.name}».
          </span>
          {link.mutual && (
            <label className="check">
              <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
              <span>
                Desconectar también «{link.name}» → «{projectName}»
              </span>
            </label>
          )}
          <div className="actions">
            <button className="btn btn-danger btn-sm" onClick={() => onDisconnect(link.project_id, link.mutual ? both : false)}>
              Desconectar
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setConfirm(false);
                setBoth(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type FormProps = {
  project: Project;
  candidates: Project[];
  incoming: Link[];
  onConnect: OutgoingProps["onConnect"];
};

function ConnectForm({ project, candidates, incoming, onConnect }: FormProps) {
  const [target, setTarget] = useState("");
  const [docs, setDocs] = useState(true);
  const [mems, setMems] = useState(false);
  const [reciprocal, setReciprocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const targetName = candidates.find((p) => p.id === target)?.name;
  const reverseExists = incoming.some((l) => l.project_id === target);
  const canConnect = !!target && (docs || mems);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canConnect) return;
    setBusy(true);
    await onConnect(target, docs, mems, reciprocal);
    setBusy(false);
    setTarget("");
    setReciprocal(false);
  }

  return (
    <form className="connect-form" onSubmit={submit}>
      <label className="field">
        <span>Proyecto</span>
        <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Elige un proyecto…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Qué puede consultar «{project.name}»</span>
        <div className="switches">
          <label className="switch">
            <input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} />
            Documentos
          </label>
          <label className="switch">
            <input type="checkbox" checked={mems} onChange={(e) => setMems(e.target.checked)} />
            Memorias
          </label>
        </div>
      </div>
      {target && (
        <label className="check">
          <input type="checkbox" checked={reciprocal} onChange={(e) => setReciprocal(e.target.checked)} />
          <span>
            {reverseExists
              ? `«${targetName}» ya consulta este proyecto. Aplicarle también estos permisos`
              : `Conectar también «${targetName}» → «${project.name}» con los mismos permisos`}
          </span>
        </label>
      )}
      <button className="btn btn-primary" disabled={!canConnect || busy}>
        {busy ? "Conectando…" : "Conectar"}
      </button>
      {!canConnect && (
        <p className="reason">{!target ? "Elige el proyecto a conectar." : "Activa al menos documentos o memorias."}</p>
      )}
    </form>
  );
}
