-- Geometria do elemento como dado, para o 3D sair da tabela e não do arquivo.
--
-- Guarda-se a caixa envolvente em coordenadas do modelo: seis números por elemento, algo como
-- 10 MB para um modelo de 100 mil elementos. Isso basta para a leitura de planejamento — a
-- massa do prédio, pavimento a pavimento, colorida por serviço e por status — e funciona em
-- qualquer tamanho de arquivo, inclusive nos que não cabem no limite do Storage.
--
-- A malha completa (triângulos por elemento) ficou de fora de propósito: são de 50 a 500 MB
-- de geometria por modelo, que precisariam de streaming por partes para renderizar. Se um dia
-- for necessária, entra em tabela própria sem desfazer esta.

alter table ifc_elements add column if not exists min_x numeric;
alter table ifc_elements add column if not exists min_y numeric;
alter table ifc_elements add column if not exists min_z numeric;
alter table ifc_elements add column if not exists max_x numeric;
alter table ifc_elements add column if not exists max_y numeric;
alter table ifc_elements add column if not exists max_z numeric;

-- Marca na versão se a transcrição trouxe geometria: um IFC sem representação geométrica é
-- válido e continua útil como dado, então a ausência precisa ser distinguível de falha.
alter table ifc_model_versions add column if not exists has_geometry boolean not null default false;
