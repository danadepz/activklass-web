import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { firebaseConfigured } from './lib/firebase'
import SetupRequired from './components/SetupRequired'
import { AuthProvider } from './context/AuthContext'
import DialogHost from './components/ui/DialogHost'
import Toaster from './components/ui/Toaster'
import App from './App.jsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {firebaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
            {/* Both are singletons driven by module-level stores, so any file
                can call confirmDialog()/toast() without threading a provider
                through. They sit inside the router only so a dialog opened
                during a navigation is not unmounted by it. */}
            <DialogHost />
            <Toaster />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <SetupRequired />
    )}
  </StrictMode>,
)
