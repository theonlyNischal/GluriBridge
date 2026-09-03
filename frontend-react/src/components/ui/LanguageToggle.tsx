import { useLanguage } from "../../lib/LanguageContext";

/**
 * Small EN|KO pill toggle (2026-09-03) — shared between the app shell's
 * header (App.tsx) and the landing page (LandingPage.tsx, 2026-09-03
 * addition). Extracted here rather than duplicated: both places need the
 * exact same real control over the exact same persisted language state
 * (LanguageContext), not two independent-looking toggles that happen to
 * look alike. `className` lets each call site handle its own
 * positioning (e.g. `ml-auto` in a flex header) without baking a layout
 * assumption into the shared component.
 */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  return (
    <div className={`flex items-center rounded-full border border-stone-200 bg-stone-100 p-0.5 text-[11px] font-semibold ${className}`}>
      <button
        onClick={() => setLang("en")}
        className={`rounded-full px-2.5 py-1 transition ${lang === "en" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("ko")}
        className={`rounded-full px-2.5 py-1 transition ${lang === "ko" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
      >
        KO
      </button>
    </div>
  );
}
