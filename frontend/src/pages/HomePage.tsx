import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorText, type Project } from "../api";
import { useApp } from "../state";

export default function HomePage() {
  const { user, projects, refreshProjects, keys } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const p = await api<Project>("/projects", { method: "POST", body: { name, description } });
      await refreshProjects();
      navigate(`/p/${p.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-title">
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p>
            {projects.length
              ? "Elige un proyecto para seguir donde lo dejaste, o crea uno nuevo para otro tema."
              : "Un proyecto agrupa documentos, memorias y un chat sobre un mismo tema. Empieza creando el primero."}
          </p>
        </header>

        {!keys.length && (
          <p className="notice">
            Para subir documentos y chatear necesitas una API key.&nbsp;<Link to="/keys">Agregar una key</Link>
          </p>
        )}

        <div className="split">
          <div className="home-list">
            {projects.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="home-row">
                <div>
                  <h3>{p.name}</h3>
                  {p.description && <p>{p.description}</p>}
                </div>
                <div className="home-stats">
                  <span className="tag tag-doc">{p.documents ?? 0} doc</span>
                  <span className="tag tag-mem">{p.memories ?? 0} mem</span>
                </div>
              </Link>
            ))}
            {!projects.length && <p className="empty">Aún no tienes proyectos.</p>}
          </div>

          <form className="form-stack" onSubmit={create}>
            <h2>Nuevo proyecto</h2>
            <label className="field">
              <span>Nombre</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tesis de grado" />
            </label>
            <label className="field">
              <span>Descripción (opcional)</span>
              <textarea
                className="textarea"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="De qué trata y qué quieres resolver"
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary" disabled={!name.trim()}>
              Crear proyecto
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
