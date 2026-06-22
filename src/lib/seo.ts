import { useEffect } from "react";

// Dependency-free per-route SEO. Sets document.title and upserts the meta/OG/Twitter
// tags + canonical for the current page — purely additive (no UI/design change). Use
// on public pages so each has an intent-matched title + description for search & social.

interface SeoOpts {
  title: string;
  description?: string;
  canonical?: string;   // defaults to current origin+pathname
  noindex?: boolean;    // utility pages (forgot/set-password, 404) → keep out of the index
  image?: string;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement("link"); el.setAttribute("rel", rel); document.head.appendChild(el); }
  el.setAttribute("href", href);
}

export function useSeo({ title, description, canonical, noindex, image }: SeoOpts) {
  useEffect(() => {
    if (title) {
      document.title = title;
      upsertMeta('meta[property="og:title"]', "property", "og:title", title);
      upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    }
    if (description) {
      upsertMeta('meta[name="description"]', "name", "description", description);
      upsertMeta('meta[property="og:description"]', "property", "og:description", description);
      upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    }
    const url = canonical || (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
    if (url) {
      upsertLink("canonical", url);
      upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    }
    if (image) {
      upsertMeta('meta[property="og:image"]', "property", "og:image", image);
      upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
    }
    upsertMeta('meta[name="robots"]', "name", "robots", noindex ? "noindex, follow" : "index, follow");
  }, [title, description, canonical, noindex, image]);
}
