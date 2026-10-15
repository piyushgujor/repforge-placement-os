# PrepForge 2.0 — Placement Preparation Workspace

A React + Vite frontend and Express backend for a personal DSA and placement-preparation workspace. The UI is original and inspired by the general workflow of coding-preparation platforms; it does not copy TakeUForward branding or proprietary editorial content.

## Features
- **500-entry DSA practice index** across 25 topic groups: programming basics, complexity, sorting, arrays, hashing, strings, binary search, sliding window, linked lists, stacks/queues, trees/BST, heaps, greedy, backtracking, graphs, DP, bit manipulation, tries, math, and intervals.
- Search and filter by topic/difficulty; select LeetCode, GeeksforGeeks, TakeUForward, Codeforces, or CodeChef as the destination platform.
- Track solved questions and bookmarks in browser `localStorage`.
- Quiz builder: DSA, OOP, OS, DBMS, CN, mixed Core CS, aptitude, Java, and web development; choose difficulty, topic focus, question count (1–100), timer, and local bank / Gemini / OpenAI provider.
- Timed quizzes, answer review, explanations, score, and retry.
- Curated free resource links including official Striver sheets and public OOP / OS MCQ practice pages.
- Roadmap, daily plan, interview checklist, responsive dark UI.
- GitHub-style 13-week activity heatmap, 30-day calendar, current streak, test history, and celebration overlay when a problem is marked solved.
- Test Center: each DSA/core/aptitude topic offers five minor-test slots and five major-test slots, with attempt counts and score history.
- AI mock interview: choose target role, experience level, 10/15/20/30-minute session, generate role-specific questions through OpenAI or Gemini, capture answers, and request structured feedback. A built-in demo interview works without an API key.
- Every problem row includes a topic/title-specific YouTube search for Striver lectures.
- AI generation through a server-side API route; provider API keys remain on the backend.

## Run locally
Requires a current Node.js LTS version.

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Vite prints the frontend URL (usually `http://localhost:5173`); the API runs on port 8787.

## Configure AI-generated quizzes
1. Copy `.env.example` to `.env`.
2. Add either `GEMINI_API_KEY` or `OPENAI_API_KEY`.
3. Restart `npm run dev` and choose Gemini or OpenAI in Quiz Builder.
4. Never commit `.env`, place keys in frontend code, or share them in screenshots.

AI quiz generation, personalized task planning, and AI interview feedback may use paid quota depending on provider/account. The built-in MCQ bank and demo interview work without an API key. A standard ChatGPT subscription does not automatically include API credits; configure an OpenAI API key separately if you choose OpenAI. The backend returns a clear setup error if a selected provider is not configured.

## Build for production

```bash
npm run build
npm start
```

The Express server serves the built `dist` directory and `/api` endpoints.

## Accuracy and scope notes
- The 500-entry index is a curated high-yield practice catalogue. It is **not claimed to be an exact copy of every row** in Striver's A2Z, SDE, Blind 75, or 79 Last Moment sheets. Some titles use platform search links because direct problem slugs vary or may change; confirm the exact title on the destination platform.
- The official sheet links are provided in the Resource Library so you can follow the canonical syllabus. Current TUF access and free/premium policies may change; third-party websites control their own content and availability.
- The built-in MCQ bank currently has 199 questions. For larger/custom quizzes, select Gemini or OpenAI and configure an API key. Provider-generated content should be reviewed like any AI output.
- This is a local-first MVP: progress is stored in this browser, not a user account or cloud database. It can help structure preparation but cannot guarantee placement or a specific salary. There is no authentication, shared leaderboard, code execution judge, voice transcription, or server-side solution verification yet. The activity calendar and history are stored in localStorage on this device.
- Problem destination links open the chosen platform's search/practice area. PrepForge does not assert that an external platform accepted a solution.
- PrepForge is not affiliated with TakeUForward, LeetCode, GeeksforGeeks, Codeforces, or CodeChef.
