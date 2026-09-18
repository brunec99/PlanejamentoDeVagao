/** Classe IFC traduzida para o vocabulário da obra. O quantitativo existe para substituir a
 * planilha que o engenheiro monta à mão, e "IfcWallStandardCase" não é uma linha de planilha de
 * obra — "Parede" é. O nome cru continua visível ao lado, porque é ele que as regras de vínculo
 * usam e é por ele que se confere o modelo. */
const GROUPS: Record<string, string[]> = {
  Parede: ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE', 'IFCCURTAINWALL'],
  Laje: ['IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE'],
  Viga: ['IFCBEAM', 'IFCBEAMSTANDARDCASE'],
  Pilar: ['IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE'],
  Fundação: ['IFCFOOTING', 'IFCPILE'],
  Porta: ['IFCDOOR', 'IFCDOORSTANDARDCASE'],
  Janela: ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'],
  Escada: ['IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCRAILING'],
  Cobertura: ['IFCROOF'],
  Forro: ['IFCCOVERING'],
  Telhado: ['IFCPLATE'],
  Armadura: ['IFCREINFORCINGBAR', 'IFCREINFORCINGMESH', 'IFCTENDON'],
  Instalações: ['IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCCABLECARRIERSEGMENT', 'IFCCABLESEGMENT', 'IFCFLOWTERMINAL', 'IFCSANITARYTERMINAL', 'IFCELECTRICAPPLIANCE', 'IFCLIGHTFIXTURE', 'IFCVALVE', 'IFCPUMP', 'IFCTANK', 'IFCAIRTERMINAL'],
  Mobiliário: ['IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCSYSTEMFURNITUREELEMENT'],
  Ambiente: ['IFCSPACE', 'IFCZONE'],
  Genérico: ['IFCBUILDINGELEMENTPROXY', 'IFCELEMENTASSEMBLY'],
};
const LABEL = new Map(Object.entries(GROUPS).flatMap(([label, classes]) => classes.map(ifcClass => [ifcClass, label] as const)));

/** Uma classe que não está no mapa vira o próprio nome sem o prefixo `Ifc`, com as palavras
 * separadas: é melhor ler "Building Element Part" do que "IFCBUILDINGELEMENTPART", e melhor
 * ainda do que esconder atrás de "Outros" o que o modelo de fato tem. */
export function groupOf(ifcClass: string) {
  const known = LABEL.get(ifcClass.trim().toUpperCase());
  if (known) return known;
  const bare = ifcClass.trim().replace(/^ifc/i, '');
  if (!bare) return ifcClass.trim();
  return bare.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/^./, first => first.toUpperCase());
}
