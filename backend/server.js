import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8787;

const allowedSubjects = new Set([
  'DSA',
  'OOP',
  'OS',
  'DBMS',
  'CN',
  'Mixed Core CS',
  'Aptitude',
  'Java',
  'Web Development'
]);

const allowedDifficulties = new Set([
  'Easy',
  'Medium',
  'Hard',
  'Mixed'
]);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'PrepForge AI Quiz API',
    provider: process.env.AI_PROVIDER || 'gemini',
    configured: Boolean(
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY
    )
  });
});

// Parse JSON returned by an AI provider
function parseJsonText(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error(
      'AI response was not valid JSON. Please retry.'
    );
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

// Validate and normalize generated MCQs
function normalize(payload, count, subject, difficulty) {
  if (!Array.isArray(payload.questions)) {
    throw new Error(
      'AI response did not contain a questions array.'
    );
  }

  return payload.questions
    .slice(0, count)
    .map((q, i) => {
      const options = Array.isArray(q.options)
        ? q.options.slice(0, 4).map(String)
        : [];

      const answerIndex = Number(q.answerIndex);

      if (
        options.length !== 4 ||
        options.some(x => !x) ||
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex > 3
      ) {
        return null;
      }

      return {
        id: `ai-${Date.now()}-${i}`,
        question: String(q.question || '').slice(0, 500),
        options,
        answerIndex,
        explanation: String(q.explanation || '').slice(0, 1200),
        subject: q.subject || subject,
        difficulty: q.difficulty || difficulty,
        source: 'AI-generated'
      };
    })
    .filter(q => q && q.question);
}

// Generate an AI quiz
app.post('/api/quiz/generate', async (req, res) => {
  try {
    const count = Math.max(
      1,
      Math.min(100, parseInt(req.body.count, 10) || 10)
    );

    const subject = allowedSubjects.has(req.body.subject)
      ? req.body.subject
      : 'Mixed Core CS';

    const difficulty = allowedDifficulties.has(
      req.body.difficulty
    )
      ? req.body.difficulty
      : 'Mixed';

    const topics = String(req.body.topics || '').slice(0, 400);

    const provider = ['openai', 'gemini'].includes(
      req.body.provider
    )
      ? req.body.provider
      : process.env.AI_PROVIDER || 'gemini';

    const prompt = `Create exactly ${count} original multiple-choice questions for software placement preparation. Subject: ${subject}. Difficulty: ${difficulty}. Focus/topics: ${topics || 'high-yield interview fundamentals'}. Avoid duplicates, ambiguous wording, and trick questions. Ensure one correct answer per question. For coding/DSA use algorithmic reasoning, complexity, data structures and edge cases. For OOP/OS/DBMS/CN use standard undergraduate interview concepts. Do not claim these are copied from any proprietary question bank. Return ONLY JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"explanation":"...","subject":"${subject}","difficulty":"${difficulty}"}]}. answerIndex is zero-based.`;

    let text = '';

    if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({
          error:
            'OpenAI key is not configured. Add OPENAI_API_KEY to .env or choose the local bank.'
        });
      }

      const r = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are a careful computer-science assessment author. Output valid JSON only.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7
          })
        }
      );

      const data = await r.json();

      if (!r.ok) {
        throw new Error(
          data.error?.message ||
          `OpenAI request failed (${r.status})`
        );
      }

      text = data.choices?.[0]?.message?.content || '';
    } else {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({
          error:
            'Gemini key is not configured. Add GEMINI_API_KEY to .env or choose the local bank.'
        });
      }

      const model =
        process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7
            }
          })
        }
      );

      const data = await r.json();

      if (!r.ok) {
        throw new Error(
          data.error?.message ||
          `Gemini request failed (${r.status})`
        );
      }

      text =
        data.candidates?.[0]?.content?.parts
          ?.map(p => p.text || '')
          .join('') || '';
    }

    const questions = normalize(
      parseJsonText(text),
      count,
      subject,
      difficulty
    );

    if (!questions.length) {
      throw new Error(
        'No valid questions returned. Retry with a smaller count.'
      );
    }

    res.json({
      provider,
      questions,
      requested: count,
      generated: questions.length
    });
  } catch (e) {
    res.status(502).json({
      error: e.message || 'Quiz generation failed.'
    });
  }
});

