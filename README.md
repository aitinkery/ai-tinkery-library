# AI Tinkery Library

A filterable library of 37 hands-on AI activities from Stanford's AI Tinkery,
with a small AI tutor panel as a helper.

**Library first, chat second.** The activities are the product — the chatbot
is a shortcut for people who'd rather describe what they want than click
through filters.

Built as a redesign of the original
[`ai-tinkery-chatbot`](https://github.com/aitinkery/ai-tinkery-chatbot):
same content, same brand, different shape.

---

## What's here

| File | What it does |
|---|---|
| `index.html` | Vanilla HTML/CSS/JS. Filter bar, activity grid, saved drawer, chat panel. |
| `activities.json` | Single source of truth for the 37 activities. |
| `server.py` | Flask: serves static assets and proxies `/api/claude` to the Apps Script backend. |
| `backend.gs` | Google Apps Script: calls Anthropic's API; returns structured JSON `{text, suggestions, activityIds}`. |
| `manifest.json`, `sw.js` | PWA shell; network-first for HTML + `activities.json`. |
| `images/`, `activity-images/` | Logos, PWA icons, and the 38 activity card images. |
| `scripts/sync-airtable.py` | Opt-in script to refresh image URLs and `created_by` from Airtable. **Never runs at server boot.** |
| `main.py`, `pyproject.toml`, `.replit` | Replit-friendly entry points. |

## Running locally

```bash
pip install flask
python server.py
# → http://localhost:5000
```

## How the chat talks to the library

1. User opens the chat panel and types a request.
2. Frontend POSTs `{ message, history, activityIds }` to `/api/claude`.
3. `server.py` forwards the request to the Apps Script web app.
4. `backend.gs` calls Claude with a system prompt that contains the 37-activity
   catalog, and asks for a single JSON object:
   ```json
   {
     "text": "…short reply…",
     "suggestions": ["Show 15-minute activities", "Focus on ethics"],
     "activityIds": ["activity-07", "activity-14"]
   }
   ```
5. The frontend parses the response, renders the text + suggestions in the
   chat, and *highlights the matching cards in the grid behind the chat*.

No regex "SUGGESTIONS:" prompt-injection trick, no fake typing delays, no
hidden onboarding state in `localStorage`. The only thing stored locally is
the user's saved list.

## Deploying `backend.gs`

1. Create a new Google Apps Script project, paste `backend.gs`.
2. Set `CLAUDE_API_KEY` (either edit the constant for local testing, or — better —
   put it in Script Properties and read from there).
3. Deploy as a Web App (executable as *you*, accessible by *anyone*).
4. Point `CLAUDE_BACKEND_URL` in `server.py` at the deployment URL.

## Syncing activity metadata from Airtable

```bash
AIRTABLE_PAT=patXXXX python3 scripts/sync-airtable.py --dry-run
AIRTABLE_PAT=patXXXX python3 scripts/sync-airtable.py
```

The script reads the `Name`, `Gallery Image`, and `Created By` fields from
Airtable and updates the matching `image` and `created_by` fields in
`activities.json`. Match key is `Name`. Commit the diff if you want the
change to stick.

The Created-By filter row in the UI is built dynamically from whatever
values are present in `activities.json` — hidden if all are blank, otherwise
one chip per distinct creator (alphabetical).

## Design notes

- Plain vanilla HTML/CSS/JS — no framework, no build step. Keep working code
  at every step.
- Brand colors preserved from the original: `#c7520a` orange, Bungee display
  font, Source Sans 3 body.
- PWA installable on iOS and Android; offline shell works, but chat doesn't.
- Accessibility: semantic header/nav/main/aside, `aria-pressed` on filter
  chips, `aria-label`s on icon-only buttons, visible focus rings, keyboard-
  operable.
