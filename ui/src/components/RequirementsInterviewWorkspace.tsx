import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { decodeCodefleetWatchNotification } from '../mcp/decoders';
import type { CodefleetClient, JsonRpcNotification } from '../mcp/client';
import { useCodefleetBoard } from '../hooks/useCodefleetBoard';
import { useCodefleetColors } from '../theme/useCodefleetColors';
import { RequirementsDocumentPane } from './RequirementsDocumentPane';
import { ThreadPane } from './ThreadPane';

type Props = {
  client: CodefleetClient;
};

const WIDE_LAYOUT_BREAKPOINT = 1120;

type StreamingArtifact = {
  id: string;
  text: string;
  status: 'running' | 'completed';
  contentType: 'artifact';
  updatedAt: number;
};

type PatchLineTone = 'meta' | 'add' | 'remove' | 'context' | 'plain';

function classifyPatchLine(line: string): PatchLineTone {
  if (
    line.startsWith('*** Begin Patch') ||
    line.startsWith('*** End Patch') ||
    line.startsWith('*** Update File:') ||
    line.startsWith('*** Add File:') ||
    line.startsWith('*** Delete File:') ||
    line.startsWith('*** Move to:') ||
    line.startsWith('@@')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) {
    return 'add';
  }
  if (line.startsWith('-')) {
    return 'remove';
  }
  if (line.startsWith(' ')) {
    return 'context';
  }
  return 'plain';
}

export function RequirementsInterviewWorkspace({ client }: Props) {
  const colors = useCodefleetColors();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;
  const board = useCodefleetBoard(client, true);
  const refreshBoardRef = useRef(board.refreshBoard);
  const [streamingArtifacts, setStreamingArtifacts] = useState<StreamingArtifact[]>([]);

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
  const hasStreamingArtifacts = streamingArtifacts.length > 0;

  const handleThreadStreamEvent = useCallback((message: JsonRpcNotification) => {
    const params =
      message.params && typeof message.params === 'object'
        ? (message.params as Record<string, unknown>)
        : null;
    const type = typeof params?.type === 'string' ? params.type : '';

    if (type === 'agent.output_item.added') {
      const itemId = typeof params?.itemId === 'string' ? params.itemId : null;
      if (!itemId) {
        return;
      }
      setStreamingArtifacts((previous) => {
        const next = [...previous];
        const existingIndex = next.findIndex((artifact) => artifact.id === itemId);
        const nextArtifact: StreamingArtifact = {
          id: itemId,
          text: existingIndex >= 0 ? next[existingIndex].text : '',
          status: 'running',
          contentType: 'artifact',
          updatedAt: Date.now(),
        };
        if (existingIndex >= 0) {
          next[existingIndex] = nextArtifact;
        } else {
          next.push(nextArtifact);
        }
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });
      return;
    }

    if (type === 'agent.artifact_delta') {
      const itemId = typeof params?.itemId === 'string' ? params.itemId : null;
      const delta = typeof params?.delta === 'string' ? params.delta : '';
      if (!itemId || delta.length === 0) {
        return;
      }
      setStreamingArtifacts((previous) => {
        const next = [...previous];
        const existingIndex = next.findIndex((artifact) => artifact.id === itemId);
        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            text: `${next[existingIndex].text}${delta}`,
            status: 'running',
            updatedAt: Date.now(),
          };
        } else {
          next.push({
            id: itemId,
            text: delta,
            status: 'running',
            contentType: 'artifact',
            updatedAt: Date.now(),
          });
        }
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });
      return;
    }

    if (type === 'agent.output_item.done') {
      const itemId = typeof params?.itemId === 'string' ? params.itemId : null;
      if (!itemId) {
        return;
      }
      setStreamingArtifacts((previous) =>
        previous
          .map((artifact) =>
            artifact.id === itemId
              ? { ...artifact, status: 'completed', updatedAt: Date.now() }
              : artifact,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    }
  }, []);

  const renderArtifactsPane = useCallback(() => {
    if (board.isLoading && !hasArtifacts && !hasStreamingArtifacts) {
      return null;
    }
    if (!hasArtifacts && !hasStreamingArtifacts) {
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
        </View>
        <ScrollView style={styles.artifactsScroll} contentContainerStyle={styles.artifactsBody}>
          {streamingArtifacts.map((artifact) => (
            <View
              key={artifact.id}
              style={[
                styles.artifactCard,
                styles.streamingArtifactCard,
                { borderColor: colors.surfaceBorder, backgroundColor: colors.background },
              ]}
            >
              <Text style={[styles.artifactStatus, { color: colors.mutedText }]}>
                {artifact.status === 'running' ? 'STREAMING PATCH' : 'PATCH'}
              </Text>
              <Text style={[styles.artifactTitle, { color: colors.text }]} numberOfLines={1}>
                {artifact.id}
              </Text>
              {artifact.text.trim() ? (
                <View
                  style={[
                    styles.patchPreview,
                    {
                      backgroundColor: `${colors.surfaceBorder}14`,
                      borderColor: colors.surfaceBorder,
                    },
                  ]}
                >
                  {artifact.text.split('\n').map((line, index) => {
                    const tone = classifyPatchLine(line);
                    const textColor =
                      tone === 'add'
                        ? '#166534'
                        : tone === 'remove'
                          ? '#991b1b'
                          : tone === 'meta'
                            ? '#1d4ed8'
                            : colors.text;
                    const lineBackgroundColor =
                      tone === 'add'
                        ? '#dcfce7'
                        : tone === 'remove'
                          ? '#fee2e2'
                          : tone === 'meta'
                            ? '#dbeafe'
                            : tone === 'context'
                              ? `${colors.surfaceBorder}12`
                              : 'transparent';

                    return (
                      <Text
                        key={`${artifact.id}-line-${index}`}
                        style={[
                          styles.streamingArtifactBody,
                          styles.patchLine,
                          {
                            color: textColor,
                            backgroundColor: lineBackgroundColor,
                          },
                        ]}
                      >
                        {line || ' '}
                      </Text>
                    );
                  })}
                </View>
              ) : (
                <Text style={[styles.streamingArtifactPlaceholder, { color: colors.mutedText }]}>
                  Waiting for patch content...
                </Text>
              )}
            </View>
          ))}
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
        </ScrollView>
      </View>
    );
  }, [board.epics, board.isLoading, board.itemsByEpicId, colors.background, colors.mutedText, colors.surface, colors.surfaceBorder, colors.text, hasArtifacts, hasStreamingArtifacts, isWide, streamingArtifacts, totalItems]);

  return (
    <View
      style={[
        styles.container,
        isWide ? styles.containerWide : styles.containerStacked,
        { backgroundColor: colors.background },
      ]}
    >
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
        <ThreadPane
          client={client}
          title=""
          agentId="requirements-interviewer"
          artifactDisplayMode="external"
          onStreamEvent={handleThreadStreamEvent}
        />
      </View>
      {renderArtifactsPane()}
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
    padding: 14,
    gap: 10,
  },
  artifactsScroll: {
    flex: 1,
  },
  artifactCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  streamingArtifactCard: {
    overflow: 'hidden',
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
  streamingArtifactBody: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  streamingArtifactPlaceholder: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  patchPreview: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  patchLine: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
});
