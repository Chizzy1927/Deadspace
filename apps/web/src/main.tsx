import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { App } from './App';
import './index.css';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { StorageMatchesPage } from './pages/StorageMatchesPage';
import { StorageRequestPage } from './pages/StorageRequestPage';
import { TransportMatchesPage } from './pages/TransportMatchesPage';
import { TransportRequestPage } from './pages/TransportRequestPage';
import { TruckLegConfirmationPage } from './pages/TruckLegConfirmationPage';
import { TruckLegListingPage } from './pages/TruckLegListingPage';
import { WarehouseSpaceConfirmationPage } from './pages/WarehouseSpaceConfirmationPage';
import { WarehouseSpaceListingPage } from './pages/WarehouseSpaceListingPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'request/transport', element: <TransportRequestPage /> },
      { path: 'requests/transport/:id/matches', element: <TransportMatchesPage /> },
      { path: 'list/truck', element: <TruckLegListingPage /> },
      { path: 'listings/truck/:id', element: <TruckLegConfirmationPage /> },
      { path: 'request/storage', element: <StorageRequestPage /> },
      { path: 'requests/storage/:id/matches', element: <StorageMatchesPage /> },
      { path: 'list/warehouse', element: <WarehouseSpaceListingPage /> },
      { path: 'listings/warehouse/:id', element: <WarehouseSpaceConfirmationPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (e.g. 404) won't change on retry; network and 5xx errors get one retry.
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
