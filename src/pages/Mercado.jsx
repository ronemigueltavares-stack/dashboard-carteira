import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'

const ORDEM = ['^BVSP', '^GSPC', 'IFIX', 'BTCBRL', 'USDBRL=X', 'BZ=F', 'TIO=F', 'GC=F']

function fmtPreco(ticker, preco) {
  if (preco == null) return '—'
  if (ticker === '^BVSP' || ticker === 'IFIX') {
    return preco.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  }
  if (ticker === '^GSPC') {
    return preco.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  if (ticker === 'BTCBRL') {
    return preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  }
  return preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function unidade(ticker) {
  if (ticker === '^BVSP' || ticker === 'IFIX') return 'pts'
  if (ticker === '^GSPC') return 'pts'
  if (ticker === 'USDBRL=X') return 'R$/USD'
  if (ticker === 'GC=F') return 'USD/oz'
  if (ticker === 'BZ=F') return 'USD/bbl'
  if (ticker === 'TIO=F') return 'USD/t'
  return ''
}

// ── Squarify (treemap layout) ─────────────────────────────────────────────
function squarify(items, X, Y, Wd, Hd) {
  const sorted = items.slice().sort((a, b) => b.value - a.value)
  const total = sorted.reduce((t, i) => t + i.value, 0)
  if (total <= 0 || Wd <= 0 || Hd <= 0) {
    sorted.forEach(i => { i._x = X; i._y = Y; i._w = 0; i._h = 0 })
    return sorted
  }
  const scale = (Wd * Hd) / total
  const areas = sorted.map(i => i.value * scale)
  let x = X, y = Y, w = Wd, h = Hd, idx = 0

  function worst(row, side) {
    if (!row.length) return Infinity
    let s = 0, mx = -Infinity, mn = Infinity
    row.forEach(v => { s += v; if (v > mx) mx = v; if (v < mn) mn = v })
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn))
  }

  while (idx < areas.length) {
    let side = Math.min(w, h)
    if (side <= 0) side = Math.max(w, h) || 1
    const row = [areas[idx]]
    const start = idx
    idx++
    while (idx < areas.length) {
      if (worst([...row, areas[idx]], side) <= worst(row, side)) {
        row.push(areas[idx]); idx++
      } else break
    }
    const rowSum = row.reduce((t, v) => t + v, 0)
    if (w >= h) {
      const cw = Math.min(rowSum / h, w)
      let cy = y
      for (let k = 0; k < row.length; k++) {
        sorted[start + k]._x = x; sorted[start + k]._y = cy
        sorted[start + k]._w = cw; sorted[start + k]._h = cw > 0 ? row[k] / cw : 0
        cy += sorted[start + k]._h
      }
      x += cw; w -= cw
    } else {
      const rh = Math.min(rowSum / w, h)
      let cx = x
      for (let k = 0; k < row.length; k++) {
        sorted[start + k]._x = cx; sorted[start + k]._y = y
        sorted[start + k]._w = rh > 0 ? row[k] / rh : 0; sorted[start + k]._h = rh
        cx += sorted[start + k]._w
      }
      y += rh; h -= rh
    }
  }
  return sorted
}

function dColor(p) {
  if (p == null) return '#3a4150'
  if (p <= -2) return '#7a241c'
  if (p <= -1) return '#9e3327'
  if (p < -0.15) return '#bf5446'
  if (p <= 0.15) return '#3a4150'
  if (p < 1) return '#2f8f68'
  if (p < 2) return '#1d9e75'
  return '#13855a'
}

const CLASSE_LABEL = { Acao: 'Ações', FII: 'FIIs', ETF: 'ETFs', BDR: 'BDRs', RF: 'Renda Fixa' }

