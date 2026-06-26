import { type ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for LLM prose (insights, assistant replies, drafts).
 * Handles headings (#/##/###), **bold**, `code`, bullet (- / *) and numbered (1.) lists,
 * and > blockquotes. No dependency and no dangerouslySetInnerHTML — it builds React
 * elements, so model output can't inject HTML. Anything it doesn't recognise renders as
 * plain text, so it degrades gracefully.
 */

// Inline tokens: **bold** and `code`.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++} className="font-semibold text-[var(--color-text)]">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={key++} className="px-1 py-0.5 rounded bg-black/25 font-mono text-[0.92em]">{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isSpecial = (t: string) => /^(#{1,6}\s|>|[-*]\s|\d+\.\s)/.test(t);

export default function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; } // blank line = block separator

    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl <= 2
        ? "text-sm font-bold text-[var(--color-text)] mt-3 first:mt-0 mb-1"
        : "text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mt-3 first:mt-0 mb-1";
      blocks.push(<div key={key++} className={cls}>{inline(h[2])}</div>);
      i++; continue;
    }

    if (/^>\s?/.test(t)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { quote.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push(<blockquote key={key++} className="border-l-2 border-[var(--color-primary)]/50 pl-3 my-2 text-[var(--color-muted)]">{inline(quote.join(" "))}</blockquote>);
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      blocks.push(<ul key={key++} className="list-disc pl-5 my-2 space-y-1">{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++; }
      blocks.push(<ol key={key++} className="list-decimal pl-5 my-2 space-y-1">{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>);
      continue;
    }

    // paragraph: gather consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i].trim())) { para.push(lines[i].trim()); i++; }
    blocks.push(<p key={key++} className="my-1.5 first:mt-0 last:mb-0">{inline(para.join(" "))}</p>);
  }

  return <div className={className}>{blocks}</div>;
}