// Shared OpenAI / Gemini request handler
async function callAI(provider, prompt, temperature = 0.6) {
  let text = '';

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OpenAI key is not configured. Add OPENAI_API_KEY to .env.'
      );
    }

    const r = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a rigorous but supportive software engineering interview coach. Return valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error(
        d.error?.message || `OpenAI request failed (${r.status})`
      );
    }

    text = d.choices?.[0]?.message?.content || '';
  } else {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        'Gemini key is not configured. Add GEMINI_API_KEY to .env.'
      );
    }

    const model =
      process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature
          }
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error(
        d.error?.message || `Gemini request failed (${r.status})`
      );
    }

    text =
      d.candidates?.[0]?.content?.parts
        ?.map(p => p.text || '')
        .join('') || '';
  }

  return parseJsonText(text);
}

// Generate a personalized daily plan
app.post('/api/plan/generate', async (req, res) => {
  try {
    const provider = ['openai', 'gemini'].includes(
      req.body.provider
    )
      ? req.body.provider
      : 'gemini';

    const solvedCount = Math.max(
      0,
      Math.min(500, Number(req.body.solvedCount) || 0)
    );

    const savedCount = Math.max(
      0,
      Math.min(500, Number(req.body.savedCount) || 0)
    );

    const streak = Math.max(
      0,
      Math.min(10000, Number(req.body.streak) || 0)
    );

    const minutesAvailable = Math.max(
      30,
      Math.min(240, Number(req.body.minutesAvailable) || 90)
    );

    const weakTopics = Array.isArray(req.body.weakTopics)
      ? req.body.weakTopics.slice(0, 5).map(String)
      : [];

    const prompt = `Create a practical daily placement-preparation plan for a CSE student. Available study time: ${minutesAvailable} minutes. DSA links solved: ${solvedCount}/500. Saved revision items: ${savedCount}. Current streak: ${streak} days. Recent weak topics from low scores: ${weakTopics.join(', ') || 'not enough test history yet'}. Balance coding practice, reviewing mistakes, one core CS subject (OOP/OS/DBMS/CN), and aptitude when useful. Keep tasks actionable and total task minutes at or below ${minutesAvailable}. Return JSON only: {"focus":"short focus title","reason":"why this plan fits the progress","tip":"one practical study method","tasks":[{"title":"specific task","minutes":20}]}. Return 4-6 tasks, no generic motivational filler.`;

    const data = await callAI(provider, prompt, 0.4);

    const tasks = Array.isArray(data.tasks)
      ? data.tasks.slice(0, 8).map(t => ({
          title: String(t.title || 'Practice session').slice(0, 160),
          minutes: Math.max(
            5,
            Math.min(90, Number(t.minutes) || 20)
          )
        }))
      : [];

    if (!tasks.length) {
      throw new Error(
        'AI did not return a usable task list. Retry.'
      );
    }

    res.json({
      focus: String(data.focus || 'Focused placement practice'),
      reason: String(data.reason || ''),
      tip: String(data.tip || ''),
      tasks,
      provider
    });
  } catch (e) {
    res.status(502).json({
      error: e.message || 'AI plan generation failed.'
    });
  }
});

