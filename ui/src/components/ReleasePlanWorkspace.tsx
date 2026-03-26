import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CodefleetClient, JsonRpcNotification } from '../mcp/client';
import { useCodefleetColors } from '../theme/useCodefleetColors';
import { ThreadPane } from './ThreadPane';

type Props = {
  client: CodefleetClient;
};

const WIDE_LAYOUT_BREAKPOINT = 1120;

type StreamingArtifact = {
  id: string;
  path?: string;
  text: string;
  status: 'running' | 'completed';
  updatedAt: number;
};

type CommitState = {
  status: 'idle' | 'running' | 'completed' | 'failed';
  updatedAt: number | null;
  errorMessage?: string;
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

function fileNameFromPath(path?: string): string | null {
  if (!path) {
    return null;
  }
  const segments = path.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function formatUpdatedAt(value: number | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ReleasePlanWorkspace({ client }: Props) {
  const colors = useCodefleetColors();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;
  const [streamingArtifacts, setStreamingArtifacts] = useState<StreamingArtifact[]>([]);
  const [collapsedArtifactIds, setCollapsedArtifactIds] = useState<Set<string>>(() => new Set());
  const [commitState, setCommitState] = useState<CommitState>({
    status: 'idle',
    updatedAt: null,
  });

  const hasStreamingArtifacts = streamingArtifacts.length > 0;
  const commitStatusLabel = useMemo(() => {
    switch (commitState.status) {
      case 'running':
        return 'Committing release plan';
      case 'completed':
        return 'Release plan committed';
      case 'failed':
        return 'Commit failed';
      default:
        return 'Draft in progress';
    }
  }, [commitState.status]);

  const handleThreadStreamEvent = useCallback((message: JsonRpcNotification) => {
    const params =
      message.params && typeof message.params === 'object'
        ? (message.params as Record<string, unknown>)
        : null;
    const type = typeof params?.type === 'string' ? params.type : '';

    if (type === 'agent.output_item.added') {
      const itemId = typeof params?.itemId === 'string' ? params.itemId : null;
      const item =
        params?.item && typeof params.item === 'object'
          ? (params.item as Record<string, unknown>)
          : null;
      const path = typeof item?.path === 'string' ? item.path : undefined;
      if (!itemId) {
        return;
      }
      setStreamingArtifacts((previous) => {
        const next = [...previous];
        const existingIndex = next.findIndex((artifact) => artifact.id === itemId);
        const nextArtifact: StreamingArtifact = {
          id: itemId,
          path: path ?? (existingIndex >= 0 ? next[existingIndex].path : undefined),
          text: existingIndex >= 0 ? next[existingIndex].text : '',
          status: 'running',
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
            updatedAt: Date.now(),
          });
        }
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });
      return;
    }

    if (type === 'agent.output_item.done') {
      const itemId = typeof params?.itemId === 'string' ? params.itemId : null;
      const item =
        params?.item && typeof params.item === 'object'
          ? (params.item as Record<string, unknown>)
          : null;
      const path = typeof item?.path === 'string' ? item.path : undefined;
      if (!itemId) {
        return;
      }
      setStreamingArtifacts((previous) =>
        previous
          .map((artifact) =>
            artifact.id === itemId
              ? ({ ...artifact, path: path ?? artifact.path, status: 'completed', updatedAt: Date.now() } as StreamingArtifact)
              : artifact,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
      return;
    }

    if (type === 'agent.tool_call') {
      const summary = typeof params?.summary === 'string' ? params.summary : '';
      if (summary === 'release_plan_commit') {
        setCommitState({
          status: 'running',
          updatedAt: Date.now(),
        });
      }
      return;
    }

    if (type === 'agent.tool_call_finish') {
      const summary = typeof params?.summary === 'string' ? params.summary : '';
      const status: CommitState['status'] = params?.status === 'failed' ? 'failed' : 'completed';
      const errorMessage = typeof params?.errorMessage === 'string' ? params.errorMessage : undefined;
      if (summary === 'release_plan_commit') {
        setCommitState({
          status,
          updatedAt: Date.now(),
          errorMessage,
        });
      }
    }
  }, []);

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
          isWide ? styles.conversationPaneWide : styles.conversationPaneStacked,
          { borderRightColor: colors.surfaceBorder, borderBottomColor: colors.surfaceBorder },
        ]}
      >
        <ThreadPane
          client={client}
          title=""
          agentId="release-plan"
          artifactDisplayMode="external"
          allowAttachments
          onStreamEvent={handleThreadStreamEvent}
        />
      </View>
      <View
        style={[
          styles.artifactsPane,
          isWide ? styles.artifactsPaneWide : styles.artifactsPaneStacked,
          { backgroundColor: colors.surface, borderRightColor: colors.surfaceBorder, borderBottomColor: colors.surfaceBorder },
        ]}
      >
        <View style={[styles.artifactsHeader, { borderBottomColor: colors.surfaceBorder }]}>
          <Text style={[styles.artifactsEyebrow, { color: colors.mutedText }]}>Release Plan</Text>
          <Text style={[styles.artifactsTitle, { color: colors.text }]}>{commitStatusLabel}</Text>
          {commitState.updatedAt ? (
            <Text style={[styles.commitMeta, { color: colors.mutedText }]}>
              Updated {formatUpdatedAt(commitState.updatedAt)}
            </Text>
          ) : (
            <Text style={[styles.commitMeta, { color: colors.mutedText }]}>
              Draft artifacts stream here while the plan is being written.
            </Text>
          )}
          {commitState.status === 'failed' && commitState.errorMessage ? (
            <Text style={[styles.commitError, { color: '#991b1b' }]}>{commitState.errorMessage}</Text>
          ) : null}
        </View>
        <ScrollView style={styles.artifactsScroll} contentContainerStyle={styles.artifactsBody}>
          {!hasStreamingArtifacts ? (
            <View
              style={[
                styles.emptyCard,
                { borderColor: colors.surfaceBorder, backgroundColor: colors.background },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No draft artifacts yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                The `release-plan` agent will stream draft markdown here when it starts editing a draft file.
              </Text>
            </View>
          ) : null}
          {streamingArtifacts.map((artifact) => (
            <View
              key={artifact.id}
              style={[
                styles.artifactCard,
                styles.streamingArtifactCard,
                { borderColor: colors.surfaceBorder, backgroundColor: colors.background },
              ]}
            >
              <Pressable
                style={styles.artifactHeaderRow}
                onPress={() =>
                  setCollapsedArtifactIds((previous) => {
                    const next = new Set(previous);
                    if (next.has(artifact.id)) {
                      next.delete(artifact.id);
                    } else {
                      next.add(artifact.id);
                    }
                    return next;
                  })
                }
              >
                <View style={styles.artifactHeaderMain}>
                  {artifact.status === 'running' ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.mutedText}
                      style={styles.artifactSpinner}
                    />
                  ) : null}
                  <View style={styles.artifactHeaderText}>
                    <Text style={[styles.artifactTitle, { color: colors.text }]} numberOfLines={1}>
                      {fileNameFromPath(artifact.path) ?? artifact.id}
                    </Text>
                    {artifact.path ? (
                      <Text style={[styles.artifactMeta, { color: colors.mutedText }]} numberOfLines={1}>
                        {artifact.path}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Ionicons
                  name={collapsedArtifactIds.has(artifact.id) ? 'chevron-forward' : 'chevron-down'}
                  size={16}
                  color={colors.mutedText}
                />
              </Pressable>
              {!collapsedArtifactIds.has(artifact.id) && artifact.text.trim() ? (
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
              ) : !collapsedArtifactIds.has(artifact.id) ? (
                <Text style={[styles.streamingArtifactPlaceholder, { color: colors.mutedText }]}>
                  Waiting for patch content...
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
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
  },
  artifactsPaneStacked: {
    flex: 1,
    minHeight: 320,
  },
  artifactsHeader: {
    minHeight: 112,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 4,
  },
  artifactsEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  artifactsTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  commitMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  commitError: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  artifactsBody: {
    padding: 14,
    gap: 10,
  },
  artifactsScroll: {
    flex: 1,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  artifactCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  artifactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  artifactHeaderMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  artifactHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  artifactSpinner: {
    marginTop: 2,
  },
  streamingArtifactCard: {
    overflow: 'hidden',
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
    paddingVertical: 2,
  },
});
