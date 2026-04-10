import { useState, useEffect, useCallback } from 'react';

export function useApi<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    // Only show loading spinner on initial fetch (when no data yet)
    // Background refetches update data silently without flashing
    setError(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    refetch();
  }, [refetch, ...deps]);

  return { data, loading, error, refetch };
}

export function useMutation<TBody = unknown, TResult = unknown>(url: string, method = 'PUT') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TResult | null>(null);

  const mutate = useCallback(async (body: TBody): Promise<TResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `${res.status} ${res.statusText}`);
      }
      setData(json);
      return json;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [url, method]);

  return { mutate, loading, error, data };
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}
