"""
sync_historico.py
Reconstrói a evolucao mensal da carteira e salva no Firestore.

Para cada mes desde o primeiro lancamento:
  - Calcula posicao (qtd de cada ativo) a partir dos lancamentos
  - Usa precos historicos mensais do BRAPI para calcular patrimonio
  - Busca CDI mensal no Banco Central (gratuito)
  - Busca IBOV historico no BRAPI

Como rodar (uma vez; repetir mensalmente para manter atualizado):
  python sync_historico.py
"""

import json
import urllib.request
import urllib.parse
from datetime import datetime
from collections import defaultdict

import yfinance as yf
import firebase_admin
from firebase_admin import credentials, firestore

KEY_FILE = "firebase-key.json"
USER_UID = "3zESUj8nuPN1ViGpyCxnkJGIJYL2"


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


def req_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "sync_historico/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def meses_entre(inicio, fim):
    meses = []
    ano, mes = inicio.year, inicio.month
    while (ano, mes) <= (fim.year, fim.month):
        meses.append(f"{ano}-{mes:02d}")
        mes += 1
        if mes > 12:
            mes, ano = 1, ano + 1
    return meses


def buscar_preco_hist(ticker):
    """
    Retorna {YYYY-MM: preco_fechamento} via yfinance (gratuito, sem token).
    Tickers brasileiros recebem sufixo .SA automaticamente.
    """
    yf_ticker = ticker if ticker.startswith("^") else ticker + ".SA"
    try:
        # auto_adjust=False → preço de fechamento real (sem ajuste por dividendos)
        # Usamos o preço bruto porque os dividendos já são rastreados separadamente.
        # auto_adjust=True distorceria o histórico: preços antigos ficam artificialmente
        # baixos, inflando a rentabilidade de carteiras com muitos pagadores de dividendos.
        dados = yf.download(yf_ticker, period="10y", interval="1mo",
                            progress=False, auto_adjust=False)
        if dados.empty:
            return {}
        # Com auto_adjust=False: 'Close' = preço bruto, 'Adj Close' = ajustado
        col = "Close"
        if isinstance(dados.columns, __import__('pandas').MultiIndex):
            close_series = dados[col][yf_ticker].squeeze()
        else:
            close_series = dados[col].squeeze()
        precos = {}
        for idx, val in close_series.items():
            try:
                v = float(val)
                if v > 0:
                    precos[f"{idx.year}-{idx.month:02d}"] = v
            except Exception:
                pass
        return precos
    except Exception as e:
        print(f"erro YF: {e}")
        return {}


def buscar_cdi_mensal(data_ini, data_fim):
    """Retorna {YYYY-MM: fator_mensal} com fator acumulado do CDI em cada mes."""
    di  = data_ini.strftime("%d/%m/%Y")
    df  = data_fim.strftime("%d/%m/%Y")
    url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
           f"?formato=json&dataInicial={di}&dataFinal={df}")
    try:
        dados   = req_json(url, timeout=30)
        fatores = defaultdict(lambda: 1.0)
        for item in dados:
            p = item["data"].split("/")          # DD/MM/YYYY
            chave = f"{p[2]}-{p[1]}"
            fatores[chave] *= (1 + float(item["valor"]) / 100)
        return dict(fatores)
    except Exception as e:
        print(f"erro CDI: {e}")
        return {}


