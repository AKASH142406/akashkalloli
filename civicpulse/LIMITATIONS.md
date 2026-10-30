# Limitations & Honesty

This is a hackathon prototype, not a municipal system. This page is deliberately blunt about what works, what is simulated, and where the AI can mislead you.

## One-paragraph summary

CivicPulse really does classify text, score duplicate similarity, compute an explainable priority, detect spatial hotspots, generate action briefs and persist a staff workflow. It does **not** talk to BBMP or any live city system, it does **not** understand photos, it has **no authentication or notifications**, and every report in the demo is synthetic. The AI is decision support. A human reviews every duplicate link, category override and status change.

## Real vs simulated

| Capability | Status | Notes |
| --- | --- | --- |
| Text classification | **Real** | Hybrid Naive Bayes + civic lexicon, 8 categories, runs locally |
| Duplicate scoring | **Real** | BGE-small embeddings + geo/time/category hybrid, human-confirmed links |
| Priority rubric | **Real** | Deterministic weighted factors with a visible explanation |
| Extractive summaries | **Real** | Sentence selection + signal extraction; no generative model |
| Hotspot detection | **Real** | DBSCAN over haversine distance, 220 m / 3 reports |
| Action briefs | **Real template** | Computed statistics filled into a fixed structure |
| Ops workflow | **Real** | Status transitions, assignment, comments, confirmations, history |
| Persistence | **Real but local** | JSON file, atomic replace, single process |
| Map | **Real but limited** | Leaflet + 175 prefetched CARTO tiles for the demo area; CDN fallback |
| Photo capture | **Real capture, no understanding** | Browser compression and storage only; no computer vision |
| Dataset | **Simulated** | 63 synthetic reports, fictional names and addresses |
| Localities / wards | **Approximate** | Centroids and ward labels for demo grouping, not official boundaries |
| Teams / SLAs | **Simulated** | Fictional team names, leads and response targets |
| Notifications | **Not implemented** | No SMS, email, push or webhook |
| Live municipal API | **Not implemented** | No BBMP / 311 / CRM integration |
| Authentication / roles | **Not implemented** | One shared ops desk; anyone who can reach the server can act |
| LLM | **Optional, off by default** | If configured, only rewrites summaries/briefs; never classification or priority |

## AI limitations

### Category classifier

- Trained on **193 synthetic examples** written for this demo. The 0.896 cross-validation accuracy is not an independent real-world evaluation; the lexicon and examples share an author.
- English-only, and sensitive to spelling, transliteration and mixed-language text (for example Kannada-English code-mixing).
- Very short or vague reports (“problem here”, “please fix”) carry little signal. The classifier still returns a label; confidence is the only warning.
- Category boundaries overlap. The seed data contains two honest disagreements:
  - **CP-1029** (“Streetlight pole damaged… wires exposed… children walk past”) is labelled **Safety Hazard** by the dataset but predicted **Streetlight**.
  - **CP-1056** (“Pipeline burst… water gushing out and flooding the street”) is labelled **Water Supply** but predicted **Waterlogging**.
- A citizen can override the category. Ops can also override it later. The AI suggestion is not authoritative.

### Duplicate detection

- The benchmark is **31 hand-labelled synthetic pairs**. Thresholds were inspected on the same set, so the reported F1 is a sanity check, not a production estimate.
- The semantic threshold (0.78) is intentionally above the F1-optimal point (0.72). This favours precision: fewer false merges, more missed duplicates. Recall is 0.813 on the benchmark, so roughly one in five true duplicates is missed there.
- Paraphrases, different languages, sarcasm and very short reports can fall below threshold. Two reports about the same drain can look different if one says “water logging” and the other says “storm-water backup”.
- Location is whatever the citizen pinned. A pin on the wrong street can suppress a true duplicate or create a false one.
- The TF-IDF fallback is materially weaker. On the synthetic benchmark its best F1 is 0.727 at 0.38; the conservative 0.62 operating threshold has low recall. The app prefers the local embedding model for this reason; run `npm run setup:model` to enable it.
- **The AI only suggests.** A staff member must confirm a link. Nothing is merged or discarded automatically.

### Priority rubric

- The weights are hand-tuned, not learned from real outcomes. They encode a reasonable civic-operations prior, not a validated risk model.
- Keyword matching can be gamed or fooled. “School” adds vulnerable-place points even if the school is closed; “minor” can reduce a genuinely dangerous report.
- Critical/High/Medium/Low thresholds are policy choices. The 4/24/72/168-hour targets are demo SLAs, not legal or contractual commitments.
- “Overdue” is computed from the SLA and the current clock. There is no escalation engine, no automatic reassignment and no notification when a target is missed.
- Priority is recomputed as reports age and as duplicates/confirmations arrive, so a report’s score can change without any new citizen input.

