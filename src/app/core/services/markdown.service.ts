import { Injectable } from '@angular/core';
import DOMPurify from 'dompurify';
import {
  calculateReadingTime,
  markdownToPlainText,
  renderMarkdownToHtml,
} from '../utils/markdown.util';

/** Length of the random suffix appended to generated slugs. */
const SLUG_SUFFIX_LENGTH = 4;

/**
 * Attributes the sanitiser must keep on anchors.
 *
 * DOMPurify drops every attribute that is not on its allowlist, so without this
 * the `target` and `rel` hardening applied by the renderer would be stripped
 * again on the way through `parseMarkdownToHtml`.
 */
const ALLOWED_LINK_ATTRIBUTES = ['target', 'rel'];

/** Applied to every anchor that survives sanitising. */
const EXTERNAL_LINK_ATTRIBUTES: Record<string, string> = {
  target: '_blank',
  rel: 'noopener noreferrer',
};

/**
 * Markdown rendering for article bodies and comment threads.
 *
 * Rendering happens in two steps: the shared pipeline in `markdown.util.ts` turns
 * GFM into HTML with hardened links, then DOMPurify strips anything executable
 * before the result is stored in `posts.content_html` /
 * `comments.content_html` or bound with `[innerHTML]`. Sanitising on the way in
 * as well as on the way out means a hostile body can never be persisted and
 * never reaches another reader.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  constructor() {
    // SEC-03, second half: markup stored before this service started hardening
    // links — or written by an older client — still arrives with a bare anchor.
    // Rewriting the attributes after sanitising guarantees every rendered link
    // carries them, whichever path produced the HTML.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'A') {
        return;
      }

      for (const [name, value] of Object.entries(EXTERNAL_LINK_ATTRIBUTES)) {
        node.setAttribute(name, value);
      }
    });
  }

  /**
   * Estimated reading time in whole minutes (minimum 1).
   *
   * Delegates to the shared pipeline so the editor preview, the published post
   * and the bundled offline dataset always agree on the number.
   */
  calculateReadingTime(markdown: string): number {
    return calculateReadingTime(markdown);
  }

  /**
   * Builds a URL-safe slug from a post title.
   *
   * The random suffix keeps slugs unique even when two authors pick the same
   * title, so the `posts.slug` unique constraint is never hit on publish.
   */
  generateSlug(title: string): string {
    const base = (title ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    return `${base || 'post'}-${randomSuffix(SLUG_SUFFIX_LENGTH)}`;
  }

  /**
   * Renders sanitised HTML for a markdown body. Returns `''` for empty input.
   *
   * The output is content only — no wrapper element — so the same stored HTML can
   * be rendered as an article (`devto-prose`) or as a comment (`devto-comment`).
   */
  parseMarkdownToHtml(markdown: string): string {
    const rendered = renderMarkdownToHtml(markdown);

    if (rendered.length === 0) {
      return '';
    }

    return DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ALLOWED_LINK_ATTRIBUTES,
      FORBID_TAGS: ['style', 'form', 'input', 'button'],
    });
  }

  /** Plain-text excerpt of a markdown body, used for previews and meta text. */
  toPlainText(markdown: string, maxLength = 160): string {
    return markdownToPlainText(markdown, maxLength);
  }
}

/** Random lowercase alphanumeric suffix drawn from the platform CSPRNG. */
function randomSuffix(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let suffix = '';
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }

  return suffix;
}
