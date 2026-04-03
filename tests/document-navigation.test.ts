import { describe, expect, it } from 'vitest';

import {
  buildBreadcrumbSegments,
  resolveDocumentLink,
} from '@takatoshi-maeda/ai-kit-expo/document';

describe('resolveDocumentLink', () => {
  it('resolves sibling documents relative to the current file', () => {
    expect(resolveDocumentLink('docs/spec/overview.md', './constraints.md')).toEqual({
      kind: 'internal',
      path: 'docs/spec/constraints.md',
      anchor: undefined,
    });
  });

  it('resolves parent traversal and preserves anchors', () => {
    expect(resolveDocumentLink('docs/spec/overview.md', '../README.md#intro')).toEqual({
      kind: 'internal',
      path: 'docs/README.md',
      anchor: 'intro',
    });
  });

  it('classifies external urls separately', () => {
    expect(resolveDocumentLink('docs/spec/overview.md', 'https://example.com/spec')).toEqual({
      kind: 'external',
      href: 'https://example.com/spec',
    });
  });
});

describe('buildBreadcrumbSegments', () => {
  it('builds cumulative path segments', () => {
    expect(buildBreadcrumbSegments('docs/spec/overview.md')).toEqual([
      { label: 'docs', path: 'docs' },
      { label: 'spec', path: 'docs/spec' },
      { label: 'overview.md', path: 'docs/spec/overview.md' },
    ]);
  });
});
