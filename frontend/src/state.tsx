import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type ApiKey, type Project, type User } from "./api";

type AppState = {
  user: User;
  setUser: (u: User | null) => void;
  projects: Project[];
  refreshProjects: () => Promise<void>;
  keys: ApiKey[];
  refreshKeys: () => Promise<void>;
  keyId: string;
  setKeyId: (id: string) => void;
};

const Ctx = createContext<AppState | null>(null);
export const useApp = () => useContext(Ctx)!;

function readStoredKey() {
  try {
    return localStorage.getItem("acervo.key") ?? "";
  } catch {
    return "";
  }
}

export function AppProvider({ user, setUser, children }: { user: User; setUser: (u: User | null) => void; children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [storedKey, setStoredKey] = useState(readStoredKey);

  const refreshProjects = useCallback(async () => setProjects(await api<Project[]>("/projects")), []);
  const refreshKeys = useCallback(async () => setKeys(await api<ApiKey[]>("/keys")), []);

  useEffect(() => {
    refreshProjects().catch(() => {});
    refreshKeys().catch(() => {});
  }, [refreshProjects, refreshKeys]);

  // La key elegida se recuerda por navegador; si ya no existe, se usa la primera disponible.
  const keyId = keys.some((k) => k.id === storedKey) ? storedKey : (keys[0]?.id ?? "");
  const setKeyId = (id: string) => {
    setStoredKey(id);
    try {
      localStorage.setItem("acervo.key", id);
    } catch {
      /* almacenamiento bloqueado: solo se pierde la preferencia */
    }
  };

  return (
    <Ctx.Provider value={{ user, setUser, projects, refreshProjects, keys, refreshKeys, keyId, setKeyId }}>
      {children}
    </Ctx.Provider>
  );
}
