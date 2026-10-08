'use client';
import { useEffect } from 'react';

/** Erro no próprio layout raiz: sem estilos nem lateral, só o essencial para recomeçar. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: 'error', route: 'root', digest: error.digest, message: error.message }));
  }, [error]);
  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: '3rem 1.5rem',
          maxWidth: 640,
          margin: '0 auto',
          color: '#05202f',
          background: '#f4f7f9',
          borderTop: '4px solid #1a719f',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a364d' }}>O Obra 360 não pôde abrir</h1>
        <p style={{ marginTop: 12, lineHeight: 1.6, color: '#435d74' }}>
          O erro foi registrado. Recarregue a página; se continuar, avise o administrador
          {error.digest ? ` informando o código ${error.digest}` : ''}.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 20,
            background: '#1a719f',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  );
}
