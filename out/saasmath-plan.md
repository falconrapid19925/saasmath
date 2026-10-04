# SaasMath: gamified Kumon-style math drills for Indonesian kelas 4-6 SD

*Working SaaS plan, 2026-10-04, for a founder go/no-go decision. Built from five research lanes: (1) Kumon method and Kumon Connect, (2) CPA Singapore math, (3) Indonesian market and curriculum, (4) gamification patterns in math apps, (5) full-stack architecture. Factual claims carry bracketed numbers resolved in section 10. The 2026-10-04 revision folds in a claim-check pass (all eight checked claims were confirmed against primary pages; the official 046/H/KR/2025 CP PDF was added as source [67]) and review feedback; every uncertainty the research flagged, plus the reviewer's corrections, is restated in section 9.*

## 1. Product concept and positioning

The product is a web app (PWA now, native mobile later) that gives Indonesian children in kelas 4-6 SD a daily 10-15 minute timed math drill, built the way Kumon works: a fine-grained ladder of small-step sets, a Standard Completion Time (SCT) target per set, and mastery before advancing [1][3]. Software replaces Kumon's paper-and-people overhead. Sets generate on demand, grading is instant, wrong answers trigger same-session self-correction, and failed gates trigger automatic repetition with freshly generated variants. When a child gets stuck, a Singapore-math CPA layer intervenes: the same problem appears as a pictorial bar model ("model batang") or a light manipulative before the abstract form returns, and if hints do not unstick the child the set falls back to worked examples and a parent nudge (3.2). The whole loop is wrapped in research-backed gamification (streaks, stars, a collectible economy, ability-matched races), aligned topic by topic to Kurikulum Merdeka Fase B/C and the TKA SD assessment [25][26][67][28], sold direct to parents in Bahasa Indonesia through WhatsApp at Rp33.000-89.000/month depending on plan (plus a Rp99.000 TKA season pass), with no registration fee. One-line pitch: Kumon Connect, but gamified, phone-first, Kurikulum-aligned, offline-tolerant (untested on low-end devices; risk 4), and 5-10x cheaper.

### Versus Kumon Connect, the closest analog

| Dimension | Kumon Connect | This product |
|---|---|---|
| Grading | Human grading centers grade homework within 24 hours, six days a week [6] | Instant, in-session |
| Hardware | Tablet plus stylus with palm rejection, BYOD; development devices are iPad 10th gen and Galaxy Tab S6 Lite 2024 [5] | Any mid or low-end Android phone browser; typed/numeric and tap input |
| Set flexibility | Officially, students "would not do a combination of both paper and digital worksheets in the same subject" [5]; r/Kumon users report modified or combined sets are not possible [13] | Adaptive mixed review plus new sets |
| Gamification | None; the blue/yellow/pink completion-time colors are a meter without a game [6] | Streaks, mastery states, economy, races |
| Conceptual layer | None; purely procedural | CPA bar-model hint ladder [15][16] |
| Distribution | A browser shortcut, not an app; r/Kumon instructors call this out [12] | Installable PWA |
| Price (SD) | Rp525.000/month per subject plus Rp350.000 registration in Jabodetabek [9] | Rp49.000/month, bundles down to Rp33.000/month, no registration fee |

### Versus Ruangguru and Khan Academy

