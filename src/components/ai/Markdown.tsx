import { type ReactNode, type CSSProperties } from "react";

/**
 * Minimal, safe Markdown renderer for LLM prose (insights, assistant replies, drafts).
 * Handles headings (#–######), **bold**, *italic*, `code`, [links](url), bullet (- / *)
 * and numbered (1.) lists, > blockquotes, --- horizontal rules, and GitHub-style
 * | pipe | tables | (with :--: alignment). No dependency and no dangerouslySetInnerHTML
 * — it builds React elements, so model output can't inject HTML. Anything it doesn't
 * recognise renders as plain text, so it degrades gracefully.
 *
 * Tables matter most: LLM financial answers lean on them heavily, and without real
 * table support the rows collapse into a wall of "| a | b | |---|---|" pipe-soup.
 */

const LINK = "text-[var(--color-primary)] underline decoration-[var(--color-primary)]/40 underline-offset-2 hover:decoration-[var(--color-primary)]";

// Inline tokens: **bold**, *italic*, `code`, [text](url). Ordered so ** wins over *.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++} className="font-semibold text-[var(--color-text)]">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key++} className="italic">{m[2]}</em>);
    else if (m[3] !== undefined) out.push(<code key={key++} className="px-1 py-0.5 rounded bg-black/25 font-mono text-[0.92em]">{m[3]}</code>);
    else if (m[4] !== undefined) out.push(<a key={key++} href={m[5]} target="_blank" rel="noopener noreferrer" className={LINK}>{m[4]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HR = /^(-{3,}|\*{3,}|_{3,})$/;
// A table separator row, e.g. |---|:--:|--:| — only dashes, colons, pipes, spaces.
const isSep = (s: string) => s.includes("-") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(s);
// Split a pipe row into trimmed cells, dropping the empties from leading/trailing pipes.
const splitRow = (s: string) => s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSpecial = (t: string) => /^(#{1,6}\s|>|[-*]\s|\d+\.\s)/.test(t) || HR.test(t) || t.includes("|");

export default function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  const n = lines.length;
  let i = 0;
  let key = 0;

  while (i < n) {
    const t = lines[i].trim();
    if (!t) { i++; continue; } // blank line = block separator

    // Horizontal rule
    if (HR.test(t)) { blocks.push(<hr key={key++} className="my-3 border-0 border-t border-[var(--color-border)]" />); i++; continue; }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl <= 2
        ? "text-sm font-bold text-[var(--color-text)] mt-3 first:mt-0 mb-1.5"
        : "text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mt-3 first:mt-0 mb-1";
      blocks.push(<div key={key++} className={cls}>{inline(h[2])}</div>);
      i++; continue;
    }

    // Table: a pipe row immediately followed by a separator row.
    if (t.includes("|") && i + 1 < n && isSep(lines[i + 1].trim())) {
      const header = splitRow(t);
      const aligns = splitRow(lines[i + 1].trim()).map((c): CSSProperties["textAlign"] => {
        const l = c.startsWith(":"), r = c.endsWith(":");
        return l && r ? "center" : r ? "right" : "left";
      });
      i += 2;
      const rows: string[][] = [];
      while (i < n && lines[i].trim().includes("|") && !isSep(lines[i].trim())) { rows.push(splitRow(lines[i].trim())); i++; }
      blocks.push(
        <div key={key++} className="overflow-x-auto my-2.5 rounded-lg border border-[var(--color-border)]">
          <table className="w-full border-collapse text-[0.9em] tabular-nums">
            <thead>
              <tr className="bg-white/[0.03]">
                {header.map((c, ci) => (
                  <th key={ci} style={{ textAlign: aligns[ci] ?? "left" }}
                    className="px-3 py-2 font-semibold text-[var(--color-text)] border-b border-[var(--color-border)] whitespace-nowrap">{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="even:bg-white/[0.02]">
                  {r.map((c, ci) => (
                    <td key={ci} style={{ textAlign: aligns[ci] ?? "left" }}
                      className="px-3 py-1.5 align-top text-[var(--color-text)]/90 border-b border-[var(--color-border)]/40 last:border-0">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(t)) {
      const quote: string[] = [];
      while (i < n && /^>\s?/.test(lines[i].trim())) { quote.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push(<blockquote key={key++} className="border-l-2 border-[var(--color-primary)]/50 pl-3 my-2 text-[var(--color-muted)]">{inline(quote.join(" "))}</blockquote>);
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < n && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      blocks.push(<ul key={key++} className="list-disc pl-5 my-2 space-y-1.5">{items.map((it, j) => <li key={j} className="pl-1">{inline(it)}</li>)}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(t)) {
      const items: string[] = [];
      while (i < n && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++; }
      blocks.push(<ol key={key++} className="list-decimal pl-5 my-2 space-y-1.5">{items.map((it, j) => <li key={j} className="pl-1">{inline(it)}</li>)}</ol>);
      continue;
    }

    // Paragraph: push this line, then gather following plain lines (never special ones,
    // so pipe rows / headings start fresh blocks instead of flattening together).
    const para: string[] = [t]; i++;
    while (i < n && lines[i].trim() && !isSpecial(lines[i].trim())) { para.push(lines[i].trim()); i++; }
    blocks.push(<p key={key++} className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{inline(para.join(" "))}</p>);
  }

  return <div className={className}>{blocks}</div>;
}
