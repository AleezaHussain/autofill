// Assuming you are using tesseract.js for OCR
import Tesseract from 'tesseract.js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('topImage') as unknown as File | null;

    if (!file) {
      return NextResponse.json({ success: false, text: '', message: 'No file uploaded' }, { status: 400 });
    }

    // Process the image with OCR
    const ocrResult = await Tesseract.recognize(
      file,
      'eng',
      {
        logger: (m) => console.log(m),
      }
    );

    const ocrText = ocrResult?.data?.text || '';

    // Forward OCR text to AI endpoint on the server and return AI response
    try {
      // Prompt instructs the AI to return only valid JSON mapping OCR to form fields
      const mappingPrompt = `You will receive raw OCR text from an uploaded document. Extract and map values into a JSON object matching the following keys exactly:
transactionRole, amount, paymentTerms, lcType, isLcIssued, issuingBank, confirmingBanks, productDescription, importerName, exporterName, confirmationCharges, lastDateForReceivingBids

Rules:
- Return ONLY a single valid JSON object (no markdown, no commentary).
- For any field you can't find, return an empty string value.
- Normalize obvious numeric amounts to plain numbers or strings (it's okay to return strings).

Here is the OCR text:
"""
${ocrText}
"""

Return the JSON now.`;

      const aiRes = await fetch(new URL('/api/ai', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: ocrText, prompt: mappingPrompt }),
      });

      const aiData = await aiRes.json();

      // aiData is expected to contain generatedText with the JSON string
      return NextResponse.json({ success: true, ocrText, ai: aiData, filename: (file as any).name || 'uploaded' });
    } catch (aiErr) {
      console.error('AI forward failed', aiErr);
      return NextResponse.json({ success: true, ocrText, ai: null, filename: (file as any).name || 'uploaded', aiError: String(aiErr) });
    }
  } catch (err) {
    return NextResponse.json({ success: false, text: '', message: String(err) }, { status: 500 });
  }
}
