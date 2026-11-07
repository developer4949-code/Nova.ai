import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const aiClient = apiKey ? new GoogleGenAI({ apiKey }) : null;

