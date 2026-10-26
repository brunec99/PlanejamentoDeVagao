"""Extrai a "Lista de pendências" de uma planilha PCP exportada do Sheets em .xlsx.

Uso:
  python3 -I scripts/terminalidade/extrair-planilha.py <planilha.xlsx> <pasta-saida>
    [--aba Terminalidades] [--apoio Apoio]

Gera <pasta-saida>/pendencias.json e <pasta-saida>/fotos/<sha1>.<ext>, que
scripts/import-terminalidade.ts lê. Só biblioteca padrão: o .xlsx é um zip de XML.

- Linhas: a aba da lista (padrão "Terminalidades"), a partir do cabeçalho que tem
  "Descrição da pendência". As colunas são achadas pelo nome do cabeçalho, não pela posição.
- Fotos: o Sheets exporta a imagem colocada na célula como desenho ancorado nela
  (xl/drawings/drawingN.xml, <xdr:from> com coluna e linha). A âncora na coluna "Foto" é a foto
  do problema; na "Foto da correção", a da correção. Âncora fora dessas colunas é relatada e
  ignorada (logotipo do cabeçalho, imagem solta abaixo da lista).
- Cadastro: as listas suspensas da aba de apoio (padrão "Apoio"), no bloco cujo título tem
  "TERMINALIDADES": Local, Apto, Responsável 3°, Responsável ATR e Tipo, na ordem da planilha.
- Valores saem como texto, sem interpretação: datas viram AAAA-MM-DD quando a célula é data;
  texto digitado ("08/102026") vai como está, e o importador decide.
"""
import argparse
import hashlib
import json
import os
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"

# Cabeçalho da planilha -> campo do JSON. A comparação ignora acento, caixa e espaços.
CAMPOS = {
    "local": "local",
    "apto": "apto",
    "descricao da pendencia": "descricao",
    "tipo": "tipo",
    "data observacao": "observado",
    "data correcao": "corrigido",
    "responsavel atr": "responsavelAtr",
    "responsavel terceiro": "responsavelTerceiro",
    "foto": "foto",
    "resolvido?": "resolvido",
    "foto da correcao": "fotoCorrecao",
    "observacao": "observacao",
}
LISTAS_APOIO = {
    "local": "locais",
    "apto": "aptos",
    "responsavel 3°": "terceiros",
    "responsavel 3o": "terceiros",
    "responsavel atr": "responsaveisAtr",
    "tipo": "tipos",
}


def chave(texto: str) -> str:
    import unicodedata

    sem_acento = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sem_acento).strip().lower()


