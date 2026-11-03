import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ProveedorAvisos } from './components/ui';
import './lib/telegram'; // antes que el router: lee los datos con los que Telegram abre la app
import App from './App';
import './index.css';

const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <ProveedorAvisos>
          <App />
        </ProveedorAvisos>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
