import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ApiProvider from './components/ApiProvider'

createRoot(document.getElementById('root')!).render(
    <ApiProvider><App /></ApiProvider>
)
