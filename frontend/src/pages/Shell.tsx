import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Menu, Plus } from "lucide-react";
import { api, errorText, type Project } from "../api";
import { useApp } from "../state";

export default function Shell() {
  const { user, setUser, projects, refreshProjects, keys } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setNavOpen(false), [location.pathname]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setCreating(false);
    try {
      const p = await api<Project>("/projects", { method: "POST", body: { name } });
      await refreshProjects();
      setName("");
      setCreating(false);
      setError("");
      navigate(`/p/${p.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    navigate("/");
  }

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className="sidebar" aria-label="Navegación">
        <div className="sidebar-top">
          <Link to="/" className="wordmark">
            <i aria-hidden /> Acervo
          </Link>
        </div>

        <div className="sidebar-section">
          <span>Proyectos</span>
          <button className="icon-btn" aria-label="Nuevo proyecto" title="Nuevo proyecto" onClick={() => setCreating(true)}>
            <Plus size={16} />
          </button>
        </div>

        <nav className="project-list">
          {creating && (
            <form className="new-project" onSubmit={create}>
              <input
                className="input"
                autoFocus
                placeholder="Nombre del proyecto"
                aria-label="Nombre del nuevo proyecto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => !name.trim() && setCreating(false)}
                onKeyDown={(e) => e.key === "Escape" && (setCreating(false), setName(""))}
              />
              {error && <p className="error-text">{error}</p>}
            </form>
          )}
          {projects.map((p) => (
            <NavLink key={p.id} to={`/p/${p.id}`} className="project-link">
              <span className="name">{p.name}</span>
              <span className="meta">
                {p.documents ?? 0} doc · {p.memories ?? 0} mem{p.links ? ` · ${p.links} conex.` : ""}
              </span>
            </NavLink>
          ))}
          {!projects.length && !creating && (
            <button className="side-item" onClick={() => setCreating(true)}>
              <Plus size={15} /> Crea tu primer proyecto
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <NavLink to="/keys" className="side-item">
            <KeyRound size={15} /> API keys <span className="count mono muted">{keys.length}</span>
          </NavLink>
          <div className="user-row">
            <span className="avatar" aria-hidden>
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="who">
              <span>{user.name}</span>
              <span className="muted mono">{user.email}</span>
            </span>
            <button className="icon-btn" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="mobile-bar">
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="Abrir navegación">
            <Menu size={18} />
          </button>
          <span className="wordmark">
            <i aria-hidden /> Acervo
          </span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
