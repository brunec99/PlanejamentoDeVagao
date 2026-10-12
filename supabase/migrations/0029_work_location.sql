-- Local da obra para a previsão do tempo nos PDFs do curto prazo (12/10/2026): cidade/endereço como a
-- pessoa escreveu e as coordenadas que a busca devolveu. Fica em work_settings, fora do snapshot, como
-- a semana 1. Pode ser rodada de novo; não reescreve commit_planning. Sem ela, os PDFs saem sem a faixa
-- do tempo e a tela de configurações avisa.
alter table work_settings
  add column if not exists place text,
  add column if not exists latitude double precision check (latitude is null or (latitude between -90 and 90)),
  add column if not exists longitude double precision check (longitude is null or (longitude between -180 and 180));

-- As colunas novas só aparecem na API depois que o PostgREST relê o esquema.
notify pgrst, 'reload schema';
