import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// --- Health check ---
app.get("/", (req, res) => {
  res.send("Backend is running.");
});

// --- Extract response safely ---
function extractResponseText(data) {
  if (
    data.output_text &&
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const texts = [];

    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (
            (contentItem.type === "output_text" ||
              contentItem.type === "text") &&
            contentItem.text
          ) {
            texts.push(contentItem.text);
          }
        }
      }
    }

    if (texts.length > 0) {
      return texts.join("\n").trim();
    }
  }

  return null;
}

// --- MAIN ENDPOINT ---
app.post("/analyze-email", async (req, res) => {
  try {
    const { emailText, role, question } = req.body;

    // ✅ FIX 1: ALLOW CHAT WITHOUT EMAIL
    if (!emailText && !question) {
      return res.status(400).json({ reply: "No input received." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ reply: "OPENAI_API_KEY is missing on server." });
    }

    // =========================
    // ✅ ROLE-BASED PROMPT (ONLY TONE DIFFERENCE)
    // =========================
    let systemPrompt;

    if (role === "specialist") {
      systemPrompt = `
You are SecureShield AI, a cybersecurity expert. Your response should reflect your expertise in cybersecurity and threat detaction. Provide confident, precise and technical analysis.

If an email is provided, determine whether it is phishing or legitimate and briefly explain why using observable cues (e.g., sender, link, tone, request).
If no email is provided, answer the user's question normally. 

Use a confident and professional tone. Use technical terms.  Keep your response strictly within 2 to 3 sentences.
`;
    } else {
      systemPrompt = `
You are an general purpose AI assistant.

Keep your response strictly within 2 to 3 sentences.

If an email is provided, explain whether it might be suspicious in simple terms.

If no email is provided, answer the user's question normally in a clear and friendly way.

Use a neutral tone. No technical terms. Be casual. 
`;
    }

    // =========================
    // ✅ USER INPUT (CONDITIONAL EMAIL)
    // =========================
    const userPrompt = `
User Question:
${question || ""}

${emailText ? "Email:\n" + emailText : ""}
`;

    // --- CALL OPENAI ---
    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: systemPrompt + "\n\n" + userPrompt
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI API error:", JSON.stringify(data, null, 2));
      return res.status(openaiRes.status).json({
        reply: "OpenAI API error: " + JSON.stringify(data)
      });
    }

    // --- EXTRACT TEXT ---
    const reply = extractResponseText(data);

    if (!reply) {
      console.error("No text extracted:", JSON.stringify(data, null, 2));
      return res.json({
        reply: "OpenAI responded, but no readable text was extracted."
      });
    }

    // --- RETURN ---
    res.json({ reply });

  } catch (error) {
    console.error("Server crash:", error);
    res.status(500).json({
      reply: "Server error: " + error.message
    });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
