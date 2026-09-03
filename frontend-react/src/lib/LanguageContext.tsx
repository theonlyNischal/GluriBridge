import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * EN/KO toggle (2026-09-03, added for Demo Day) — deliberately narrow
 * scope: real users are GluriBridge's own 2-person team, both Korean,
 * and competitors in this space ship Korean-language products, so this
 * isn't cosmetic. Scoped to the nav/header chrome + the Dashboard page
 * only for now (explicit choice, not an oversight) — everything else
 * (Candidates list, Candidate detail, Territory Discovery, How it
 * works) stays English. Extending coverage later means adding more
 * keys to STRINGS in lib/i18n.ts and more t() calls on that page; the
 * mechanism here doesn't change.
 *
 * Deliberately NOT applied to any real candidate data — names, orgs,
 * Indonesian legal citations, registry document names, news snippets.
 * That's evidence, not UI copy, and must stay verbatim in its original
 * language in both EN and KO modes; only app chrome ever passes through
 * t().
 */
export type Lang = "en" | "ko";

const STORAGE_KEY = "gluribridge-lang";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "ko" ? "ko" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private-browsing/blocked storage — the toggle still works for the
         rest of this session, it just won't survive a reload. Not worth
         surfacing to the user over. */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
