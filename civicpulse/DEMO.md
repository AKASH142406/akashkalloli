# 5-minute demo script

The goal is one complete journey: **citizen reports → AI triage → staff action → citizen sees progress → city-level insight → honest limits.**

Reset before you start: open the **Demo** button in the header → **Reset**, or run `npm run reset`.

Keep the browser at a normal desktop width for the staff screens. The report and track pages are mobile-first; resize to ~390 px for one shot if you want to show that.

---

## 0:00–0:20 — Reset and frame the problem

**Show:** Home page.

Say:

> “CivicPulse takes scattered civic complaints and turns them into a prioritised, explainable action list. Everything here is synthetic, and the AI runs locally.”

Click **Demo → Reset** if you have not already. The home snapshot should show roughly 50 open reports, 9 hotspots and several critical items.

---

## 0:20–1:30 — Citizen capture + live AI triage

**Go to:** `#/report`.

1. Click the quick chip **“Knee-deep water on the road”**, or type:

   > “Knee-deep water at the Ejipura signal after last night's rain. Bikes are stalling and traffic is backed up for 500 metres.”

2. Point at the right-hand **CivicPulse triage** card while it updates:
   - suggested category and confidence;
   - priority score and the plain-language reason;
   - **duplicate check** — it should surface **CP-1001** as a likely duplicate because the pin defaults to Ejipura.

3. Optionally add a photo. It is compressed in the browser before upload.

4. Click **Continue → Locate**. The pin is already on Ejipura. Drag it slightly if you want to show the duplicate check re-running.

5. Click **Review → Submit report**.

Say while the processing animation runs:

> “This is not a chatbot. The classifier, duplicate scorer and priority rubric run on the server and return the reasons, not just a label.”

---

## 1:30–2:00 — The triage result

**Show:** the result page with the new `CP-10xx` ID.

Point out:

- category and confidence;
- priority level, score, SLA target and **every factor** in “Why this priority?”;
- the duplicate card naming **CP-1001** with a match percentage and the reason (“same spot”, “very similar wording”);
- the note that ops must confirm the merge and the report is never discarded automatically.

Click **Track this report** and leave the tab on the citizen timeline for later.

---

## 2:00–2:30 — Citizen tracking + confirmation

**Show:** `#/track/CP-10xx`.

- The status rail starts at **Received**.
- The map shows the pin.
- The timeline shows the creation event and the AI triage event.
- Click **I'm also affected**. The confirmation count increases. This feeds the priority rubric (`+2` per confirmation, capped at 8).

Say:

> “The citizen sees the same reasoning staff see, in plain language. No black-box score.”

---

## 2:30–3:30 — Staff action

**Go to:** `#/ops/report:CP-10xx` (replace with the new ID), or open the **Ops desk** and find it in the queue.

In the drawer:

1. **Confirm duplicate** next to CP-1001. The new report is linked to the canonical report; CP-1001 keeps the queue position.
2. **Assign to team** — the AI suggests Drainage & Stormwater. Assign it.
3. Move status **new → assigned** (or **review → assigned**), then **assigned → in progress**.
4. Post a public update, for example:

   > “Drainage crew scheduled for this evening. Please avoid the junction until water clears.”

Say:

> “The AI suggested; the dispatcher decided. Every action is recorded in the report history.”

---

## 3:30–4:15 — City-level insight

**Go to:** `#/insights`.

Point out, in order:

1. **Action brief:** “Ejipura: drainage failure suspected” — 8 open reports within ~199 m, 2 critical, rising trend, recommended owner and first step.
2. **Hotspot cards:** Ejipura, Indiranagar 100ft Road (darkness linked to safety), BTM Layout. Each has severity, radius, category mix and trend.
3. **14-day trend:** reports rising over the last week.
4. **Area watchlist:** open volume, average priority and hotspot links.
5. **Duplicate groups:** six groups; some already human-confirmed, some still actionable. Link one if you have time.

Say:

> “Nine separate Ejipura complaints become one drainage hypothesis instead of nine queue items. The brief is a template over computed statistics, not an investigation — the unknowns are listed on the card.”

Optional: click **Assign cluster** on Ejipura and assign all open reports to Drainage & Stormwater in one action.

---

## 4:15–4:45 — How the AI works + honesty

**Go to:** `#/ai`.

1. **Pipeline diagram:** classify → summarise → duplicate check → prioritise → cluster → brief.
2. **Model card:** hybrid Naive Bayes + lexicon, 0.896 cross-validated accuracy on 193 synthetic examples; BGE-small embeddings, 0.78 duplicate threshold.
3. **F1 sweep chart:** semantic vs TF-IDF fallback. Point out that the operating threshold is deliberately above the best-F1 point to favour precision.
4. **Live playground:** try:

   > “Live electric wire hanging near the school gate, sparking”

   It should return **Safety Hazard**, **Critical**, with the hazard and vulnerable-place factors visible.

5. Scroll to the **honesty** panel and the known disagreements (CP-1029, CP-1056).

Say:

> “The classifier is trained on synthetic examples, so 0.896 is a sanity check, not real-world validation. The duplicate threshold is tuned for precision, and a human confirms every merge. There is no image understanding, no live city integration, no authentication and no notifications.”

---

## 4:45–5:00 — Close

Return to `#/insights` or the home page.

> “Capture, understand, reveal, act. The AI is real and local, the workflow is real, the data is synthetic, and the limits are on the page. That is CivicPulse.”

---

## If you have less than 5 minutes

Use this shorter path:

1. `#/report` → quick chip → show live duplicate check → submit.
2. Result page → point at priority factors + duplicate CP-1001.
3. `#/ops/report:<new-id>` → confirm duplicate → assign → status.
4. `#/insights` → Ejipura brief + hotspot cards.
5. `#/ai` → model card + one honesty sentence.

Skip the track page and the playground.

---

## Demo troubleshooting

| Problem | Fix |
| --- | --- |
| New report does not show CP-1001 as a duplicate | Make sure the pin is near Ejipura (the default) and the text mentions water/rain/flooding. The live check compares meaning, distance and time. |
| The report form preview says “clear” | Wait for the 420 ms debounce, or move the pin closer to Ejipura. |
| Ops drawer is empty after a reset | The reset restores the seed; the `CP-10xx` ID from before the reset no longer exists. Submit again or use a seed ID such as `CP-1009`. |
| Map tiles are blank | The demo area is prefetched; outside it the server redirects to the CARTO CDN. Check internet access or stay near Ejipura/Koramangala. |
| Embeddings are not ready | The server logs the fallback. The app still works with TF-IDF, but duplicate recall is lower. Run `npm run setup:model`, then restart. |
| Port 4173 is busy | `PORT=4174 npm start` (PowerShell: `$env:PORT=4174; npm start`). |
| Need a clean slate | `npm run reset`, or **Demo → Reset**. This also removes uploaded demo photos. |
