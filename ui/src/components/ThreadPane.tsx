import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type {
  CodefleetClient,
  ConversationGetResult,
  ConversationSummary,
} from '../mcp/client';
import { useCodefleetColors } from '../theme/useCodefleetColors';

type Props = {
  client: CodefleetClient;
  title?: string;
};

type ThreadMessage = {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp?: string | null;
  status?: 'running' | 'completed' | 'failed';
};

const POLL_INTERVAL_MS = 2000;

function messageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function toThreadMessages(conversation: ConversationGetResult): ThreadMessage[] {
  const messages: ThreadMessage[] = [];

  for (const turn of conversation.turns) {
    messages.push({
      id: `${turn.turnId}:user`,
      role: 'user',
      content: turn.userMessage,
      timestamp: turn.timestamp,
      status: 'completed',
    });
    messages.push({
      id: `${turn.turnId}:agent`,
      role: 'agent',
      content: turn.assistantMessage || (turn.status === 'error' ? turn.errorMessage ?? 'Error' : ''),
      timestamp: turn.timestamp,
      status: turn.status === 'error' ? 'failed' : 'completed',
    });
  }

  if (conversation.status === 'progress' && conversation.inProgress) {
    const startedAt = conversation.inProgress.startedAt ?? conversation.inProgress.updatedAt;
    const userMessage = conversation.inProgress.userMessage?.trim();
    if (userMessage) {
      messages.push({
        id: `${conversation.inProgress.turnId ?? 'progress'}:user`,
        role: 'user',
        content: userMessage,
        timestamp: startedAt,
        status: 'completed',
      });
    }
    messages.push({
      id: `${conversation.inProgress.turnId ?? 'progress'}:agent`,
      role: 'agent',
      content: conversation.inProgress.assistantMessage?.trim() || 'Thinking...',
      timestamp: startedAt,
      status: 'running',
    });
  }

  return messages;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleString();
}

