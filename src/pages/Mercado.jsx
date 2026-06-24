import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'

const ORDEM = ['^BVSP', '^GSPC', 'IFIX', 'BTCBRL', 'USDBRL=X', 'BZ=F', 'TIO=F', 'GC=F']

function fmtPreco(ticker, preco) {
  if (preco == null) return '—'
  if (ticker === '^BVSP' || ticker === 'IFIX') return preco.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (ticker === '^GSPC') return preco.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (ticker === 'BTCBRL') return preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
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

// ── Squarify ──────────────────────────────────────────────────────────────
function squarify(items, X, Y, Wd, Hd) {
  const sorted = items.slice().sort((a, b) => b.value - a.value)
  const total = sorted.reduce((t, i) => t + i.value, 0)
  if (total <= 0 || Wd <= 0 || Hd <= 0) { sorted.forEach(i => { i._x = X; i._y = Y; i._w = 0; i._h = 0 }); return sorted }
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
    let side = Math.min(w, h); if (side <= 0) side = Math.max(w, h) || 1
    const row = [areas[idx]]; const start = idx; idx++
    while (idx < areas.length) { if (worst([...row, areas[idx]], side) <= worst(row, side)) { row.push(areas[idx]); idx++ } else break }
    const rowSum = row.reduce((t, v) => t + v, 0)
    if (w >= h) {
      const cw = Math.min(rowSum / h, w); let cy = y
      for (let k = 0; k < row.length; k++) { sorted[start+k]._x=x; sorted[start+k]._y=cy; sorted[start+k]._w=cw; sorted[start+k]._h=cw>0?row[k]/cw:0; cy+=sorted[start+k]._h }
      x += cw; w -= cw
    } else {
      const rh = Math.min(rowSum / w, h); let cx = x
      for (let k = 0; k < row.length; k++) { sorted[start+k]._x=cx; sorted[start+k]._y=y; sorted[start+k]._w=rh>0?row[k]/rh:0; sorted[start+k]._h=rh; cx+=sorted[start+k]._w }
      y += rh; h -= rh
    }
  }
  return sorted
}

function dColor(p) {
  if (p == null) return '#3a4150'
  if (p <= -2) return '#7a241c'; if (p <= -1) return '#9e3327'; if (p < -0.15) return '#bf5446'
  if (p <= 0.15) return '#3a4150'; if (p < 1) return '#2f8f68'; if (p < 2) return '#1d9e75'; return '#13855a'
}

const CLASSE_LABEL = { Acao: 'Ações', FII: 'FIIs', ETF: 'ETFs', BDR: 'BDRs', RF: 'Renda Fixa' }
const CLASSE_COR   = { Acao: 'var(--blue)', FII: 'var(--teal)', ETF: 'var(--purple)', BDR: 'var(--coral)', RF: 'var(--gray)' }

// ── Sparkline com área preenchida (estilo Google Finance) ────────────────
function hashStr(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; return h
}
function mkRng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff } }

function Sparkline({ ticker, historico, pm, cotacao }) {
  const real = (historico || []).filter(v => v != null && v > 0)
  let pts
  if (real.length > 1) {
    pts = real
  } else {
    // simula trajetória PM → cotação atual
    const end = cotacao || pm || 1
    const start = pm || end
    const r = mkRng(hashStr(ticker) + 9)
    const amp = Math.abs(end - start) || end * 0.02
    const sim = []
    for (let i = 0; i < 22; i++) {
      const t = i / 21
      sim.push(start + (end - start) * t + (r() - 0.5) * amp * 0.9)
    }
    sim[0] = start; sim[21] = end
    pts = sim
  }

  const mn = Math.min(...pts), mx = Math.max(...pts)
  const rg = (mx - mn) || Math.abs(pts[0]) * 0.01 || 1
  const W = 88, H = 30, P = 3, n = pts.length
  const X = i => P + (i / (n - 1)) * (W - 2 * P)
  const Y = v => H - P - ((v - mn) / rg) * (H - 2 * P)
  const up = pts[n - 1] >= pts[0]
  const col = up ? '#3ecf8e' : '#f0686b'
  const gid = `sg${ticker.replace(/[^a-z0-9]/gi, '')}`
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${X(n-1).toFixed(1)} ${H - P} L${X(0).toFixed(1)} ${H - P} Z`

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.4" />
          <stop offset="100%" stopColor={col} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <clipPath id={`clip${gid}`}>
        <rect x="0" y="0" width={W} height={H} />
      </clipPath>
      <g clipPath={`url(#clip${gid})`}>
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <circle cx={X(n-1).toFixed(1)} cy={Y(pts[n-1]).toFixed(1)} r="2.5" fill={col} />
    </svg>
  )
}

