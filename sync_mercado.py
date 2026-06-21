"""
sync_mercado.py
Busca dados de mercado e salva no Firestore (colecao 'mercado').
Execute uma vez por dia para atualizar os cards da pagina Mercado.

Como rodar:
  python sync_mercado.py
"""

import json
import os
import urllib.request
import urllib.parse
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore

KEY_FILE = "firebase-key.json"

# Indices buscados via BRAPI (ticker_proprio, nome_exibicao)
INDICES_BRAPI = [
    ("^BVSP",    "Ibovespa"),
    ("^GSPC",    "S&P 500"),
    ("IFIX",     "IFIX"),
    ("USDBRL=X", "Dolar"),
    ("BZ=F",     "Brent"),
    ("TIO=F",    "Minerio de Ferro"),
    ("GC=F",     "Ouro"),
]

# Bitcoin via CoinGecko (gratuito, sem token)
TICKER_BTC = "BTCBRL"

# Todos os tickers validos (para limpar obsoletos no Firestore)
TICKERS_VALIDOS = {t for t, _ in INDICES_BRAPI} | {TICKER_BTC}


def ler_env():
    env = {}
    try:
        with open(".env", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env


def buscar_um_brapi(ticker_proprio, nome, token):
    """Busca um ticker na BRAPI. Usa ticker_proprio como ID do documento."""
    ticker_enc = urllib.parse.quote(ticker_proprio, safe="")
    params = urllib.parse.urlencode({"token": token})
    url = f"https://brapi.dev/api/quote/{ticker_enc}?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sync_mercado/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read())
            results = dados.get("results", [])
            if results:
                r = results[0]
                return {
                    "ticker":      ticker_proprio,
                    "nome":        nome,
                    "preco":       r.get("regularMarketPrice"),
                    "variacaoDia": r.get("regularMarketChangePercent"),
                    "variacaoAbs": r.get("regularMarketChange"),
                }
    except Exception as e:
        print(f"    erro: {e}")
    return None


def buscar_btc_brl():
    """Busca Bitcoin em BRL via CoinGecko (gratuito, sem token)."""
    url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sync_mercado/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read())
            btc = dados.get("bitcoin", {})
            preco = btc.get("brl")
            var   = btc.get("brl_24h_change")
            if preco:
                return {
                    "ticker":      TICKER_BTC,
                    "nome":        "Bitcoin",
                    "preco":       preco,
                    "variacaoDia": var,
                    "variacaoAbs": None,
                }
    except Exception as e:
        print(f"    erro CoinGecko: {e}")
    return None


def sync():
    env = ler_env()
    token = env.get("VITE_BRAPI_TOKEN", "")
    if not token:
        print("ERRO: VITE_BRAPI_TOKEN nao encontrado no arquivo .env")
        input("Pressione Enter para fechar...")
        return

    print("Conectando ao Firebase...")
    cred = credentials.Certificate(KEY_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    col = db.collection("mercado")

    # Limpar documentos obsoletos (ex: 'BTC', 'IFIX.SA' de versoes anteriores)
    for doc in col.stream():
        if doc.id not in TICKERS_VALIDOS:
            doc.reference.delete()
            print(f"  Removido obsoleto: {doc.id}")

    agora = datetime.utcnow()
    resultados = []

    print(f"Buscando {len(INDICES_BRAPI)} indices na BRAPI...")
    for ticker, nome in INDICES_BRAPI:
        r = buscar_um_brapi(ticker, nome, token)
        if r:
            resultados.append(r)
        else:
            print(f"  AVISO: {nome} ({ticker}) nao encontrado")

    print("Buscando Bitcoin (CoinGecko)...")
    btc = buscar_btc_brl()
    if btc:
        resultados.append(btc)
    else:
        print("  AVISO: Bitcoin nao encontrado")

    atualizados = 0
    for r in resultados:
        r["atualizadoEm"] = agora
        col.document(r["ticker"]).set(r)
        sinal = "+" if (r.get("variacaoDia") or 0) >= 0 else ""
        preco = r.get("preco") or 0
        print(f"  {r['nome']:<20}  {preco:>14,.2f}  {sinal}{r.get('variacaoDia') or 0:.2f}%")
        atualizados += 1

    total = len(INDICES_BRAPI) + 1
    print(f"\n{atualizados}/{total} indices atualizados no Firestore.")
    input("Pressione Enter para fechar...")


if __name__ == "__main__":
    sync()
