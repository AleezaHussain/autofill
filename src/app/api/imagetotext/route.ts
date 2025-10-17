import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded image from the form data
    const formData = await request.formData();
    const fileEntry = formData.get('topImage');

    if (!fileEntry) {
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    // Ensure the entry is a File/Blob before calling arrayBuffer()
    if (typeof fileEntry === 'string') {
      return NextResponse.json({ success: false, message: 'Invalid file uploaded' }, { status: 400 });
    }

    // Convert the File/Blob to a buffer
    const buffer = Buffer.from(await fileEntry.arrayBuffer());

    // Prepare the form data for the OCR.space API
    const ocrApiKey = process.env.OCR_SPACE_API_KEY;
    if (!ocrApiKey) {
      return NextResponse.json({ success: false, message: 'OCR API key not configured' }, { status: 500 });
    }

    const ocrFormData = new FormData();
    ocrFormData.append('file', new Blob([buffer]), 'image.jpg');
    ocrFormData.append('apikey', ocrApiKey); // Your OCR.space API key
    ocrFormData.append('language', 'eng'); // Language (English in this case)

    // Use fetch for OCR.space request (more reliable in Node/Edge runtime)
    let ocrText = '';
    try {
      const ocrResp = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: ocrFormData,
      });

      const ocrBody = await ocrResp.text();
      let ocrJson: unknown = null;
      try {
        ocrJson = JSON.parse(ocrBody);
      } catch {
        console.error('OCR.space returned non-JSON response', { status: ocrResp.status, body: ocrBody });
        return NextResponse.json({ success: false, message: 'OCR service returned non-JSON', raw: ocrBody }, { status: 502 });
      }

      const parsed = (ocrJson as { ParsedResults?: Array<{ ParsedText?: string }> } | null) ?? null;
      if (!ocrResp.ok || !parsed || !parsed.ParsedResults || !parsed.ParsedResults[0]) {
        console.error('OCR.space error', { status: ocrResp.status, body: ocrJson });
        return NextResponse.json({ success: false, message: 'OCR failed', raw: ocrJson }, { status: 502 });
      }

      ocrText = parsed.ParsedResults[0].ParsedText || '';
    } catch (ocrErr) {
      console.error('Failed to call OCR.space', ocrErr);
      return NextResponse.json({ success: false, message: 'OCR request failed', error: String(ocrErr) }, { status: 502 });
    }

    // Trigger the second API call to process and format the OCR text
  // Derive base URL from the incoming request so deployments don't need NEXT_PUBLIC_BASE_URL
  const origin = new URL(request.url).origin;
  const aiUrl = `${origin.replace(/\/$/, '')}/api/ai`;

    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: ocrText,
        prompt: `Please extract and map the following fields from the text below:

- transactionRole
- amount
- paymentTerms
- lcType
- isLcIssued
- issuingBank
- confirmingBanks
- productDescription
- importerName
- exporterName
- confirmationCharges
- lastDateForReceivingBids

Here is the OCR text:
"""
${ocrText}
"""
Provide the extracted data in a valid JSON format.`
      }),
    });

    // If AI endpoint failed, capture raw body for debugging
    if (!aiResponse.ok) {
      const raw = await aiResponse.text().catch(() => '<no-body>');
      console.error('AI route error', aiResponse.status, raw);
      return NextResponse.json({ success: false, message: 'AI processing failed', aiRaw: raw }, { status: 502 });
    }

  // Parse JSON safely
  let aiData: unknown;
    const contentType = aiResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        aiData = await aiResponse.json();
      } catch (parseErr) {
        const raw = await aiResponse.text().catch(() => '<no-body>');
        console.error('Failed to parse AI JSON response', parseErr, raw);
        return NextResponse.json({ success: false, message: 'Invalid AI JSON response', aiRaw: raw }, { status: 502 });
      }
    } else {
      // Not JSON (maybe HTML error page)
      const raw = await aiResponse.text().catch(() => '<no-body>');
      console.error('AI returned non-JSON response', raw);
      return NextResponse.json({ success: false, message: 'AI returned non-JSON response', aiRaw: raw }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      ocrText,
      aiData,
    });
  } catch (error) {
    console.error('OCR Error:', error);
    return NextResponse.json({ success: false, message: 'OCR processing failed' }, { status: 500 });
  }
}
