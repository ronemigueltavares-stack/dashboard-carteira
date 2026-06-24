"""
sync_mercado.py
1. Busca indices globais (BRAPI) e Bitcoin (CoinGecko) -> colecao 'mercado'
2. Busca cotacao ao vivo + historico 30d dos ativos da carteira (yfinance) -> users/{uid}/cotacoes
Execute uma vez por dia para atualizar a pagina Mercado.

Como rodar:
  python sync_mercado.py
"""

import json
import urllib.request
import urllib.parse
from datetime import datetime

import yfinance as yf
import firebase_admin
from firebase_admin import credentials, firestore

KEY_FILE  = "firebase-key.json"
USER_UID  = "3zESUj8nuPN1ViGpyCxnkJGIJYL2"

# Indices buscados via BRAPI
INDICES_BRAPI = [
    ("^BVSP",    "Ibovespa"),
    ("^GSPC",    "S&P 500"),
    ("IFIX",     "IFIX"),
    ("USDBRL=X", "Dolar"),
    ("BZ=F",     "Brent"),
    ("TIO=F",    "Minerio de Ferro"),
    ("GC=F",     "Ouro"),
]
TICKER_BTC    = "BTCBRL"
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
    ticker_enc = urllib.parse.quote(ticker_proprio, safe="")
    url = f"https://brapi.dev/api/quote/{ticker_enc}?token={urllib.parse.quote(token)}"
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
    url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sync_mercado/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read())
            btc = dados.get("bitcoin", {})
            preco = btc.get("brl")
            var   = btc.get("brl_24h_change")
            if preco:
                return {"ticker": TICKER_BTC, "nome": "Bitcoin", "preco": preco, "variacaoDia": var, "variacaoAbs": None}
    except Exception as e:
        print(f"    erro CoinGecko: {e}")
    return None


def buscar_cotacoes_ativos(tickers, db, agora):
    """Busca preco ao vivo + historico 30d via yfinance e salva em users/{uid}/cotacoes."""
    col = db.collection(f"users/{USER_UID}/cotacoes")
    ok = 0

    for ticker in tickers:
        ticker_yf = ticker + ".SA"
        try:
            hist = yf.Ticker(ticker_yf).history(period="1mo", interval="1d", auto_adjust=True)
            if hist.empty:
                print(f"  {ticker:<12}  sem dados no yfinance")
                continue

            closes = [round(float(v), 2) for v in hist["Close"].tolist() if v == v]  # exclui NaN
            if len(closes) < 2:
                continue

            preco     = closes[-1]
            preco_ant = closes[-2]
            var_dia   = round((preco - preco_ant) / preco_ant * 100, 4) if preco_ant else 0.0

            col.document(ticker).set({
                "ticker":      ticker,
                "preco":       preco,
                "variacaoDia": var_dia,
                "historico":   closes,
                "atualizadoEm": agora,
            })

            sinal = "+" if var_dia >= 0 else ""
            print(f"  {ticker:<12}  R$ {preco:>9.2f}  {sinal}{var_dia:.2f}%  ({len(closes)} dias)")
            ok += 1

        except Exception as e:
            print(f"  {ticker:<12}  erro: {e}")

    return ok


def sync():
    env   = ler_env()
    token = env.get("VITE_BRAPI_TOKEN", "")
    if not token:
        print("ERRO: VITE_BRAPI_TOKEN nao encontrado no arquivo .env")
        input("Pressione Enter para fechar...")
        return

    print("Conectando ao Firebase...")
    cred = credentials.Certificate(KEY_FILE)
    firebase_admin.initialize_app(cred)
    db  = firestore.client()
    col = db.collection("mercado")
    agora = datetime.utcnow()

    # ── 1. Indices globais (BRAPI) ────────────────────────────────────────
    for doc in col.stream():
        if doc.id not in TICKERS_VALIDOS:
            doc.reference.delete()
            print(f"  Removido obsoleto: {doc.id}")

    resultados = []
    print(f"\nBuscando {len(INDICES_BRAPI)} indices na BRAPI...")
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

    for r in resultados:
        r["atualizadoEm"] = agora
        col.document(r["ticker"]).set(r)
        sinal = "+" if (r.get("variacaoDia") or 0) >= 0 else ""
        print(f"  {r['nome']:<20}  {r.get('preco') or 0:>14,.2f}  {sinal}{r.get('variacaoDia') or 0:.2f}%")

    print(f"{len(resultados)}/{len(INDICES_BRAPI)+1} indices atualizados.")

    # ── 2. Cotacoes dos ativos da carteira (yfinance) ─────────────────────
    print(f"\nBuscando posicoes do usuario {USER_UID}...")
    pos_snap = db.collection(f"users/{USER_UID}/posicoes").stream()
    tickers_carteira = [
        d.to_dict().get("ticker")
        for d in pos_snap
        if d.to_dict().get("qtd", 0) > 0
    ]
    tickers_carteira = sorted(set(t for t in tickers_carteira if t))

    if not tickers_carteira:
        print("  Nenhuma posicao encontrada. Rode sync_firebase.py primeiro.")
    else:
        print(f"Buscando cotacoes de {len(tickers_carteira)} ativos via yfinance...")
        ok = buscar_cotacoes_ativos(tickers_carteira, db, agora)
        print(f"{ok}/{len(tickers_carteira)} ativos atualizados em users/{USER_UID}/cotacoes.")

    print("\nSincronizacao concluida!")
    input("Pressione Enter para fechar...")


if __name__ == "__main__":
    sync()
