import { Marked, Renderer, type Tokens } from 'marked';

/**
 * Framework-free markdown pipeline shared by the article renderer and the
 * bundled sample content.
 *
 * `MarkdownService` layers DOMPurify on top of {@link renderMarkdownToHtml} for
 * anything a user can type. The offline dataset renders through the same
 * function without sanitising, because its markup is a compile-time constant of
 * this application rather than input. Keeping one implementation means the
 * sample posts, the seeded database rows and live posts all produce byte
 * identical HTML for the same markdown.
 */

/** Words per minute used by the reading-time estimate. */
export const WORDS_PER_MINUTE = 200;

/**
 * Attributes added to every rendered anchor (SEC-03).
 *
 * `target="_blank"` opens the reference without losing the reader's place, and
 * `rel="noopener noreferrer"` denies the opened page a `window.opener` handle
 * and the referrer header. Without them a link in an article body could navigate
 * the reader's own tab, or reach back into it.
 */
export const EXTERNAL_LINK_ATTRIBUTES = 'target="_blank" rel="noopener noreferrer"';

/** Matches the opening tag of a rendered anchor, including its newline form. */
const ANCHOR_START = /^<a(\s|>)/;

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    /**
     * Delegates to the upstream renderer so URL cleaning and entity escaping
     * stay exactly as marked implements them, then adds the external-link
     * attributes to the emitted anchor.
     */
    link(this: Renderer, token: Tokens.Link): string {
      const html = new Renderer().link.call(this, token);

      if (!ANCHOR_START.test(html)) {
        // An unparseable URL renders as bare text, which must stay untouched.
        return html;
      }

      return html.replace(ANCHOR_START, `<a ${EXTERNAL_LINK_ATTRIBUTES}$1`);
    },
  },
});

/** Renders markdown to raw HTML. Returns an empty string for blank input. */
export function renderMarkdownToHtml(source: string): string {
  const trimmed = (source ?? '').trim();

  if (trimmed.length === 0) {
    return '';
  }

  return markdown.parse(trimmed, { async: false }) as string;
}

/**
 * Estimated reading time in whole minutes (minimum 1).
 *
 * Fenced code blocks are excluded because they are skimmed rather than read, and
 * markdown punctuation is stripped so it does not inflate the count.
 */
export function calculateReadingTime(source: string): number {
  const trimmed = (source ?? '').trim();

  if (trimmed.length === 0) {
    return 1;
  }

  const withoutCodeFences = trimmed.replace(/```[\s\S]*?```/g, '');
  const plainText = withoutCodeFences
    .replace(/`[^`]*`/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ');

  const wordCount = plainText.split(/\s+/).filter((word) => word.length > 0).length;

  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

/** Plain-text excerpt of a markdown body, used for previews and meta text. */
export function markdownToPlainText(source: string, maxLength = 160): string {
  const text = (source ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
