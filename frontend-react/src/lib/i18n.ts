import { useLanguage, type Lang } from "./LanguageContext";

/**
 * EN/KO string dictionary — covers the nav/header chrome (global, every
 * page) plus every real page in the app: Dashboard (2026-09-03),
 * Landing (2026-09-03), and Candidates list/Candidate detail/Territory
 * Discovery/Partnerships (Tracked)/Sync (Registry)/How this works, all
 * added 2026-09-04 (see LanguageContext.tsx for the full scope
 * reasoning, including the one residual boundary: backend-generated
 * dynamic prose has no Korean anywhere and stays English even on a
 * now-covered page). Design System is the one page deliberately still
 * English-only — internal component reference, not a real user path.
 * A key missing here just falls back to its English value via t()'s
 * own fallback, so an incomplete translation never blanks or breaks a
 * render — this file grows whenever a page's coverage is extended, not
 * on every single future English string added anywhere.
 *
 * Korean copy drafted by Claude, not a native speaker. Revised once
 * (2026-09-03) against native-level review feedback — unified the
 * candidate/project term choice, dropped a stray hanja annotation,
 * tightened several stiff/translationese phrasings — but two of that
 * review's specific suggestions were deliberately NOT applied (see
 * "프로젝트" not bare "후보" below, and the activity-category comment):
 * still treat this as a strong draft, not final copy signed off by a
 * domain expert in Korean forestry-carbon terminology specifically.
 * The 2026-09-04 expansion (six pages' worth of new keys) reused this
 * same established vocabulary everywhere the same concept recurred,
 * rather than each page inventing its own — but was NOT itself put
 * through a second native-level review pass; same caveat applies.
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
  "nav.sync": { en: "Registry Sync", ko: "레지스트리 동기화" },
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
    // 2026-09-04 rewrite: the original conjugated into a full sentence
    // ("...검증합니다"), a different, more formal register than the
    // English headline's own terse noun-fragment style ("found, scored,
    // and evidence-checked"). Bare noun phrases match that register.
    // "산림탄소" solid (no space) — real Korean forestry-carbon
    // terminology writes it this way (e.g. 산림탄소상쇄제도, the actual
    // government term for the forest carbon offset system), not "산림
    // 탄소" split. "증거 기반 검증" ("evidence-BASED verification"),
    // not the terser "증거 검증" alone — that reads ambiguously as
    // "verifying the evidence" rather than "verifying [the partners]
    // via evidence," which 기반 resolves without losing the terseness.
    ko: "인도네시아 실제 산림탄소 파트너 — 발굴, 평가, 증거 기반 검증.",
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

  // Territory Discovery page (2026-09-04) — scope extended here from
  // Dashboard/landing-only, static UI chrome only (headings, filter
  // labels, panel titles, empty/loading states, tooltips). Real
  // candidate names, org names, province/territory names, and anything
  // read live from the API stay untranslated, same rule as every other
  // page in scope. A few fragments below are split at the same node
  // boundary the JSX already uses around an interpolated number/link so
  // the two languages can each attach their own counters/particles
  // correctly (Korean counters/particles attach directly to the digit,
  // no space) — see the call site for how the pieces recombine; every
  // `en` value here still reconstructs byte-for-byte to the page's
  // original English sentence.
  "territory.loading": { en: "Loading…", ko: "불러오는 중…" },
  "territory.subtitle": {
    en: "Real candidate locations + real Customary Territory Registry (BRWA) geometry, fetched on demand",
    ko: "실제 프로젝트 위치 + 실제 관습토지등록부(BRWA) 지오메트리, 필요 시 불러옴",
  },

  "territory.summary.candidatesCount": { en: "{n} real candidates", ko: "실제 프로젝트 {n}건이" },
  "territory.summary.mappedPrefix": { en: "are mapped here, spanning ", ko: "지도에 표시되며, 실제 " },
  "territory.summary.provincesMid": { en: " real provinces (", ko: "개 주에 걸쳐 있습니다 (" },
  "territory.summary.noProvinceSuffix": { en: " have no province on file).", ko: "건은 등록된 주 정보가 없습니다)." },
  "territory.summary.territoriesTrackedMid": {
    en: " real customary territories are tracked, of which ",
    ko: "개의 실제 관습토지가 추적되고 있으며, 이 중 ",
  },
  "territory.summary.geometrySuffix": {
    en: " ({pct}%) have geometry on file — a confirmed real ceiling for this data source, not an in-progress number. ",
    ko: "개({pct}%)는 경계 데이터가 있습니다 — 이는 이 데이터 출처의 확정된 실제 한계치이며, 진행 중인 수치가 아닙니다. ",
  },
  "territory.summary.loadingTerritories": { en: "Real customary territory totals are loading… ", ko: "실제 관습토지 총계를 불러오는 중입니다… " },
  "territory.summary.overlapCountLink": { en: "{n}", ko: "{n}건의" },
  "territory.summary.overlapSuffix": {
    en: "candidates have a confirmed land-rights overlap with a specific territory.",
    ko: "프로젝트가 특정 지역과 확인된 토지권리 중첩이 있습니다.",
  },

  "territory.legend.selected": { en: "selected territory", ko: "선택한 관습토지" },
  "territory.map.shownCount": { en: "{shown} of {total} shown", ko: "{total}건 중 {shown}건 표시" },

  "territory.mapGap.label": { en: "Some candidates not shown on map", ko: "일부 프로젝트는 지도에 표시되지 않음" },
  "territory.mapGap.body": {
    en: "{missing} of {total} filtered candidates have no real coordinates on file.",
    ko: "필터링된 프로젝트 {total}건 중 {missing}건은 실제 좌표 정보가 없습니다.",
  },
  "territory.geometryMissing.label": { en: "No geometry on file", ko: "경계 데이터 없음" },
  "territory.geometryNotice": {
    en: "This territory has no real geometry on file — a confirmed real gap for ~23% of customary territories, not a bug.",
    ko: "이 지역은 실제 경계 데이터가 없습니다 — 관습토지의 약 23%에 해당하는 확인된 실제 데이터 공백이며, 오류가 아닙니다.",
  },

  "territory.filterPanel.title": { en: "Filter candidates", ko: "프로젝트 필터" },
  "territory.filterPanel.province": { en: "Province", ko: "주" },
  "territory.filterPanel.allProvinces": { en: "All provinces", ko: "전체 주" },
  "territory.filterPanel.anyOpportunity": { en: "Any opportunity", ko: "전체 기회 점수" },
  "territory.filterPanel.anyEvidence": { en: "Any evidence strength", ko: "전체 증거 강도" },
  "territory.filterPanel.richness": { en: "Richness", ko: "증거 수준" },
  "territory.filterPanel.allRichness": { en: "All richness", ko: "전체 증거 수준" },
  "territory.filterPanel.landRightsOverlap": { en: "Land rights / Customary Territory Overlap", ko: "토지권리 / 관습토지 중첩" },
  "territory.filterPanel.anyOverlapStatus": { en: "Any overlap status", ko: "전체 중첩 상태" },
  "territory.filterPanel.shownOfTotal": { en: "{shown} of {total}", ko: "{total}건 중 {shown}건" },
  "territory.filterPanel.reset": { en: "Reset", ko: "초기화" },

  // Richness/overlap filter option labels — same rich/thin concept as
  // map.legend.rich/thin above, reused Korean term for consistency
  // ("증거 충분"/"증거 부족") even though this page's English wording
  // ("Strong Evidence"/"Limited Evidence") differs from the Dashboard
  // map legend's ("rich candidate"/"thin candidate").
  "territory.richness.strong": { en: "Strong Evidence", ko: "증거 충분" },
  "territory.richness.corroborated": { en: "Corroborated", ko: "상호 확인됨" },
  "territory.richness.limited": { en: "Limited Evidence", ko: "증거 부족" },
  "territory.overlap.confirmed": { en: "Confirmed overlap", ko: "확인된 중첩" },
  "territory.overlap.notConfirmed": { en: "No confirmed overlap", ko: "확인된 중첩 없음" },

  "territory.selectedRegion.title": { en: "Selected region", ko: "선택된 주" },
  "territory.selectedRegion.titlePrefix": { en: "Selected region — ", ko: "선택된 주 — " },
  "territory.selectedRegion.noneLabel": { en: "No region selected", ko: "선택된 주 없음" },
  "territory.selectedRegion.noneBody": {
    en: "Pick a province in the filter panel to see real aggregate stats for candidates there.",
    ko: "필터 패널에서 주를 선택하면 해당 지역 프로젝트의 실제 집계 통계를 볼 수 있습니다.",
  },
  "territory.selectedRegion.noMatchLabel": { en: "No candidates match", ko: "일치하는 프로젝트 없음" },
  "territory.selectedRegion.noMatchBody": {
    en: "No real candidates in {province} match the other active filters.",
    ko: "{province}에 다른 활성 필터와 일치하는 실제 프로젝트가 없습니다.",
  },
  "territory.selectedRegion.strongLimited": { en: "Strong / limited evidence", ko: "증거 충분 / 부족" },
  "territory.selectedRegion.avgOpportunity": { en: "Avg opportunity", ko: "평균 기회" },
  "territory.selectedRegion.avgEvidence": { en: "Avg evidence strength", ko: "평균 증거 강도" },
  "territory.selectedRegion.corroboratedNote": {
    en: "+{n} corroborated (real, not shown above)",
    ko: "+{n}건 상호 확인됨 (실제 데이터, 위에 표시되지 않음)",
  },
  "territory.selectedRegion.topOpportunityLabel": {
    en: "Top opportunity (highest Opportunity score here)",
    ko: "최고 기회 (여기서 가장 높은 기회 점수)",
  },
  "territory.selectedRegion.opportunitySuffix": { en: " — opportunity {score}", ko: " — 기회 {score}" },

  "territory.search.title": { en: "Search real customary territories", ko: "실제 관습토지 검색" },
  "territory.search.placeholder": { en: "Territory name…", ko: "지역 이름…" },
  "territory.search.failedPrefix": { en: "Search failed: ", ko: "검색 실패: " },
  "territory.search.hint": {
    en: "Type at least 2 characters — searches real customary territory names.",
    ko: "2자 이상 입력하세요 — 실제 관습토지 이름을 검색합니다.",
  },
  "territory.search.noMatches": {
    en: 'No real customary territory matches "{q}".',
    ko: '실제 관습토지 중 "{q}"와 일치하는 결과가 없습니다.',
  },

  // Search-result tooltip/compact chrome. POLICY_TIER_LABEL /
  // COMPACT_POLICY_TIER_LABEL (lib/format.ts and this page's own local
  // const) are shared, non-lang-aware English lookups also used by
  // CandidateDetailPage (out of scope, stays English) — same pattern as
  // status.*/scoreLabel.* above: a Territory-Discovery-only Korean
  // mirror, not a fork of the source of truth.
  "territory.noProvinceOnFile": { en: "no province on file", ko: "등록된 주 정보 없음" },
  "territory.hasGeometryOnFile": { en: "boundary shape on file", ko: "경계 데이터 있음" },
  "territory.noGeometryOnFile": { en: "no boundary shape on file", ko: "경계 데이터 없음" },
  "territory.onFileCompact": { en: "on file", ko: "보유" },
  "territory.noBoundaryCompact": { en: "no boundary", ko: "경계 없음" },
  "territory.policyTier.penetapan": { en: "Formally decreed", ko: "공식 결정됨" },
  "territory.policyTier.pengaturan": { en: "In regulatory process", ko: "규제 절차 진행 중" },
  "territory.policyTier.belumAda": { en: "Not yet established", ko: "아직 미확정" },
  "territory.policyTierCompact.penetapan": { en: "Decreed", ko: "결정됨" },
  "territory.policyTierCompact.pengaturan": { en: "In process", ko: "진행 중" },
  "territory.policyTierCompact.belumAda": { en: "None yet", ko: "미확정" },

  "territory.overlapPanel.title": { en: "Territories with confirmed candidate overlap", ko: "확인된 프로젝트 중첩이 있는 지역" },
  "territory.overlapPanel.note": {
    en:
      "Real, confirmed land-rights checks only ({withOverlap} of {total} candidates) — a territory absent here hasn't necessarily " +
      "been checked against every candidate, per gluribridge/README.md's Open Items.",
    ko: "실제로 확인된 토지권리 검토만 표시됩니다 ({total}건 중 {withOverlap}건) — 여기 없는 지역이 모든 프로젝트와 대조 확인된 것은 아닙니다. 자세한 내용은 gluribridge/README.md의 Open Items 참고.",
  },
  "territory.overlapPanel.noneLabel": { en: "No confirmed overlaps in the current data", ko: "현재 데이터에 확인된 중첩 없음" },

  "territory.topList.title": { en: "Top territories — real candidate count by province", ko: "상위 지역 — 주별 실제 프로젝트 수" },
  "territory.topList.caption": {
    en:
      "Ranked by real candidate count, not average need score — a province with a single high-need candidate would otherwise misleadingly " +
      "outrank one with genuine breadth. Reflects the other active filters (not the Province filter itself); click a row for its exact filtered " +
      "Candidates view. ",
    ko: "평균 기회 점수가 아닌 실제 프로젝트 수를 기준으로 순위를 매깁니다 — 그렇지 않으면 기회 점수가 매우 높은 프로젝트 하나만 있는 주가, 실제로 폭넓게 분포된 주보다 부당하게 높은 순위를 차지할 수 있습니다. 주 필터 자체를 제외한 다른 활성 필터를 반영합니다. 행을 클릭하면 해당 필터가 적용된 정확한 프로젝트 목록을 볼 수 있습니다. ",
  },
  "territory.topList.excludedNote": {
    en: "{n} candidates with no province on file (or spanning multiple provinces) are excluded from this geographic ranking — use the Province filter to view them directly.",
    ko: "등록된 주 정보가 없거나 여러 주에 걸친 프로젝트 {n}건은 이 지역 순위에서 제외되었습니다 — 직접 확인하려면 주 필터를 사용하세요.",
  },

  // Registry Sync page (2026-09-04) — scope extended here from
  // Dashboard+Landing-only, same pattern as landing.* above: static UI
  // chrome only (headings, table headers, status/phase labels, button
  // labels, the fixed wrapper text around dynamic result messages).
  // Deliberately NOT applied to: real timestamps, SRUK/SRN-PPI/Verra/
  // BRWA (real registry proper nouns), or any backend-composed message
  // fragment (FreezeInfo.reason, RefreshLogEntry.detail, SourceFreshness.
  // note, thrown ApiError bodies) — those stay verbatim in whatever
  // language the backend returns them in, same discipline as candidate
  // data elsewhere in this file.
  "sync.title": { en: "Registry Sync", ko: "레지스트리 동기화" },
  // {n} substituted by the caller, same placeholder pattern as
  // dash.headline above.
  "sync.subtitle": {
    en: "Real per-source freshness, a real refresh action, and a real activity log — {n} candidates currently live in the database.",
    ko: "소스별 실제 최신성 정보, 실제 새로고침 기능, 실제 활동 로그 — 현재 데이터베이스에 프로젝트 {n}개가 있습니다.",
  },
  "sync.loading": { en: "Loading…", ko: "불러오는 중…" },
  // {error} is the raw thrown error's message — left untouched by the caller.
  "sync.error.prefix": { en: "Failed to load sync status: {error}", ko: "동기화 상태를 불러오지 못했습니다: {error}" },
  // {ts} is a real formatted timestamp (fmtDateTime) — untouched by the caller.
  "sync.frozen.since": { en: "Data frozen since {ts}", ko: "{ts}부터 데이터 동결됨" },

  "sync.panel.sources": { en: "Sources", ko: "소스" },
  "sync.panel.refresh": { en: "Refresh", ko: "새로고침" },
  "sync.panel.activityLog": { en: "Activity log", ko: "활동 로그" },

  "sync.table.source": { en: "Source", ko: "소스" },
  "sync.table.lastFetched": { en: "Last fetched", ko: "마지막 수집" },
  "sync.table.age": { en: "Age", ko: "경과 시간" },
  "sync.table.status": { en: "Status", ko: "상태" },

  // sourceStatus() badge labels
  "sync.status.neverFetched": { en: "Never fetched", ko: "수집된 적 없음" },
  "sync.status.manualOnly": { en: "Manual only", ko: "수동 전용" },
  "sync.status.dueForRefresh": { en: "Due for refresh", ko: "새로고침 필요" },
  "sync.status.upToDate": { en: "Up to date", ko: "최신 상태" },

  // LIVE_SOURCE_TEXT — per-source live progress badge, while a refresh is running
  "sync.live.waiting": { en: "Waiting…", ko: "대기 중…" },
  "sync.live.scraping": { en: "Scraping now…", ko: "수집 중…" },
  "sync.live.done": { en: "Done", ko: "완료" },
  "sync.live.notDue": { en: "Not due", ko: "기한 전" },
  "sync.live.failed": { en: "Failed", ko: "실패" },

  // fmtAge()
  "sync.age.unknown": { en: "unknown age", ko: "경과 시간 알 수 없음" },
  "sync.age.today": { en: "today", ko: "오늘" },
  "sync.age.oneDayAgo": { en: "1 day ago", ko: "1일 전" },
  "sync.age.daysAgo": { en: "{n} days ago", ko: "{n}일 전" },

  // Per-source refresh button. {source} is SOURCE_LABEL[source] — a real
  // registry proper noun (SRUK/SRN-PPI/Verra/BRWA), left untouched.
  "sync.button.refreshOnly": { en: "Refresh {source} only", ko: "{source}만 새로고침" },
  "sync.warning.brwa": {
    en: "Re-crawls all 2,283 BRWA territory profiles — much slower than the other sources, real time and load.",
    ko: "BRWA 관습토지 프로필 2,283건을 전부 다시 수집합니다 — 다른 소스보다 훨씬 느리며 실제 시간과 부하가 발생합니다.",
  },
  "sync.button.refresh": { en: "Refresh", ko: "새로고침" },
  "sync.button.refreshing": { en: "Refreshing…", ko: "새로고침 중…" },

  // PHASE_LABEL — segmented progress bar's trailing phase caption
  "sync.phase.starting": { en: "Starting…", ko: "시작 중…" },
  "sync.phase.pipeline": {
    en: "Normalizing, scoring, and (if requested) searching live news…",
    ko: "데이터 정규화, 점수 산정, (요청 시) 실시간 뉴스 검색 진행 중…",
  },
  "sync.phase.loading": { en: "Loading results into the database…", ko: "결과를 데이터베이스에 저장하는 중…" },
  // Fallback when phase is a source name mid-scrape. {source} is a real
  // registry proper noun (SOURCE_LABEL), left untouched.
  "sync.phase.workingOn": { en: "Working on {source}…", ko: "{source} 처리 중…" },

  "sync.refresh.lastRegistryOnly": { en: "Last registry-only refresh:", ko: "마지막 레지스트리 전용 새로고침:" },
  "sync.refresh.lastWithNews": { en: "Last refresh with live news enrichment:", ko: "마지막 실시간 뉴스 보강 포함 새로고침:" },
  "sync.button.refreshRegistries": { en: "Refresh registries", ko: "레지스트리 새로고침" },
  "sync.button.fullRefreshNews": { en: "Full refresh (with news)", ko: "전체 새로고침 (뉴스 포함)" },

  // newsDisabledReason — real config-state messages, not backend text
  "sync.news.disabled.noKey": {
    en: "Requires TAVILY_API_KEY configured on the backend (see the repo root's .env.example).",
    ko: "백엔드에 TAVILY_API_KEY가 설정되어 있어야 합니다 (저장소 루트의 .env.example 참고).",
  },
  "sync.news.disabled.frozen": { en: "Data is frozen.", ko: "데이터가 동결되었습니다." },

  // runRefresh() outcome messages — fixed wrapper text only; {detail} and
  // {ts} substitutions are backend-composed/real-timestamp fragments and
  // stay untouched by the caller, same discipline as elsewhere in this file.
  "sync.result.okNews": { en: "Refreshed successfully, with live news enrichment.", ko: "새로고침 성공 (실시간 뉴스 보강 포함)." },
  "sync.result.okRegistry": { en: "Refreshed successfully (registry-only).", ko: "새로고침 성공 (레지스트리 전용)." },
  "sync.result.errorDetail": {
    en: "Couldn't complete the refresh: {detail}. Showing the last successful data from {ts}.",
    ko: "새로고침을 완료하지 못했습니다: {detail}. {ts}의 마지막 성공 데이터를 표시합니다.",
  },
  "sync.result.frozenBlocked": { en: "Data is frozen — refresh blocked.", ko: "데이터가 동결되어 새로고침이 차단되었습니다." },
  "sync.result.alreadyInProgress": {
    en: "A refresh is already in progress — showing its live status now.",
    ko: "이미 새로고침이 진행 중입니다 — 실시간 상태를 표시합니다.",
  },
  "sync.result.rejected": { en: "Refresh request rejected.", ko: "새로고침 요청이 거부되었습니다." },
  "sync.result.unreachable": {
    en: "Couldn't reach the backend to refresh. Showing the last successful data from {ts}.",
    ko: "백엔드에 연결할 수 없어 새로고침하지 못했습니다. {ts}의 마지막 성공 데이터를 표시합니다.",
  },

  // Activity log
  "sync.log.empty": { en: "No refresh attempts recorded yet.", ko: "기록된 새로고침 시도가 없습니다." },
  // RefreshLogEntry.status pill — fixed 3-value vocabulary, not free backend text
  "sync.log.status.ok": { en: "ok", ko: "정상" },
  "sync.log.status.frozen": { en: "frozen", ko: "동결" },
  "sync.log.status.error": { en: "error", ko: "오류" },
  // RefreshLogEntry.triggered_by — fixed 2-value vocabulary
  "sync.log.triggeredBy.manual": { en: "manual", ko: "수동" },
  "sync.log.triggeredBy.scheduler": { en: "scheduler", ko: "스케줄러" },
  "sync.log.newsUsed": { en: "news enrichment used", ko: "뉴스 보강 적용됨" },
  "sync.log.newsRequestedNotUsed": { en: "news enrichment requested, not used", ko: "뉴스 보강 요청됨 (적용 안 됨)" },

  // Candidates list page (2026-09-04) — scope extended here from
  // Dashboard/nav/landing-only, same mechanism, no changes to it.
  // Reuses score.opportunity/score.evidence, status.*, activity.*, and
  // province.notAvailable above rather than duplicating those terms
  // under this prefix — see call sites in CandidatesListPage.tsx and
  // CandidateCardGrid.tsx (STATUS_LABEL_KEY/CATEGORY_KEY-style local
  // maps, same pattern as DashboardPage.tsx/ProjectTypeBreakdown.tsx).
  "candidatesList.kpi.total": { en: "Total candidates", ko: "전체 프로젝트" },
  "candidatesList.kpi.highOpp": { en: "High opportunity (≥70)", ko: "높은 기회 (≥70)" },
  "candidatesList.kpi.highEvid": { en: "High evidence strength (≥70)", ko: "높은 증거 강도 (≥70)" },
  // "Amber" mirrors dash.kpi.compliance.sub's own amber->주의 mapping
  // ("보고 기한 주의/위험 표시" above) rather than inventing a new word for
  // the same caution-level concept.
  "candidatesList.kpi.amberCompliance": { en: "Amber compliance", ko: "규정준수 주의" },

  "candidatesList.searchPlaceholder": { en: "Search name or organization…", ko: "이름 또는 기관 검색…" },

  "candidatesList.filter.allRichness": { en: "All richness", ko: "전체 증거 수준" },
  "candidatesList.filter.allStatuses": { en: "All statuses", ko: "전체 상태" },
  "candidatesList.filter.allActivityTypes": { en: "All activity types", ko: "전체 활동 유형" },
  "candidatesList.filter.defaultOrder": { en: "Default order", ko: "기본 정렬" },

  // data_richness values, this page's own filter-dropdown wording (kept
  // separate from format.ts's RICHNESS_DISPLAY_LABEL, which stays
  // English-only and untouched) — "rich"/"thin" reuse map.legend.rich/
  // map.legend.thin's exact wording above; "corroborated" isn't covered
  // there so gets a new term consistent with that register.
  "candidatesList.richness.strong": { en: "Strong Evidence", ko: "증거 충분" },
  "candidatesList.richness.corroborated": { en: "Corroborated", ko: "교차 검증됨" },
  "candidatesList.richness.thin": { en: "Limited Evidence", ko: "증거 부족" },

  "candidatesList.sort.needDesc": { en: "Opportunity (high to low)", ko: "기회 (높은 순)" },
  "candidatesList.sort.needAsc": { en: "Opportunity (low to high)", ko: "기회 (낮은 순)" },
  "candidatesList.sort.credDesc": { en: "Evidence Strength (high to low)", ko: "증거 강도 (높은 순)" },
  "candidatesList.sort.credAsc": { en: "Evidence Strength (low to high)", ko: "증거 강도 (낮은 순)" },

  // "{n} of {m}" counter + pagination's "Showing X–Y of Z" — just the
  // connector word/symbol, the real counts stay plain numbers rendered
  // by the caller.
  "candidatesList.countOf": { en: "of", ko: "/" },

  "candidatesList.activeFilter": { en: "Active filter:", ko: "적용된 필터:" },
  "candidatesList.activeFilters": { en: "Active filters:", ko: "적용된 필터:" },

  // Active-filter chips — threshold/flag filters that arrive via URL
  // query (from Dashboard/Territory Discovery links) with no dropdown
  // control on this page itself (see the real `activeChips.push` call
  // sites in CandidatesListPage.tsx). minNeed/minCred chips reuse
  // score.opportunity/score.evidence above instead of new keys here.
  "candidatesList.chip.complianceApproaching": { en: "Compliance deadline approaching (amber/red)", ko: "규정준수 기한 임박 (주의/위험)" },
  "candidatesList.chip.amberBadge": { en: "Amber compliance badge", ko: "규정준수 주의 표시" },
  "candidatesList.chip.hasResolvedContact": { en: "Has resolved contact", ko: "연락처 확보됨" },
  "candidatesList.chip.noResolvedContact": { en: "No resolved contact", ko: "연락처 미확보" },
  "candidatesList.chip.provincePrefix": { en: "Province:", ko: "지역:" },
  "candidatesList.chip.brwaOverlapYes": { en: "Confirmed Customary Territory Overlap", ko: "관습토지 중첩 확인됨" },
  "candidatesList.chip.brwaOverlapNo": { en: "No Confirmed Customary Territory Overlap", ko: "관습토지 중첩 확인 안 됨" },
  "candidatesList.chip.hasEmailYes": { en: "Has confidently-resolved email", ko: "신뢰도 높은 이메일 확보" },
  "candidatesList.chip.hasEmailNo": { en: "No confidently-resolved email", ko: "신뢰도 높은 이메일 없음" },
  "candidatesList.chip.lowConfidenceEmailYes": { en: "Has weaker email match", ko: "신뢰도 낮은 이메일 일치" },
  "candidatesList.chip.lowConfidenceEmailNo": { en: "No weaker email match", ko: "신뢰도 낮은 이메일 일치 없음" },
  "candidatesList.chip.hasPhoneYes": { en: "Reachable by phone/WhatsApp", ko: "전화/왓츠앱으로 연락 가능" },
  "candidatesList.chip.hasPhoneNo": { en: "No phone/WhatsApp on file", ko: "전화/왓츠앱 정보 없음" },
  "candidatesList.chip.hasPresenceYes": { en: "Findable online (website/social)", ko: "온라인에서 확인 가능 (웹사이트/SNS)" },
  "candidatesList.chip.hasPresenceNo": { en: "No public presence found", ko: "온라인 정보 없음" },
  "candidatesList.chip.removeTooltip": { en: "Click to remove this filter", ko: "클릭하여 이 필터 제거" },

  "candidatesList.loading": { en: "Loading…", ko: "불러오는 중…" },
  "candidatesList.errorPrefix": { en: "Failed to load candidates:", ko: "프로젝트 로드 실패:" },

  "candidatesList.pagination.showing": { en: "Showing", ko: "표시" },
  "candidatesList.pagination.prev": { en: "Prev", ko: "이전" },
  "candidatesList.pagination.next": { en: "Next", ko: "다음" },

  // Tracked page (Partnerships) — added 2026-09-04, scope extended per
  // explicit request. Reuses status.notContacted/contacted/
  // followUpNeeded/done/rejected above for STATUS_OPTIONS/STATUS_LABEL
  // mirrors rather than duplicating those 5 values a third time; every
  // key below is genuinely new copy specific to this page's own chrome
  // (KpiCard labels/StatusEditor, both plain-string props, so no shared
  // component file needs touching to use these).
  "tracked.kpi.total": { en: "Tracked total", ko: "추적 총계" },
  // {n} substituted by the caller, same placeholder pattern as
  // dash.headline above.
  "tracked.kpi.total.sub": { en: "of {n} candidates", ko: "전체 프로젝트 {n}건 중" },
  "tracked.filter.placeholder": { en: "All tracked statuses", ko: "모든 추적 상태" },
  "tracked.filter.showingOne": { en: "Showing 1 candidate", ko: "프로젝트 1건 표시 중" },
  // {shown}/{total} substituted by the caller — two placeholders, same
  // mechanism as the single-{n} keys above.
  "tracked.badge.count": { en: "{shown} of {total} tracked", ko: "총 {total}건 중 {shown}건 추적 중" },
  "tracked.empty": {
    en: "No candidates have a status set yet — select one below to start tracking it.",
    ko: "아직 상태가 설정된 프로젝트가 없습니다 — 아래에서 하나를 선택해 추적을 시작하세요.",
  },
  "tracked.loading": { en: "Loading…", ko: "불러오는 중…" },
  "tracked.detail.failedToLoad": { en: "Failed to load:", ko: "불러오기 실패:" },
  "tracked.detail.fullDetail": { en: "Full detail →", ko: "상세 정보 →" },

  // StatusEditor.tsx — lives only on this page (see that file's own top
  // comment), so translating it here doesn't leak into any other page.
  "tracked.editor.updateStatus": { en: "Update status", ko: "상태 업데이트" },
  "tracked.editor.statusLabel": { en: "Status", ko: "상태" },
  "tracked.editor.noteLabel": { en: "Note (optional)", ko: "메모 (선택 사항)" },
  "tracked.editor.notePlaceholder": {
    en: "e.g. Waiting on their Monitoring & Verification (MRV) team to respond",
    ko: "예: MRV(모니터링·검증) 팀의 답변을 기다리는 중",
  },
  "tracked.editor.save": { en: "Save", ko: "저장" },
  "tracked.editor.saving": { en: "Saving…", ko: "저장 중…" },
  "tracked.editor.failedToUpdate": { en: "Failed to update status: ", ko: "상태 업데이트 실패: " },
  "tracked.editor.statusHistory": { en: "Status history", ko: "상태 변경 이력" },
  "tracked.editor.noHistory": { en: "No status changes recorded yet", ko: "아직 기록된 상태 변경이 없습니다" },

  // How this works page (2026-09-04) — scope extended here from
  // Dashboard/Landing-only, per explicit request. This page is entirely
  // static prose (data sources, scoring methodology, compliance, contact
  // resolution) that already went through its own plain-language pass —
  // EN wording below is copied verbatim from the page so t() renders
  // byte-identical English regardless of this addition. Reuses
  // score.opportunity/score.evidence for the Opportunity/Evidence
  // Strength terms rather than re-declaring them. Deliberately NOT
  // translated, matching this file's existing conventions elsewhere:
  // the "need score"/"credibility score" and "(Geospatial)"/
  // "(Contactability)" tooltip terms (kept English in both languages,
  // same as ScoreLabelPill.tsx's title="need score" already does),
  // real registry names (SRUK/SRN-PPI/Verra/BRWA/Tavily), the Indonesian
  // official registry names spelled out in each SourceCard description
  // (Sistem Registri Unit Karbon, etc.), the Permenhut 6/2026 regulation
  // citation, and every live-API-derived number (SourceCard `stat`/
  // `detail` props and the Stat component values) — those are computed
  // straight from hooks/context in the component, not fixed strings, so
  // they're intentionally left out of this dictionary.
  "howItWorks.title": { en: "How this works", ko: "작동 방식" },
  "howItWorks.subtitle": {
    en: "A permanent, honest explanation of this pipeline — every number below is fetched live from the real API, never typed in.",
    ko: "이 파이프라인에 대한 변치 않는 솔직한 설명입니다 — 아래의 모든 숫자는 실제 API에서 실시간으로 가져오며, 직접 입력한 값이 아닙니다.",
  },
  "howItWorks.loading": { en: "Loading…", ko: "불러오는 중…" },
  "howItWorks.statsErrorPrefix": { en: "Failed to load live stats:", ko: "실시간 통계 불러오기 실패:" },

  "howItWorks.dataSources.title": { en: "Data sources", ko: "데이터 출처" },
  "howItWorks.source.sruk.name": { en: "Carbon Registry (SRUK)", ko: "탄소 등록부 (SRUK)" },
  "howItWorks.source.sruk.desc": {
    en: "Sistem Registri Unit Karbon — Indonesia's carbon-unit registry. Registers the tradable credit itself, only after validation/verification.",
    ko: "Sistem Registri Unit Karbon — 인도네시아의 탄소배출권 등록 시스템. 검증·실사를 마친 뒤에만 거래 가능한 크레딧 자체를 등록합니다.",
  },
  "howItWorks.source.srnppi.name": { en: "Climate Registry (SRN-PPI)", ko: "기후 등록부 (SRN-PPI)" },
  "howItWorks.source.srnppi.desc": {
    en: "Sistem Registri Nasional Pengendalian Perubahan Iklim — the broader climate-action registry. Registers the mitigation action itself, regardless of whether it becomes a tradable credit.",
    ko: "Sistem Registri Nasional Pengendalian Perubahan Iklim — 보다 포괄적인 기후 행동 등록 시스템. 거래 가능한 크레딧으로 전환되는지 여부와 관계없이 완화 활동 자체를 등록합니다.",
  },
  "howItWorks.source.verra.name": { en: "International Registry (Verra)", ko: "국제 등록부 (Verra)" },
  "howItWorks.source.verra.desc": {
    en: "The international voluntary carbon standard registry — the track most non-Indonesian projects use.",
    ko: "국제 자발적 탄소표준 등록 시스템 — 인도네시아 외 대부분의 프로젝트가 사용하는 트랙입니다.",
  },
  "howItWorks.source.brwa.name": { en: "Customary Territory Registry (BRWA)", ko: "관습토지등록부 (BRWA)" },
  "howItWorks.source.brwa.desc": {
    en: "Badan Registrasi Wilayah Adat — Indonesia's customary/indigenous territory registry (NGO-run). Cross-referenced as real land-rights evidence, not another candidate source.",
    ko: "Badan Registrasi Wilayah Adat — 인도네시아의 관습·원주민 토지 등록 시스템 (NGO 운영). 또 다른 프로젝트 출처가 아니라 실제 토지권리 증거로 대조 확인하는 데 사용됩니다.",
  },
  "howItWorks.source.tavily.name": { en: "Tavily (live web search)", ko: "Tavily (실시간 웹 검색)" },
  "howItWorks.source.tavily.desc": {
    en: "Used to discover organizations with no registry presence at all, and to attempt finding a contact when a registry has no named individual on file.",
    ko: "등록부에 전혀 정보가 없는 조직을 발견하거나, 등록부에 담당자 이름이 기재되어 있지 않을 때 연락처를 찾기 위해 사용됩니다.",
  },

  "howItWorks.scoring.title": { en: "How scoring works", ko: "점수 산정 방식" },
  // Split into fragments around the <strong>/<span title> elements the
  // page interleaves mid-sentence — score.opportunity/score.evidence
  // above fill the two <strong> terms, "need score"/"credibility score"
  // stay English (see file-top note), so only the plain-text fragments
  // around them need a key.
  "howItWorks.scoring.introA": {
    en: "Every candidate gets two independent scores — shown elsewhere in the app as",
    ko: "모든 프로젝트는 두 개의 독립적인 점수를 받습니다 — 앱의 다른 곳에서는",
  },
  "howItWorks.scoring.betweenOppEvid": {
    en: "(internally, the need score: is there a real documentation/monitoring gap Gluri could fill) and",
    ko: "(내부적으로는 need score: Gluri가 채울 수 있는 실제 문서화·모니터링 공백이 있는지)와",
  },
  "howItWorks.scoring.beforeNeverCombined": {
    en: "(internally, the credibility score: how mature/confirmed the project itself is). These are",
    ko: "(내부적으로는 credibility score: 프로젝트 자체가 얼마나 성숙하고 확인되었는지)로 표시됩니다. 이 두 점수는",
  },
  "howItWorks.scoring.neverCombined": { en: "never combined into one ranking", ko: "절대 하나의 순위로 합쳐지지 않습니다" },
  "howItWorks.scoring.afterNeverCombined": {
    en: "— a fully-documented, credible project can genuinely have an Opportunity score of 0 (no gap detected, not a bad candidate), and a brand-new, thin lead can score high on Opportunity while still being low on Evidence Strength. Sort by whichever axis you're trying to find.",
    ko: "— 문서화가 완전하고 신뢰할 수 있는 프로젝트도 기회 점수가 실제로 0일 수 있고(공백이 발견되지 않았을 뿐 나쁜 프로젝트라는 의미는 아닙니다), 이제 막 등장한 근거가 얕은 리드도 기회 점수는 높으면서 증거 강도는 낮을 수 있습니다. 무엇을 찾고 있는지에 따라 원하는 축으로 정렬하세요.",
  },
  "howItWorks.whatDrivesOpportunity": { en: "What drives Opportunity", ko: "기회를 좌우하는 요인" },
  "howItWorks.whatDrivesEvidence": { en: "What drives Evidence Strength", ko: "증거 강도를 좌우하는 요인" },
  "howItWorks.opp.bullet1": {
    en: "Reached a technical/validation stage but hasn't filed the core project document either track requires (a DRAM or a DPP).",
    ko: "기술·검증 단계까지 도달했지만, 두 트랙 모두 요구하는 핵심 프로젝트 서류(DRAM 또는 DPP)를 아직 제출하지 않은 경우.",
  },
  "howItWorks.opp.bullet2": {
    en: "No technical or monitoring documentation submitted to any registry at all.",
    ko: "어느 등록부에도 기술·모니터링 서류를 전혀 제출하지 않은 경우.",
  },
  "howItWorks.opp.bullet3": {
    en: "Registered on Verra but shows no progress beyond an early pipeline listing.",
    ko: "Verra에 등록은 되어 있지만 초기 파이프라인 등재 이후 진전이 없는 경우.",
  },
  "howItWorks.opp.bullet4": {
    en: "A real news mention suggests the organization is actively looking for a monitoring/technology partner (treated as inferred, not confirmed, since it comes from a news article, not a registry).",
    ko: "실제 뉴스 언급을 통해 해당 조직이 모니터링·기술 파트너를 적극적으로 찾고 있는 것으로 보이는 경우 (등록부가 아닌 뉴스 기사 출처이므로 확인이 아닌 추정으로 처리됩니다).",
  },
  "howItWorks.opp.bullet5": {
    en: "Registration is actively progressing — the organization is currently engaged with the process.",
    ko: "등록 절차가 실제로 진행 중인 경우 — 해당 조직이 현재 절차에 적극적으로 참여하고 있습니다.",
  },
  "howItWorks.opp.bullet6": {
    en: "A Forestry-Carbon Regulation (Permenhut 6/2026) reporting deadline is approaching or has passed.",
    ko: "산림 탄소 규정(Permenhut 6/2026)의 보고 기한이 임박했거나 이미 지난 경우.",
  },
  "howItWorks.evid.registryStatus.term": { en: "Registry status", ko: "등록 상태" },
  "howItWorks.evid.registryStatus.desc": {
    en: "is it in an official registry, has it progressed beyond initial registration, does it have a DRAM/DPP on file.",
    ko: "공식 등록부에 등재되어 있는지, 최초 등록 이후 진전이 있었는지, DRAM/DPP 서류가 있는지 여부.",
  },
  "howItWorks.evid.landRights.term": { en: "Land rights", ko: "토지권리" },
  "howItWorks.evid.landRights.desc": {
    en: "a formal land-rights category on file, or a confirmed Customary Territory Registry (BRWA) overlap.",
    ko: "공식 토지권리 분류가 등록되어 있거나, 관습토지등록부(BRWA)와의 중첩이 확인된 경우.",
  },
  "howItWorks.evid.locationVerified.term": { en: "Location Verified", ko: "위치 검증" },
  "howItWorks.evid.locationVerified.desc": {
    en: "real coordinates on file, and whether a full boundary (not just a point) exists.",
    ko: "실제 좌표 정보가 있는지, 그리고 (단순 지점이 아닌) 전체 경계 정보가 있는지 여부.",
  },
  "howItWorks.evid.contactFound.term": { en: "Contact Found", ko: "연락처 확보" },
  "howItWorks.evid.contactFound.desc": {
    en: "whether a real contact (a name and/or an email) has actually been resolved.",
    ko: "실제 연락처(이름 및/또는 이메일)가 실제로 확인되었는지 여부.",
  },

  "howItWorks.compliance.title": { en: "How compliance is checked", ko: "컴플라이언스 확인 방식" },
  "howItWorks.compliance.intro": {
    en: "Permenhut 6/2026 is the regulation governing forest-carbon trading in Indonesia. It contains 25 real, individually-encoded rules —",
    ko: "Permenhut 6/2026은 인도네시아의 산림 탄소 거래를 규율하는 규정입니다. 실제로 개별 인코딩된 25개의 규칙을 포함하고 있으며 —",
  },
  "howItWorks.compliance.wiredSuffix": { en: "are currently wired into live scoring", ko: "현재 실시간 점수 산정에 반영되어 있습니다" },
  "howItWorks.compliance.loading": { en: "the exact wired-vs-total count is loading…", ko: "정확한 반영/전체 건수를 불러오는 중…" },
  "howItWorks.compliance.rest": {
    en: '. The rest aren\'t silently skipped — each one is flagged with its own specific reason it isn\'t yet computable from the data this pipeline normalizes: most bind the Ministry directly rather than an individual project, or need a field this pipeline doesn\'t currently capture (e.g. a document submission timestamp). Every one of those reasons is visible per-candidate, on the Compliance tab\'s expanded rule list — never a blanket "not done yet."',
    ko: '. 나머지 규칙도 조용히 건너뛰는 것이 아닙니다 — 이 파이프라인이 정규화하는 데이터로는 아직 계산할 수 없는 구체적인 이유가 각각 명시되어 있습니다: 대부분은 개별 프로젝트가 아니라 정부 부처(Ministry)에 직접 적용되는 규칙이거나, 이 파이프라인이 현재 수집하지 않는 항목(예: 서류 제출 시각)이 필요합니다. 이런 이유는 프로젝트별 Compliance 탭의 확장된 규칙 목록에서 모두 확인할 수 있습니다 — 그냥 뭉뚱그려 "아직 안 됨"이라고 표시되는 일은 없습니다.',
  },

  "howItWorks.noLlm.title": { en: "Why no LLM in scoring, dossier, or outreach", ko: "점수 산정·문서·아웃리치에 LLM을 쓰지 않는 이유" },
  "howItWorks.noLlm.body": {
    en: "Every score, badge, and generated document in this pipeline is a deterministic function of already-known fields — no language model ever decides a score, a match, or what to write. This is a deliberate trust decision, not a cost-cutting shortcut: deterministic logic is fully auditable (the exact same input always produces the exact same output, traceable rule by rule), carries zero hallucination risk, and is cheap enough to re-run daily at full scale. The one place text generation happens at all — dossier and outreach-email prose — is template-based, assembling already-computed real facts into readable sentences, never inventing a new fact or a new number.",
    ko: "이 파이프라인의 모든 점수, 배지, 생성된 문서는 이미 알려진 필드값에 대한 결정론적 함수입니다 — 어떤 언어 모델도 점수, 매칭, 작성 내용을 결정하지 않습니다. 이는 비용 절감을 위한 편법이 아니라 의도적인 신뢰 설계입니다: 결정론적 로직은 완전히 감사 가능하고(동일한 입력은 언제나 동일한 출력을 만들며, 규칙 단위로 추적 가능), 환각(hallucination) 위험이 전혀 없으며, 전체 규모에서 매일 재실행할 만큼 비용이 저렴합니다. 텍스트 생성이 이루어지는 유일한 지점 — 문서(dossier)와 아웃리치 이메일 문구 — 도 템플릿 기반으로, 이미 계산된 실제 사실을 읽기 쉬운 문장으로 조립할 뿐 새로운 사실이나 숫자를 지어내지 않습니다.",
  },

  "howItWorks.contact.title": { en: "How contact resolution works", ko: "연락처 확인 방식" },
  "howItWorks.contact.intro": {
    en: "A contact is resolved in one of three ways, checked in order — a candidate only moves to the next when the previous one genuinely found nothing:",
    ko: "연락처는 세 가지 방법 중 하나로 확인되며, 순서대로 시도됩니다 — 하나의 프로젝트는 이전 방법에서 정말 아무것도 찾지 못했을 때만 다음 방법으로 넘어갑니다:",
  },
  "howItWorks.contact.registry.term": { en: "Found directly in the official registry record", ko: "공식 등록부 기록에서 직접 확인" },
  "howItWorks.contact.registry.desc": {
    en: "a named individual the registry itself lists as the registrant. The most common real outcome, but registries record a name, never an email.",
    ko: "등록부 자체가 등록인으로 기재한 실명 개인. 가장 흔한 실제 결과이지만, 등록부는 이름만 기록할 뿐 이메일은 절대 기록하지 않습니다.",
  },
  "howItWorks.contact.website.term": { en: "Found via the organization's own website", ko: "조직 자체 웹사이트를 통해 확인" },
  "howItWorks.contact.website.desc": {
    en: 'a live web search for the org\'s own site, requiring the page to genuinely self-identify as that organization (a copyright footer or an explicit "contact us" naming it) before trusting an email found there.',
    ko: '해당 조직의 웹사이트를 실시간 웹 검색으로 찾되, 그 페이지가 실제로 해당 조직임을 스스로 밝히고 있는지(저작권 푸터나 조직명을 명시한 "문의하기" 등) 확인한 뒤에만 거기서 찾은 이메일을 신뢰합니다.',
  },
  "howItWorks.contact.news.term": { en: "Mentioned in a news article", ko: "뉴스 기사에서 언급됨" },
  "howItWorks.contact.news.desc": {
    en: "the lowest-confidence lead, since a news article has no equivalent structural anchor (no copyright footer, no dedicated contact page) to verify against.",
    ko: "신뢰도가 가장 낮은 리드입니다 — 뉴스 기사는 대조 확인할 수 있는 구조적 근거(저작권 푸터, 별도의 연락처 페이지 등)가 없기 때문입니다.",
  },
  // {n} substituted by the caller, same placeholder pattern as
  // dash.headline/landing.kpi.scored.sub above.
  "howItWorks.contact.breakdown": {
    en: "The real, current breakdown across all {n} final candidates:",
    ko: "전체 {n}건의 최종 프로젝트에 대한 실제 현재 분포:",
  },
  // Same underlying concept as dash.chip.verifiedEmails/potentialMatches/
  // namedNoEmail — reuses their established Korean wording verbatim even
  // though this page's English labels are phrased slightly differently
  // (a resolution-confidence framing vs. Dashboard's verification-status
  // framing of the same three buckets).
  "howItWorks.stat.confidentEmails": { en: "Confidently-resolved emails", ko: "검증된 이메일" },
  "howItWorks.stat.weakEmails": { en: "Weaker email matches", ko: "가능성 있는 일치" },
  "howItWorks.stat.namedNoEmailYet": { en: "Named contacts, no email yet", ko: "이름만 확인 (이메일 없음)" },
  "howItWorks.stat.nothingFound": { en: "Nothing found", ko: "찾지 못함" },

  // Candidate Detail page (2026-09-04) — extends scope from Dashboard-only
  // to this page (the biggest, most dynamic-content-heavy page in the app).
  // Deliberately covers ONLY fixed UI chrome — section headings, field
  // labels, button labels, tab labels, empty-state text, loading/error
  // states, and a page-scoped Korean mirror of format.ts's English-only
  // label maps (POLICY_TIER_LABEL/MATCH_STATUS_LABEL/
  // LAND_RIGHTS_CATEGORY_LABEL/VERIFICATION_STATUS_LABEL — format.ts
  // itself stays English-only/unchanged, other pages still import it
  // directly). Everything backend-generated on this page (need_detection_
  // reasons, why_gluri/dossier prose, credibility_components text, the
  // compliance badge's `reason` citations, land-rights/BRWA overlap
  // explanation text, the outreach draft's own real EN/ID subject/body,
  // document titles, citation URLs, news titles, candidate/org names,
  // registry IDs, province/district names, dates) is deliberately left
  // OUT of this dictionary — see CandidateDetailPage.tsx itself for where
  // each of those is rendered untouched.
  "candidateDetail.nav.backToCandidates": { en: "Back to candidates", ko: "프로젝트 목록으로 돌아가기" },
  "candidateDetail.nav.ofCount": { en: "{a} of {b}", ko: "{b}개 중 {a}번째" },
  "candidateDetail.nav.previous": { en: "Previous: {name}", ko: "이전: {name}" },
  "candidateDetail.nav.noPrevious": { en: "No previous candidate in this filtered view", ko: "이 필터 조건에서는 이전 프로젝트가 없습니다" },
  "candidateDetail.nav.next": { en: "Next: {name}", ko: "다음: {name}" },
  "candidateDetail.nav.noNext": { en: "No next candidate in this filtered view", ko: "이 필터 조건에서는 다음 프로젝트가 없습니다" },

  // Section rail + tabs bar (same real section, shown twice — the rail's
  // own label and, for compliance/dossier/outreach, the tabs bar's label
  // — kept as the SAME Korean word both places)
  "candidateDetail.section.whyContactFirst": { en: "Why Contact First", ko: "우선 연락 사유" },
  "candidateDetail.section.scores": { en: "Scores", ko: "점수" },
  "candidateDetail.section.landRights": { en: "Land Rights", ko: "토지 권리" },
  "candidateDetail.section.documents": { en: "Documents", ko: "문서" },
  "candidateDetail.section.evidence": { en: "Evidence", ko: "증거" },
  "candidateDetail.section.compliance": { en: "Compliance", ko: "컴플라이언스" },
  "candidateDetail.section.dossier": { en: "Dossier", ko: "상세 자료" },
  "candidateDetail.section.contact": { en: "Contact", ko: "연락처" },
  "candidateDetail.section.outreach": { en: "Outreach", ko: "아웃리치" },
  "candidateDetail.tab.overview": { en: "Overview", ko: "개요" },

  "candidateDetail.hero.heading": { en: "Why contact this candidate first", ko: "이 프로젝트에 우선 연락해야 하는 이유" },

  "candidateDetail.need.noGapDetected": { en: "No documentation gap detected.", ko: "문서 공백이 발견되지 않았습니다." },
  "candidateDetail.credibility.registryStatus": { en: "Registry status", ko: "등록 상태" },
  "candidateDetail.credibility.locationVerified": { en: "Location Verified", ko: "위치 확인됨" },
  "candidateDetail.credibility.geospatial": { en: "Geospatial", ko: "공간 정보" },
  "candidateDetail.credibility.contactFound": { en: "Contact Found", ko: "연락처 확인됨" },
  "candidateDetail.credibility.contactability": { en: "Contactability", ko: "연락 가능성" },
  "candidateDetail.credibility.cappedReason": {
    en: "Capped at 30 — this candidate's data is thin (e.g. a single uncorroborated news mention), so a higher score isn't trustworthy enough to show uncapped.",
    ko: "30점으로 제한됨 — 이 프로젝트의 데이터가 부족하여 (예: 교차 확인되지 않은 뉴스 언급 1건) 더 높은 점수를 그대로 신뢰하기 어렵습니다.",
  },

  // Page-scoped Korean mirror of format.ts's English-only label maps (see
  // format.ts's own docstrings for the real schema values these come
  // from) — format.ts itself is NOT modified; this page looks up its own
  // key alongside the existing English map at its own render call sites.
  "candidateDetail.verificationStatus.registryConfirmed": { en: "Officially Verified", ko: "공식 검증됨" },
  "candidateDetail.landRightsCategory.PBPH": { en: "Forestry Business Permit", ko: "산림사업허가 (PBPH)" },
  "candidateDetail.landRightsCategory.perhutananSosial": { en: "Social Forestry", ko: "사회림 (Social Forestry)" },
  "candidateDetail.landRightsCategory.hutanAdat": { en: "Customary Forest", ko: "관습림 (Customary Forest)" },
  "candidateDetail.landRightsCategory.hutanHak": { en: "Privately Titled Forest", ko: "사유림 (Privately Titled Forest)" },
  "candidateDetail.landRightsCategory.pbPjlKarbon": { en: "Carbon Services Permit", ko: "탄소서비스허가 (Carbon Services Permit)" },
  "candidateDetail.policyTier.penetapan": { en: "Formally decreed", ko: "공식 지정됨" },
  "candidateDetail.policyTier.pengaturan": { en: "In regulatory process", ko: "규제 절차 진행 중" },
  "candidateDetail.policyTier.belumAda": { en: "Not yet established", ko: "아직 미지정" },
  "candidateDetail.matchStatus.primary": { en: "Primary record", ko: "기본 기록" },
  "candidateDetail.matchStatus.autoMerged": { en: "Automatically merged", ko: "자동 병합됨" },

  "candidateDetail.panel.landRights": { en: "Land rights", ko: "토지 권리" },
  "candidateDetail.panel.identityResolution": { en: "Identity resolution", ko: "신원 확인" },
  "candidateDetail.panel.documentsCount": { en: "Documents ({n})", ko: "문서 ({n})" },
  "candidateDetail.panel.newsEvidenceCount": { en: "News evidence ({n})", ko: "뉴스 증거 ({n})" },

  "candidateDetail.landRights.formalCategoryHeading": { en: "Formal land-rights category on file", ko: "공식 토지권리 분류 등록됨" },
  "candidateDetail.landRights.via": { en: "via", ko: "근거:" },
  "candidateDetail.landRights.noDecreeDocument": { en: "no decree document on file for this category", ko: "이 분류에 대한 결정 문서가 등록되어 있지 않음" },
  "candidateDetail.landRights.overlapFoundHeading": {
    en: "Customary Territory Overlap found (no formal category classified yet)",
    ko: "관습토지 중첩 확인됨 (공식 분류는 아직 없음)",
  },
  "candidateDetail.landRights.territory": { en: "Territory", ko: "영역" },
  "candidateDetail.landRights.relationship": { en: "Relationship", ko: "관계" },
  "candidateDetail.landRights.legalRecognitionStatus": { en: "Legal recognition status", ko: "법적 인정 상태" },
  "candidateDetail.landRights.notYetChecked": { en: "Not yet checked", ko: "아직 확인되지 않음" },
  "candidateDetail.landRights.notYetCheckedTitle": {
    en: 'No coordinates on file to test against Customary Territory Registry (BRWA) data — this is not the same as "no overlap found."',
    ko: '등록된 좌표가 없어 관습토지등록부(BRWA) 데이터와 대조할 수 없습니다 — 이는 "중첩 없음"과는 다릅니다.',
  },

  "candidateDetail.identityResolution.score": { en: "score", ko: "점수" },

  "candidateDetail.documents.view": { en: "View", ko: "보기" },
  "candidateDetail.documents.viewDownloadTitle": { en: "View / download this document", ko: "문서 보기 / 다운로드" },
  "candidateDetail.documents.showAll": { en: "Show all {n} documents", ko: "문서 {n}개 모두 보기" },
  "candidateDetail.documents.showFewer": { en: "Show fewer", ko: "간략히 보기" },

  "candidateDetail.news.match": { en: "match", ko: "일치도" },

  "candidateDetail.compliance.daysRemainingUntil": {
    en: "days remaining until {date} (Forestry-Carbon Regulation, Reporting Deadline)",
    ko: "{date}까지 남은 일수 (산림탄소규정, 보고 기한)",
  },
  "candidateDetail.compliance.panelTitle": { en: "Compliance (Forestry-Carbon Regulation)", ko: "컴플라이언스 (산림탄소규정)" },
  "candidateDetail.compliance.additionalRulesNote": {
    en: "{n} additional Forestry-Carbon Regulation rules exist but aren't yet computable from available data — mostly regulations that bind the Ministry directly, or require fields not yet normalized.",
    ko: "산림탄소규정 중 {n}개의 추가 규정이 있지만 현재 데이터로는 아직 계산할 수 없습니다 — 대부분 정부 부처에 직접 적용되거나 아직 정규화되지 않은 필드가 필요한 규정입니다.",
  },
  "candidateDetail.compliance.showFullRuleCoverage": { en: "Show full rule coverage", ko: "전체 규정 보기" },
  "candidateDetail.compliance.hideFullRuleCoverage": { en: "Hide full rule coverage", ko: "전체 규정 숨기기" },
  "candidateDetail.compliance.notWired": { en: "Not wired", ko: "미연동" },
  "candidateDetail.compliance.why": { en: "Why", ko: "이유" },

  "candidateDetail.dossier.whyGluri": { en: "Why Gluri", ko: "Gluri 추천 사유" },
  "candidateDetail.dossier.landRegulatoryPosition": { en: "Land & regulatory position", ko: "토지 및 규제 현황" },
  "candidateDetail.dossier.contactRoute": { en: "Contact route", ko: "연락 경로" },
  "candidateDetail.dossier.mainOffice": { en: "Main Office", ko: "대표 전화" },
  "candidateDetail.dossier.generalOfficeLine": { en: "General office line", ko: "대표 전화번호" },
  "candidateDetail.dossier.suggestedPoc": { en: "Suggested point of contact", ko: "추천 담당자" },
  "candidateDetail.dossier.publicPresence": { en: "Public presence", ko: "온라인 공개 정보" },
  "candidateDetail.dossier.publicPresenceNote": {
    en: "Where to find them online — not a direct contact channel.",
    ko: "온라인에서 확인할 수 있는 정보 — 직접적인 연락 수단은 아닙니다.",
  },
  "candidateDetail.dossier.website": { en: "Website", ko: "웹사이트" },
  "candidateDetail.dossier.dppValidationTitle": {
    en: "Project Document (DPP) validation proxy (unscored evidence — not a compliance check)",
    ko: "프로젝트 문서(DPP) 검증 참고자료 (미평가 증거 — 컴플라이언스 검사 아님)",
  },
  "candidateDetail.dossier.nextQuestions": { en: "Next questions", ko: "다음 확인 사항" },

  "candidateDetail.outreach.panelTitle": { en: "Outreach draft", ko: "아웃리치 초안" },
  "candidateDetail.outreach.cannotGenerate": { en: "Cannot generate outreach yet", ko: "아직 아웃리치를 생성할 수 없음" },
  "candidateDetail.outreach.insufficientContactInfo": { en: "Insufficient contact information.", ko: "연락처 정보가 충분하지 않습니다." },
  "candidateDetail.outreach.to": { en: "To", ko: "수신" },
  "candidateDetail.outreach.subject": { en: "Subject", ko: "제목" },
  "candidateDetail.outreach.notOnFile": { en: "(not on file — see warning above)", ko: "(등록된 정보 없음 — 위 경고 참고)" },
  "candidateDetail.outreach.sendEmail": { en: "Send email", ko: "이메일 보내기" },
  "candidateDetail.outreach.openInEmailClient": { en: "Open in your email client — to {email}", ko: "이메일 클라이언트에서 열기 — 수신: {email}" },

  "candidateDetail.gaps.heading": { en: "Key Gaps / Risks", ko: "주요 공백 / 위험 요소" },
  "candidateDetail.gaps.none": { en: "No key gaps flagged for this candidate.", ko: "이 프로젝트에 표시된 주요 공백이 없습니다." },
  "candidateDetail.gaps.missingRegDoc.label": { en: "Missing Registration/Project Document", ko: "등록/프로젝트 문서 누락" },
  "candidateDetail.gaps.missingRegDoc.text": {
    en: "No Registration Document (DRAM) or Project Document (DPP) on file yet.",
    ko: "등록 문서(DRAM) 또는 프로젝트 문서(DPP)가 아직 등록되지 않았습니다.",
  },
  "candidateDetail.gaps.noCoordinates.label": { en: "No coordinates", ko: "좌표 없음" },
  "candidateDetail.gaps.noCoordinates.text": {
    en: "Customary Territory Registry not checked — location not verified.",
    ko: "관습토지등록부(BRWA) 대조가 이루어지지 않음 — 위치가 검증되지 않았습니다.",
  },
  "candidateDetail.gaps.complianceDeadline.label": { en: "Compliance deadline", ko: "컴플라이언스 기한" },
  "candidateDetail.gaps.complianceDeadline.text": { en: "{n} days remaining.", ko: "{n}일 남음." },
  "candidateDetail.gaps.contactReadiness.label": { en: "Contact readiness", ko: "연락처 준비 상태" },
  "candidateDetail.gaps.contactReadiness.none": { en: "No contact resolved yet.", ko: "아직 확인된 연락처가 없습니다." },
  "candidateDetail.gaps.contactReadiness.attempted": {
    en: "Email not on file — a web search did not find a public email; manual lookup would need a different channel.",
    ko: "이메일 미등록 — 웹 검색으로 공개 이메일을 찾지 못했습니다. 수동으로 다른 경로를 확인해야 합니다.",
  },
  "candidateDetail.gaps.contactReadiness.notAttempted": { en: "Email not on file — needs manual lookup.", ko: "이메일 미등록 — 수동 확인이 필요합니다." },

  "candidateDetail.tracking.updated": { en: "Updated {date}", ko: "{date} 업데이트됨" },
  "candidateDetail.tracking.noStatusChanges": { en: "No status changes recorded yet", ko: "기록된 상태 변경 없음" },
  "candidateDetail.tracking.viewTracking": { en: "View tracking →", ko: "트래킹 보기 →" },
  "candidateDetail.tracking.viewOnRegistry": {
    en: "{plainLabel} ({label}) — view on their own registry",
    ko: "{plainLabel} ({label}) — 해당 등록기관에서 보기",
  },
  "candidateDetail.tracking.carbonRegistry": { en: "Carbon Registry", ko: "탄소 등록부" },
  "candidateDetail.tracking.climateRegistry": { en: "Climate Registry", ko: "기후 등록부" },
  "candidateDetail.tracking.internationalRegistry": { en: "International Registry", ko: "국제 등록부" },

  "candidateDetail.error.failedToLoad": { en: "Failed to load candidate: {error}", ko: "프로젝트를 불러오지 못했습니다: {error}" },
  "candidateDetail.loading": { en: "Loading…", ko: "불러오는 중…" },
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
