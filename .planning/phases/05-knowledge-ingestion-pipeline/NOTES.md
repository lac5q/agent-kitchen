# Phase 05 Pre-Planning Notes

## Meeting Note Normalization (MUST address in plan)

### The Problem
Google Meet/Calendar sometimes attaches the same Google Doc to multiple calendar events. This means a single source document can represent multiple distinct meetings, resulting in:
- Multiple meetings merged into one blob in `knowledge/gdrive/meet-recordings`
- No per-meeting traceability for agents doing retrieval
- Ambiguous provenance when querying by date or attendee

### Required Behavior
The ingestion pipeline must NOT ingest raw meeting docs as-is without checking for multi-event collision.

**Per ingestion run:**
1. For each Google Doc pulled from Meet/Calendar, check if it is referenced by more than one calendar event
2. If one doc → one event: ingest normally, one record
3. If one doc → multiple events: create a **normalized index note per event** pointing to the canonical raw doc
   - Each index note records: `date`, `attendees`, `event_id`, `source_doc_id`, `shared_doc: true/false`
   - Raw canonical file stored exactly once in `knowledge/gdrive/meet-recordings`

### Per-Meeting Index Note Schema
```
---
date: YYYY-MM-DD
event_id: <google_calendar_event_id>
attendees: [name1, name2]
source_doc_id: <google_doc_id>
shared_doc: true   # true if this doc covers multiple calendar events
---

# Meeting — YYYY-MM-DD

Summary or excerpt from canonical doc relevant to this event.

Source: knowledge/gdrive/meet-recordings/<filename>.md
```

### What This Gives Agents
- Clean per-meeting lookup by date or attendee
- No duplicated raw content
- Provenance flag (`shared_doc`) so agents know when a note spans multiple events

### Known Existing Case
Juan meetings (April 8 + April 9) appear to share the same Google Doc — confirmed as the motivating example for this requirement.
