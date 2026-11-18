"""Gera data/hoje.json: busca as notícias do dia, pede a análise para a IA e salva o resultado.

Uso:  ANTHROPIC_API_KEY=... python scripts/gerar.py
Roda sozinho todo dia pelo GitHub Actions (.github/workflows/diario.yml).
"""
import datetime as dt
import html
import json
import os
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic
import feedparser

RAIZ = Path(__file__).resolve().parent.parent
MODELO = os.environ.get("MODELO_IA", "claude-sonnet-5-5")
FUSO = ZoneInfo("America/Sao_Paulo")
MAX_NOTICIAS = 60

# Fontes de notícias (RSS). Guardamos só título, resumo curto e link.
FEEDS = [
    "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://www.infomoney.com.br/feed/",
    "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
]

# Código de 2 letras -> código numérico usado no mapa (ISO 3166-1).
ISO2_PARA_MAPA = {
    "AE": "784", "AF": "004", "AO": "024", "AR": "032", "AT": "040", "AU": "036", "BD": "050", "BE": "056",
    "BO": "068", "BR": "076", "CA": "124", "CH": "756", "CL": "152", "CN": "156", "CO": "170", "CU": "192",
    "CZ": "203", "DE": "276", "DK": "208", "DZ": "012", "EC": "218", "EG": "818", "ES": "724", "ET": "231",
    "FI": "246", "FR": "250", "GB": "826", "GR": "300", "HU": "348", "ID": "360", "IE": "372", "IL": "376",
    "IN": "356", "IQ": "368", "IR": "364", "IT": "380", "JP": "392", "KE": "404", "KP": "408", "KR": "410",
    "KW": "414", "KZ": "398", "LB": "422", "LY": "434", "MA": "504", "MX": "484", "MY": "458", "MZ": "508",
    "NG": "566", "NL": "528", "NO": "578", "NZ": "554", "OM": "512", "PE": "604", "PH": "608", "PK": "586",
    "PL": "616", "PS": "275", "PT": "620", "PY": "600", "QA": "634", "RO": "642", "RU": "643", "SA": "682",
    "SD": "729", "SE": "752", "SY": "760", "TH": "764", "TR": "792", "TW": "158", "UA": "804", "US": "840",
    "UY": "858", "VE": "862", "VN": "704", "YE": "887", "ZA": "710",
}


def limpar(texto: str, limite: int = 280) -> str:
    texto = re.sub(r"<[^>]+>", " ", html.unescape(texto or ""))
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto[:limite]


def coletar() -> list[dict]:
    vistos, itens = set(), []
    for url in FEEDS:
        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            print(f"Aviso: não consegui ler {url}", file=sys.stderr)
            continue
        fonte_feed = limpar(feed.feed.get("title", ""), 60)
        for e in feed.entries[:25]:
            titulo = limpar(e.get("title", ""), 200)
            chave = titulo.lower()[:80]
            if not titulo or chave in vistos:
                continue
            vistos.add(chave)
            fonte = e.get("source", {}).get("title") if isinstance(e.get("source"), dict) else None
            itens.append({
                "titulo": titulo,
                "resumo": limpar(e.get("summary", "")),
                "link": e.get("link", ""),
                "fonte": fonte or fonte_feed,
            })
    return itens[:MAX_NOTICIAS]


def analisar(noticias: list[dict], hoje: str) -> dict:
    cliente = anthropic.Anthropic()
    prompt = (RAIZ / "scripts" / "prompt.md").read_text(encoding="utf-8")
    entrada = json.dumps(noticias, ensure_ascii=False, indent=1)
    resp = cliente.messages.create(
        model=MODELO,
        max_tokens=12000,
        system=prompt,
        messages=[{"role": "user", "content": f"Data de hoje: {hoje}.\n\nNotícias:\n{entrada}"}],
    )
    texto = "".join(b.text for b in resp.content if b.type == "text").strip()
    inicio, fim = texto.find("{"), texto.rfind("}")
    if inicio < 0 or fim < 0:
        raise ValueError("A IA não devolveu JSON.")
    return json.loads(texto[inicio : fim + 1])


def validar(bruto: dict, noticias: list[dict]) -> dict:
    """Confere o que a IA devolveu: só aceita links que vieram das fontes e países que existem no mapa."""
    links_validos = {n["link"] for n in noticias if n["link"]}
    saida = []
    for n in bruto.get("noticias", []):
        cod = ISO2_PARA_MAPA.get(str(n.get("pais_iso2", "")).upper())
        fontes = [f for f in n.get("fontes", []) if f.get("url") in links_validos]
        if not cod or not fontes or not n.get("fato"):
            continue
        conf = n.get("confianca", "médio")
        saida.append({
            "id": re.sub(r"[^a-z0-9-]", "", str(n.get("id", "")).lower()) or f"n{len(saida)}",
            "pais": cod,
            "pais_nome": n.get("pais_nome", ""),
            "titulo_curto": n.get("titulo_curto", ""),
            "categoria": n.get("categoria", "Economia"),
            "fato": n["fato"],
            "por_que_importa": n.get("por_que_importa", [])[:4],
            "impacto": {k: n.get("impacto", {}).get(k, "") for k in ("semanas", "meses", "longo_prazo")},
            "virada": n.get("virada", ""),
            "confianca": conf if conf in ("alto", "médio", "baixo") else "médio",
            "justificativa_confianca": n.get("justificativa_confianca", ""),
            "relevancia": max(1, min(10, int(n.get("relevancia", 5)))),
            "fontes": fontes,
        })
    ids = {n["id"] for n in saida}
    itens = [i for i in bruto.get("resumo", {}).get("itens", []) if i.get("noticia") in ids][:5]
    if not saida or not itens:
        raise ValueError("A análise veio vazia ou sem fontes válidas; mantendo a edição anterior.")
    return {"resumo": {"itens": itens, "de_olho": bruto.get("resumo", {}).get("de_olho", "")}, "noticias": saida}


def main() -> None:
    agora = dt.datetime.now(FUSO)
    hoje = agora.date().isoformat()
    noticias = coletar()
    print(f"{len(noticias)} notícias coletadas")
    if len(noticias) < 5:
        sys.exit("Poucas notícias coletadas; mantendo a edição anterior.")
    edicao = validar(analisar(noticias, hoje), noticias)
    edicao = {"data": hoje, "gerado_em": agora.isoformat(timespec="minutes"), **edicao}

    texto = json.dumps(edicao, ensure_ascii=False, indent=2) + "\n"
    (RAIZ / "data" / "hoje.json").write_text(texto, encoding="utf-8")
    arquivo = RAIZ / "data" / "arquivo"
    arquivo.mkdir(exist_ok=True)
    (arquivo / f"{hoje}.json").write_text(texto, encoding="utf-8")
    print(f"Edição de {hoje} salva com {len(edicao['noticias'])} análises")


if __name__ == "__main__":
    main()