def sync():
    print("Conectando ao Firebase...")
    cred = credentials.Certificate(KEY_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    TIPOS_PROV = {'DIV','JCP','RENDIMENTO','RENDIMENTOS','DIVIDENDO','DIVIDENDOS'}

    # ── 1. Lancamentos ────────────────────────────────────────────────────────
    # COMPRA/VENDA: afetam qtd E custo
    # BONIF/FRACAO: afetam apenas qtd (custo = 0, ações recebidas sem desembolso)
    TIPOS_LANCE = {"COMPRA", "VENDA", "BONIF", "FRACAO", "FRAC", "BONIFICACAO"}
    print("Lendo lancamentos do Firestore...")
    lancamentos = []
    for snap in db.collection(f"users/{USER_UID}/lancamentos").stream():
        rec  = snap.to_dict()
        dt   = rec.get("data")
        tipo = (rec.get("tipo") or "").upper()
        if not hasattr(dt, "year") or tipo not in TIPOS_LANCE:
            continue
        if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        lancamentos.append({
            "data":  dt,
            "ativo": (rec.get("ativo") or "").upper(),
            "qtd":   float(rec.get("qtd") or 0),
            "total": float(rec.get("total") or 0),
            "tipo":  tipo,
        })

    if not lancamentos:
        print("Nenhum lancamento encontrado.")
        input("Pressione Enter para fechar...")
        return

    # ── 1b. Proventos (dividendos/JCP/rendimentos) ────────────────────────────
    print("Lendo proventos do Firestore...")
    proventos = []
    for snap in db.collection(f"users/{USER_UID}/proventos").stream():
        rec  = snap.to_dict()
        dt   = rec.get("data")
        tipo = (rec.get("tipo") or "").upper()
        if not hasattr(dt, "year") or tipo not in TIPOS_PROV:
            continue
        if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        proventos.append({
            "data":  dt,
            "valor": float(rec.get("valor") or 0),
        })
    print(f"   {len(proventos)} proventos validos")

    lancamentos.sort(key=lambda x: x["data"])
    data_ini    = datetime(lancamentos[0]["data"].year, lancamentos[0]["data"].month, 1)
    data_fim    = datetime.utcnow()
    todos_meses = meses_entre(data_ini, data_fim)
    tickers     = sorted({l["ativo"] for l in lancamentos})

    print(f"Periodo: {todos_meses[0]} a {todos_meses[-1]}  |  {len(tickers)} ativos")

    # ── 2. Posicao, custo bruto e proventos acumulados por mes ───────────────
    print("Calculando posicoes mensais...")
    posicoes_mes = {}
    custo_mes    = {}   # compras - vendas (bruto)
    prov_acum    = {}   # proventos acumulados ate cada mes

    # Pre-calcular proventos acumulados (soma de todos antes do fim do mes)
    total_prov = 0.0
    prov_por_mes = defaultdict(float)
    for p in proventos:
        chave = f"{p['data'].year}-{p['data'].month:02d}"
        prov_por_mes[chave] += p["valor"]

    for mes in todos_meses:
        ano, m = int(mes[:4]), int(mes[5:])
        corte  = datetime(ano + 1, 1, 1) if m == 12 else datetime(ano, m + 1, 1)
        qtds   = defaultdict(float)
        custo  = 0.0
        for l in lancamentos:
            if l["data"] >= corte:
                break
            tipo = l["tipo"]
            if tipo == "COMPRA":
                qtds[l["ativo"]] += l["qtd"]
                custo            += l["total"] or 0
            elif tipo == "VENDA":
                qtds[l["ativo"]] -= l["qtd"]
                custo            -= l["total"] or 0
            else:
                # BONIF / FRACAO: adiciona ações sem custo
                qtds[l["ativo"]] += l["qtd"]
        posicoes_mes[mes] = {t: q for t, q in qtds.items() if q > 0.001}
        custo_mes[mes]    = max(custo, 0)
        total_prov        += prov_por_mes.get(mes, 0)
        prov_acum[mes]    = total_prov

    # ── 3. Precos historicos de cada ativo (BRAPI) ────────────────────────────
    print(f"Buscando historico de precos ({len(tickers)} ativos) — pode demorar ~1 min...")
    precos_hist  = {}
    ultimo_preco = {}

    for i, ticker in enumerate(tickers, 1):
        print(f"  [{i:2d}/{len(tickers)}] {ticker:<12}", end=" ", flush=True)
        hist = buscar_preco_hist(ticker)
        precos_hist[ticker] = hist
        print(f"{len(hist)} meses" if hist else "sem dados")

    # ── 3b. Custo rastreavel (excluindo tickers sem dados de preco) ─────────────
    # Tickers sem nenhum dado de preco distorcem a razao patrimonio/custo nos
    # primeiros meses em que sao mantidos, causando super-valorizacao artificial.
    # custo_rastreavel exclui esses tickers do denominador para dar uma linha limpa.
    sem_preco = {t for t in tickers if not precos_hist.get(t)}
    if sem_preco:
        print(f"   Sem preco (excluidos do custo rastreavel): {', '.join(sorted(sem_preco))}")
    else:
        print("   Todos os tickers tem dados de preco.")

    custo_rastreavel_mes = {}
    for mes in todos_meses:
        ano, m = int(mes[:4]), int(mes[5:])
        corte  = datetime(ano + 1, 1, 1) if m == 12 else datetime(ano, m + 1, 1)
        custo_r = 0.0
        for l in lancamentos:
            if l["data"] >= corte:
                break
            if l["ativo"] in sem_preco:
                continue
            tipo = l["tipo"]
            if tipo == "COMPRA":
                custo_r += l["total"] or 0
            elif tipo == "VENDA":
                custo_r -= l["total"] or 0
        custo_rastreavel_mes[mes] = max(custo_r, 0)

    # ── 4. CDI mensal (Banco Central) ─────────────────────────────────────────
    print("Buscando CDI (Banco Central)...")
    cdi_mensal = buscar_cdi_mensal(data_ini, data_fim)
    print(f"   {len(cdi_mensal)} meses")

    # ── 5. IBOV historico (BRAPI) ─────────────────────────────────────────────
    print("Buscando IBOV historico...")
    ibov_hist = buscar_preco_hist("^BVSP")
    print(f"   {len(ibov_hist)} meses")

    # ── 6. Patrimonio mensal com forward-fill de precos ───────────────────────
    print("Calculando patrimonio mensal...")
    patrimonio_mes = {}
    for mes in todos_meses:
        for ticker in tickers:
            p = precos_hist.get(ticker, {}).get(mes)
            if p:
                ultimo_preco[ticker] = p
        pos   = posicoes_mes.get(mes, {})
        valor = sum(qtd * ultimo_preco.get(t, 0) for t, qtd in pos.items())
        patrimonio_mes[mes] = round(valor, 2)

    # ── 7. Curva de cota — retorno TOTAL encadeado (inclui proventos) ─────────
    # Baseado na metodologia do PopularHistorico.ps1, estendida para retorno total:
    #   numerador   = Σ(qtd[t-1] × preco[t]) + dividendos_recebidos[t]
    #   denominador = patrimonio_precos[t-1]  + proventos_acumulados_ate[t-1]
    #   R[t] = numerador / denominador − 1
    #   cota[t] = cota[t-1] × (1 + R[t])
    # Novos aportes/vendas (cash flows) so afetam o retorno no mes SEGUINTE.
    # Tickers sem preco contribuem 0 nos dois lados — neutros.
    # Proventos acumulados no denominador tornam o benchmark justo contra CDI e
    # IBOV (que ja sao indices de retorno total).
    print("Calculando curva de cota (retorno total, dividendos incluidos)...")
    cota_por_mes = {}
    cota_por_mes[todos_meses[0]] = 1.0

    for i in range(1, len(todos_meses)):
        mes_prev = todos_meses[i - 1]
        mes_curr = todos_meses[i]

        pat_prev  = patrimonio_mes.get(mes_prev, 0)
        cota_prev = cota_por_mes.get(mes_prev, 1.0) or 1.0

        if pat_prev <= 0:
            cota_por_mes[mes_curr] = cota_prev
            continue

        # Valorizar posicoes do mes anterior a precos do mes atual
        valor_pelo_preco_fim = 0.0
        pos_prev = posicoes_mes.get(mes_prev, {})
        for ticker, qtd in pos_prev.items():
            if qtd <= 0:
                continue
            preco = (precos_hist.get(ticker, {}).get(mes_curr)
                     or precos_hist.get(ticker, {}).get(mes_prev)
                     or 0)
            valor_pelo_preco_fim += qtd * preco

        # Proventos recebidos no mes atual somam ao retorno
        # Denominador = pat_prev (valor das acoes no mes anterior, sem acumular
        # dividendos passados — equivale a reinvestimento imediato de cada provento)
        dividendos_mes = prov_por_mes.get(mes_curr, 0)

        r = (valor_pelo_preco_fim + dividendos_mes) / pat_prev - 1
        cota_por_mes[mes_curr] = round(cota_prev * (1 + r), 8)

    # ── 8. Salvar no Firestore ────────────────────────────────────────────────
    print("Salvando no Firestore...")
    hist_col = db.collection(f"users/{USER_UID}/historico")

    for doc in hist_col.stream():   # limpar dados anteriores
        doc.reference.delete()

    salvos = 0
    for mes in todos_meses:
        pat  = patrimonio_mes.get(mes, 0)
        cst  = custo_mes.get(mes, 0)
        prov = prov_acum.get(mes, 0)
        cst_liq = max(cst - prov, 0)
        if pat <= 0 and cst <= 0:
            continue
        hist_col.document(mes).set({
            "mes":              mes,
            "patrimonio":       pat,
            "custo":            round(cst_liq, 2),
            "custo_bruto":      round(cst, 2),
            "custo_rastreavel": round(custo_rastreavel_mes.get(mes, cst), 2),
            "proventos_acum":   round(prov, 2),
            "cota":             cota_por_mes.get(mes),
            "ibov":             ibov_hist.get(mes),
            "cdi_fator":        round(cdi_mensal.get(mes, 1.0), 8),
        })
        salvos += 1

    print(f"\n{salvos} meses gravados no Firestore.")
    print("Concluido! Atualize o navegador para ver os graficos.")
    input("Pressione Enter para fechar...")


if __name__ == "__main__":
    sync()
