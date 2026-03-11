import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running.");
});

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

app.post("/analyze-email", async (req, res) => {
  try {
    const { emailText, role } = req.body;
let systemPrompt;

if(role === "specialist"){

systemPrompt = `
You are SecureMail AI, a cybersecurity expert specializing in phishing detection.

Analyze the email and determine whether it is legitimate or phishing.
Focus on indicators such as:
• suspicious sender domain
• reward or prize scams
• urgency language
• mismatched links

Provide a confident technical explanation.
`;

}

else{

systemPrompt = `
You are AssistAI, a helpful general AI assistant.

Help the user understand whether the email might be suspicious.
Explain in simple language without technical cybersecurity terminology.
`;

}
    if (!emailText) {
      return res.status(400).json({ reply: "No email text received." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ reply: "OPENAI_API_KEY is missing on Render." });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: systemPrompt + "\n\nEmail:\n" + emailText
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI API error:", JSON.stringify(data, null, 2));
      return res.status(openaiRes.status).json({
        reply: "OpenAI API error: " + JSON.stringify(data)
      });
    }

    const reply = extractResponseText(data);

    if (!reply) {
      console.error(
        "No text extracted from OpenAI response:",
        JSON.stringify(data, null, 2)
      );
      return res.json({
        reply: "OpenAI responded, but no readable text was extracted."
      });
    }

    res.json({ reply });
  } catch (error) {
    console.error("Server crash:", error);
    res.status(500).json({ reply: "Server crash: " + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