- Ruangguru SD sells content: animated videos, quizzes, and printable latihan soal [31]. We sell a daily production loop with timed mastery gates. A video library cannot tell a parent "anak Anda menyelesaikan 20 set minggu ini, 85% lebih cepat dari target."
- Khan Academy is free and fully in Indonesian [35], which anchors price expectations at zero for content. But its alignment is US-derived, not Kurikulum Merdeka or TKA, and its gamification stops at points and badges [35]. We compete on alignment to the CP topic lists [25][26][67] and the TKA matrix [28], the habit loop, and WhatsApp-native parent reporting.
- No Indonesian competitor offering a game-based timed drill loop for kelas 4-6 appeared in the five research lanes. That is an absence-of-evidence finding scoped to this research, not proof none exists; treat it as a hypothesis to validate in Phase 1 parent interviews. Prodigy, the global template, sells in English with USD pricing and no IDR localization [36]; the market-lane research also found its Indonesian App Store listing shows language EN only (a claim resting on Prodigy's own listings) [36][37].

## 2. Target users and market

**Who uses it:** children in kelas 4-6 SD, ages roughly 9-12, on a family Android phone, often a shared device, for 10-15 minutes a day. No stylus and no tablet assumption. This inverts Kumon Connect's BYOD-tablet model, whose device floor most Indonesian households cannot meet [5].

**Who pays:** the parent, in practice usually the mother, who already decides education spend. Sales and retention both run through WhatsApp. Indonesia is commonly reported at about 112 million WhatsApp users, per a WhatsApp-vendor marketing source [40], and class WhatsApp groups are reported to beat school apps for parent communication because parents open them by habit [41]. CoLearn runs both channels per its own homepage: enrollment is "hanya tersedia melalui nomor WhatsApp" (one WhatsApp number) and a weekly "Laporan Belajar" goes "langsung ke WhatsApp orang tua" [32].

**Willingness-to-pay anchors from the research:**

| Product | Model | Price |
|---|---|---|
| Kumon Indonesia (SD, Jabodetabek, Area 1) | Center worksheets or Connect, per subject per student | Rp525.000/month plus Rp350.000 registration, effective Jan 2026; Rp430.000/month in the cheapest areas; about Rp6,3M/year for one subject [9][10] |
| Smartick Indonesia | Daily personalized gamified sessions | Rp6.000/day, about Rp180.000/month [38] |
| CoLearn | Live online bimbel, kelas 4-12, math first | Rp90.000/month (1x/week) to Rp170.000/month (2x/week); kelas 12 is a Rp170.000 4-class package without reports [32] |
| Ruangguru SD | Video and quiz bundles | Rp550.000/6 bulan, Rp750.000/3 bulan (promo pricing, "harga dapat berubah sewaktu-waktu"); TKA prep bundles from Rp1.150.000 [31] |
| Les privat (offline) | Per session, kelas 4-6 | About Rp920.000-1.000.000/month; group les from Rp200.000/month (market-lane finding, no URL captured) |
| Khan Academy | Free content | Rp0 [35] |

**Market signals and one back-of-envelope ceiling:**

- Kumon Indonesia has 140.000+ students across 800+ kelas, out of a global program of about 4,2M students in 51 countries [11]. A large installed base already pays for exactly this method, so parents already understand "daily worksheet, timed, mastery" framing. Kumon also normalizes the acquisition playbook: a free 2-week/4-session trial and recurring Rp350.000 registration-fee waiver promos [11].
- Order-of-magnitude ceiling, explicitly not a TAM: Kumon Indonesia's 140.000+ students [11] are a proven paying pool for the daily-drill method. Reaching even 5-10% of that pool means 7.000-14.000 subscribers, which at the Rp48.700 per-subscriber contribution (section 7) is Rp340-680M/month, far above a three-person team's burn. Reaching it is an acquisition problem the research did not size; no CAC data exists in the briefs.
- The first Tes Kemampuan Akademik ran 20-30 April 2026, with Matematika dan Numerasi on day 1: 30 questions in 75 minutes per both government sources (one third-party page says 20 questions; the government pages say 30) [30][28]. Kelas-6 results carry an official certificate usable for SMP admission via jalur prestasi, subject to regional policy [29][42]. TKA is free and voluntary [29], new as of Permendikdasmen No. 9/2025, so the plan treats it as a recurring annual anchor and Phase 3 targets the TKA 2027 cycle (2027 registration dates unannounced at plan date); TKA is upside, not a dependency (risk 8).
- School-facing B2B is crowded (Kipin [33], Quipper School [34], Pijar Sekolah); a parent-facing math-drill subscription for grades 4-6 did not appear in any of the five research lanes (an absence-of-evidence finding, same caveat as above).
- Zenius ceased operations in January 2024 after raising US$40M [39]. B2C edtech without a durable daily-use loop is fragile here. A daily drill habit is the durable loop bet.

**Personas (design artifacts, not survey data):**

1. **Ibu Ratna, 38, Tangerang.** Daughter in kelas 5, in Kumon Math at Rp525.000/month plus transport [9]. Values the routine and visible progress but fights the monotony; "beberapa anak merasa metode latihan rutin cukup repetitif... terasa monoton" is the documented parent complaint [14]. Switch candidate: same method at home, about a tenth of the price, progress on her phone.
2. **Bapak Dedi, 41, Cimahi.** Son in kelas 4. Cannot justify Rp1M/month les privat. One mid-range Android shared with the child. Wants structured daily math, and specifically not another app that opens YouTube; the same-device distraction problem is documented in r/Kumon threads, where parents report kids switching tabs to YouTube and TikTok while work sits open [12]. Those are North American threads, so the fear is imported, not measured in Indonesia.
3. **Ibu Sari, 36, Depok.** Son in kelas 6, TKA in April 2027 (the 2026 run completed in April; next cycle's dates unannounced [30]). Wants cheap TKA prep between Ruangguru's Rp1.150.000+ bundles [31] and CoLearn's live classes [32], motivated by a certificate she can share in the class WhatsApp group [41].

## 3. Learning model

### 3.1 The daily drill loop, the Kumon engine mechanized

1. **Placement.** A short diagnostic, roughly 15-20 items, places the child at a deliberately easy rung. Kumon sets placement below school grade on purpose [1][2].
2. **Daily set.** One set of 10-20 items generated from the current skill at the current difficulty step. Kumon's ladder is about 4.420 small-step worksheets where difficulty rises "marginally from worksheet to worksheet" [1]; ours expresses the same idea as skills times parameterized difficulty steps.
3. **Timed against a calibrated SCT.** Kumon defines SCT as "the time in which the student should complete each worksheet, including time taken for corrections" [3]. Kumon's SCT is a constant per fixed worksheet; ours must be computed per generated set. Each skill template carries a base seconds-per-item and a difficulty multiplier, so SCT(set) = base seconds per item x item count x difficulty factor. The initial value comes from the content author's estimate; once a skill has roughly 100 completing attempts, the target recalibrates to the 75th percentile of completion time among passing attempts. The timer runs invisibly (4.4); actual versus SCT is computed and shown after submission, color-coded like Kumon Connect's blue/yellow/pink Study Records [6].
4. **Instant grading and self-correction.** Numeric answers grade in seconds. Wrong items are flagged and the child corrects them. Kumon has students "think for themselves and correct mistakes on their own" [1], but needs human grading centers working six days a week to make that happen on paper [6].
5. **Mastery gate, with no dead ends.** Advance only on beating the bar. Proposed gates, to calibrate in Phase 1: 95% accuracy or better within SCT advances immediately. Accurate (80-94% or better) but over SCT: after two consecutive over-target passes, the SCT target tightens by about 10%; beating the tightened target twice advances the child, mirroring Kumon instructors' option to adjust the assignment [4]. If three tightened cycles pass without advance, the child promotes anyway with a "fluency focus" flag that schedules extra spaced review. Below 80% drops one step into CPA-hint mode. At the bottom step of a skill there is nowhere to drop: the child stays in CPA-hint mode with easier generator parameters, smaller number ranges and more scaffolding, until two clean passes, then re-ascends.
6. **CPA-hint mode, defined.** A set-level state, distinct from the per-item hints in 3.2: every item's pictorial hint is available from the first attempt, the timer is off, and the set is untimed end to end. Two clean passes exit back to timed sets. The per-item hint trigger (3.2) still applies inside normal timed sets.
7. **Variant repetition, not identical repetition.** Failed gates auto-generate a variant of the same step. This mechanizes Kumon's repetition while fixing the r/Kumon complaint that Kumon Connect forbids combined or modified sets [13].
8. **Spaced review.** Mastered skills re-enter as short mixed sets on an SM-2/FSRS-style schedule [54]; "Mastered" only sticks after a later mixed-skill assessment, per Khan's definition [46].

### 3.2 The CPA layer, built as a hint ladder

CPA (Concrete-Pictorial-Abstract, from Bruner's enactive/iconic/symbolic modes) is the instructional core of Singapore math [15]. The bar model, in part-whole and comparison forms, entered Singapore's curriculum in 1983 and is "primarily pictorial" [16]. Kumon, paper or Connect, has no conceptual layer at all, so this is both the pedagogical differentiator and the answer to the monotony complaint [14].

- **Trigger.** Two consecutive failures or a stall on an item offers the pictorial version. The hint path is untimed and always available. Set-level CPA-hint mode, where every hint is open from the start and the timer is off, is defined in 3.1 step 6.
- **Step 1, pictorial.** The same item as one of five fixed, reusable models: part-whole bar, comparison bar, fraction bar, number line, base-ten/array. Reusing the same models across kelas 4-6 follows Maths No Problem's guidance that children decode instantly when they meet "the same bar model they first saw" [16], and the Math Learning Center's shape of 13+ reusable manipulative tools rather than per-lesson content [19]. Thinking Blocks proves the tape-diagram tool works as a standalone pictorial layer for exactly these grade-level topics: Junior, Addition, Multiplication, Fractions, Ratios, plus Decimals and Percent videos [18]. Bar models are the standard Singapore tool for fractions, percentages, ratios, and multi-step problems through grade 6 [17].
- **Step 2, manipulative, optional.** A light interaction, for example shading a hundredths chart for decimals. Edutopia's grade-5 sequence reinterprets the base-ten cube as one whole, flat as a tenth, rod as a hundredth, unit cube as a thousandth, before the abstract column method appears [20]. Others: dragging fraction bars, building with base-ten pieces.
- **Escalation beyond hints.** If the hint ladder does not unstick the child, two hint-mediated failures on the same step, the set drops to worked-example mode: a fully solved example with each CPA step annotated, followed by a near-identical item. Two more failures trigger a parent nudge on WhatsApp ("Anak butuh bantuan di [topik]"), and from v1.5 a short explainer clip. The ladder ends at the parent, not at a dead end.
- **Close the link.** After solving through a hint, show picture and equation together before logging mastery, because "the learning sits in the links between representations, not in the representations themselves" [16]. Hints fade as mastery grows, and the manipulative varies within a topic, Dienes-style, to prevent tool-attachment [16].
- **Terminology.** Brand the tool "model batang" with "model bar" as a secondary label, never "diagram batang". In Kurikulum Merdeka that term means a bar chart for data [26], which kelas 5-6 children meet in the data chapter of their official books. Indonesian usage keeps the English acronym, "pendekatan CPA", glossed as Konkret, Gambaran, Abstrak [23].
- **Why it fills a real gap.** A 2024 Indonesia-Singapore curriculum comparison, cited in a 2025 review, found CPA implementation in Indonesia is "insidental", dependent on individual teachers or researchers rather than systematized in official materials [24]. The Fase B CP wording itself licenses the approach: pupils work "menggunakan benda-benda konkret, gambar dan simbol matematika" [25]. A product that ties pictorial hints systematically to the Fase B/C outcome list addresses a documented gap.

### 3.3 Curriculum mapping to Kurikulum Merdeka Fase B/C

Source: official CP text from Keputusan Kepala BSKAP 008/H/KR/2022, quoted verbatim on defantri.com [25][26], a third-party transcription. The 2025 re-issuance, KepKa BSKAP No. 046/H/KR/2025, was checked directly in the review's claim-check pass: its Fase C Matematika section contains the same requirements with one rewording found, "mengubah pecahan menjadi desimal" became "mengubah pecahan menjadi berbagai bentuk pecahan lain", with decimal comparison and ordering retained, so the math content is substantively unchanged [67]. The 2025 revision wraps the same five elements, Bilangan, Aljabar, Pengukuran, Geometri, Analisis Data dan Peluang, in the Pembelajaran Mendalam framework [27]. The Fase B topic list below is per the 2022 decree transcription; its 2025 rewording was not checked side by side (unverified). Kumon's ladder covers the grade 4-6 arithmetic strand in levels C-F: multiplication, division, the four fraction operations, then fractions, decimals, and word problems [3]. Kumon has no measurement, geometry, or data strand, so the Bilangan strand mirrors Kumon levels C-F while Pengukuran, Geometri, and Data are covered by our own generator families, unit-conversion drills, keliling/luas sets, and data-reading sets, that Kumon does not offer.

**Kelas 4 (Fase B) drill topics [25]:**

- Bilangan: whole numbers to 10.000, place value, compare, order; addition and subtraction to 1.000 with regrouping; multiplication and division to 100; kelipatan dan faktor; money problems in thousands of rupiah; unit fractions, same-denominator comparison, equivalent fractions; decimals, persepuluhan and perseratusan, linked to percent.
- Pengukuran and Geometri: length and weight with standard units, cm to m conversion; keliling and luas with standard whole-number units; plane-shape properties with composition and decomposition.
- Data: tables, picture diagrams, pictograms, one-unit-scale bar charts.
- Kumon mirror, Bilangan strand only: levels C-D, multiplication tables through 2-digit x 1-digit, then division with remainders and 2-digit x 2-digit [3]. No Kumon equivalent exists for the Pengukuran, Geometri, and Data topics above.

**Kelas 5 (Fase C) drill topics [26][67]:**

- Bilangan and Aljabar: whole numbers to 1.000.000 with arithmetic to 100.000; KPK and FPB; fraction addition and subtraction including different denominators, fraction multiplication and division by whole numbers; converting fractions to other fraction forms including decimals (decimal comparison retained in the 2025 wording [67]); ordering decimals to one decimal place; unknown-value sentences with all four operations to 1.000; growing and shrinking patterns with x and division; money problems.
- Pengukuran and Geometri: perimeter and area of triangles, quadrilaterals, polygons, and composite shapes; time durations; angle measurement.
- Data: pictograms, bar charts, frequency tables.
- Kumon mirror, Bilangan strand only: level E, the four operations with three or more fractions [3]. The measurement, geometry, and data topics are ours alone.

**Kelas 6 (Fase C consolidation plus TKA) [26][67][28]:**

- Bilangan and Aljabar: rasio and proportional reasoning with unit ratios; percent; mixed-number fraction operations; decimal operations; multi-step soal cerita, which is Kumon level F territory [3].
- Geometri and Pengukuran: volume of kubus and balok with unit conversion; solids from front, top, and side views; grid-map locations; angles.
- Data and peluang: frequency tables; comparing likelihood of events.
- **TKA mode.** The Pusmendik matrix assesses exactly three areas: Bilangan, covering fraction equivalence and comparison, fraction-decimal-percent relations, the four operations, and KPK/FPB; Geometri and Pengukuran, covering plane and solid shapes, spatial visualization, all standard-unit conversions, keliling and luas, volume kubus/balok, and angles; and Data. Each kompetensi is phrased "Memahami, mengaplikasikan, dan bernalar yang lebih tinggi", higher-order reasoning, not just procedures [28]. The item bank therefore separates fluency items from reasoning items, both tagged to CP elements and TKA sub-topics so the bank re-maps cheaply if BSKAP revises again [27][67].

### 3.4 What we deliberately do not copy from Kumon

- The 30-minute daily prescription [2] becomes 10-15 minutes, achievable daily for kelas 4-6 and consistent with Smartick's daily-session model [38] and Matific's "30 menit per minggu" parent pitch [22].
- Handwriting on tablets [5] becomes typed/numeric and tap-based bar-model input on phones, with structured widgets for fractions and mixed numbers (section 5).
- Human graders on 24-hour turnaround [6] become instant auto-grading.
- Rigid single-sheet assignments [13] become adaptive mixed review with generated variants.
- Paper fallback becomes offline-first caching (section 6).
- Kumon Connect itself proves the daily digital worksheet model works: auto-assigned sets at sign-in, daily submission, instructor replay and messages, a star calendar, and parent-visible records [5][6][7]. We copy the loop, not the constraints.

## 4. Gamification system

Design rule from the research: gamify mastery, not volume. Separate effort rewards from mastery signals, keep competition self-referential or cooperative, and never rank children publicly on speed. Duolingo Math already validated the transfer of this habit machinery to elementary math with "fast-paced, bite-sized lessons" covering multiplication, division, fractions, decimals, geometry, and measurement [44].

**4.1 Streak, the habit engine.** Daily set completion feeds a streak. Copy Duolingo's researched version: milestone celebrations early, which raised new-learner 7-day retention by 1.7%, plus 2 Streak Freeze tokens, which raised daily active learners by 0.38%; learners reaching a 7-day streak are 3.6x more likely to complete their course [43]. Duolingo deliberately uses loss aversion with slack, because a little flexibility motivates more than rigid rules [43]. Freezes map naturally onto Lebaran and family holidays.

**4.2 Effort versus mastery currencies.** Stars and XP reward completing today's work and unlock cosmetics. Topic mastery states, Baru, Lancar, Kuasai, advance only through repeated correct performance across sessions [45][46]. This protects the Kumon promise, mastery before advancing [1], from being gamed by XP volume.

**4.3 Collectible economy.** Stars buy avatar items, room decoration, and a pet companion that grows with the child. Smartick runs exactly this in Indonesia, stars redeemable for avatar and room costumes, and parents already pay Rp6.000/day for it [38]. Prodigy's collectible pets show collection mechanics carry long-term engagement [37]. Each questline ends in a boss: a mixed-topic challenge or a CPA bar-model puzzle that unlocks the next zone. DragonBox hides the math inside the mechanic, teaching linear equations to five-year-olds before symbols appear [52], and Prodigy's zone structure gives the small-step ladder narrative shape at near-zero content cost [37].

**4.4 Anxiety-safe timing.** Use invisible or de-emphasized timers, the Prodigy Math Facts pattern: no visible countdown, 5-10 minute daily games, mastery at three consecutive correct answers within a threshold, and never publicly comparing students on timed results [51]. The 2025 Psychological Science in the Public Interest synthesis recommends fact-fluency practice in 2-10 minute bursts several times a week, introduced only after accuracy, and Maki's 2024 study of 113 fourth and fifth graders found no anxiety difference between timed and untimed tasks; both are known here secondhand, via Prodigy's literature review, whose primary papers were not read [51]. Boaler reports about a third of students develop math anxiety at the onset of timed testing, and time pressure blocks working memory [50]; Matific lists timed pressure as an anxiety driver from age 5 [21]. The evidence is contested. We take the middle path: SCT as a personal benchmark, untimed hints, opt-in sprints after accuracy, no public speed ranking.

**4.5 Competition, carefully.** A 2026 systematic review of 45 studies, 11 of them pooled in the meta-analysis, found a small-to-moderate motivation effect, g = 0.383, and recommends limiting excessive competition in favor of personal progress and cooperative tasks [49]. Documented failure modes include hard-to-earn badges and persistently low leaderboard ranks depressing exactly the low performers a mastery product must retain [49]. Our mechanics: beat-your-own-best personal records; a Mathletics-style "Bonus Level" one step above the child's current best worth double points [48]; short ability-matched races, the way Mathletics Live matches opponents on speed and accuracy [47]; cooperative weekly goals for parent-formed groups or classes. Cooperative framing follows the meta-analysis recommendation [49]; the assumption that it fits Indonesian classroom culture better than individual ranking is an untested hypothesis, not a research finding. No global speed leaderboards.

**4.6 Parent-facing artifacts.** Kumon Connect testimonials show what parents actually value: pages done, time taken, progress at a glance, and instructor messages that keep the child motivated outside the center [7]. We ship a weekly Bahasa Indonesia WhatsApp digest, a star calendar like Kumon Connect's Study History with a star per completed day [6], and printable and shareable certificates. Smartick's downloadable diplomas [38] and Mathletics' weekly Bronze-Silver-Gold certificate ladder [48] are culturally potent artifacts that travel through parent WhatsApp groups [41].

## 5. Feature set

**MVP (v1), the loop. It ships across Phases 1-2 (weeks 1-16) in two increments** (section 8): the drill loop lands in Phase 1, billing and the CPA layer complete the MVP in Phase 2.

- Bahasa Indonesia PWA, installable, fast on low-end Android; child profile plus parent account
- Placement diagnostic
- Daily drill player: generated sets, invisible timer with calibrated SCT, instant grading, self-correction mode, mastery gates with the no-dead-end rules in 3.1, auto-variant repetition
- Launch content: kelas 4 core, multiplication, division, fractions, plus kelas 5 fractions and decimals, about 40-60 skills
- CPA hint ladder on 6-8 launch skills: part-whole bar, fraction bar, number line (Phase 2)
- Streak, streak freezes, stars, basic avatar and room shop
- Parent dashboard on web and weekly WhatsApp progress digest via utility templates (Phase 2) [65]
- Offline-first: the client caches a server-signed seed list covering the next three days of sets, evaluates gates locally, queues results in IndexedDB, and syncs on reconnect; beyond the signed window it falls back to the cached skill ladder and locally stored seeds (section 6)
- Answer input spec: numeric keypad for integers; fractions via a stacked numerator/denominator widget; mixed numbers as whole plus fraction fields; angles and money as numeric entry with unit chips; soal cerita answered as numeric final answers with unit selection; bar models manipulated by tap and drag, never freehand drawing
- PDF export of any set with answer key, for parents who want Kumon-style paper practice [60]
- Midtrans payments: QRIS, virtual accounts, e-wallets; monthly plus 3- and 6-month bundles (Phase 2) [61]
- Free tier: the first island is the first two units of the kelas-4 Bilangan strand, roughly 8-10 skills with about ten sets each, several weeks of daily content, no time limit; a 7-day full trial unlocks all kelas 4-5 content. Exact size is a conversion lever to tune, not a research finding.
- Admin: generator-template dashboard, skill-graph editor

**v1.5, months 5-7 (Phase 3):**

- Full Fase B/C coverage for kelas 4-6; soal cerita strand
- TKA mode: mock 30-question/75-minute tests, sub-topic score report, shareable certificate, seasonal campaign for the TKA 2027 cycle [28][30]
- Elo item-difficulty learning plus the review scheduler at scale [53][54]
- Cooperative layer pilot: class and group codes, weekly group goals, light teacher view
- Referral program; more manipulatives: comparison bar, base-ten, money pieces; explainer clips behind the hint ladder (3.2)
- Xendit recurring, for e-wallet direct-debit breadth, if one-off QRIS re-payment churns [63]

**v2, months 8-12 (Phase 4):**

- Family plan; TKA season pass tuning
- Handwriting input on tablets as a Kumon-BYOD-style tier [5]
- Native Android wrapper if PWA limits bite, storage eviction or push
- B2B-lite school pilot with offline-first content packs, the Kipin pattern [33]
- FIRe-style prerequisite trickle-down credit, the Math Academy ceiling [55]
- Financial-literacy mini-module; Matific markets one for Kelas 4-9 in Indonesia [22]

## 6. Full-stack architecture

- **Frontend: Next.js/React PWA with TypeScript.** One codebase, installable on the family Android, offline-capable, and fast on low-end devices; typed/numeric and tap-based input with the fraction and mixed-number widgets specified in section 5 replace handwriting for this audience [5].
- **Backend: Supabase**, Postgres, Auth, Edge Functions, Storage. Pro is $25/month at 100k MAU and an 8 GB database, billing resources rather than operations [57]; a practitioner blog estimates a heavily active app, 10k DAU doing 10M reads/day, at about $50-100/month on Supabase versus $500-1.500 on Firebase. That is a personal-blog estimate, not official pricing [58].
- **Drill engine: deterministic client-side TypeScript generators, seeded per session; the server decides the next task, skill plus step plus seed, and the client renders and grades.** This is the Duolingo Session Generator split at small-SaaS scale [59], and it lets a full drill session run with zero network.
- **Offline and integrity model.** For offline days beyond today, the client pre-generates up to three days of sets from a server-signed seed list and falls back to the cached skill ladder with locally stored seeds after that; gates evaluate locally and results queue in IndexedDB until reconnect. On sync, the server recomputes streaks, mastery states, and SCT calibration from the synced attempts and flags statistically implausible results, superhuman speed or uniform perfect patterns, before they reach the parent dashboard. A child faking mastery only mis-places themselves; parent-visible records are server-validated.
- **Content: parameterized generator templates per skill**, number ranges, regroup flags, item counts, with seeds stored alongside results so any worksheet regenerates identically and exports to PDF with answer keys. This is the Math-Aids pattern of dynamically generated worksheets across topics [60], and it matches how Math Academy pairs its topic graph with "the easiest and hardest variations" per topic instead of hand-authoring every item [55].
- **Data model: skills as topics on a prerequisite graph** mapped to Fase B/C elements, with per-skill mastery state, attempt history, and item-difficulty estimates [55].
- **Adaptive model in three cheap layers:** mastery gates; per-skill Elo, student skill versus item difficulty, which Pelánek describes as simple, robust, and effective, needing no expert input, with item difficulties learned from answers and the U(n) = a/(1+bn) uncertainty update [53]; and SM-2/FSRS review scheduling for mastered skills [54]. Math Academy's FIRe trickle-down is a documented later upgrade, not a launch requirement [55].
- **Payments: Midtrans first.** QRIS 0.7%, virtual accounts IDR 4.000 per transaction, GoPay 2%, cards 2.9% plus IDR 2.000, and a recurring subscription API with tokenized GoPay and cards plus automatic retry of failed charges [61][62]. Default collection to QRIS and e-wallets on small tickets: on a Rp49.000 charge, QRIS costs about Rp343 (0.7%) while cards cost 2.9% plus IDR 2.000, about Rp3.400 or roughly 7% of the ticket [61]. Xendit Subscriptions, with e-wallets, direct debit, up to 5 linked payment accounts, and retries, is the breadth backup [63][64]. DOKU has documented fees but no verified subscription product, so it is not counted [66].
- **WhatsApp: WhatsApp Business Cloud API utility templates** for weekly digests and payment reminders. Utility templates inside the 24-hour customer-service window are free; Indonesia rates effective October 1, 2026 are about $0.025 per utility message and $0.0411 per marketing message, with 1.000 free service messages per number per month at the start [65]. This channel replaces Kumon's instructor-comment loop and is core retention, not an add-on [7][32]. Whether Meta accepts weekly progress digests as utility rather than marketing is an open categorization question (risk 12); if reclassified, per-message cost rises from about $0.025 to about $0.0411 [65].
- **Hosting: Supabase managed, Singapore region, plus the Next.js frontend on a standard edge host, Vercel or Cloudflare Pages.** Launch runs at the $25/month Pro floor [57], rising toward the $50-100 practitioner estimate only under heavy read volume [58]; budget $25-150/month through the design-partner and soft-launch stages, with no sourced data beyond that. Latency for Indonesian users on Singapore-region infrastructure is unverified (risk 5).

## 7. Monetization and pricing in IDR

**Benchmark** (repeated from section 2 for pricing context): Kumon Rp525.000/month per subject plus Rp350.000 registration [9], Smartick about Rp180.000/month [38], CoLearn Rp90.000-170.000/month [32], Ruangguru SD bundles Rp550.000 per 6 months and TKA bundles from Rp1.150.000 [31], les privat about Rp920.000-1.000.000/month, Khan Academy free [35]. Matholia, the closest Singapore-math practice portal, lists at about US$10.99/month individual on a third-party 2022 list, indicative only.

**Recommended pricing:**

| Plan | Price | Logic |
|---|---|---|
| Bulanan | Rp49.000/month | Under CoLearn's Rp90.000; about a tenth of Kumon SD Jabodetabek |
| 3 bulan | Rp129.000, about Rp43.000/month | Bundle, Indonesian style |
| 6 bulan | Rp229.000, about Rp38.000/month | |
| 12 bulan | Rp399.000, about Rp33.000/month | About 6% of a year of Kumon, Rp6,3M per subject |
| Family, up to 3 children | Rp89.000/month | Kumon charges per subject per student [9] |
| TKA Prep season pass, kelas 5-6 | Rp99.000 for the January-April season (2027 cycle), or included in the 12-month plan | Against Ruangguru TKA bundles from Rp1.150.000 [31]; a one-off pass, not a monthly price |
| Free tier | First island always free, plus a 7-day full trial | Beats Kumon's 2-week/4-session trial [11] because the free rung never expires; island scope in section 5 |

**Rationale:**

- Sell bundles, not monthly only. SD packages in Indonesia are sold as term, semester, and year bundles, per Ruangguru's packaging [31]. Bundles also pre-pay against QRIS re-payment churn, since QRIS has no true auto-renew and Midtrans recurring covers tokenized GoPay and cards only [62].
- No registration fee. Kumon's Rp350.000 registration [9] and its frequent waiver promos [11] are a visible commitment cost we erase.
- The price band sits under CoLearn and Smartick and above the free anchor. Khan conditions parents to pay zero for content [35]; the gap we charge for is alignment, the daily loop, and progress parents can see in WhatsApp.
- Verify Midtrans's unpublished "gaming and digital product companies" rate differential before finalizing prices (risk 3) [61].

### 7.1 Go/no-go economics (planning assumptions, not research findings)

The research supplies competitor prices and payment fees but no CAC, conversion, or salary data. The numbers below are a framework with placeholders the founder must replace with real offers; none are sourced.

- **Contribution per subscriber:** Rp49.000 monthly plan minus 0.7% QRIS (Rp343) is about Rp48.700/month; the 12-month bundle is about Rp33.250/month equivalent.
- **Break-even:** paying subscribers needed = monthly burn / contribution. A three-person team, 2 engineers plus 1 content and pedagogy lead, plus tools and infra plausibly burns Rp30-60M/month at Indonesian market rates; that figure is a placeholder, not a research finding. At that burn, break-even is roughly 620-1.230 paying subscribers on monthly plans, or roughly 900-1.800 on an all-annual mix.
- **CAC:** unmeasured (risk 7). The plan assumes near-zero paid acquisition through Phase 2, design partners and WhatsApp groups plus referral, with a target blended CAC below one month's price, Rp49.000. The kill condition: if blended CAC exceeds one month's contribution (about Rp48.700) at scale, the model fails regardless of retention.
- **Conversion assumption to validate:** 5-10% of active trialists converting to paid, an industry-typical planning figure, unverified for this product; Phase 2's go criteria (section 8) test it directly.
- **Gross margin framing:** variable costs per subscriber, payment fees plus marginal infra and WhatsApp sends, leave variable margin above 90%. That excludes team cost and CAC, which dominate the P&L at a Rp49.000 price point; the break-even math above is the honest headline, not the margin.

## 8. MVP roadmap

Assumption: 2 engineers plus 1 content and pedagogy lead. Effort is rough dev-weeks. Content capacity: a generator template plus tuning is budgeted at 1-2 engineer-days per skill, and a CPA hint ladder at 2-3 days per skill; 40-60 skills in eight weeks only works if templates parameterize most content, with the content lead authoring templates and word-problem shells. If per-skill effort runs double, Phase 1 scope shrinks to kelas 4 only. Proposed success thresholds below are planning criteria to confirm with the founder, not research findings.

**Phase 1, core loop, weeks 1-8, about 12 dev-weeks.** Skill graph v1, about 40-60 skills covering kelas 4 multiplication, division, and fractions plus kelas 5 fractions and decimals; generator templates; drill player with invisible timer, SCT calibration, gates, and variants; placement diagnostic; streak, stars, and shop-lite; Supabase auth and data model; offline caching and sync; PDF export. Acquisition: design partners come from the founder's direct network and parent WhatsApp groups in 2-3 school communities, recruited with free access; no paid media. Exit criteria: 20-50 design-partner families recruited; at least 40% of them complete 4 or more sessions/week by week 8; at least 100 completing attempts per launch skill so SCT and gates calibrate on real data.

**Phase 2, monetize plus CPA, weeks 9-16, about 12 dev-weeks.** CPA hint ladder on launch skills; parent dashboard; WhatsApp weekly digest on utility templates [65]; Midtrans QRIS, VA, and e-wallet with bundle pricing [61]; kelas 4-5 coverage completed; referral beta, give-a-month/get-a-month, seeded through class WhatsApp groups [41], with CoLearn's click-to-chat enrollment as the sales pattern to copy [32]. Go/no-go criteria: at least 30% of design-partner families convert to paid within 4 weeks of billing launch; D30 retention at least 25%; median 3 or more sessions/week. Below 10% conversion or D30 below 15% means stop or rework pricing and content before public launch.

**Phase 3, TKA season, months 5-7, about 10 dev-weeks.** Kelas 6 skills, rasio, volume, data and peluang; TKA mode with mock 30-question/75-minute tests, sub-topic reports, and shareable certificates, timed to the TKA 2027 cycle. The 2026 cycle ran registration around January-February (reported in snippets, unverified) with the exam 20-30 April [30]; 2027 dates are unannounced. Elo and review scheduler at scale; class and group cooperative pilot. Exit criteria: at least 500 paying subscribers and at least half of kelas-6 subscribers completing at least one TKA mock by end of season.

**Phase 4, scale, months 8-12, about 12 or more dev-weeks.** Family plan; tablet handwriting tier; native-app decision point; B2B-lite school pilot; FIRe-style trickle-down [55]; soal cerita depth and additional manipulatives; Xendit recurring if churn data demands it [63]. Exit criteria: CAC payback under 3 months; monthly churn under 8% on monthly plans.

## 9. Risks and open questions

**Risks:**

1. **Timed-drill anxiety.** The evidence is genuinely contested: Boaler reports about a third of students develop math anxiety at the onset of timed testing [50], while Maki 2024 found no anxiety difference and the 2025 PSPI synthesis endorses short post-accuracy bursts, both known here secondhand via [51]. The design hedges in 4.4 mitigate, but parent and teacher sentiment needs monitoring; the critique is familiar to Indonesian educators through Matific's Indonesian-language marketing [21][22].
2. **Recurring-payment churn.** QRIS has no true auto-renew, and Midtrans recurring covers tokenized GoPay and cards only [62]. Mitigation: bundles and WhatsApp reminders; Xendit direct-debit breadth if needed [63].
3. **Midtrans rate category.** Its pricing page says gaming and digital product companies "are subject to different rates" but publishes none; verify whether an edtech subscription qualifies before finalizing price [61].
4. **PWA storage eviction on low-end Android.** The offline-first guidance in the research is Android-native, not PWA-specific; Chrome Lite mode and aggressive eviction were not verified [56]. The plan's headline "offline-tolerant" claim and its offline MVP bullet are untested until a storage-budget prototype runs on low-end devices; the fallback design in section 6 bounds the exposure but does not remove the risk.
5. **Latency.** Singapore-region Supabase latency for Indonesian users is unverified [57].
6. **Engagement without a full RPG.** Prodigy's ceiling is a complete RPG with pets, quests, and a battle pass [37]. Smartick's homepage suggests stars, avatars, and a daily session suffice in Indonesia [38], but the research found no data on Smartick's Indonesian traction, and risk 7's willingness-to-pay gap applies.
7. **Free anchor and unmeasured demand.** Khan Academy is free and Indonesian [35]. No survey data exists on willingness to pay for drills specifically, and no CAC or conversion benchmark exists for this category; pricing and the break-even math (7.1) may need adjustment after design-partner data.
8. **Curriculum and TKA durability.** The CP was re-issued in 2025 as BSKAP 046/H/KR/2025 [27][67], and TKA is new: the first run was April 2026, it is voluntary, and its persistence and national scope are unverified [29]. The plan treats TKA as upside; the core daily-fluency value holds without it. Item tagging to CP elements and TKA sub-topics keeps re-mapping cheap.
9. **Evidence extrapolation.** The Ratinho systematic review and meta-analysis covers ages 13-38, not elementary children [49]. Vendor efficacy claims, such as Matific's plus-34% study [22], are self-reported and unverified. Several load-bearing numbers in this plan are secondhand: the PSPI synthesis and Maki study via Prodigy's blog [51], the Supabase-vs-Firebase cost estimate via a personal blog [58], and the WhatsApp user count via a vendor marketing page [40].
10. **Points the research flagged as unverified, restated:** Smartick's full price tiers beyond the Rp6.000/day hero figure [38]; Kumon Connect's IDR price and Indonesian adoption, since no fee is published and not all centers offer it [8]; les privat prices, captured without a URL; Xendit fees, which were browser-extracted from a global page and need re-verification against the Indonesian rate card [64]; WhatsApp per-message rates, taken from a BSP's reproduction of Meta's rate card rather than Meta's page [65]; TKA 2026 registration and simulation dates, which came from search-result snippets, though the April 20-30 exam window is verified and the government pages agree on 30 questions in 75 minutes [30][28]; TKA 2027 dates, unannounced.
11. **B2C fragility.** Zenius shut down after raising US$40M [39]. The daily habit loop, annual bundles, and the low-cost WhatsApp referral channel are the structural answers; watch CAC.
12. **Child-data and platform compliance, not researched.** The briefs contain nothing on Indonesian data-protection obligations for a product storing children's attempt history and mastery states, on PSE registration requirements, or on app-store kids' policies for a collectible economy. The retention loop also depends on Meta accepting weekly progress digests as utility templates rather than marketing; reclassification raises per-message cost from about $0.025 to about $0.0411 [65]. Treat all of this as a pre-launch legal and platform checklist to run before Phase 2 billing; it was not researched here.
13. **No structural moat; competitive response.** Nothing technical stops CoLearn, Ruangguru, or Kumon Indonesia from shipping a gamified drill loop. Defensibility rests on execution and accumulation: calibrated per-skill difficulty and SCT data that compounds with attempts, CP/TKA item tagging for fast re-mapping, the WhatsApp parent loop, and a price structure incumbents may not want to match. Kumon Indonesia's franchise centers assume human grading and Rp525.000/month economics [9], and Ruangguru monetizes video bundles [31]; that they are constrained is an inference from their business models, not a verified statement of intent.

**Open questions:**

- Gate thresholds: the 95%/80% proposals, the SCT tightening step, and the placement length need calibration on design-partner data.
- Price elasticity: is Rp49.000 too low, signaling weakness, or too high against free?
- Does the cooperative class layer need teacher buy-in, B2B-lite, or do parent-formed groups work alone?
- Which WhatsApp BSP at scale, given WATI starts at $49/month and markups vary [65]?
- Is a native app ever needed? Decide on storage and push evidence in Phase 4.
- Will Meta classify weekly progress digests as utility or marketing [65]?

## 10. Sources

All URLs come from the five research briefs except source 67, the official 046/H/KR/2025 PDF, which the review's claim-check pass verified and added. Numbering matches the bracketed citations in the text. No web searches were run while drafting this plan; the claim-check pass that followed supplied the verification behind the notes above. The briefs left no gap that blocked drafting, but several load-bearing facts remain unverified and are listed in risks 4, 5, 10, and 12.

**Kumon method and Kumon Connect**

1. https://www.kumon.com/about-kumon/kumon-method/small-steps/five-features
2. https://www.kumon.com/math-program
3. https://kumon.sg/wp-content/uploads/2021/08/Table-of-Learning-Maths.pdf
4. https://www.kumon.com/resources/understanding-completion-time-in-kumon-a-parents-practical-guide/
5. https://www.kumon.com/kumon-connect
6. https://www.kumon.com/resources/canadian_english/how-kumon-connect-works-what-families-need-to-know-about-digital-kumon-worksheets/
7. https://au.kumonglobal.com/kumon-connect/
8. https://id.kumonglobal.com/kumon-connect/
9. https://id.kumonglobal.com/biaya-kursus/?lang=id
10. https://www.biayales.id/biaya-les-kumon/
11. https://id.wikipedia.org/wiki/Kumon
12. https://www.reddit.com/r/Kumon/comments/1bp6i67/is_it_true_electronic_version_of_kumon_is_superior/
13. https://www.reddit.com/r/Kumon/comments/1lpsj86/kumon_connect/
14. https://www.educenter.id/review-jujur-orang-tua-perubahan-anak-setelah-3-bulan-ikut-kumon/

**CPA Singapore math**

15. https://mathsnoproblem.com/en/approach/concrete-pictorial-abstract
16. https://mathsnoproblem.com/en/approach/bar-modelling
17. https://esingaporemath.com/blog/bar-modeling
18. https://www.mathplayground.com/thinkingblocks.html
19. https://www.mathlearningcenter.org/apps
20. https://www.edutopia.org/article/cpa-method-math-lessons-upper-elementary/
21. https://www.matific.com/us/en-us/home/blog/2021/11/09/mathematics-pedagogy-rigor-and-engagement/
22. https://www.matific.com/id/id/home/
23. https://mentarigroups.com/blog/pendekatan-cpa-dalam-metode-singapura-membangun-pemahaman-matematika-yang-kokoh/
24. https://ipssj.com/index.php/ojs/article/download/654/599/2095

**Indonesian curriculum, market, and competitors**

25. https://www.defantri.com/2022/05/capaian-pembelajaran-matematika-sd-fase-b.html
26. https://www.defantri.com/2022/05/capaian-pembelajaran-matematika-sd-fase-c.html
27. https://guru.kemendikdasmen.go.id/kurikulum/referensi-penerapan/capaian-pembelajaran/sd-sma/matematika/fase-c/
28. https://pusmendik.kemendikdasmen.go.id/tka/tka/view/mata-pelajaran-wajib/sd
29. https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52474902769689-Kenali-Tes-Kemampuan-Akademik-TKA
30. https://bbpmpjatim.kemendikdasmen.go.id/main/cek-di-sini-jadwal-lengkap-tka-sd-2026-mulai-pembagian-sesi-ujian-jam-pelaksanaan-dan-info-penting-bagi-siswa/
31. https://www.ruangguru.com/blog/informasi-produk-ruangguru-yang-jadi-unggulan
32. https://colearn.id/
33. https://kipin.id/
34. https://www.quipper.com/id/school/
35. https://id.khanacademy.org/math
36. https://www.prodigygame.com/Memberships/math/
37. https://www.prodigygame.com/main-en/blog/what-is-prodigy-math-game
38. https://www.smartick.id/
39. https://www.cnbcindonesia.com/tech/20240104061424-37-502593/zenius-berhenti-beroperasi-sebut-tantangan-operasional
40. https://www.ycloud.com/id/blog/whatsapp-statistics-for-businesses
41. https://cards.co.id/whatsapp-vs-aplikasi-sekolah-info-orang-tua
42. https://tka.kemendikdasmen.go.id/

**Gamification patterns**

43. https://blog.duolingo.com/how-duolingo-streak-builds-habit/
44. https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_duolingo_method_2023.pdf
45. https://support.khanacademy.org/hc/en-us/articles/202487710-What-are-energy-points-badges-and-avatars
46. https://support.khanacademy.org/hc/en-us/articles/5548760867853--How-do-Khan-Academy-s-Mastery-levels-work
47. https://www.mathletics.com/me/faq/
48. https://www.3plearning.com/blog/mathletics-reward-great-performance/
49. https://link.springer.com/article/10.1007/s10648-025-10108-1
50. https://www.youcubed.org/evidence/fluency-without-fear/
51. https://www.prodigygame.com/main-en/blog/math-facts-timed-tests-anxiety
52. https://dragonbox.com/products/numbers

**Full-stack architecture**

53. https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
54. https://faqs.ankiweb.net/what-spaced-repetition-algorithm
55. https://www.mathacademy.com/how-our-ai-works
56. https://developer.android.com/topic/architecture/data-layer/offline-first
57. https://supabase.com/pricing
58. https://justinmckelvey.com/blog/supabase-vs-firebase
59. https://blog.duolingo.com/rewriting-duolingos-engine-in-scala/
60. https://www.math-aids.com/
61. https://midtrans.com/pricing
62. https://midtrans.com/features/recurring-payment
63. https://www.xendit.co/en-id/products/subscriptions/
64. https://www.xendit.co/en/pricing/
65. https://chatmaxima.com/whatsapp-api-pricing/
66. https://www.doku.com/en-us/pricing

**Added in the 2026-10-04 revision (claim-check pass)**

67. https://bpmpbabel.kemendikdasmen.go.id/PPID/wp-content/uploads/2025/07/KepKaBSKAP-046_2025-ttg-CP.pdf