// Generate interview questions
app.post('/api/interview/generate', async (req, res) => {
  try {
    const provider = ['openai', 'gemini'].includes(
      req.body.provider
    )
      ? req.body.provider
      : 'gemini';

    const role = String(
      req.body.role || 'Software engineer intern'
    ).slice(0, 100);

    const level = String(
      req.body.level || 'Internship'
    ).slice(0, 50);

    const minutes = Math.max(
      10,
      Math.min(30, Number(req.body.minutes) || 10)
    );

    const count = Math.max(
      4,
      Math.min(
        15,
        Number(req.body.count) || Math.round(minutes / 2)
      )
    );

    const prompt = `Create exactly ${count} original interview questions for a ${role} interview at ${level} level, designed for a ${minutes}-minute practice session. Mix technical knowledge, problem solving, project discussion, trade-offs, and behavioral communication as relevant to the role. Questions should be specific, realistic, non-duplicative, and suitable for a student/fresher. Return JSON only: {"questions":[{"question":"...","type":"DSA|Technical|Project|Behavioral|System Design"}]}.`;

    const data = await callAI(provider, prompt, 0.7);

    const questions = (data.questions || [])
      .filter(q => q && typeof q.question === 'string')
      .slice(0, count)
      .map(q => ({
        question: q.question.slice(0, 800),
        type: String(q.type || 'Technical').slice(0, 40)
      }));

    if (!questions.length) {
      throw new Error(
        'No valid interview questions returned. Retry.'
      );
    }

    res.json({
      provider,
      role,
      level,
      minutes,
      questions
    });
  } catch (e) {
    res.status(502).json({
      error: e.message || 'Interview generation failed.'
    });
  }
});

// Evaluate interview answers
app.post('/api/interview/evaluate', async (req, res) => {
  try {
    const provider = ['openai', 'gemini'].includes(
      req.body.provider
    )
      ? req.body.provider
      : 'gemini';

    const role = String(
      req.body.role || 'Software engineer intern'
    ).slice(0, 100);

    const level = String(
      req.body.level || 'Internship'
    ).slice(0, 50);

    const answers = Array.isArray(req.body.answers)
      ? req.body.answers.slice(0, 20).map(a => ({
          question: String(a.question || '').slice(0, 800),
          answer: String(a.answer || '').slice(0, 4000),
          type: String(a.type || 'Technical').slice(0, 40)
        }))
      : [];

    if (!answers.length) {
      return res.status(400).json({
        error: 'Submit at least one answer to evaluate.'
      });
    }

    const prompt = `Evaluate this practice interview for a ${role} candidate at ${level} level. Be constructive, specific, and fair to a student/fresher. Do not invent facts. Score each answer 0-10 for correctness, clarity, reasoning, and completeness. Overall score must be 0-100. Return JSON only: {"overallScore":0,"summary":"...","strengths":["..."],"improvements":["..."],"answerFeedback":[{"question":"...","feedback":"...","score":0,"modelAnswerOutline":"..."}]}. Answers: ${JSON.stringify(answers)}`;

    const data = await callAI(provider, prompt, 0.3);

    const score = Math.max(
      0,
      Math.min(100, Number(data.overallScore) || 0)
    );

    res.json({
      overallScore: score,
      summary: String(data.summary || ''),
      strengths: Array.isArray(data.strengths)
        ? data.strengths.slice(0, 8)
        : [],
      improvements: Array.isArray(data.improvements)
        ? data.improvements.slice(0, 8)
        : [],
      answerFeedback: Array.isArray(data.answerFeedback)
        ? data.answerFeedback.slice(0, 20).map(a => ({
            question: String(a.question || ''),
            feedback: String(a.feedback || ''),
            score: Math.max(
              0,
              Math.min(10, Number(a.score) || 0)
            ),
            modelAnswerOutline: String(
              a.modelAnswerOutline || ''
            )
          }))
        : []
    });
  } catch (e) {
    res.status(502).json({
      error: e.message || 'Interview evaluation failed.'
    });
  }
});

// Serve the built React frontend
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../dist');

app.use(express.static(dist));

// FIX: Express 5 requires a named wildcard.
// This matches both "/" and other frontend routes.
app.get('/{*path}', (req, res) => {
  res.sendFile(
    path.join(dist, 'index.html'),
    err => {
      if (err) {
        res
          .status(404)
          .send(
            'Frontend is not built. Run npm run dev or npm run build first.'
          );
      }
    }
  );
});

app.listen(PORT, () => {
  console.log(`PrepForge API running at http://localhost:${PORT}`);
});