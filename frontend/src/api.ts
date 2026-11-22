export type User = { id: string; name: string; email: string };
export type Project = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  documents?: number;
  memories?: number;
  links?: number;
};
export type ApiKey = { id: string; label: string; model: string; base_url: string; key_hint: string; created_at: string };
export type Doc = { id: string; filename: string; size_bytes: number; chunk_count: number; created_at: string };
export type Memory = { id: string; title: string; content: string; created_at: string };
export type Source = {
  ref: string;
  kind: "document" | "memory";
  title: string;
  page: number | null;
  project_id: string;
  project_name: string | null;
  external: boolean;
  snippet: string;
  score: number;
  cited?: boolean;
};
export type Message = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  memories: { id: string; title: string }[];
  created_at?: string;
};
export type Link = {
  project_id: string;
  name: string;
  share_documents: boolean;
  share_memories: boolean;
  mutual?: boolean;
};
export type Links = { outgoing: Link[]; incoming: Link[] };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; form?: FormData };

export async function api<T = unknown>(path: string, { method = "GET", body, form }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor. Revisa que Docker esté corriendo");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("session-expired"));
    const detail = data?.detail;
    // FastAPI devuelve una lista cuando falla la validación del cuerpo.
    const message = Array.isArray(detail)
      ? `Revisa el campo «${detail[0]?.loc?.at(-1)}»: ${detail[0]?.msg}`
      : detail || `El servidor respondió ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}
