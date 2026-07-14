import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/query-keys';
import { configApi } from '@/api/resources';

/** 公开站点配置：注册模式 / 域名 / 站点标题。长期缓存。 */
export function usePublicConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => configApi.getPublic(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
