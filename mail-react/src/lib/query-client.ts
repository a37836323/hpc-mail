import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.code >= 400 && error.code < 500)) return false
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
    },
  },
})
