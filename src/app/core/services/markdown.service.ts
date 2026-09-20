import { Injectable } from '@angular/core';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/** Words per minute used by the reading-time estimate. */
const WORDS_PER_MINUTE = 200;

/** Length of the random suffix appended to generated slugs. */
const SLUG_SUFFIX_LENGTH = 4;

/** Wrapper class around rendered article HTML; styled in `src/styles.css`. */
const PROSE_WRAPPER_CLASS = 'devto-prose';

/**
 * Markdown rendering for article bodies and comment threads.
 *
 * Rendering happens in two steps: `marked` turns GFM into HTML and DOMPurify
 * strips anything executable before the result is stored in
 * `posts.content_html` / `comments.content_html` or bound with `[innerHTML]`.
 * Sanitising on the way in as well as on the way out means a hostile body can
 * never be persisted and never reaches another reader.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly markdown = new Marked({
    gfm: true,
    breaks: true,
  });

  /**
   * Estimated reading time in whole minutes (minimum 1).
   *
   * Fenced code blocks are excluded because they are skimmed rather than read,
   * and markdown punctuation is stripped so it does not inflate the count.
   */
  calculateReadingTime(markdown: string): number {
    const source = (markdown ?? '').trim();

    if (source.length === 0) {
      return 1;
    }

    const withoutCodeFences = source.replace(/```[\s\S]*?```/g, '');
    const plainText = withoutCodeFences
      .replace(/`[^`]*`/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_~-]+/g, ' ');

    const wordCount = plainText.split(/\s+/).filter((word) => word.length > 0).length;

    return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
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

  /** Renders sanitised HTML for a markdown body. Returns `''` for empty input. */
  parseMarkdownToHtml(markdown: string): string {
    const source = (markdown ?? '').trim();

    if (source.length === 0) {
      return '';
    }

    const rendered = this.markdown.parse(source, { async: false }) as string;

    return DOMPurify.sanitize(`<div class="${PROSE_WRAPPER_CLASS}">${rendered}</div>`, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button'],
    });
  }

  /** Plain-text excerpt of a markdown body, used for previews and meta text. */
  toPlainText(markdown: string, maxLength = 160): string {
    const text = (markdown ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
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
