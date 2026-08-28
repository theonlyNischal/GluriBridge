import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * Ported from the vanilla-JS app's checkStaleness() — surfaces the gap
 * between a registry-only refresh and the last news-enriched one LOUDLY,
 * not as a quiet footnote (see backend/app/scheduler.py's
 * _load_export_into_db() docstring for why this exists at all).
 */
export function StalenessBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .getStats()
      .then((stats) => {
        if (stats.news_data_stale) {
          setMessage(stats.news_data_stale_message ?? "Live dataset has drifted from its last news-enriched refresh.");
        }
      })
      .catch(() => {
        /* advisory only — never block the app on this */
      });
  }, []);

  if (!message) return null;
  return (
    <div className="border-b border-compliance-amber/30 bg-compliance-amberBg px-6 py-2 text-[13px] text-compliance-amber">
      ⚠ {message}
    </div>
  );
}
