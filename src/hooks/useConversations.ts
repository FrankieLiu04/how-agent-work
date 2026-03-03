"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Conversation } from "~/components/ConversationList";

type ConversationMode = "CHAT" | "AGENT" | "IDE" | "CLI" | "FINANCE";

interface UseConversationsOptions {
  mode: ConversationMode;
  autoLoad?: boolean;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  loadConversations: () => Promise<void>;
  createConversation: () => Promise<Conversation | null>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateTitle: (id: string, title: string) => Promise<void>;
}

export function useConversations({
  mode,
  autoLoad = true,
}: UseConversationsOptions): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentConversationRef = useRef<Conversation | null>(null);
  const modeRef = useRef<ConversationMode>(mode);
  const loadRequestSeqRef = useRef(0);
  const selectRequestSeqRef = useRef(0);
  const cacheRef = useRef<
    Record<ConversationMode, { conversations: Conversation[]; currentId: string | null }>
  >({
    CHAT: { conversations: [], currentId: null },
    AGENT: { conversations: [], currentId: null },
    IDE: { conversations: [], currentId: null },
    CLI: { conversations: [], currentId: null },
    FINANCE: { conversations: [], currentId: null },
  });

  // Keep ref in sync
  currentConversationRef.current = currentConversation;
  modeRef.current = mode;

  const loadConversations = useCallback(async () => {
    const requestMode = mode;
    const requestId = ++loadRequestSeqRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations?mode=${requestMode}`);
      if (!response.ok) {
        throw new Error(`Failed to load conversations: ${response.status}`);
      }
      const data = (await response.json()) as { conversations: Conversation[] };
      if (loadRequestSeqRef.current !== requestId || modeRef.current !== requestMode) {
        return;
      }

      setConversations(data.conversations);
      const cur = currentConversationRef.current;
      const cachedCurrentId = cacheRef.current[requestMode].currentId;
      const preferredId = cur?.id ?? cachedCurrentId;
      const nextCurrent = preferredId
        ? data.conversations.find((c) => c.id === preferredId) ?? null
        : null;
      setCurrentConversation(nextCurrent);
    } catch (err) {
      if (loadRequestSeqRef.current !== requestId || modeRef.current !== requestMode) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      if (loadRequestSeqRef.current === requestId && modeRef.current === requestMode) {
        setIsLoading(false);
      }
    }
  }, [mode]);

  const createConversation = useCallback(async (): Promise<Conversation | null> => {
    const requestMode = mode;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: requestMode }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string; message?: string };
        throw new Error(
          errorData.message ?? errorData.error ?? `Failed to create conversation: ${response.status}`
        );
      }

      const newConversation = (await response.json()) as Conversation;
      if (modeRef.current !== requestMode) {
        return newConversation;
      }
      setConversations((prev) => [newConversation, ...prev]);
      setCurrentConversation(newConversation);
      return newConversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  const selectConversation = useCallback(async (id: string) => {
    const requestMode = mode;
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setCurrentConversation(conv);
    } else {
      const requestId = ++selectRequestSeqRef.current;
      // Fetch from server if not in local list
      try {
        const response = await fetch(`/api/conversations/${id}?mode=${requestMode}`);
        if (response.ok && selectRequestSeqRef.current === requestId && modeRef.current === requestMode) {
          const data = (await response.json()) as Conversation;
          setCurrentConversation(data);
        }
      } catch {
        // Ignore errors, just don't select
      }
    }
  }, [conversations, mode]);

  const deleteConversation = useCallback(async (id: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.status}`);
      }

      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  }, [currentConversation]);

  const updateTitle = useCallback(async (id: string, title: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update conversation: ${response.status}`);
      }

      const updated = (await response.json()) as Conversation;
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
      if (currentConversation?.id === id) {
        setCurrentConversation((prev) => (prev ? { ...prev, title: updated.title } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update conversation");
    }
  }, [currentConversation]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      void loadConversations();
    }
  }, [autoLoad, loadConversations]);

  useEffect(() => {
    const cached = cacheRef.current[mode];
    setConversations(cached.conversations);
    const cachedCurrent = cached.currentId
      ? cached.conversations.find((c) => c.id === cached.currentId) ?? null
      : null;
    setCurrentConversation(cachedCurrent);
    setIsLoading(false);
    setError(null);
  }, [mode]);

  useEffect(() => {
    cacheRef.current[mode] = {
      conversations,
      currentId: currentConversation?.id ?? null,
    };
  }, [mode, conversations, currentConversation?.id]);

  return {
    conversations,
    currentConversation,
    isLoading,
    error,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    updateTitle,
  };
}
