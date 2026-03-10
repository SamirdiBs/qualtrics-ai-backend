import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running.");
});

app.post("/analyze-email", async (req, res) => {
  try {
    const { emailText } = req.body;

    if (!emailText) {
      return res.status(400).json({ reply: "No email text received." });
    }

    res.json({ reply: "Test response from backend." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Server error." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});