import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorText, type User } from "../api";

export default function AuthPage({ mode, onAuth }: { mode: "login" | "register"; onAuth: (u: User) => void }) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await api<User>(isRegister ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: isRegister ? { name, email, password } : { email, password },
      });
      onAuth(user);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-intro">
        <span className="wordmark">
          <i aria-hidden /> Acervo
        </span>
        <h1>
          Lo que lees, lo que concluyes, <em>siempre a mano.</em>
        </h1>
        <ol className="auth-steps">
          <li>
            <b>Organiza por proyectos.</b>
            <span />
            <span>Cada proyecto tiene sus documentos, su chat y sus memorias, separados del resto.</span>
          </li>
          <li>
            <b>Pregunta a tus documentos.</b>
            <span />
            <span>Cada respuesta busca primero en tus archivos y luego en tus memorias, y cita la fuente.</span>
          </li>
          <li>
            <b>Guarda conclusiones.</b>
            <span />
            <span>Pide «genera una memoria sobre esto» y queda como Markdown consultable para siempre.</span>
          </li>
        </ol>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h2>{isRegister ? "Crea tu cuenta" : "Inicia sesión"}</h2>
          {isRegister && (
            <label className="field">
              <span>Nombre</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="field">
            <span>Correo</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
            {isRegister && <small>Mínimo 8 caracteres.</small>}
          </label>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}
          </button>
          <p className="auth-switch">
            {isRegister ? (
              <>
                ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
              </>
            ) : (
              <>
                ¿Primera vez? <Link to="/registro">Crea una cuenta</Link>
              </>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
