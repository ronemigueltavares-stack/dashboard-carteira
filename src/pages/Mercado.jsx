import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

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
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
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
