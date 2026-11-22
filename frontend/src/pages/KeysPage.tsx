import { useState, type FormEvent } from "react";
import { Lock, Trash2 } from "lucide-react";
import { api, errorText, formatDate } from "../api";
import { useApp } from "../state";

const DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_URL = "https://api.openai.com/v1";

export default function KeysPage() {
  const { keys, refreshKeys, keyId, setKeyId } = useApp();
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_URL);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const k = await api<{ id: string }>("/keys", {
        method: "POST",
        body: { label, api_key: apiKey, model, base_url: baseUrl },
      });
      await refreshKeys();
      if (!keyId) setKeyId(k.id);
      setLabel("");
      setApiKey("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/keys/${id}`, { method: "DELETE" });
      setConfirming(null);
      await refreshKeys();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-title">
          <h1>API keys</h1>
          <p>
            Trae tu propia key. Se usa para chatear con el modelo y para calcular los embeddings de tus documentos.
            Eliges cuál usar desde el chat.
          </p>
        </header>

        <div className="split">
          <div>
            <div className="rows">
              {keys.map((k) => (
                <div key={k.id} className="row">
                  <div className="row-main">
                    <div className="row-title">
                      <span>{k.label}</span>
                      {k.id === keyId && <span className="tag tag-neutral">en uso</span>}
                    </div>
                    <div className="row-meta">
                      {k.model} · ••••{k.key_hint} · {new URL(k.base_url).host} · {formatDate(k.created_at)}
                    </div>
                  </div>
                  <div className="row-actions">
                    {confirming === k.id ? (
                      <span className="row-confirm">
                        ¿Eliminar?
                        <button className="btn btn-danger btn-sm" onClick={() => remove(k.id)}>
                          Eliminar
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button className="icon-btn danger" aria-label={`Eliminar ${k.label}`} onClick={() => setConfirming(k.id)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!keys.length && (
              <div className="empty">
                <b>Todavía no hay keys.</b>
                Agrega una con el formulario para empezar a subir documentos y chatear.
              </div>
            )}
          </div>

          <form className="form-stack" onSubmit={save}>
            <h2>Agregar key</h2>
            <label className="field">
              <span>Nombre</span>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Personal" />
            </label>
            <label className="field">
              <span>API key</span>
              <input
                className="input mono"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder="sk-…"
              />
            </label>
            <label className="field">
              <span>Modelo de chat</span>
              <input className="input mono" value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label className="field">
              <span>URL base</span>
              <input className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <small>Cualquier API compatible con OpenAI.</small>
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !label.trim() || !apiKey.trim()}>
              {busy ? "Guardando…" : "Guardar key"}
            </button>
            <p className="security-note">
              <Lock size={14} />
              Se cifra con AES-256-GCM antes de guardarse. Solo el servidor puede descifrarla y nunca se vuelve a mostrar.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
