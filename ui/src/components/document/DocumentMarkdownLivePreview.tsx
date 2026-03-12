import { ScrollView, StyleSheet, Text } from 'react-native';

type Props = {
  content: string;
  textColor: string;
  mutedTextColor: string;
  tintColor: string;
  borderColor: string;
  onPressLink: (href: string) => void;
};

export function DocumentMarkdownLivePreview({ content, textColor, mutedTextColor }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.text, { color: textColor }]}>{content}</Text>
      <Text style={[styles.note, { color: mutedTextColor }]}>
        Markdown live preview is available on web. This platform falls back to plain text.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});

