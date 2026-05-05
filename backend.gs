// AI Tinkery Library — Claude backend (Google Apps Script).
// Deploy as a Web App. The Flask server proxies POST /api/claude to this URL.
//
// Contract with the frontend:
//   Request:  { message: string, history: [{role, content}, ...], activityIds?: [string, ...] }
//   Response: {
//     success: true,
//     response: {
//       text: string,
//       suggestions: string[],   // 0 or 2-3 items, short action statements, no questions
//       activityIds: string[]    // zero or more "activity-01"…"activity-37"
//     }
//   }
//
// Never commit a real API key. Set CLAUDE_API_KEY in script properties or paste
// here only for local testing. Production should use PropertiesService.

const CLAUDE_API_KEY = 'YOUR_CLAUDE_API_KEY_HERE';
const CLAUDE_MODEL   = 'claude-3-5-sonnet-20241022';

// Compact activity catalog so Claude can recommend by ID without guessing.
// Keep in sync with activities.json. One line per activity:
//   id: name | category | time | audience | short description
const ACTIVITY_CATALOG = `
activity-01: Build-a-Bot | Use AI | 45 minutes | Teacher | Create a custom chatbot using bot101.app
activity-02: I Love Algorithms Card Game | Understand AI | 45 minutes | Student | Machine-learning card game, no code or screens
activity-03: Learning Math with AI | Learn/Teach With AI | 20 minutes | Student | Learn math with the help of an LLM
activity-04: Creativity in the Age of AI | Understand AI | 1 hour | Teacher+Student | Read and discuss three d.school articles on AI and creativity
activity-05: Design How AI Fits Your Workflow | Evaluate AI | 45 minutes | Teacher | Five-stage workflow design: where does AI actually add value
activity-06: Gradiants | Learn/Teach With AI | 30 minutes | Teacher | Map what aspects of work should/can use AI
activity-07: Teachable Machine: Pose Model | Shape AI | 30 minutes | Student | Train your own pose-recognition AI model; see how ML works
activity-08: Text to Virtual Reality | Use AI | 30 minutes | Student | Use skybox.blockadelabs.com to generate 360° worlds from text
activity-09: Prompting Without a Keyboard | Use AI | 30 minutes | Student | Voice-based prompting; think-out-loud with an LLM
activity-10: AI Game Creator | Use AI | 30 minutes | Student | Build playable educational games from plain-language descriptions
activity-11: AI or Not? (Virtual) | Understand AI | 15 minutes | Teacher+Student | Sort cards into AI or not; generalize a rule
activity-12: Prompting Lab | Use AI | 30 minutes | Teacher+Student | Experiment with structured, conversational, meta prompting
activity-13: Text to 3D Objects | Use AI | 30 minutes | Student | Use meshy.ai to generate 3D models from text
activity-14: Keep Your Data Private | Evaluate AI | 30 minutes | Teacher | Host a chatbot locally and offline with Chatbox
activity-15: More than GenAI | Understand AI | 1 hour | Teacher+Student | Sort AIs into groups; build your own classifier
activity-16: AI + Storytelling | Learn/Teach With AI | 45 minutes | Student | Use AI in storytelling; weigh the trade-offs
activity-17: LLM Learning Modes | Learn/Teach With AI | 30 minutes | Teacher | Compare normal vs learning mode across LLMs
activity-18: The Bookshelf — Critical AI Literacy Library | Learn/Teach With AI | self-paced | Teacher | Curated book collection on AI and society
activity-19: AI Music Generator | Use AI | 30 minutes | Student | Generate music with Suno.com; reflect on originality
activity-20: Instructional Materials GenAI | Learn/Teach With AI | 45 minutes | Teacher | Use GenAI to create instructional materials for a learning objective
activity-21: Quickdraw | Understand AI | 30 minutes | Student | Doodle game where a neural net guesses; how ML recognizes patterns
activity-22: Working Groups Facilitator Guide | Use AI | self-paced | Teacher | Facilitation guide for multi-session working groups
activity-23: AI + Education Resource Repository | Understand AI | self-paced | Teacher | Curated research and frameworks on AI in education
activity-24: Curiosity Boards — Resource Guide | Learn/Teach With AI | self-paced | Teacher | Visual interactive installations for AI exploration
activity-25: Create and Edit Images | Use AI | 30 minutes | Student | Use canva.com AI features (text-to-image, magic resize)
activity-26: Prompting Environmental Impact | Evaluate AI | 30 minutes | Student | Revise prompts for environmental efficiency without losing quality
activity-27: Deep Research | Use AI | 15 minutes | Teacher+Student | Use the Deep Research functionality in ChatGPT
activity-28: Brainstorming AI Use Cases | Learn/Teach With AI | 15 minutes | Teacher+Student | Brainstorm AI use cases by role; risk vs reward map
activity-29: AI Quests | Learn/Teach With AI | 45 minutes | Student | Game-based AI learning for middle schoolers (ages 11–14)
activity-30: Vibe Code a Website | Use AI | 30 minutes | Teacher | Step-by-step guide to deploy a vibe-coded tool
activity-31: Feedback & Assessments with AI | Learn/Teach With AI | 30 minutes | Teacher | Set up ChatGPT to provide feedback on student work
activity-32: Literature Review Strategy with GenAI | Use AI | 15 minutes | Student | Use AI to assist the literature review process
activity-33: Evaluating GenAI Images | Evaluate AI | 1 hour | Teacher+Student | Create AI images; evaluate for stereotypes and bias
activity-34: Meta-prompting | Use AI | 30 minutes | Student | Use a chatbot to design, refine, and optimize prompts
activity-35: DIY Agent with Zapier Agents | Shape AI | 30 minutes | Student | Design an agent that handles birthdays for a teacher
activity-36: Fact checking AI | Evaluate AI | 1 hour | Student | Lateral reading as a way to fact-check AI output
activity-37: Ethical AI use | Evaluate AI | 1 hour | Student | Ethical considerations: bias, fairness, privacy, responsible deployment
`.trim();

