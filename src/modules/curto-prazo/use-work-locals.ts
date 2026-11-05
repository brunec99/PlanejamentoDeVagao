'use client';
import { useEffect, useState } from 'react';
import type { CommitmentLocal, CommitmentLocalsResponse } from '@/app/api/curto-prazo/locais/route';

export type { CommitmentLocal };

/** Os locais da obra para a coluna Local da planilha e para o filtro de local do PDF (05/11/2026): os "Locais da
 * obra" da Linha de Balanço do longo prazo, lidos de `GET /api/curto-prazo/locais`, de cima para baixo como um
 * prédio (a Linha de Balanço lista de baixo para cima pela ordem; aqui o topo vem primeiro, como na gaveta "Locais
 * da obra"). `nameOf` dá o nome de um id; id sem local na lista (apagado, ou de antes da carga) volta vazio. */
export type WorkLocals =
  | { status: 'loading'; locals: CommitmentLocal[]; nameOf: (id: string | undefined) => string }
  | { status: 'ready'; locals: CommitmentLocal[]; nameOf: (id: string | undefined) => string }
  | { status: 'error'; message: string; locals: CommitmentLocal[]; nameOf: (id: string | undefined) => string };

const empty = (_id: string | undefined) => '';

export function useWorkLocals(workId: string): WorkLocals {
  const [result, setResult] = useState<{ workId: string; state: WorkLocals }>();
  useEffect(() => {
    if (!workId) return;
    let active = true;
    const settle = (state: WorkLocals) => {
      if (active) setResult({ workId, state });
    };
    fetch(`/api/curto-prazo/locais?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' })
      .then(async res => {
        const body = (await res.json().catch(() => ({}))) as CommitmentLocalsResponse & { error?: string };
        if (!res.ok) {
          settle({ status: 'error', message: body.error || 'Não foi possível carregar os locais.', locals: [], nameOf: empty });
          return;
        }
        const locals = body.available ? [...body.locals].sort((a, b) => b.order - a.order || a.id.localeCompare(b.id)) : [];
        const names = new Map(locals.map(local => [local.id, local.name]));
        settle({ status: 'ready', locals, nameOf: id => (id ? (names.get(id) ?? '') : '') });
      })
      .catch(() => settle({ status: 'error', message: 'Falha na comunicação com o servidor.', locals: [], nameOf: empty }));
    return () => {
      active = false;
    };
  }, [workId]);
  return result && result.workId === workId ? result.state : { status: 'loading', locals: [], nameOf: empty };
}
