export type ResolvedDocumentLink =
  | { kind: 'internal'; path: string; anchor?: string }
  | { kind: 'external'; href: string }
  | { kind: 'anchor'; anchor: string };

export type BreadcrumbSegment = {
  label: string;
  path: string;
};

function normalizeDocumentPath(input: string): string {
  const cleaned = input.replace(/\\/g, '/');
  const isRooted = cleaned.startsWith('/');
  const parts = cleaned.split('/');
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      if (normalized.length > 0) {
        normalized.pop();
      }
      continue;
    }
    normalized.push(part);
  }

  return `${isRooted ? '/' : ''}${normalized.join('/')}`;
}

function dirname(documentPath: string): string {
  const normalized = normalizeDocumentPath(documentPath).replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return '';
  }
  return parts.slice(0, -1).join('/');
}

export function resolveDocumentLink(basePath: string, href: string): ResolvedDocumentLink | null {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('#')) {
    return { kind: 'anchor', anchor: trimmed.slice(1) };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { kind: 'external', href: trimmed };
  }

  const [withoutQuery = trimmed] = trimmed.split('?');
  const [pathPart = withoutQuery, anchor] = withoutQuery.split('#');
  if (!pathPart) {
    return anchor ? { kind: 'anchor', anchor } : null;
  }

  if (pathPart.startsWith('/')) {
    return {
      kind: 'internal',
      path: normalizeDocumentPath(pathPart).replace(/^\/+/, ''),
      anchor,
    };
  }

  return {
    kind: 'internal',
    path: normalizeDocumentPath([dirname(basePath), pathPart].filter(Boolean).join('/')).replace(/^\/+/, ''),
    anchor,
  };
}

export function buildBreadcrumbSegments(documentPath: string): BreadcrumbSegment[] {
  const normalized = normalizeDocumentPath(documentPath).replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join('/'),
  }));
}

