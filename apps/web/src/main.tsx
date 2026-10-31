import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { App } from './App';
import { ContainedLayout } from './components/ContainedLayout';
import './index.css';
import { LandingPage } from './pages/LandingPage';
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
      { index: true, element: <LandingPage />, handle: { title: 'Spare truck space and idle warehouse space' } },
      {
        element: <ContainedLayout />,
        children: [
          { path: 'request/transport', element: <TransportRequestPage />, handle: { title: 'Request transport' } },
          {
            path: 'requests/transport/:id/matches',
            element: <TransportMatchesPage />,
            handle: { title: 'Transport matches' },
          },
          { path: 'list/truck', element: <TruckLegListingPage />, handle: { title: 'List a truck leg' } },
          { path: 'listings/truck/:id', element: <TruckLegConfirmationPage />, handle: { title: 'Truck leg listed' } },
          { path: 'request/storage', element: <StorageRequestPage />, handle: { title: 'Request storage' } },
          {
            path: 'requests/storage/:id/matches',
            element: <StorageMatchesPage />,
            handle: { title: 'Storage matches' },
          },
          { path: 'list/warehouse', element: <WarehouseSpaceListingPage />, handle: { title: 'List warehouse space' } },
          {
            path: 'listings/warehouse/:id',
            element: <WarehouseSpaceConfirmationPage />,
            handle: { title: 'Warehouse space listed' },
          },
          { path: '*', element: <NotFoundPage />, handle: { title: 'Page not found' } },
        ],
      },
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
