"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Conversation } from "~/components/ConversationList";

type ConversationMode = "CHAT" | "AGENT" | "IDE" | "CLI";

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

  // Keep ref in sync
  currentConversationRef.current = currentConversation;

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations?mode=${mode}`);
      if (!response.ok) {
        throw new Error(`Failed to load conversations: ${response.status}`);
      }
      const data = (await response.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
      const cur = currentConversationRef.current;
      if (cur && !data.conversations.some((c) => c.id === cur.id)) {
        setCurrentConversation(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  const createConversation = useCallback(async (): Promise<Conversation | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string; message?: string };
        throw new Error(
          errorData.message ?? errorData.error ?? `Failed to create conversation: ${response.status}`
        );
      }

      const newConversation = (await response.json()) as Conversation;
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
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setCurrentConversation(conv);
    } else {
      // Fetch from server if not in local list
      try {
        const response = await fetch(`/api/conversations/${id}?mode=${mode}`);
        if (response.ok) {
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
    setConversations([]);
    setCurrentConversation(null);
  }, [mode]);

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