def indice_coluna(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def letra_coluna(indice: int) -> str:
    letras = ""
    n = indice + 1
    while n:
        n, resto = divmod(n - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def ler_rels(z: zipfile.ZipFile, caminho: str) -> dict:
    """Relações de uma parte do pacote, com o alvo já resolvido para o caminho no zip."""
    pasta, nome = posixpath.split(caminho)
    rels = posixpath.join(pasta, "_rels", nome + ".rels")
    if rels not in z.namelist():
        return {}
    raiz = ET.fromstring(z.read(rels))
    return {
        r.get("Id"): posixpath.normpath(posixpath.join(pasta, r.get("Target")))
        for r in raiz.findall("pr:Relationship", NS)
    }


class Planilha:
    def __init__(self, arquivo: str):
        self.z = zipfile.ZipFile(arquivo)
        self.textos = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            for si in ET.fromstring(self.z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                self.textos.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        estilos = ET.fromstring(self.z.read("xl/styles.xml"))
        formatos = {int(n.get("numFmtId")): n.get("formatCode") for n in estilos.findall("m:numFmts/m:numFmt", NS)}
        self.estilo_data = []
        for xf in estilos.findall("m:cellXfs/m:xf", NS):
            fid = int(xf.get("numFmtId", 0))
            codigo = formatos.get(fid, "").lower()
            self.estilo_data.append(14 <= fid <= 22 or (bool(re.search(r"[dy]", codigo)) and "h" not in codigo))
        livro = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ler_rels(self.z, "xl/workbook.xml")
        self.abas = {s.get("name"): rels[s.get(R_ID)] for s in livro.findall("m:sheets/m:sheet", NS)}

    def celulas(self, aba: str) -> dict:
        """{linha (0-based): {coluna (0-based): texto}}."""
        raiz = ET.fromstring(self.z.read(self.abas[aba]))
        linhas = {}
        for row in raiz.iter(f"{{{NS['m']}}}row"):
            valores = {}
            for c in row.findall("m:c", NS):
                t = c.get("t")
                v = c.find("m:v", NS)
                if t == "s" and v is not None:
                    valor = self.textos[int(v.text)]
                elif t == "inlineStr":
                    valor = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
                elif v is not None and v.text is not None:
                    valor = v.text
                    estilo = int(c.get("s", 0))
                    if t not in ("str", "b", "e") and estilo < len(self.estilo_data) and self.estilo_data[estilo]:
                        valor = (date(1899, 12, 30) + timedelta(days=float(valor))).isoformat()
                    elif t is None and re.fullmatch(r"-?\d+\.0+", valor):
                        valor = valor.split(".")[0]  # 201.0 -> 201: número inteiro digitado como apto
                else:
                    continue
                valores[indice_coluna(c.get("r"))] = valor.strip()
            linhas[int(row.get("r")) - 1] = valores
        return linhas

    def imagens(self, aba: str) -> dict:
        """{(linha, coluna): [caminho no zip]} das imagens ancoradas na aba."""
        caminho = self.abas[aba]
        ancoras = {}
        for desenho in ler_rels(self.z, caminho).values():
            if "/drawings/" not in desenho:
                continue
            alvos = ler_rels(self.z, desenho)
            for ancora in list(ET.fromstring(self.z.read(desenho))):
                de = ancora.find("xdr:from", NS)
                blip = ancora.find(".//a:blip", NS)
                if de is None or blip is None:
                    continue
                pos = (int(de.find("xdr:row", NS).text), int(de.find("xdr:col", NS).text))
                ancoras.setdefault(pos, []).append(alvos[blip.get(R_EMBED)])
        return ancoras


def extrair(arquivo: str, saida: str, aba: str, apoio: str) -> dict:
    planilha = Planilha(arquivo)
    if aba not in planilha.abas:
        sys.exit(f'Aba "{aba}" não encontrada. Abas: {", ".join(planilha.abas)}')
    celulas = planilha.celulas(aba)

    cabecalho = next((r for r in sorted(celulas) if any(chave(v) == "descricao da pendencia" for v in celulas[r].values())), None)
    if cabecalho is None:
        sys.exit(f'Cabeçalho com "Descrição da pendência" não encontrado na aba "{aba}".')
    colunas = {}
    for c, v in celulas[cabecalho].items():
        campo = CAMPOS.get(chave(v))
        if campo and campo not in colunas:
            colunas[campo] = c
    faltando = [campo for campo in ("local", "descricao", "observado") if campo not in colunas]
    if faltando:
        sys.exit(f"Colunas obrigatórias ausentes no cabeçalho: {', '.join(faltando)}.")

    os.makedirs(os.path.join(saida, "fotos"), exist_ok=True)
    gravadas = {}

    def foto(caminho: str) -> dict:
        if caminho not in gravadas:
            dados = planilha.z.read(caminho)
            sha1 = hashlib.sha1(dados).hexdigest()
            nome = sha1 + os.path.splitext(caminho)[1].lower()
            with open(os.path.join(saida, "fotos", nome), "wb") as f:
                f.write(dados)
            gravadas[caminho] = {"sha1": sha1, "arquivo": nome}
        return gravadas[caminho]

    imagens = planilha.imagens(aba)
    usadas = set()
    linhas = []
    for r in sorted(celulas):
        if r <= cabecalho:
            continue
        valores = celulas[r]
        linha = {campo: valores.get(c, "") for campo, c in colunas.items() if campo not in ("foto", "fotoCorrecao")}
        fotos = imagens.get((r, colunas.get("foto", -1)), [])
        correcao = imagens.get((r, colunas.get("fotoCorrecao", -1)), [])
        if not linha.get("descricao"):
            continue  # linha vazia (ou só com imagem solta): relatada abaixo se tiver imagem
        usadas.update((r, colunas[k]) for k, lista in (("foto", fotos), ("fotoCorrecao", correcao)) if lista)
        linha["linha"] = r + 1
        linha["fotos"] = [foto(c) for c in fotos]
        linha["fotosCorrecao"] = [foto(c) for c in correcao]
        linhas.append(linha)

    ignoradas = [
        {"celula": f"{letra_coluna(c)}{r + 1}", "imagens": len(lista)}
        for (r, c), lista in sorted(imagens.items())
        if (r, c) not in usadas
    ]

    cadastro = {lista: [] for lista in set(LISTAS_APOIO.values())}
    if apoio in planilha.abas:
        apoio_celulas = planilha.celulas(apoio)
        titulo = next(((r, c) for r in sorted(apoio_celulas) for c, v in apoio_celulas[r].items() if "TERMINALIDADES" in v.upper()), None)
        if titulo:
            r_titulo, c_inicio = titulo
            cab = apoio_celulas.get(r_titulo + 1, {})
            for c in sorted(k for k in cab if k >= c_inicio):
                lista = LISTAS_APOIO.get(chave(cab[c]))
                if not lista or cadastro[lista]:
                    continue
                for r in sorted(k for k in apoio_celulas if k > r_titulo + 1):
                    v = apoio_celulas[r].get(c, "")
                    if v and v not in cadastro[lista]:
                        cadastro[lista].append(v)

    resultado = {"origem": os.path.basename(arquivo), "aba": aba, "linhas": linhas, "cadastro": cadastro, "imagensIgnoradas": ignoradas}
    with open(os.path.join(saida, "pendencias.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=1)
    return resultado


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("planilha")
    parser.add_argument("saida")
    parser.add_argument("--aba", default="Terminalidades")
    parser.add_argument("--apoio", default="Apoio")
    args = parser.parse_args()
    r = extrair(args.planilha, args.saida, args.aba, args.apoio)
    fotos = sum(len(l["fotos"]) for l in r["linhas"])
    correcao = sum(len(l["fotosCorrecao"]) for l in r["linhas"])
    print(f'{len(r["linhas"])} pendências, {fotos} fotos do problema, {correcao} fotos da correção.')
    print("Cadastro: " + ", ".join(f"{k} {len(v)}" for k, v in sorted(r["cadastro"].items())))
    for ignorada in r["imagensIgnoradas"]:
        print(f'Imagem fora das colunas de foto, ignorada: {ignorada["celula"]} ({ignorada["imagens"]})')


if __name__ == "__main__":
    main()
