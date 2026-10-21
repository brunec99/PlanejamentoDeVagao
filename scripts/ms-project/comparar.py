"""Compara a bancada com o MS Project real (ver docs/engenharia-reversa-project.md).

uso: python3 -I comparar.py <pasta>
A pasta tem cenarios.json e motor.json (de exportar-cenarios.ts), project.json (de
montar-no-project.ps1) e, se houver, xml-aberto.json (de abrir-xml.ps1). Imprime, por cenário:
[BANCADA] onde o Project discorda do resultado esperado da fixture, [motor] onde só o motor do
Obra 360 discorda do Project, e [xml] onde abrir o .xml exportado dá resultado diferente de montar
o cenário direto no Project."""
import json
import os
import sys

CAMPOS = ['inicio', 'termino', 'inicioTardio', 'terminoTardio', 'folgaTotal', 'folgaLivre',
          'critica', 'conflito', 'prazoPerdido', 'determinantes']
XML = CAMPOS[:7]


def ler(pasta, nome):
    caminho = os.path.join(pasta, nome)
    return json.load(open(caminho, encoding='utf-8-sig')) if os.path.exists(caminho) else None


def norm(v):
    if isinstance(v, list):
        return sorted(v)
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def main(pasta):
    cen, mot, prj = ler(pasta, 'cenarios.json'), ler(pasta, 'motor.json'), ler(pasta, 'project.json')
    xml = ler(pasta, 'xml-aberto.json') or [None] * len(cen)
    n_esp = d_esp = n_mot = d_mot = n_xml = d_xml = 0
    for i, (c, m, p, x) in enumerate(zip(cen, mot, prj, xml), 1):
        linhas = []
        if p['erros']:
            linhas.append(f"   ERRO no Project: {p['erros']}")
        for tid, pt in p['tarefas'].items():
            esp = c['esperado'].get(tid, {})
            for campo in CAMPOS:
                pv, mv = norm(pt.get(campo)), norm(m.get(tid, {}).get(campo))
                n_mot += 1
                if campo in esp:
                    n_esp += 1
                    if norm(esp[campo]) != pv:
                        d_esp += 1
                        d_mot += pv != mv
                        linhas.append(f"   [BANCADA] {tid}.{campo}: Project={pv} esperado={norm(esp[campo])} motor={mv}")
                        continue
                if pv != mv:
                    d_mot += 1
                    linhas.append(f"   [motor] {tid}.{campo}: Project={pv} motor={mv}")
            xt = x and x['tarefas'].get(tid)
            for campo in XML if xt else []:
                n_xml += 1
                if norm(xt[campo]) != norm(pt[campo]):
                    d_xml += 1
                    linhas.append(f"   [xml] {tid}.{campo}: direto={norm(pt[campo])} xml={norm(xt[campo])}")
        if linhas:
            print(f"{i:02d} {c['nome']}")
            print('\n'.join(linhas))
            for tid, pt in p['tarefas'].items():
                print(f"      {tid}: {pt['bruto']}")
    print(f"\nProject x esperado da bancada: {d_esp} divergências em {n_esp} checagens")
    print(f"Project x motor (todas as tarefas e campos): {d_mot} em {n_mot}")
    if n_xml:
        print(f".xml exportado x montagem direta no Project: {d_xml} em {n_xml}")


if __name__ == '__main__':
    main(sys.argv[1])
