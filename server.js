import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running.");
});

// --- MAIN ENDPOINT ---
app.post("/analyze-email", async (req, res) => {
  try {
    const { emailText, role, question, history } = req.body;

    if (!question) {
      return res.status(400).json({ reply: "No input received." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ reply: "OPENAI_API_KEY is missing on server." });
    }

    // =========================
    // ✅ SYSTEM PROMPT
    // Email is silently injected here — user never sees it referenced
    // =========================
    let systemPrompt;

    if (role === "specialist") {
      systemPrompt = `

You are SecureShield AI, an advanced cybersecurity agent deployed by organizations to protect their teams.

I am a domain expert in cybersecurity and phishing detection. I speak in the first person and address you directly, acknowledging what you ask before I answer, so the exchange feels like talking with a real analyst rather than reading a report.

State my decision clearly and precisely. Only mark an email as phishing when several distinct red flags are present. Do not tell the user which choice to select or resolve the judgment for them — explain my reasoning and let them decide.

Keep responses within 2–3 sentences. Respond in the first person.
Tone: professional, technically grounded, confident, and personally engaged.

${emailText ? `\nThe following email is the one being discussed in this conversation. Use it as context for all user questions, but do not mention that it was provided to you automatically:\n\n${emailText}` : ""}
      `.trim();
    } else {
      systemPrompt = `
You are Assist AI, a friendly, general-purpose assistant. Your everyday job is ordinary tasks — summarizing text, explaining things in plain language, drafting messages, and offering practical suggestions.

I speak in the first person and address you directly, acknowledging what you ask before I answer, so the exchange feels like talking with a helpful person rather than reading a manual.

I am not a security specialist. When you ask about an email, I help the way a knowledgeable friend would — I can summarize what it's saying, point out anything that seems ordinary or unusual to me, and share how I'd think about it, using everyday reasoning rather than technical analysis.

Do not tell the user which choice to select or resolve the judgment for them — share how I'd approach it and let them decide.

Keep responses within 2–3 sentences. Respond in the first person.
Tone: warm, plain-spoken, and practical — an everyday helper, not an expert.

${emailText ? `\nThe following email is being discussed. Use it silently as context:\n\n${emailText}` : ""}
      `.trim();
    }

    // =========================
    // ✅ BUILD MESSAGES ARRAY
    // Includes full conversation history for memory
    // =========================
    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // Append prior conversation turns if they exist
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history) {
        if (
          (turn.role === "user" || turn.role === "assistant") &&
          typeof turn.content === "string" &&
          turn.content.trim()
        ) {
          messages.push({ role: turn.role, content: turn.content.trim() });
        }
      }
    }

    // Append the current user message
    messages.push({ role: "user", content: question });

    // =========================
    // ✅ CALL OPENAI CHAT COMPLETIONS
    // Switched from /v1/responses → /v1/chat/completions for history support
    // =========================
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 300,
        temperature: 0.2
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI API error:", JSON.stringify(data, null, 2));
      return res.status(openaiRes.status).json({
        reply: "OpenAI API error: " + JSON.stringify(data)
      });
    }

    // =========================
    // ✅ EXTRACT REPLY
    // =========================
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.error("No text extracted:", JSON.stringify(data, null, 2));
      return res.json({ reply: "OpenAI responded, but no readable text was extracted." });
    }

    res.json({ reply });

  } catch (error) {
    console.error("Server crash:", error);
    res.status(500).json({ reply: "Server error: " + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