### Summaries and briefs

- Summaries are **extractive**. They can include awkward fragments, repeat a phrase, or miss the most important sentence if it is long and lexically unusual.
- Signal extraction is regex-based: quantities, impact terms and duration phrases. It can miss synonyms and can pick up the wrong number.
- Hotspot briefs are **templates over statistics**, not an investigation. The hypothesis (“drainage failure suspected”) is a prompt for a human, not a diagnosis.
- The brief’s confidence and unknowns are generated from rules. They are not calibrated probabilities.

### Hotspots

- DBSCAN uses a fixed **220 m** radius and **3-report** minimum. A real hotspot spread over 300 m, or one with only two reports, will not appear.
- Cluster membership is based on pins, not parcel or ward boundaries.
- Resolved reports and confirmed duplicates are excluded from clustering. A cluster can disappear after a cleanup even if the underlying problem persists.
- Clusters are spatial only. There is no space-time scan statistic, no seasonality model and no causal inference.
- The top cluster drives the headline brief. Other clusters are available in the UI but are not ranked by a formal cost model.

### Photos

- The browser compresses and uploads a photo, and the report displays it. **There is no image classification, pothole detection, severity estimation or OCR.**
- A photo can be attached to any category. The AI does not verify that the photo matches the text.
- Uploaded files are stored on local disk. There is no virus scanning, EXIF stripping or retention policy.

### Optional LLM

- Disabled unless `CIVIC_LLM_URL`, `CIVIC_LLM_KEY` and `CIVIC_LLM_MODEL` are all set.
- When enabled, it may rewrite a summary or brief. It is never used for classification, duplicate decisions or priority.
- It can hallucinate, omit uncertainty or invent details despite the prompt. It has not been evaluated for this use case.
- Enabling it sends report text to a third-party endpoint. The default local pipeline does not.

## Product and engineering limitations

- **Synthetic data only.** No real citizen reports, no real PII, no real municipal outcomes. The 63 reports are generated by `lib/seed.js`.
- **No authentication or authorisation.** There is no login, role model, audit identity or CSRF protection. Do not expose this server to the public internet.
- **Single-process JSON store.** `data/state.json` is rewritten atomically, but there is no database, transaction isolation, concurrent-writer safety or migration path. Two server processes would fight over the file.
- **No rate limiting.** Request body size is limited, but there is no per-IP or per-user throttling.
- **No notifications.** Citizens see updates only by revisiting the track page. Staff get no alerts.
- **No production map service.** 175 tiles are prefetched for the demo area at zoom 12–15. Outside that area the server redirects to the CARTO CDN, which requires internet access. The map is not a survey-grade basemap.
- **Geolocation depends on browser permission.** The demo defaults to Ejipura so it works without permission.
- **Accessibility and i18n are not audited.** The UI uses semantic HTML and keyboard-friendly controls, but there is no formal WCAG review and no localisation.
- **Tests cover the AI core, not the UI.** `npm test` checks classification, duplicate scoring, priority, summaries, seed insights and the model card. The browser flows were tested manually; there is no automated end-to-end suite in the repo.
- **No load or performance testing.** The bootstrap payload is roughly 2 MB because it includes all reports and insights. That is fine for 63 reports, not for a city.
- **Reset is destructive.** It restores the seed and deletes uploaded `CP-*.jpg/png/webp` files. Any reports or actions you created are lost.

## What would change for a real pilot

1. Replace the synthetic corpus with labelled, consented, multilingual reports and evaluate on a held-out real set.
2. Add authentication, role-based access, audit logs and a real database with concurrency control.
3. Add image triage only with a validated model and a human review path; do not infer severity from photos alone.
4. Calibrate priority against real response times and outcomes, and separate “risk” from “political urgency”.
5. Replace fixed-radius DBSCAN with a space-time method and validate against known infrastructure failures.
6. Add notifications, SLA escalation and a citizen feedback loop.
7. Run an accessibility, privacy and security review before any public deployment.
8. Keep the human-in-the-loop design: AI suggests, staff decide, citizens see the reasoning.

## How to describe this in the demo

Say this plainly:

> “The triage, duplicate scoring, priority rubric, hotspot detection and workflow are real code running locally on synthetic data. The dataset, teams and SLAs are simulated. There is no live city integration, no image understanding and no authentication. The AI is a suggestion engine with a visible explanation; a human confirms every merge and every status change.”

That is the honest version, and it is also the more interesting engineering story.
