import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { useAuth } from './AuthContext'

export default function Layout() {
  const [aba, setAba] = useState('carteira')
  const user = useAuth()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 22px 60px' }}>

        {/* Cabeçalho */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, var(--teal), var(--blue))',
              flexShrink: 0,
            }} />
            <div>
              <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>
                Minha Carteira
              </h1>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                B3 · Ações, FIIs, ETFs, BDRs
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--border2)' }}
              />
            ) : (
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--teal), var(--blue))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, color: '#fff',
              }}>
                {user?.displayName?.charAt(0) ?? '?'}
              </div>
            )}
            <button
              onClick={() => signOut(auth)}
              style={{
                background: 'transparent',
                border: '0.5px solid var(--border2)',
                color: 'var(--mut)',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Sair
            </button>
          </div>
        </header>

        {/* Abas */}
        <nav style={{
          display: 'flex', gap: 4, margin: '14px 0 22px',
          borderBottom: '0.5px solid var(--border)',
        }}>
          {['carteira', 'mercado'].map(tab => (
            <button
              key={tab}
              onClick={() => setAba(tab)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: aba === tab ? '2px solid var(--teal)' : '2px solid transparent',
                color: aba === tab ? 'var(--text)' : 'var(--mut)',
                fontSize: 14,
                fontWeight: 500,
                padding: '10px 14px',
                cursor: 'pointer',
                marginBottom: -1,
                textTransform: 'capitalize',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {/* Conteúdo das abas */}
        {aba === 'carteira' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 300, color: 'var(--dim)', fontSize: 14,
          }}>
            Página Carteira — em construção
          </div>
        )}

        {aba === 'mercado' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 300, color: 'var(--dim)', fontSize: 14,
          }}>
            Página Mercado — em construção
          </div>
        )}

      </div>
    </div>
  )
}
