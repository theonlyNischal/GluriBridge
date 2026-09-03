import { useLanguage, type Lang } from "./LanguageContext";

/**
 * EN/KO string dictionary — scoped to the nav/header chrome (global,
 * every page) plus the Dashboard page only (2026-09-03, see
 * LanguageContext.tsx for the full scope reasoning). Every other page's
 * strings are plain hardcoded English in their own files, same as
 * before this existed; this file only grows when a NEW page is brought
 * into scope, not on every future English string added to Dashboard —
 * a key missing here just falls back to its English value via t()'s
 * own fallback, so an incomplete translation never blanks or breaks a
 * render.
 *
 * Korean copy drafted by Claude, not a native speaker. Revised once
 * (2026-09-03) against native-level review feedback — unified the
 * candidate/project term choice, dropped a stray hanja annotation,
 * tightened several stiff/translationese phrasings — but two of that
 * review's specific suggestions were deliberately NOT applied (see
 * "프로젝트" not bare "후보" below, and the activity-category comment):
 * still treat this as a strong draft, not final copy signed off by a
 * domain expert in Korean forestry-carbon terminology specifically.
 *
 * Deliberately excludes: candidate/org names, real Indonesian legal
 * citations and document names, registry IDs, province names, news
 * snippets — real evidentiary data stays verbatim in its original
 * language regardless of UI language; only app chrome ever passes
 * through t().
 */
