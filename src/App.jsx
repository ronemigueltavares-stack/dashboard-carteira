import { AuthProvider, useAuth } from './AuthContext'
import Login from './Login'
import Layout from './Layout'

function AppRoutes() {
  const user = useAuth()
  return user ? <Layout /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
