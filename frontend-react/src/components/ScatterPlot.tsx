import { useNavigate } from "react-router-dom";
import type { CandidateListRow, ScoreLabel } from "../lib/types";

// Real hex values matching tailwind.config.js's actual palette — SVG
// fill can't consume Tailwind utility classes directly, so these are
// kept in sync with the same three colors ScoreLabelPill already uses
// for the identical need-led/credibility-led/neither mapping.
const DOT_COLOR: Record<ScoreLabel, string> = {
  opportunity: "#a05a2c", // clay-600
  confirmed: "#2f6d4f", // forest-600
  strong_lead: "#8a7658", // stone-500
  mixed: "#8a7658",
  early_signal: "#8a7658",
};

const W = 640;
const H = 420;
const PAD = 44;

/**
 * All 144 real candidates, need_score vs. credibility_score — nothing
 * fabricated, no third dimension invented (no "trend over time," since
 * this pipeline doesn't track historical score changes across runs).
 * Deterministic per-candidate jitter (not Math.random(), so points don't
 * jump around on re-render) — purely a rendering aid: need_score only
 * takes 6 discrete real values, so without jitter dozens of candidates
 * would render as one indistinguishable dot on the same vertical line.
 * The real values are unaffected — jitter is display-only, shown exactly
 * via the native tooltip and by clicking through to the real record.
 */
function jitter(id: string, range: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * range;
}

export function ScatterPlot({ candidates }: { candidates: CandidateListRow[] }) {
  const navigate = useNavigate();
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scatter plot of need score vs credibility score for all real candidates">
        {/* gridlines at 0/25/50/75/100 on both axes */}
        {[0, 25, 50, 75, 100].map((v) => {
          const x = PAD + (v / 100) * plotW;
          const y = PAD + plotH - (v / 100) * plotH;
          return (
            <g key={v}>
              <line x1={x} y1={PAD} x2={x} y2={PAD + plotH} stroke="#e2d9c9" strokeWidth={1} />
              <line x1={PAD} y1={y} x2={PAD + plotW} y2={y} stroke="#e2d9c9" strokeWidth={1} />
              <text x={x} y={PAD + plotH + 16} textAnchor="middle" fontSize="10" fill="#8a7658">
                {v}
              </text>
              <text x={PAD - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#8a7658">
                {v}
              </text>
            </g>
          );
        })}
        {/* axes */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + plotH} stroke="#a89577" strokeWidth={1.5} />
        <line x1={PAD} y1={PAD + plotH} x2={PAD + plotW} y2={PAD + plotH} stroke="#a89577" strokeWidth={1.5} />

        {/* points */}
        {candidates
          .filter((r) => r.need_score != null && r.credibility_score != null)
          .map((r) => {
            const jx = jitter(r.candidate_id, 6);
            const jy = jitter(r.candidate_id + "y", 6);
            const cx = PAD + (r.need_score / 100) * plotW + jx;
            const cy = PAD + plotH - (r.credibility_score / 100) * plotH + jy;
            return (
              <circle
                key={r.candidate_id}
                cx={cx}
                cy={cy}
                r={4}
                fill={DOT_COLOR[r.score_label]}
                fillOpacity={0.65}
                stroke="white"
                strokeWidth={0.75}
                className="cursor-pointer transition-[r] hover:r-[6]"
                onClick={() => navigate(`/candidates/${r.candidate_id}`)}
              >
                <title>
                  {r.name} — need {r.need_score.toFixed(1)} / cred {r.credibility_score.toFixed(1)}
                </title>
              </circle>
            );
          })}

        {/* axis titles */}
        <text x={PAD + plotW / 2} y={H - 4} textAnchor="middle" fontSize="11" fontWeight={600} fill="#a05a2c">
          Need score →
        </text>
        <text x={12} y={PAD + plotH / 2} textAnchor="middle" fontSize="11" fontWeight={600} fill="#2f6d4f" transform={`rotate(-90, 12, ${PAD + plotH / 2})`}>
          ↑ Credibility score
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[11.5px] text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT_COLOR.opportunity }} />
          need-led (Opportunity)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT_COLOR.confirmed }} />
          credibility-led (Confirmed)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT_COLOR.mixed }} />
          no single dominant axis
        </span>
      </div>
    </div>
  );
}