export const STRINGS = {
  // Nav sidebar + header (App.tsx) — global chrome, both EN and KO.
  "nav.dashboard": { en: "Dashboard", ko: "대시보드" },
  "nav.territoryDiscovery": { en: "Territory Discovery", ko: "지역 탐색" },
  "nav.candidates": { en: "Candidates", ko: "프로젝트" },
  "nav.partnerships": { en: "Partnerships", ko: "파트너십" },
  "nav.tagline1": { en: "Indonesia forestry-carbon", ko: "인도네시아 산림 탄소" },
  "nav.tagline2": { en: "partner discovery", ko: "파트너 발굴" },
  "nav.howItWorks": { en: "How this works", ko: "작동 방식" },
  "nav.designSystem": { en: "Design system", ko: "디자인 시스템" },
  "nav.collapse": { en: "Collapse", ko: "접기" },
  "nav.expandSidebar": { en: "Expand sidebar", ko: "사이드바 펼치기" },
  "nav.collapseSidebar": { en: "Collapse sidebar", ko: "사이드바 접기" },
  "title.candidateDetail": { en: "Candidate detail", ko: "프로젝트 상세" },

  // Dashboard hero
  "dash.eyebrow": { en: "Real, evidence-backed candidate discovery", ko: "실제 데이터 기반, 증거 중심의 프로젝트 발굴" },
  // {n} substituted via t()'s caller — kept as a placeholder rather than
  // string concatenation because Korean word order puts the count
  // mid-sentence with no space before its counter word (명), not at the
  // start like English.
  "dash.headline": { en: "{n} real candidates in the pipeline", ko: "파이프라인에 실제 프로젝트 {n}개" },
  "dash.kpi.total": { en: "Total Candidates", ko: "전체 프로젝트" },
  "dash.kpi.total.sub": { en: "live from the API", ko: "API 실시간 데이터" },
  "dash.kpi.highOpp": { en: "High Opportunity", ko: "높은 기회" },
  "dash.kpi.highOpp.sub": { en: "Opportunity ≥ 70", ko: "기회 점수 ≥ 70" },
  "dash.kpi.highEvid": { en: "High Evidence Strength", ko: "높은 증거 강도" },
  "dash.kpi.highEvid.sub": { en: "Evidence Strength ≥ 70", ko: "증거 강도 ≥ 70" },
  "dash.kpi.compliance": { en: "Compliance Risk", ko: "규제 위험" },
  "dash.kpi.compliance.sub": { en: "Reporting Deadline amber/red badge", ko: "보고 기한 주의/위험 표시" },
  "dash.supportLine": {
    en: "Independent axes · never combined into one ranking · live from the registry",
    ko: "독립적인 두 축 · 하나의 순위로 합치지 않음 · 등록 데이터 실시간 반영",
  },

  // Contact ready / Also found cards
  "dash.contactReady": { en: "Contact ready", ko: "연락 가능" },
  "dash.contactReady.unit": { en: "contacts identified", ko: "건의 연락처 확보" },
  "dash.viewContacts": { en: "View contacts", ko: "연락처 보기" },
  // "검증된" (not "확인된") to match "Verified" -> "검증된" consistently
  // with scoreLabel.confirmed below — this app's Confirmed-vs-Verified
  // distinction (Confirmed = read directly from a registry field;
  // Verified = independently cross-checked, e.g. against the org's own
  // website) was explicitly called load-bearing for credibility earlier
  // this session, so the two English words should map to two DIFFERENT
  // Korean words consistently, not converge on one.
  "dash.chip.verifiedEmails": { en: "Verified emails", ko: "검증된 이메일" },
  "dash.chip.potentialMatches": { en: "Potential matches", ko: "가능성 있는 일치" },
  "dash.chip.namedNoEmail": { en: "Named contacts, no email", ko: "이름만 확인 (이메일 없음)" },
  "dash.alsoFound": { en: "Also found", ko: "다른 연락 방법" },
  "dash.alsoFound.unit": { en: "more ways to connect", ko: "건의 추가 연락 경로" },
  "dash.chip.phoneWhatsapp": { en: "Phone/WhatsApp", ko: "전화/왓츠앱" },
  "dash.chip.onlineOnly": { en: "Online presence only", ko: "온라인 정보만 있음" },

  // Panel titles + links
  "dash.panel.gallery": { en: "Candidate profiles — one real example per category", ko: "프로젝트 프로필 — 카테고리별 실제 예시 1건" },
  "dash.panel.map": {
    en: "Real candidate locations + real Customary Territory Registry overlaps",
    ko: "실제 프로젝트 위치 + 관습토지등록부(BRWA) 중첩 현황",
  },
  "dash.panel.province": { en: "Candidates by province (real, normalized)", ko: "주별 프로젝트 분포 (실제 데이터, 정규화됨)" },
  "dash.panel.topOpp": { en: "Top 5 by Opportunity", ko: "기회 점수 상위 5" },
  "dash.panel.topEvid": { en: "Top 5 by Evidence Strength", ko: "증거 강도 상위 5" },
  "dash.panel.projectType": { en: "Candidates by project type", ko: "프로젝트 유형별 분포" },
  "dash.panel.outreach": { en: "Outreach status", ko: "아웃리치 현황" },
  "dash.viewAllCandidates": { en: "View all candidates", ko: "전체 프로젝트 보기" },
  "dash.viewInTerritoryDiscovery": { en: "View in Territory Discovery", ko: "지역 탐색에서 보기" },
  "dash.outreach.note": {
    en: "Real, persisted state — set from a candidate's detail page, survives every data refresh.",
    ko: "실제 저장된 상태 — 프로젝트 상세 페이지에서 설정되며, 데이터가 갱신되어도 유지됩니다.",
  },

  // Score axes (reused across KPI subs, gallery cards, RankedList — see
  // ScoreStatCard's own label prop; ScoreLabelPill takes an optional
  // lang prop instead of importing this directly, see its own file)
  "score.opportunity": { en: "Opportunity", ko: "기회" },
  "score.evidence": { en: "Evidence Strength", ko: "증거 강도" },
  "score.opp.short": { en: "opp", ko: "기회" },
  "score.evid.short": { en: "evid", ko: "증거" },

  // Project type breakdown (ProjectTypeBreakdown.tsx) — these 5 values
  // are a real Indonesian forestry/carbon-registry classification
  // (activity_type.py), not a generic descriptive category invented for
  // this UI. Same discipline as SRUK/BRWA/DRAM elsewhere in the app:
  // the recognizable English/international term is kept in parens
  // rather than fully replaced by an invented Korean phrase I (not a
  // domain expert in Korean forestry-policy terminology) can't vouch
  // for as the actual term Indonesian/Korean carbon-market practitioners
  // would recognize. "Improved Forest Management" specifically keeps
  // its international acronym (IFM) since that's how it's referenced in
  // real Verra/VCS methodology documents.
  "activity.reforestation": { en: "Reforestation", ko: "재조림 (Reforestation)" },
  "activity.socialForestry": { en: "Social forestry", ko: "사회림 (Social Forestry)" },
  "activity.conservation": { en: "Conservation", ko: "보전 (Conservation)" },
  "activity.peatland": { en: "Peatland", ko: "이탄지 (Peatland)" },
  "activity.improvedForestManagement": { en: "Improved Forest Management", ko: "산림경영 개선 (IFM)" },
  "activity.unclassified": { en: "Unclassified", ko: "미분류" },
  "activity.notApplicable": { en: "Not applicable", ko: "해당 없음" },
  "dash.projectType.caption": {
    en: "A project can span more than one type, so these don't sum to",
    ko: "하나의 프로젝트가 여러 유형에 해당할 수 있어 합계가 다음 수와 일치하지 않습니다:",
  },

  // Province breakdown chrome-only labels (real province names stay
  // untranslated — proper nouns, not UI copy)
  "province.notAvailable": { en: "Not available", ko: "지역 정보 없음" },
  "province.other": { en: "Other", ko: "기타" },

  // Outreach status labels (STATUS_LABEL is shared app-wide and stays
  // English everywhere else; this Dashboard-only mirror is intentional,
  // not a fork of the source of truth)
  "status.notContacted": { en: "Not contacted", ko: "미접촉" },
  "status.contacted": { en: "Contacted", ko: "접촉 완료" },
  "status.followUpNeeded": { en: "Follow-up needed", ko: "후속 조치 필요" },
  "status.done": { en: "Done", ko: "완료" },
  "status.rejected": { en: "Rejected", ko: "거절됨" },

  // score_label category pills (ScoreLabelPill's own SCORE_LABEL_TEXT is
  // the English source of truth everywhere else; this is an opt-in
  // Korean mirror passed only from Dashboard call sites)
  "scoreLabel.opportunity": { en: "High Opportunity", ko: "높은 기회" },
  "scoreLabel.confirmed": { en: "Verified Project", ko: "검증된 프로젝트" },
  "scoreLabel.strongLead": { en: "Promising Lead", ko: "유망한 리드" },
  "scoreLabel.mixed": { en: "Balanced", ko: "균형" },
  "scoreLabel.earlySignal": { en: "Early signal", ko: "초기 신호" },

  // DashboardMap legend + popup chrome (Dashboard-exclusive component,
  // not shared with Territory Discovery's own TerritoryMap.tsx)
  "map.legend.rich": { en: "rich candidate", ko: "증거 충분" },
  "map.legend.thin": { en: "thin candidate", ko: "증거 부족" },
  "map.legend.territory": { en: "real customary territory", ko: "실제 관습토지" },
  "map.legend.shown": { en: "shown", ko: "표시됨" },
  "map.popup.viewCandidate": { en: "View candidate", ko: "프로젝트 보기" },

  // Closing trust-badge row
  "dash.trust.confirmedInferred": { en: "Confirmed vs. inferred, always labeled", ko: "확인된 정보와 추정 정보를 항상 구분 표시" },
  "dash.trust.noLlm": { en: "No LLM for scoring or matching", ko: "점수 산정과 매칭에 LLM 미사용" },
  "dash.trust.independentAxes": { en: "Opportunity and Evidence Strength scored independently", ko: "기회 점수와 증거 강도는 독립적으로 산정" },

  // Landing page (2026-09-03) — scope extended here from Dashboard-only,
  // per explicit request: the cold-open front door is exactly the
  // scenario (no narrator to bridge language) where a language choice
  // matters most, more than the live demo does. Small surface (~10
  // keys) — reuses dash.trust.noLlm/independentAxes and
  // nav.howItWorks/nav.designSystem above rather than duplicating them.
  "landing.eyebrow": { en: "Indonesia forestry-carbon partner discovery", ko: "인도네시아 산림 탄소 파트너 발굴" },
  "landing.headline": {
    en: "Real forestry-carbon partners in Indonesia — found, scored, and evidence-checked.",
    ko: "인도네시아의 실제 산림 탄소 파트너 — 발굴하고, 평가하고, 증거로 검증합니다.",
  },
  "landing.sentence": {
    en: "GluriBridge turns public registries, land-rights records, and news into one pipeline — every number here traces back to a real, checkable source.",
    ko: "GluriBridge는 공공 등록 정보, 토지권리 기록, 뉴스를 하나의 파이프라인으로 통합합니다 — 여기의 모든 숫자는 실제로 확인 가능한 출처에서 나옵니다.",
  },
  "landing.kpi.candidates": { en: "Real candidates", ko: "실제 프로젝트" },
  "landing.kpi.candidates.sub": { en: "Live from the registry", ko: "등록 데이터 실시간 반영" },
  "landing.kpi.scored": { en: "Scored independently", ko: "독립적으로 평가" },
  // {n} substituted by the caller, same placeholder pattern as
  // dash.headline above.
  "landing.kpi.scored.sub": { en: "high-opportunity · + {n} high-evidence", ko: "기회 상위 · 증거 상위 +{n}" },
  "landing.kpi.contacts": { en: "Direct contacts found", ko: "직접 연락처 확보" },
  "landing.kpi.contacts.sub": { en: "+ {n} more identified by name", ko: "+ {n}건 이름만 확인" },
  "landing.cta": { en: "View dashboard", ko: "대시보드 보기" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key]?.[lang] ?? STRINGS[key]?.en ?? key;
}

/** Convenience hook — `const { t, lang } = useT()` reads the current
 * language from context so call sites don't have to thread it through
 * themselves. */
export function useT() {
  const { lang } = useLanguage();
  return { t: (key: StringKey) => t(key, lang), lang };
}