// ── Cabeçalho ordenável com setas empilhadas ──────────────────────────────
function ColHeader({ label, col, sortCol, sortDir, onSort, align = 'right' }) {
  const active = sortCol === col
  const upActive   = active && sortDir === -1  // menor primeiro = seta para cima
  const downActive = active && sortDir === 1   // maior primeiro = seta para baixo

  return (
    <div
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer', userSelect: 'none',
        display: 'flex', alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 5,
      }}
    >
      <span style={{ fontSize: 10, color: active ? 'var(--text)' : 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 0 }}>
        <span style={{ fontSize: 10, lineHeight: '10px', color: upActive ? 'var(--text)' : 'rgba(255,255,255,0.22)' }}>▲</span>
        <span style={{ fontSize: 10, lineHeight: '10px', color: downActive ? 'var(--text)' : 'rgba(255,255,255,0.22)' }}>▼</span>
      </div>
    </div>
  )
}

// ── Treemap de variação do dia ────────────────────────────────────────────
function TreemapVariacao({ posicoes, brapi }) {
  const { tiles, sectorLabels, top, bot } = useMemo(() => {
    if (posicoes.length === 0) return { tiles: [], sectorLabels: [], top: null, bot: null }
    const byClasse = {}
    posicoes.forEach(p => { const c = p.classe || 'Acao'; (byClasse[c] = byClasse[c] || []).push(p) })
    // tamanho = proporção do patrimônio de cada ativo na carteira
    const setores = Object.keys(byClasse).map(c => ({
      value: byClasse[c].reduce((t, p) => t + (p.patrimonio || 0), 0),
      classe: c, ativos: byClasse[c],
    }))
    const tiles = [], sectorLabels = []
    squarify(setores, 0, 0, 100, 100).forEach(sr => {
      const aitems = sr.ativos.map(a => ({ value: a.patrimonio || 0, ref: a }))
      squarify(aitems, sr._x, sr._y, sr._w, sr._h).forEach(ar => {
        const a = ar.ref
        tiles.push({ x:ar._x, y:ar._y, w:ar._w, h:ar._h, ticker:a.ticker, segmento:a.segmento, patrimonio:a.patrimonio, variacaoDia: brapi[a.ticker]?.variacaoDia ?? null })
      })
      if (sr._w > 14 && sr._h > 9) sectorLabels.push({ x: sr._x, y: sr._y, label: CLASSE_LABEL[sr.classe] || sr.classe })
    })
    const comVar = posicoes.filter(p => brapi[p.ticker]?.variacaoDia != null).sort((a,b) => (brapi[b.ticker].variacaoDia||0)-(brapi[a.ticker].variacaoDia||0))
    const top = comVar[0] ? { ticker: comVar[0].ticker, v: brapi[comVar[0].ticker].variacaoDia } : null
    const bot = comVar[comVar.length-1] ? { ticker: comVar[comVar.length-1].ticker, v: brapi[comVar[comVar.length-1].ticker].variacaoDia } : null
    return { tiles, sectorLabels, top, bot }
  }, [posicoes, brapi])

  if (posicoes.length === 0) return null
  const temVar = Object.keys(brapi).length > 0

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', flexWrap:'wrap', gap:8, marginBottom:4 }}>
        <div style={{ fontSize:13, fontWeight:600 }}>Variação do Dia</div>
        {top && bot && (
          <div style={{ fontSize:11, color:'var(--dim)' }}>
            maior alta: <span style={{ color:'var(--pos)' }}>{top.ticker} +{top.v.toFixed(2)}%</span>
            {' · '}
            maior baixa: <span style={{ color:'var(--neg)' }}>{bot.ticker} {bot.v.toFixed(2)}%</span>
          </div>
        )}
      </div>
      <div style={{ fontSize:11, color:'var(--dim)', marginBottom:10 }}>
        tamanho = proporção na carteira · cor = variação do dia · agrupado por classe
        {!temVar && <span style={{ color:'var(--mut)', marginLeft:6 }}>· rode python sync_mercado.py para colorir</span>}
      </div>
      <div style={{ position:'relative', width:'100%', height:380, borderRadius:8, overflow:'hidden' }}>
        {tiles.map((tile, i) => {
          const v = tile.variacaoDia; const sinal=(v||0)>=0?'+':''; const arrow=(v||0)>=0?'▲':'▼'
          const showPct = tile.h>7.5&&tile.w>5; const showVal = tile.h>12&&tile.w>7
          return (
            <div key={i}
              title={`${tile.ticker}${tile.segmento?' · '+tile.segmento:''} · ${v!=null?sinal+v.toFixed(2)+'%':'aguardando'} · R$ ${(tile.patrimonio||0).toLocaleString('pt-BR',{maximumFractionDigits:0})}`}
              style={{ position:'absolute', left:`${tile.x}%`, top:`${tile.y}%`, width:`${tile.w}%`, height:`${tile.h}%`, background:dColor(v), boxSizing:'border-box', border:'1px solid var(--bg)', overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'center', padding:'4px 7px', color:'#fff', cursor:'default', transition:'background 0.4s' }}>
              <div style={{ fontSize:11, fontWeight:600, lineHeight:1.15 }}>{tile.ticker}</div>
              {showPct&&v!=null&&<div style={{ fontSize:11, fontWeight:500, lineHeight:1.2, opacity:.95 }}>{arrow} {sinal}{v.toFixed(2)}%</div>}
              {showVal&&<div style={{ fontSize:11, lineHeight:1.2, opacity:.72 }}>R$ {(tile.patrimonio||0).toLocaleString('pt-BR',{maximumFractionDigits:0})}</div>}
            </div>
          )
        })}
        {sectorLabels.map((sl, i) => (
          <div key={`sl-${i}`} style={{ position:'absolute', left:`${sl.x}%`, top:`${sl.y}%`, pointerEvents:'none', zIndex:2, fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.55)', padding:'3px 6px', textShadow:'0 1px 2px rgba(0,0,0,0.55)' }}>{sl.label}</div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:10, color:'var(--dim)', marginRight:4 }}>escala:</span>
        {[['≤−2%','#7a241c'],['−2%→−1%','#9e3327'],['−1%→−0.15%','#bf5446'],['neutro','#3a4150'],['+0.15%→+1%','#2f8f68'],['+1%→+2%','#1d9e75'],['≥+2%','#13855a']].map(([lbl,cor])=>(
          <div key={lbl} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:cor }} />
            <span style={{ fontSize:10, color:'var(--dim)' }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Lista de ativos ───────────────────────────────────────────────────────
const COLS_GRID = 'minmax(110px,1.5fr) 52px minmax(90px,1fr) 82px 82px 90px 82px 96px'

function varMes(historico) {
  const h = (historico || []).filter(v => v != null && v > 0)
  if (h.length < 2) return null
  return (h[h.length - 1] - h[0]) / h[0] * 100
}

function ListaAtivos({ posicoes, brapi }) {
  const [sortCol, setSortCol] = useState('patrimonio')
  const [sortDir, setSortDir] = useState(1) // 1 = maior primeiro, -1 = menor primeiro

  function toggleSort(col) {
    if (sortCol === col) { setSortDir(d => -d) } else { setSortCol(col); setSortDir(1) }
  }

  const linhas = useMemo(() => {
    const arr = posicoes.map(p => ({
      ...p,
      _preco:  brapi[p.ticker]?.preco ?? p.cotacao ?? 0,
      _varDia: brapi[p.ticker]?.variacaoDia ?? null,
      _hist:   brapi[p.ticker]?.historico ?? null,
      _rent:   p.rentabilidadePct != null ? p.rentabilidadePct * 100 : null,
      _mes:    varMes(brapi[p.ticker]?.historico),
    }))
    return arr.sort((a, b) => {
      if (sortCol === 'ticker')   return sortDir * a.ticker.localeCompare(b.ticker)
      if (sortCol === 'segmento') return sortDir * (a.segmento||'').localeCompare(b.segmento||'')
      let va, vb
      if      (sortCol === 'pm')      { va = a.pm     || 0;           vb = b.pm     || 0 }
      else if (sortCol === 'cotacao') { va = a._preco;                vb = b._preco }
      else if (sortCol === 'rent')    { va = a._rent   ?? -Infinity;  vb = b._rent   ?? -Infinity }
      else if (sortCol === 'varDia')  { va = a._varDia ?? -Infinity;  vb = b._varDia ?? -Infinity }
      else if (sortCol === 'mes')     { va = a._mes    ?? -Infinity;  vb = b._mes    ?? -Infinity }
      else                            { va = a.patrimonio || 0;       vb = b.patrimonio || 0 }
      return sortDir * (vb - va)
    })
  }, [posicoes, brapi, sortCol, sortDir])

  if (posicoes.length === 0) return null

  const sh = (lbl, col, align) => <ColHeader label={lbl} col={col} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} align={align} />

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 4px' }}>
      <div style={{ fontSize:13, fontWeight:600, marginBottom:14 }}>Ativos</div>
      <div style={{ overflowX:'auto' }}>
        {/* Cabeçalho */}
        <div style={{ display:'grid', gridTemplateColumns:COLS_GRID, gap:12, minWidth:750, padding:'0 4px 10px', borderBottom:'0.5px solid var(--border)' }}>
          {sh('Ativo',   'ticker',  'left')}
          <div />
          {sh('Segmento','segmento','left')}
          {sh('PM',      'pm',      'right')}
          {sh('Cotação', 'cotacao', 'right')}
          {sh('Rent.',   'rent',    'right')}
          {sh('Mês',     'mes',     'right')}
          <div style={{ fontSize:10, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>30d</div>
        </div>

        {/* Linhas */}
        {linhas.map(p => {
          const rentCor = p._rent == null ? 'var(--text)' : p._rent >= 0 ? 'var(--pos)' : 'var(--neg)'
          const mesCor  = p._mes  == null ? 'var(--text)' : p._mes  >= 0 ? 'var(--pos)' : 'var(--neg)'
          return (
            <div key={p.ticker} style={{ display:'grid', gridTemplateColumns:COLS_GRID, gap:12, minWidth:750, padding:'10px 4px', borderBottom:'0.5px solid var(--border)', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>{p.ticker}</div>
                {p._varDia != null && (
                  <div style={{ fontSize:11, color:p._varDia>=0?'var(--pos)':'var(--neg)' }}>
                    {p._varDia>=0?'+':''}{p._varDia.toFixed(2)}% hoje
                  </div>
                )}
              </div>
              <div style={{ fontSize:11, fontWeight:600, color:CLASSE_COR[p.classe]||'var(--mut)' }}>
                {p.classe==='Acao'?'Ação':p.classe||'—'}
              </div>
              <div style={{ fontSize:12, color:'var(--mut)' }}>{p.segmento||'—'}</div>
              <div style={{ fontSize:12, textAlign:'right' }}>
                R$ {(p.pm||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
              </div>
              <div style={{ fontSize:12, textAlign:'right' }}>
                {p._preco ? `R$ ${p._preco.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:rentCor, textAlign:'right' }}>
                {p._rent != null ? `${p._rent>=0?'▲ +':'▼ '}${Math.abs(p._rent).toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:mesCor, textAlign:'right' }}>
                {p._mes != null ? `${p._mes>=0?'▲ +':'▼ '}${Math.abs(p._mes).toFixed(2)}%` : '—'}
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <Sparkline ticker={p.ticker} historico={p._hist} pm={p.pm} cotacao={p._preco} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Página Mercado ────────────────────────────────────────────────────────
export default function Mercado() {
  const user = useAuth()
  const [indices,    setIndices]    = useState([])
  const [posicoes,   setPosicoes]   = useState([])
  const [brapi,      setBrapi]      = useState({})
  const [atualizado, setAtualizado] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'mercado'), snap => {
      const dados = snap.docs.map(d => d.data()).sort((a,b) => ORDEM.indexOf(a.ticker)-ORDEM.indexOf(b.ticker))
      setIndices(dados); setCarregando(false)
      const dt = dados[0]?.atualizadoEm?.toDate?.(); if (dt) setAtualizado(dt)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `users/${user.uid}/posicoes`), snap => {
      setPosicoes(snap.docs.map(d => d.data()).filter(p => (p.qtd||0)>0 && (p.patrimonio||0)>0))
    })
    return unsub
  }, [user.uid])

  // Cotacoes dos ativos — lidas do Firestore (gravadas pelo sync_mercado.py via yfinance)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, `users/${user.uid}/cotacoes`), snap => {
      const map = {}
      snap.docs.forEach(d => {
        const c = d.data()
        if (c.ticker) map[c.ticker] = { variacaoDia: c.variacaoDia ?? null, preco: c.preco ?? null, historico: c.historico ?? null }
      })
      setBrapi(map)
    })
    return unsub
  }, [user.uid])

  if (carregando) return <div style={{ color:'var(--dim)', textAlign:'center', padding:40 }}>Carregando...</div>

  if (indices.length === 0) return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:40, textAlign:'center' }}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Nenhum dado de mercado ainda</div>
      <div style={{ fontSize:13, color:'var(--mut)', marginBottom:16 }}>Execute o script abaixo para carregar os índices:</div>
      <code style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid var(--border)', borderRadius:8, padding:'8px 16px', fontSize:13, color:'var(--teal)' }}>python sync_mercado.py</code>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Cards de índices */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${indices.length},1fr)`, gap:10, overflowX:'auto' }}>
        {indices.map(idx => {
          const pos=(idx.variacaoDia||0)>=0; const cor=pos?'var(--pos)':'var(--neg)'; const sinal=pos?'+':''
          return (
            <div key={idx.ticker} style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderTop:`2px solid ${cor}`, borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, color:'var(--mut)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>{idx.nome}</div>
              <div style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.01em', marginBottom:2 }}>{fmtPreco(idx.ticker,idx.preco)}</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:13, fontWeight:600, color:cor }}>{sinal}{(idx.variacaoDia||0).toFixed(2)}%</span>
                <span style={{ fontSize:10, color:'var(--dim)' }}>{unidade(idx.ticker)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <TreemapVariacao posicoes={posicoes} brapi={brapi} />
      <ListaAtivos     posicoes={posicoes} brapi={brapi} />

      {atualizado && (
        <div style={{ fontSize:11, color:'var(--dim)', textAlign:'right' }}>
          Dados de {atualizado.toLocaleString('pt-BR')} · atualize rodando{' '}
          <code style={{ color:'var(--mut)' }}>python sync_mercado.py</code>
        </div>
      )}
    </div>
  )
}
