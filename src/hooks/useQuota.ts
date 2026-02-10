"use client";

import { useState, useCallback, useEffect } from "react";

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date | null;
}

interface UseQuotaOptions {
  autoLoad?: boolean;
}

interface UseQuotaReturn {
  quota: QuotaStatus;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (newUsed: number) => void;
}

const DEFAULT_QUOTA: QuotaStatus = {
  used: 0,
  limit: 60,
  remaining: 60,
  resetAt: null,
};

export function useQuota({ autoLoad = true }: UseQuotaOptions = {}): UseQuotaReturn {
  const [quota, setQuota] = useState<QuotaStatus>(DEFAULT_QUOTA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/quota");
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        used: number;
        limit: number;
        remaining: number;
        resetAt: string;
      };

      setQuota({
        used: data.used,
        limit: data.limit,
        remaining: data.remaining,
        resetAt: new Date(data.resetAt),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load quota";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manually update quota (e.g., after a successful API call)
  const update = useCallback((newUsed: number) => {
    setQuota((prev) => ({
      ...prev,
      used: newUsed,
      remaining: Math.max(0, prev.limit - newUsed),
    }));
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      void refresh();
    }
  }, [autoLoad, refresh]);

  // Auto-refresh when reset time passes
  useEffect(() => {
    if (!quota.resetAt) return;

    const now = Date.now();
    const resetTime = quota.resetAt.getTime();
    const timeUntilReset = resetTime - now;

    if (timeUntilReset <= 0) {
      // Reset time has passed, refresh immediately
      void refresh();
      return;
    }

    // Schedule refresh for when reset time passes
    const timer = setTimeout(() => {
      void refresh();
    }, timeUntilReset + 1000); // Add 1 second buffer

    return () => clearTimeout(timer);
  }, [quota.resetAt, refresh]);

  return {
    quota,
    isLoading,
    error,
    refresh,
    update,
  };
}
