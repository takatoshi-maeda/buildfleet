import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCodefleetColors } from '../../theme/useCodefleetColors';
import type { DocumentChatMessage, DocumentReleaseNote, DocumentTreeNode } from './documentTypes';

type Props = {
  messages: DocumentChatMessage[];
  draft: string;
  isTyping: boolean;
  selectedFile: DocumentTreeNode | null;
  selectedRelease: DocumentReleaseNote | null;
  onChangeDraft: (next: string) => void;
  onSubmit: () => void;
};

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DocumentFrontDeskPane({
  messages,
  draft,
  isTyping,
  selectedFile,
  selectedRelease,
  onChangeDraft,
  onSubmit,
}: Props) {
  const colors = useCodefleetColors();
  const canSubmit = draft.trim().length > 0 && !isTyping;
  const userBubbleColor = colors.tint === '#ffffff' ? '#0a7ea4' : colors.tint;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>フロントデスク</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]} numberOfLines={2}>
            {selectedFile ? `${selectedFile.name}` : 'ファイル未選択'}
            {selectedRelease ? ` · ${selectedRelease.version}` : ''}
          </Text>
        </View>
        <Ionicons name="sparkles-outline" size={18} color={colors.tint} />
      </View>

      <ScrollView contentContainerStyle={styles.chatContent}>
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <View
              key={message.id}
              style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAgent]}
            >
              <View
                style={[
                  styles.messageBubble,
                  {
                    backgroundColor: isUser ? userBubbleColor : colors.background,
                    borderColor: isUser ? userBubbleColor : colors.surfaceBorder,
                  },
                ]}
              >
                <Text style={[styles.messageRole, { color: isUser ? '#ffffff' : colors.mutedText }]}>
                  {isUser ? 'You' : 'Agent'}
                </Text>
                <Text style={[styles.messageText, { color: isUser ? '#ffffff' : colors.text }]}>
                  {message.content}
                </Text>
                <Text style={[styles.messageTime, { color: isUser ? '#dbeafe' : colors.mutedText }]}>
                  {formatTimestamp(message.timestamp)}
                </Text>
              </View>
            </View>
          );
        })}
        {isTyping ? (
          <View style={styles.typingRow}>
            <View style={[styles.typingBubble, { backgroundColor: colors.background, borderColor: colors.surfaceBorder }]}>
              <ActivityIndicator size="small" color={colors.tint} />
              <Text style={[styles.typingText, { color: colors.mutedText }]}>フロントデスクが整理中です…</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.inputWrap, { borderTopColor: colors.surfaceBorder }]}>
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="メッセージを入力..."
          placeholderTextColor={colors.mutedText}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.background,
              borderColor: colors.surfaceBorder,
            },
          ]}
          multiline
          maxLength={600}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[
            styles.sendButton,
            {
              backgroundColor: canSubmit ? userBubbleColor : colors.background,
              borderColor: canSubmit ? userBubbleColor : colors.surfaceBorder,
            },
          ]}
        >
          <Ionicons name="send" size={16} color={canSubmit ? '#ffffff' : colors.mutedText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  chatContent: {
    padding: 14,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAgent: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '92%',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  messageRole: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
  },
  typingRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  typingBubble: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputWrap: {
    padding: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
