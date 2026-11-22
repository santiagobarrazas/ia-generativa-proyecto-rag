# Acervo: RAG por proyectos

Aplicación web para chatear con tus documentos. Cada proyecto tiene su base de conocimiento, sus memorias y su chat. Los proyectos se pueden conectar entre sí para compartir documentos, memorias o ambos.

## Arrancar

```bash
cp .env.example .env        # y pon secretos largos: openssl rand -base64 48
docker compose up -d --build
```

Abre http://localhost:8080, crea una cuenta, agrega tu API key en **API keys** (por defecto usa el modelo `gpt-6-luna` y la URL `https://api.openai.com/v1`) y crea un proyecto.

| Servicio | Tecnología | Puerto |
|---|---|---|
| frontend | React 19 + Vite, servido por nginx (también hace de proxy de `/api`) | `localhost:8080` |
| backend | Python 3.13, FastAPI, LangChain | interno `:8000` |
| postgres | Usuarios, keys cifradas, proyectos, conexiones, metadatos y el historial del chat | interno |
| qdrant | Vectores: colecciones `documents` y `memories` | `localhost:6333/dashboard` |

## Cómo funciona

**Doble RAG.** En cada mensaje, el backend calcula un solo embedding de la pregunta y busca dos veces:

1. En la colección `documents` (k=6), dentro del proyecto actual y de los proyectos conectados que comparten documentos.
2. En la colección `memories` (k=4), dentro del proyecto actual y de los proyectos conectados que comparten memorias.

Los fragmentos recuperados se etiquetan como `[D1]…` y `[M1]…` y se inyectan en el prompt de sistema **solo para ese turno**. El contexto que persiste es únicamente el chat actual, guardado con `PostgresChatMessageHistory` de LangChain. Al **vaciar el chat** se borra ese contexto. Las memorias y los documentos se conservan.

**Memorias.** El modelo tiene una herramienta `save_memory(title, content)`. Cuando pides algo como *«Genera una memoria sobre este tema con la conclusión a la que llegamos»*, el modelo escribe un Markdown que se guarda en Postgres y se indexa en la colección `memories`. Nunca entra al contexto completo: solo se recupera por similitud, igual que los documentos.

**Conexiones.** Son dirigidas: conectar A → B le da a A acceso a lo que B comparte, y no al revés. Al conectar eliges documentos, memorias o ambos (al menos uno), y puedes marcar que también se conecte B → A. Al desconectar, si la conexión es mutua, aparece la opción de quitar también la conexión inversa. Desde B puedes **revocar** el acceso que A tiene a B.

**Aislamiento en Qdrant.** Cada punto lleva `metadata.project_id`, indexado como *tenant* (`is_tenant=true`). Todas las búsquedas filtran con `MatchAny` sobre los proyectos permitidos.

## Seguridad

- Contraseñas con **bcrypt** (costo 12). El login tarda lo mismo si el correo no existe.
- Sesión con **JWT HS256** firmado con `JWT_SECRET`, en una cookie `HttpOnly` y `SameSite=Strict` que dura 7 días. JavaScript no puede leer el token.
- API keys cifradas con **AES-256-GCM**. La clave de cifrado se deriva de `BYOK_KEY` y el `user_id` va como dato autenticado, así que una key copiada a otra cuenta no se puede descifrar. La API nunca devuelve la key, solo sus últimos 4 caracteres.
- `JWT_SECRET` y `BYOK_KEY` son obligatorios y deben tener al menos 32 caracteres; si no, el backend no arranca. **Si cambias `BYOK_KEY`, las keys guardadas dejan de descifrarse** y hay que registrarlas de nuevo.

## Variables de entorno (`.env`)

| Variable | Para qué |
|---|---|
| `JWT_SECRET` | Firma de las sesiones |
| `BYOK_KEY` | Cifrado de las API keys |
| `POSTGRES_PASSWORD` | Contraseña de Postgres |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | Modelo de embeddings (por defecto `text-embedding-3-small`, 1536 dimensiones). Se llama con la key que elijas. Si lo cambias, borra el volumen de Qdrant (`docker compose down -v`). |

## Formatos soportados

PDF (se cita por página), TXT, Markdown, CSV y HTML, hasta 25 MB. Se trocean en fragmentos de ~1000 caracteres con 150 de solapamiento (`RecursiveCharacterTextSplitter`).

## Tests

```bash
docker compose run --rm --no-deps backend python -m pytest -q tests
```

## Estructura

```
backend/app/
  main.py          app FastAPI y errores del proveedor traducidos
  security.py      bcrypt, JWT, AES-GCM
  db.py            esquema Postgres
  rag.py           loaders, chunking, embeddings, Qdrant (LangChain)
  routes/          auth, keys, projects (+ conexiones), knowledge (docs + memorias), chat
frontend/src/
  pages/           login/registro, inicio, proyecto, API keys
  components/      Chat, Knowledge, Connections, Markdown
```