export function ThreadPane({ client, title = 'Feedback Desk' }: Props) {
  const colors = useCodefleetColors();
  const userBubbleColor = colors.tint === '#ffffff' ? '#0a7ea4' : colors.tint;
  const scrollRef = useRef<ScrollView | null>(null);
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('new');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunningRemote, setIsRunningRemote] = useState(false);

  const refreshSessions = useCallback(async () => {
    try {
      const result = await client.listConversations(50);
      const next = [...result.sessions].sort((a, b) => {
        const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0;
        const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? '') || 0;
        return bTime - aTime;
      });
      setSessions(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load history.');
    }
  }, [client]);

  const loadConversation = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === 'new') {
      setMessages([]);
      setIsRunningRemote(false);
      return;
    }

    setIsLoadingConversation(true);
    try {
      const result = await client.getConversation(sessionId);
      setMessages(toThreadMessages(result));
      setIsRunningRemote(result.status === 'progress');
      setErrorMessage(null);
    } catch (error) {
      setMessages([]);
      setIsRunningRemote(false);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load conversation.');
    } finally {
      setIsLoadingConversation(false);
    }
  }, [client]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    void loadConversation(selectedSessionId);
    setIsHistoryOpen(false);
  }, [loadConversation, selectedSessionId]);

  useEffect(() => {
    if (!isRunningRemote || selectedSessionId === 'new') return;
    const timer = setInterval(() => {
      void loadConversation(selectedSessionId);
      void refreshSessions();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isRunningRemote, loadConversation, refreshSessions, selectedSessionId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const canSubmit = draft.trim().length > 0 && !isSubmitting;
  const selectedSessionLabel = useMemo(() => {
    if (selectedSessionId === 'new') return title;
    const current = sessions.find((session) => session.sessionId === selectedSessionId);
    return current?.latestUserMessage?.trim() || current?.title?.trim() || title;
  }, [selectedSessionId, sessions, title]);

  const handleSubmit = useCallback(async () => {
    const text = draft.trim();
    if (!text || isSubmitting) return;

    setDraft('');
    setErrorMessage(null);
    const optimisticUser: ThreadMessage = {
      id: messageId('user'),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'completed',
    };
    const optimisticAgent: ThreadMessage = {
      id: messageId('agent'),
      role: 'agent',
      content: 'Thinking...',
      timestamp: new Date().toISOString(),
      status: 'running',
    };
    setMessages((previous) => [...previous, optimisticUser, optimisticAgent]);
    setIsSubmitting(true);

    try {
      const result = await client.runAgent({
        message: text,
        sessionId: selectedSessionId === 'new' ? undefined : selectedSessionId,
      });
      const nextSessionId = result.sessionId || selectedSessionId;
      setSelectedSessionId(nextSessionId);
      await Promise.all([loadConversation(nextSessionId), refreshSessions()]);
    } catch (error) {
      setMessages((previous) => [
        ...previous.slice(0, -1),
        {
          ...optimisticAgent,
          content: error instanceof Error ? error.message : 'Failed to send message.',
          status: 'failed',
        },
      ]);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      setIsSubmitting(false);
    }
  }, [client, draft, isSubmitting, loadConversation, refreshSessions, selectedSessionId]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => void refreshSessions()} hitSlop={8}>
            <Ionicons name="refresh-outline" size={18} color={colors.mutedText} />
          </Pressable>
          <Pressable onPress={() => setIsHistoryOpen((value) => !value)} hitSlop={8}>
            <Ionicons
              name={isHistoryOpen ? 'time' : 'time-outline'}
              size={18}
              color={colors.mutedText}
            />
          </Pressable>
        </View>
      </View>

      {isHistoryOpen ? (
        <View style={[styles.historyPanel, { borderBottomColor: colors.surfaceBorder }]}>
          <Pressable
            style={[
              styles.historyItem,
              selectedSessionId === 'new' && { backgroundColor: colors.surfaceSelected },
            ]}
            onPress={() => setSelectedSessionId('new')}
          >
            <Text style={[styles.historyText, { color: colors.text }]} numberOfLines={1}>
              New conversation
            </Text>
          </Pressable>
          <ScrollView style={styles.historyList}>
            {sessions.map((session) => (
              <Pressable
                key={session.sessionId}
                style={[
                  styles.historyItem,
                  selectedSessionId === session.sessionId && {
                    backgroundColor: colors.surfaceSelected,
                  },
                ]}
                onPress={() => setSelectedSessionId(session.sessionId)}
              >
                <Text style={[styles.historyText, { color: colors.text }]} numberOfLines={1}>
                  {session.latestUserMessage?.trim() || session.title?.trim() || session.sessionId}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.subHeader, { borderBottomColor: colors.surfaceBorder }]}>
          <Text style={[styles.subHeaderText, { color: colors.mutedText }]} numberOfLines={1}>
            {selectedSessionLabel}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        {isLoadingConversation ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.mutedText} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                  Start a conversation with Feedback Desk.
                </Text>
              </View>
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      isUser ? styles.userRow : styles.agentRow,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        {
                          backgroundColor: isUser ? userBubbleColor : colors.background,
                          borderColor: colors.surfaceBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          { color: isUser ? '#ffffff' : colors.text },
                        ]}
                      >
                        {message.content}
                      </Text>
                      {message.timestamp ? (
                        <Text
                          style={[
                            styles.messageMeta,
                            { color: isUser ? 'rgba(255,255,255,0.75)' : colors.mutedText },
                          ]}
                        >
                          {formatTimestamp(message.timestamp)}
                          {message.status === 'running' ? ' • running' : ''}
                          {message.status === 'failed' ? ' • failed' : ''}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      {errorMessage ? (
        <View style={[styles.errorBar, { borderTopColor: colors.surfaceBorder }]}>
          <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.composer, { borderTopColor: colors.surfaceBorder }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Feedback Desk..."
            placeholderTextColor={`${colors.mutedText}99`}
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.surfaceBorder,
                backgroundColor: colors.background,
              },
            ]}
            multiline
            editable={!isSubmitting}
            onSubmitEditing={() => void handleSubmit()}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
            style={[
              styles.sendButton,
              { backgroundColor: canSubmit ? colors.tint : `${colors.mutedText}33` },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#ffffff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  subHeaderText: {
    fontSize: 12,
    fontWeight: '500',
  },
  historyPanel: {
    borderBottomWidth: 1,
    maxHeight: 220,
  },
  historyList: {
    maxHeight: 172,
  },
  historyItem: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  historyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  body: {
    flex: 1,
  },
  messages: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  agentRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '88%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageMeta: {
    fontSize: 11,
  },
  emptyState: {
    paddingVertical: 28,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
  },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
