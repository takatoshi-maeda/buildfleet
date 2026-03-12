import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { decodeCodefleetWatchNotification } from '../mcp/decoders';
import type { CodefleetClient } from '../mcp/client';
import { useCodefleetBoard } from '../hooks/useCodefleetBoard';
import { useCodefleetColors } from '../theme/useCodefleetColors';
import { RequirementsDocumentPane } from './RequirementsDocumentPane';
import { ThreadPane } from './ThreadPane';

type Props = {
  client: CodefleetClient;
};

const WIDE_LAYOUT_BREAKPOINT = 1120;

export function RequirementsInterviewWorkspace({ client }: Props) {
  const colors = useCodefleetColors();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;
  const board = useCodefleetBoard(client, true);
  const refreshBoardRef = useRef(board.refreshBoard);

  refreshBoardRef.current = board.refreshBoard;

  useEffect(() => {
    const abort = new AbortController();
    const notificationToken = `requirements-interview-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    let refreshQueued = false;

    const scheduleRefresh = () => {
      if (refreshQueued) {
        return;
      }
      refreshQueued = true;
      setTimeout(() => {
        refreshQueued = false;
        void refreshBoardRef.current();
      }, 240);
    };

    void client.watchFleet(
      { heartbeatSec: 15, notificationToken },
      {
        signal: abort.signal,
        onNotification: (message) => {
          const event = decodeCodefleetWatchNotification(message);
          if (!event || event.params.notificationToken !== notificationToken) {
            return;
          }
          if (event.method === 'backlog.snapshot' || event.method === 'backlog.changed') {
            scheduleRefresh();
          }
        },
      },
    ).catch(() => undefined);

    return () => abort.abort();
  }, [client]);

  const totalItems = useMemo(
    () => Object.values(board.itemsByEpicId).reduce((count, items) => count + items.length, 0),
    [board.itemsByEpicId],
  );
  const hasArtifacts = board.epics.length > 0 || totalItems > 0;

  const renderArtifactsPane = useCallback(() => {
    if (board.isLoading && !hasArtifacts) {
      return null;
    }
    if (!hasArtifacts) {
      return null;
    }

    return (
      <View
        style={[
          styles.artifactsPane,
          isWide ? [styles.paneWide, styles.artifactsPaneWide] : styles.artifactsPaneStacked,
          { backgroundColor: colors.surface, borderRightColor: colors.surfaceBorder, borderBottomColor: colors.surfaceBorder },
        ]}
      >
        <View style={[styles.artifactsHeader, { borderBottomColor: colors.surfaceBorder }]}>
          <Text style={[styles.artifactsEyebrow, { color: colors.mutedText }]}>Artifacts</Text>
          <Text style={[styles.artifactsTitle, { color: colors.text }]}>
            {board.epics.length} epics / {totalItems} items
          </Text>
        </View>
        <View style={styles.artifactsBody}>
          {board.epics.slice(0, 8).map((epic) => {
            const itemCount = board.itemsByEpicId[epic.id]?.length ?? 0;
            return (
              <View key={epic.id} style={[styles.artifactCard, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}>
                <Text style={[styles.artifactStatus, { color: colors.mutedText }]}>
                  {(epic.status ?? 'todo').toUpperCase()}
                </Text>
                <Text style={[styles.artifactTitle, { color: colors.text }]} numberOfLines={2}>
                  {epic.title}
                </Text>
                <Text style={[styles.artifactMeta, { color: colors.mutedText }]}>
                  {epic.id} · {itemCount} items
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }, [board.epics, board.isLoading, board.itemsByEpicId, colors.background, colors.mutedText, colors.surface, colors.surfaceBorder, colors.text, hasArtifacts, isWide, totalItems]);

  return (
    <View
      style={[
        styles.container,
        isWide ? styles.containerWide : styles.containerStacked,
        { backgroundColor: colors.background },
      ]}
    >
      {renderArtifactsPane()}
      <View
        style={[
          styles.conversationPane,
          isWide
            ? [
                hasArtifacts ? styles.conversationPaneWideWithArtifacts : styles.conversationPaneWide,
                styles.conversationPaneWideBorder,
              ]
            : styles.conversationPaneStacked,
          { borderRightColor: colors.surfaceBorder, borderBottomColor: colors.surfaceBorder },
        ]}
      >
        <ThreadPane client={client} title="" agentId="requirements-interviewer" />
      </View>
      <View style={[styles.documentPane, isWide ? styles.documentPaneWide : styles.documentPaneStacked]}>
        <RequirementsDocumentPane client={client} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  containerWide: {
    flexDirection: 'row',
  },
  containerStacked: {
    flexDirection: 'column',
  },
  conversationPane: {
    minWidth: 0,
    minHeight: 0,
  },
  conversationPaneWide: {
    flex: 2,
  },
  conversationPaneWideWithArtifacts: {
    flex: 2,
  },
  conversationPaneWideBorder: {
    borderRightWidth: 1,
  },
  conversationPaneStacked: {
    flex: 1,
    minHeight: 360,
    borderBottomWidth: 1,
  },
  artifactsPane: {
    minWidth: 0,
    minHeight: 0,
  },
  artifactsPaneWide: {
    flex: 1,
    borderRightWidth: 1,
  },
  artifactsPaneStacked: {
    borderBottomWidth: 1,
    maxHeight: 280,
  },
  paneWide: {
    flex: 1,
  },
  documentPane: {
    minWidth: 0,
    minHeight: 0,
  },
  documentPaneWide: {
    flex: 1,
  },
  documentPaneStacked: {
    flex: 1,
    minHeight: 320,
  },
  artifactsHeader: {
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  artifactsEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  artifactsTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  artifactsBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  artifactCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  artifactStatus: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  artifactTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  artifactMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
});
