import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Convierte las citas [D1] / [M2] en enlaces internos para dibujarlas como botones.
const withCitations = (text: string) => text.replace(/\[([DM]\d+)\](?!\()/g, "[$1](#cite-$1)");

export default function Markdown({ children, onCite }: { children: string; onCite?: (ref: string) => void }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children: label }) {
            if (href?.startsWith("#cite-")) {
              const ref = href.slice(6);
              return (
                // Enlace en línea (no botón) para que la cita no se separe de la puntuación al cortar la línea.
                <a
                  href={href}
                  role="button"
                  className={`cite ${ref.startsWith("D") ? "doc" : "mem"}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onCite?.(ref);
                  }}
                  aria-label={`Ver fuente ${ref}`}
                >
                  {ref}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {label}
              </a>
            );
          },
        }}
      >
        {onCite ? withCitations(children) : children}
      </ReactMarkdown>
    </div>
  );
}
