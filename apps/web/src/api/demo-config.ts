import { DemoConfigSchema } from '@deadspace/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export const fetchDemoConfig = () => apiFetch('/api/demo-config', DemoConfigSchema);

/**
 * Whether the API accepts new truck and warehouse listings. `undefined` while loading or if the config
 * can't be fetched: the forms then behave normally and rely on the API's own FEATURE_DISABLED answer.
 */
export function useListingCreationEnabled(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['demo-config'],
    queryFn: fetchDemoConfig,
    staleTime: Infinity,
    retry: false,
  });
  return data?.listingCreationEnabled;
}