const SYSTEM_CONTEXT = `You are the guide for the Stanford AI Tinkery **Activity Library** — a browsable, filterable collection of 37 hands-on AI activities for teachers and students.

**Your job:** help the user find activities that actually fit their situation. You are *not* the primary UI; the cards in the library behind you are. Be concise, warm, and decisive.

**AI Tinkery's four guiding principles** (for context, don't lecture about them):
1. Collaborative — learning through community dialogue
2. Human-centered — multiple perspectives matter
3. Applied — try, test, and learn by doing
4. Thoughtful — AI is a system to be questioned and shaped

**Categories used by the library:**
Understand AI · Use AI · Learn/Teach With AI · Shape AI · Evaluate AI

**Activities you can recommend (use the id, e.g. "activity-07"):**
${ACTIVITY_CATALOG}

**Output contract — IMPORTANT:**
Always respond with a single JSON object in a fenced code block, and nothing else:

\`\`\`json
{
  "text": "your short reply, 2-4 sentences, plain prose, no markdown headings",
  "suggestions": ["Show beginner activities", "Focus on ethics"],
  "activityIds": ["activity-07", "activity-14"]
}
\`\`\`

Rules for the fields:
- \`text\`: 40–120 words. Warm but direct. When recommending, name 1–3 activities and say why each fits. Don't list IDs in the text.
- \`suggestions\`: 0 or 2–3 items. Each is a short first-person *action statement* under 8 words. No question marks. No generic fallbacks. If you don't have 2 genuinely useful next steps, return \`[]\`.
- \`activityIds\`: 0–6 ids from the catalog above. Only include ids the user would actually benefit from given what they've told you. Never invent ids.

If the user hasn't told you enough to recommend, ask one focused question in \`text\` and return \`[]\` for both arrays.`;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const userMessage = String(body.message || '').trim();
    const history     = Array.isArray(body.history) ? body.history : [];

    const rawReply = callClaudeAPI(userMessage, history);
    const parsed   = parseReply(rawReply);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, response: parsed }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function callClaudeAPI(userMessage, history) {
  // Keep only the last 10 turns to cap token usage.
  const recent = history.slice(-10);
  const messages = recent
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map(m => ({ role: m.role, content: String(m.content) }));

  messages.push({ role: 'user', content: userMessage });

  const payload = {
    model:      CLAUDE_MODEL,
    max_tokens: 800,
    system:     SYSTEM_CONTEXT,
    messages:   messages
  };

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key':         CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());
  if (code !== 200) {
    throw new Error('Claude API error ' + code + ': ' + JSON.stringify(body));
  }
  return body.content[0].text;
}

// Extract the JSON object from Claude's reply. Claude is instructed to wrap
// it in a ```json fence; we tolerate a bare object as a fallback.
function parseReply(raw) {
  const fallback = { text: String(raw || '').trim(), suggestions: [], activityIds: [] };
  if (!raw) return fallback;

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/);
  let candidate = fenced ? fenced[1] : null;

  if (!candidate) {
    // Find the first {...} JSON object in the reply.
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start >= 0 && end > start) candidate = raw.slice(start, end + 1);
  }

  if (!candidate) return fallback;

  try {
    const obj = JSON.parse(candidate);
    const text = typeof obj.text === 'string' ? obj.text.trim() : '';
    const suggestions = Array.isArray(obj.suggestions)
      ? obj.suggestions
          .map(s => String(s || '').trim())
          .filter(s => s && s.indexOf('?') === -1 && s.split(/\s+/).length <= 8)
          .slice(0, 3)
      : [];
    const activityIds = Array.isArray(obj.activityIds)
      ? obj.activityIds
          .map(x => String(x || '').trim())
          .filter(x => /^activity-\d{2}$/.test(x))
          .slice(0, 6)
      : [];
    return {
      text: text || fallback.text,
      suggestions: suggestions.length >= 2 ? suggestions : [],
      activityIds: activityIds
    };
  } catch (_) {
    return fallback;
  }
}

function testBackend() {
  const resp = callClaudeAPI("I'm a teacher. What's a 30-minute activity about AI bias for 8th graders?", []);
  Logger.log(resp);
  Logger.log(JSON.stringify(parseReply(resp), null, 2));
}
