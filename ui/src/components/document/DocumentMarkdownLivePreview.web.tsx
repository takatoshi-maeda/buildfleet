import { Extension } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { Table } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CSSProperties, MouseEvent } from 'react';

type Props = {
  content: string;
  textColor: string;
  mutedTextColor: string;
  tintColor: string;
  borderColor: string;
  onPressLink: (href: string) => void;
};

export function DocumentMarkdownLivePreview({
  content,
  textColor,
  mutedTextColor,
  tintColor,
  borderColor,
  onPressLink,
}: Props) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'document-markdown-editor__code-block',
          },
        },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
          },
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: '',
      }),
      Extension.create({
        name: 'requirementsInterviewReadonly',
        addKeyboardShortcuts() {
          return {};
        },
      }),
      Markdown.configure({
        indentation: {
          style: 'space',
          size: 2,
        },
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content,
    contentType: 'markdown',
    immediatelyRender: true,
    editable: false,
    editorProps: {
      attributes: {
        class: 'document-markdown-editor__content tiptap requirements-interview-markdown',
        'data-editor-mode': 'live',
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (editor.getMarkdown() === content) {
      return;
    }
    editor.commands.setContent(content, { contentType: 'markdown' });
  }, [content, editor]);

  const editorSurfaceStyle = useMemo<CSSProperties>(
    () => ({
      ...markdownSurfaceStyle,
      ['--document-editor-border' as string]: borderColor,
      ['--document-editor-muted' as string]: mutedTextColor,
      ['--document-editor-link' as string]: tintColor,
      ['--document-editor-selection' as string]: '#0a7ea433',
      ['--document-editor-inline-code' as string]: '#e0f2fe',
      ['--document-editor-code-block' as string]: '#eff3f8',
      ['--document-editor-panel' as string]: '#ffffff',
      ['--document-editor-panel-alt' as string]: '#f8fafc',
      color: textColor,
      background: 'transparent',
    }),
    [borderColor, mutedTextColor, textColor, tintColor],
  );

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const anchor = target.closest('a');
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute('href');
    if (!href) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onPressLink(href);
  };

  return (
    <View style={styles.container}>
      <style>{markdownEditorCss}</style>
      <div style={editorSurfaceStyle} onClickCapture={handleClickCapture}>
        <EditorContent editor={editor} />
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
});

const markdownSurfaceStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px',
  boxSizing: 'border-box',
};

const markdownEditorCss = `
.document-markdown-editor__content {
  min-height: 100%;
}

.document-markdown-editor__content.tiptap,
.document-markdown-editor__content .tiptap {
  color: inherit;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.7;
}

.document-markdown-editor__content.tiptap :first-child,
.document-markdown-editor__content .tiptap :first-child {
  margin-top: 0;
}

.document-markdown-editor__content.tiptap p,
.document-markdown-editor__content.tiptap ul,
.document-markdown-editor__content.tiptap ol,
.document-markdown-editor__content.tiptap blockquote,
.document-markdown-editor__content.tiptap pre,
.document-markdown-editor__content.tiptap table,
.document-markdown-editor__content .tiptap p,
.document-markdown-editor__content .tiptap ul,
.document-markdown-editor__content .tiptap ol,
.document-markdown-editor__content .tiptap blockquote,
.document-markdown-editor__content .tiptap pre,
.document-markdown-editor__content .tiptap table {
  margin: 0 0 1rem;
}

.document-markdown-editor__content.tiptap h1,
.document-markdown-editor__content.tiptap h2,
.document-markdown-editor__content.tiptap h3,
.document-markdown-editor__content .tiptap h1,
.document-markdown-editor__content .tiptap h2,
.document-markdown-editor__content .tiptap h3 {
  margin: 1.4rem 0 0.75rem;
  line-height: 1.2;
}

.document-markdown-editor__content.tiptap h1,
.document-markdown-editor__content .tiptap h1 {
  font-size: 2rem;
}

.document-markdown-editor__content.tiptap h2,
.document-markdown-editor__content .tiptap h2 {
  font-size: 1.55rem;
}

.document-markdown-editor__content.tiptap ul,
.document-markdown-editor__content.tiptap ol,
.document-markdown-editor__content .tiptap ul,
.document-markdown-editor__content .tiptap ol {
  padding-left: 1.3rem;
}

.document-markdown-editor__content.tiptap ul[data-type="taskList"],
.document-markdown-editor__content .tiptap ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.document-markdown-editor__content.tiptap ul[data-type="taskList"] li,
.document-markdown-editor__content .tiptap ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.document-markdown-editor__content.tiptap ul[data-type="taskList"] li > label,
.document-markdown-editor__content .tiptap ul[data-type="taskList"] li > label {
  margin-top: 0.2rem;
}

.document-markdown-editor__content.tiptap ul[data-type="taskList"] li > div,
.document-markdown-editor__content .tiptap ul[data-type="taskList"] li > div {
  flex: 1;
}

.document-markdown-editor__content.tiptap blockquote,
.document-markdown-editor__content .tiptap blockquote {
  border-left: 3px solid var(--document-editor-border);
  margin-left: 0;
  padding-left: 1rem;
  color: var(--document-editor-muted);
}

.document-markdown-editor__content.tiptap code,
.document-markdown-editor__content .tiptap code {
  background: var(--document-editor-inline-code);
  border-radius: 6px;
  padding: 0.14rem 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}

.document-markdown-editor__content.tiptap pre,
.document-markdown-editor__content .tiptap pre {
  background: var(--document-editor-code-block);
  border: 1px solid var(--document-editor-border);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  overflow-x: auto;
}

.document-markdown-editor__content.tiptap pre code,
.document-markdown-editor__content .tiptap pre code {
  background: transparent;
  padding: 0;
}

.document-markdown-editor__content.tiptap a,
.document-markdown-editor__content .tiptap a {
  color: var(--document-editor-link);
  text-decoration: underline;
  cursor: pointer;
}

.document-markdown-editor__content.tiptap table,
.document-markdown-editor__content .tiptap table {
  border-collapse: collapse;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--document-editor-border);
  border-radius: 12px;
}

.document-markdown-editor__content.tiptap table th,
.document-markdown-editor__content.tiptap table td,
.document-markdown-editor__content .tiptap table th,
.document-markdown-editor__content .tiptap table td {
  border: 1px solid var(--document-editor-border);
  padding: 0.7rem 0.85rem;
  text-align: left;
  vertical-align: top;
}

.document-markdown-editor__content.tiptap table th,
.document-markdown-editor__content .tiptap table th {
  background: var(--document-editor-panel-alt);
  font-weight: 700;
}
`;

