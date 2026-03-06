import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CodefleetClient } from '../mcp/client';
import type { CodefleetEpic, CodefleetItem } from '../mcp/types';

export type UseCodefleetBoardResult = {
  epics: CodefleetEpic[];
  itemsByEpicId: Record<string, CodefleetItem[]>;
  selectedItem: CodefleetItem | null;
  isLoading: boolean;
  isDetailLoading: boolean;
  errorMessage: string | null;
  refreshBoard: () => Promise<void>;
  selectItem: (itemId: string | null) => Promise<void>;
};

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('signal is aborted');
}

function sortByUpdatedAtDesc<T extends { updatedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? '') || 0;
    const bTime = Date.parse(b.updatedAt ?? '') || 0;
    return bTime - aTime;
  });
}

export function useCodefleetBoard(
  client: CodefleetClient,
  enabled = true,
): UseCodefleetBoardResult {
  const [epics, setEpics] = useState<CodefleetEpic[]>([]);
  const [items, setItems] = useState<CodefleetItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CodefleetItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [epicResult, itemResult] = await Promise.all([
        client.listBacklogEpics(),
        client.listBacklogItems(),
      ]);
      setEpics(sortByUpdatedAtDesc(epicResult.epics));
      setItems(sortByUpdatedAtDesc(itemResult.items));
    } catch (error) {
      if (isAbortLikeError(error)) return;
      setErrorMessage(error instanceof Error ? error.message : String(error ?? 'unknown'));
    } finally {
      setIsLoading(false);
    }
  }, [client, enabled]);

  const selectItem = useCallback(async (itemId: string | null) => {
    if (!itemId) {
      setSelectedItem(null);
      return;
    }

    setIsDetailLoading(true);
    setErrorMessage(null);
    try {
      const result = await client.getBacklogItem(itemId);
      setSelectedItem(result.item);
    } catch (error) {
      if (isAbortLikeError(error)) return;
      setErrorMessage(error instanceof Error ? error.message : String(error ?? 'unknown'));
      setSelectedItem(null);
    } finally {
      setIsDetailLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!enabled) {
      setEpics([]);
      setItems([]);
      setSelectedItem(null);
      setErrorMessage(null);
      setIsLoading(false);
      setIsDetailLoading(false);
      return;
    }
    void refreshBoard();
  }, [enabled, refreshBoard]);

  const itemsByEpicId = useMemo(() => {
    const grouped: Record<string, CodefleetItem[]> = {};

    for (const epic of epics) {
      grouped[epic.id] = [];
    }
    for (const item of items) {
      if (!grouped[item.epicId]) {
        grouped[item.epicId] = [];
      }
      grouped[item.epicId].push(item);
    }

    return grouped;
  }, [epics, items]);

  return {
    epics,
    itemsByEpicId,
    selectedItem,
    isLoading,
    isDetailLoading,
    errorMessage,
    refreshBoard,
    selectItem,
  };
}