// ── Treemap de variação do dia ────────────────────────────────────────────
function TreemapVariacao() {
  const user = useAuth()
  const [posicoes, setPosicoes] = useState([])
  const [variacoes, setVariacoes] = useState({})
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `users/${user.uid}/posicoes`), snap => {
      const pos = snap.docs
        .map(d => d.data())
        .filter(p => (p.qtd || 0) > 0 && (p.patrimonio || 0) > 0)
      setPosicoes(pos)
      setCarregando(false)
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    if (posicoes.length === 0) return
    const token = import.meta.env.VITE_BRAPI_TOKEN
    if (!token) return
    const tickers = posicoes.map(p => p.ticker).join(',')
    fetch(`https://brapi.dev/api/quote/${tickers}?token=${token}`)
      .then(r => r.json())
      .then(data => {
        const map = {}
        ;(data.results || []).forEach(r => {
          if (r.regularMarketChangePercent != null) map[r.symbol] = r.regularMarketChangePercent
        })
        setVariacoes(map)
      })
      .catch(() => {})
  }, [posicoes])

  const { tiles, sectorLabels, top, bot } = useMemo(() => {
    if (posicoes.length === 0) return { tiles: [], sectorLabels: [], top: null, bot: null }

    const byClasse = {}
    posicoes.forEach(p => {
      const c = p.classe || 'Acao'
      ;(byClasse[c] = byClasse[c] || []).push(p)
    })

    const setores = Object.keys(byClasse).map(c => ({
      value: byClasse[c].reduce((t, p) => t + (p.patrimonio || 0), 0),
      classe: c,
      ativos: byClasse[c],
    }))

    const tiles = []
    const sectorLabels = []

    squarify(setores, 0, 0, 100, 100).forEach(sr => {
      const aitems = sr.ativos.map(a => ({ value: a.patrimonio || 0, ref: a }))
      squarify(aitems, sr._x, sr._y, sr._w, sr._h).forEach(ar => {
        const a = ar.ref
        tiles.push({
          x: ar._x, y: ar._y, w: ar._w, h: ar._h,
          ticker: a.ticker,
          segmento: a.segmento,
          patrimonio: a.patrimonio,
          variacaoDia: variacoes[a.ticker] ?? null,
        })
      })
      if (sr._w > 14 && sr._h > 9) {
        sectorLabels.push({ x: sr._x, y: sr._y, label: CLASSE_LABEL[sr.classe] || sr.classe })
      }
    })

    const comVar = posicoes
      .filter(p => variacoes[p.ticker] != null)
      .sort((a, b) => (variacoes[b.ticker] || 0) - (variacoes[a.ticker] || 0))
    const top = comVar[0] ? { ticker: comVar[0].ticker, v: variacoes[comVar[0].ticker] } : null
    const bot = comVar[comVar.length - 1] ? { ticker: comVar[comVar.length - 1].ticker, v: variacoes[comVar[comVar.length - 1].ticker] } : null

    return { tiles, sectorLabels, top, bot }
  }, [posicoes, variacoes])

  if (carregando) return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 24, color: 'var(--dim)', textAlign: 'center' }}>
      Carregando posições...
    </div>
  )
  if (posicoes.length === 0) return null

  const temVariacao = Object.keys(variacoes).length > 0

  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 18px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Variação do Dia</div>
        {top && bot && (
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
            maior alta: <span style={{ color: 'var(--pos)' }}>{top.ticker} +{top.v.toFixed(2)}%</span>
            {' · '}
            maior baixa: <span style={{ color: 'var(--neg)' }}>{bot.ticker} {bot.v.toFixed(2)}%</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10 }}>
        tamanho = valor de mercado (qtd × cotação) · cor = variação do dia · agrupado por classe
        {!temVariacao && (
          <span style={{ color: 'var(--mut)', marginLeft: 6 }}>· aguardando cotações ao vivo...</span>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', height: 380, borderRadius: 8, overflow: 'hidden' }}>
        {tiles.map((tile, i) => {
          const v = tile.variacaoDia
          const sinal = (v || 0) >= 0 ? '+' : ''
          const arrow = (v || 0) >= 0 ? '▲' : '▼'
          const showPct = tile.h > 7.5 && tile.w > 5
          const showVal = tile.h > 12 && tile.w > 7
          return (
            <div
              key={i}
              title={`${tile.ticker}${tile.segmento ? ' · ' + tile.segmento : ''} · ${v != null ? sinal + v.toFixed(2) + '%' : 'aguardando'} · R$ ${(tile.patrimonio || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
              style={{
                position: 'absolute',
                left: `${tile.x}%`, top: `${tile.y}%`,
                width: `${tile.w}%`, height: `${tile.h}%`,
                background: dColor(v),
                boxSizing: 'border-box',
                border: '1px solid var(--bg)',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                padding: '4px 7px', color: '#fff', cursor: 'default',
                transition: 'background 0.4s',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.15 }}>{tile.ticker}</div>
              {showPct && v != null && (
                <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.2, opacity: 0.95 }}>
                  {arrow} {sinal}{v.toFixed(2)}%
                </div>
              )}
              {showVal && tile.patrimonio != null && (
                <div style={{ fontSize: 11, lineHeight: 1.2, opacity: 0.72 }}>
                  R$ {tile.patrimonio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
          )
        })}
        {sectorLabels.map((sl, i) => (
          <div
            key={`sl-${i}`}
            style={{
              position: 'absolute', left: `${sl.x}%`, top: `${sl.y}%`,
              pointerEvents: 'none', zIndex: 2,
              fontSize: 11, fontWeight: 500,
              color: 'rgba(255,255,255,0.55)',
              padding: '3px 6px',
              textShadow: '0 1px 2px rgba(0,0,0,0.55)',
            }}
          >
            {sl.label}
          </div>
        ))}
      </div>

      {/* Legenda de cores */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--dim)', marginRight: 4 }}>escala:</span>
        {[
          { label: '≤ −2%', color: '#7a241c' },
          { label: '−2% a −1%', color: '#9e3327' },
          { label: '−1% a −0.15%', color: '#bf5446' },
          { label: 'neutro', color: '#3a4150' },
          { label: '+0.15% a +1%', color: '#2f8f68' },
          { label: '+1% a +2%', color: '#1d9e75' },
          { label: '≥ +2%', color: '#13855a' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontSize: 10, color: 'var(--dim)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Página Mercado ────────────────────────────────────────────────────────
export default function Mercado() {
  const [indices, setIndices] = useState([])
  const [atualizado, setAtualizado] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'mercado'), snap => {
      const dados = snap.docs.map(d => d.data())
      dados.sort((a, b) => ORDEM.indexOf(a.ticker) - ORDEM.indexOf(b.ticker))
      setIndices(dados)
      setCarregando(false)
      const dt = dados[0]?.atualizadoEm?.toDate?.()
      if (dt) setAtualizado(dt)
    })
    return unsub
  }, [])

  if (carregando) return (
    <div style={{ color: 'var(--dim)', textAlign: 'center', padding: 40 }}>Carregando...</div>
  )

  if (indices.length === 0) return (
    <div style={{
      background: 'var(--card)', border: '0.5px solid var(--border)',
      borderRadius: 14, padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Nenhum dado de mercado ainda</div>
      <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 16 }}>
        Execute o script abaixo para carregar os índices:
      </div>
      <code style={{
        background: 'rgba(255,255,255,0.06)', border: '0.5px solid var(--border)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--teal)',
      }}>
        python sync_mercado.py
      </code>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Cards de índices */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${indices.length}, 1fr)`,
        gap: 10,
        overflowX: 'auto',
      }}>
        {indices.map(idx => {
          const positivo = (idx.variacaoDia || 0) >= 0
          const cor = positivo ? 'var(--pos)' : 'var(--neg)'
          const sinal = positivo ? '+' : ''
          return (
            <div key={idx.ticker} style={{
              background: 'var(--card)',
              border: `0.5px solid var(--border)`,
              borderTop: `2px solid ${cor}`,
              borderRadius: 12,
              padding: '14px 16px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {idx.nome}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 2 }}>
                {fmtPreco(idx.ticker, idx.preco)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: cor }}>
                  {sinal}{(idx.variacaoDia || 0).toFixed(2)}%
                </span>
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>
                  {unidade(idx.ticker)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Treemap de variação do dia */}
      <TreemapVariacao />

      {/* Rodapé: quando foi atualizado */}
      {atualizado && (
        <div style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}>
          Dados de {atualizado.toLocaleString('pt-BR')} · atualize rodando{' '}
          <code style={{ color: 'var(--mut)' }}>python sync_mercado.py</code>
        </div>
      )}

    </div>
  )
}
