-- Plano de longo prazo responsável pelas atividades dos vagões (25/09/2026).
-- Separada da 0024 porque aquela já tinha sido aplicada no Supabase quando isto foi decidido.
-- Pode ser rodada de novo: `if not exists` e `drop constraint if exists`.
-- Guarda de qual revisão e para qual sequência os vagões foram gerados por último, para a tela
-- dizer quando o plano mudou depois.
alter table long_term_plans add column if not exists synced_revision integer;
alter table long_term_plans add column if not exists synced_sequence_id text references production_sequences(id) on delete set null;
alter table long_term_plans add column if not exists synced_at timestamptz;
alter table long_term_plans add column if not exists synced_by text;

-- Atividade gerada pelo plano tem origem própria. `commit_planning` já grava `origin` como texto,
-- então basta alargar a checagem — nenhuma função é reescrita. Sem este trecho, gerar vagões
-- falha na gravação (violação da checagem) e nada é alterado.
alter table activities drop constraint if exists activities_origin_check;
alter table activities add constraint activities_origin_check check (origin in ('manual', 'mock', 'prevision', 'long_term'));
