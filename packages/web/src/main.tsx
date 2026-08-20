import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RestoreState } from '@workbench/sync/contract';
import { App } from './App';
import './index.css';

function handleGlobalError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const err = error as {
      status?: number;
      state?: string;
      step?: string;
      message?: string;
      error?: string;
    };
    if (err.status === 503 || (err.state && err.state !== 'idle')) {
      const restoreState: RestoreState = {
        state: (err.state as RestoreState['state']) || 'restoring',
        step: err.step,
        message: err.message || err.error,
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('workbench:restore-state', { detail: restoreState }));
      }
    }
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleGlobalError,
  }),
  mutationCache: new MutationCache({
    onError: handleGlobalError,
  }),
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

const root = document.getElementById('root');
if (root === null) throw new Error('找不到 #root 挂载点');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
