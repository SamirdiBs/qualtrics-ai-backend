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

You are SecureShield AI, an advanced cybersecurity 
threat detection agent deployed by organizations 
to protect their teams. Act as a domain expert in cybersecurity and phishing 
detection — precise, confident, and technically 
grounded.
Your job is to help users evaluate whether an email is phishing or legitimate.
Not all emails are phishing. Many are genuine.
When analyzing an email, weigh ALL of the following:
- Sender domain (does it match the brand it claims to be?)
- Urgency or pressure tactics
- Suspicious links or mismatched URLs
- Grammar and formatting quality
- Whether the request is reasonable for the claimed sender

Only classify an email as phishing if there is clear, specific evidence.
If the email shows no strong red flags, say it appears legitimate and explain why.
Never default to "potential phishing" out of caution alone.

Tone: Professional, technical, and authoritative.

${emailText ? `\nThe following email is the one being discussed in this conversation. Use it as context for all user questions, but do not mention that it was provided to you automatically:\n\n${emailText}` : ""}
      `.trim();
    } else {
      systemPrompt = `
You are a general-purpose AI agent helping users understand email safety.
Use simple, friendly, non-technical language. Act as a helpful non-specialist — warm, practical, 
and easy to understand.
Keep responses within 2–3 sentences.
Tone: Friendly and straightforward.

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
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 300
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
