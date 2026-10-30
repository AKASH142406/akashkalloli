# CivicFix AI - AI Powered Civic Platform

Live Demo: [YOUR NETLIFY LINK]

## Problem
Scattered citizen reports, duplicate complaints, no prioritization.

## Solution - 4 Stage Pipeline
1. Capture: Text + Image + Category + Map pin (<1 min, mobile)
2. Understand: AI pipeline
   - Categorize: keyword rules (Safety, Waterlogging, Road, Waste, Light, Drainage)
   - Summarize: first-sentence extraction
   - Duplicate: Jaccard similarity >0.6
   - Priority: score = urgency 40% + safety 30% + duplicates 20% + hotspot 10%
3. Reveal: Leaflet map with priority colors + hotspot cluster detection (500m radius)
4. Act: Kanban workflow New->Review->Assigned->Resolved + Citizen tracking ID

## Tech
Single HTML file, Tailwind CDN, Leaflet Maps, Pure JS AI (no backend needed for MVP)

## Synthetic Data
10 reports with 2 duplicate pairs and 1 hotspot (Ejipura - 3 reports) + 1 critical safety issue.

## Limitations & Honesty
Real: Categorization, duplicate detection, priority scoring, map clustering, workflow.
Mocked: Image CV analysis (only preview), SMS/push notification, BBMP live API.
AI can fail: If description is vague ("problem here"), category defaults to Drainage, priority Low.
Next: Use sentence-transformer embeddings, YOLO for image pothole detection, real Firebase backend.

## Demo Script (5 min)
1. Submit: "Electric wire fallen near school, sparking" + photo + pin
2. Show AI result: Category, Summary, Duplicate check, Priority=Critical with reasons
3. Show Map hotspot: Ejipura cluster insight
4. Admin: Move card to Assigned -> Resolved, citizen tracks via ID