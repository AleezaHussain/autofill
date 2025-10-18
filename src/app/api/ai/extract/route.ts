import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const { imageBase64, prompt, debug } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ success: false, message: 'Missing imageBase64' }, { status: 400 });
    }

    // Short system instruction: extract text only
    const systemMessage = `You are an assistant whose only job is to extract the full text contents from the provided image. Return ONLY the extracted text (no JSON, no commentary). If you can't extract text, return an empty string.`;

    const userContent = `${prompt ?? 'Extract text from the image.'}\n\nIMAGE_BASE64:\n${imageBase64}\n\nReturn only the extracted text.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
    });

    const assistant = response.choices?.[0]?.message?.content || '';

    // Try to extract text blocks heuristically (strip JSON etc.)
    let extractedText = assistant.trim();

    // If assistant returned fenced code, extract inner content
    const codeMatch = extractedText.match(/```(?:\w*\n)?([\s\S]*?)```/);
    if (codeMatch && codeMatch[1]) extractedText = codeMatch[1].trim();

    console.log('AI-extract assistant reply (truncated):', extractedText.slice(0, 2000));

    const payload: Record<string, unknown> = { success: true, extractedText };
    if (debug) payload.rawAssistant = assistant;

    return NextResponse.json(payload);
  } catch (err) {
    console.error('Error in /api/ai/extract', err);
    return NextResponse.json({ success: false, message: 'Extraction error', error: String(err) }, { status: 500 });
  }
}
