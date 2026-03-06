import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';

import type { CodefleetItem } from '../mcp/types';
import { useCodefleetColors } from '../theme/useCodefleetColors';
import { formatCodefleetTimestamp } from './statusTiming';

type Props = {
  item: CodefleetItem | null;
  isLoading: boolean;
  onClose?: () => void;
  embedded?: boolean;
  style?: StyleProp<ViewStyle>;
};

function formatDate(value?: string): string {
  return formatCodefleetTimestamp(value) ?? '-';
}

function formatNoteDate(value?: string): string | null {
  return formatCodefleetTimestamp(value);
}

export function DetailPane({ item, isLoading, onClose, embedded = false, style }: Props) {
  const colors = useCodefleetColors();
  const textColor = colors.text;
  const subTextColor = colors.mutedText;
  const borderColor = colors.surfaceBorder;
  const bgColor = colors.surface;
  const bodyContent = item ? (
    <>
      <Text style={[styles.title, { color: textColor }]}>{item.title}</Text>
      <Text style={[styles.meta, { color: subTextColor }]}>ID: {item.id}</Text>
      <Text style={[styles.meta, { color: subTextColor }]}>Epic: {item.epicId}</Text>
      <Text style={[styles.meta, { color: subTextColor }]}>Kind: {item.kind ?? '-'}</Text>
      <Text style={[styles.meta, { color: subTextColor }]}>Status: {item.status ?? '-'}</Text>
      <Text style={[styles.meta, { color: subTextColor }]}>Updated: {formatDate(item.updatedAt)}</Text>
      <View style={styles.notesSection}>
        <Text style={[styles.notesTitle, { color: textColor, borderBottomColor: borderColor }]}>Notes</Text>
        {item.notes.length > 0 ? (
          item.notes.map((note, index) => (
            <View key={note.id ?? `${item.id}-note-${index}`} style={[styles.noteSectionItem, { borderColor }]}>
              <Text style={[styles.noteContent, { color: textColor }]}>{note.content}</Text>
              {formatNoteDate(note.createdAt) ? (
                <Text style={[styles.noteMeta, { color: subTextColor }]}>
                  {formatNoteDate(note.createdAt)}
                </Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={[styles.noteContent, { color: subTextColor }]}>No notes</Text>
        )}
      </View>
    </>
  ) : null;

  return (
    <View
      style={[
        styles.container,
        embedded ? styles.embeddedContainer : null,
        {
          borderLeftColor: borderColor,
          borderColor,
          backgroundColor: bgColor,
        },
        style,
      ]}
    >
      <View style={[styles.header, embedded ? styles.embeddedHeader : null, { borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Item Detail</Text>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={18} color={subTextColor} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.emptyState}>
          <Text style={{ color: subTextColor }}>Loading...</Text>
        </View>
      ) : item ? (
        embedded ? <View style={styles.body}>{bodyContent}</View> : <ScrollView contentContainerStyle={styles.body}>{bodyContent}</ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={{ color: subTextColor }}>Select a card to show details.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderLeftWidth: 1,
  },
  embeddedContainer: {
    flex: 0,
    borderLeftWidth: 0,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  embeddedHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
  },
  notesSection: {
    marginTop: 8,
    gap: 10,
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  noteSectionItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  noteContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  noteMeta: {
    fontSize: 11,
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
