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

    // Make the request to OCR.space API using fetch (works better with Fetch/FormData on Node/Next.js)
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: ocrFormData,
    });

    let ocrJson: unknown = null;
    try {
      ocrJson = await ocrResponse.json();
    } catch {
      const raw = await ocrResponse.text().catch(() => '<no-body>');
      console.error('Failed to parse OCR.space response as JSON', raw);
      return NextResponse.json({ success: false, message: 'Invalid OCR response', ocrRaw: raw }, { status: 502 });
    }

    // Log a truncated version of OCR.space response for debugging
    try {
      console.log('OCR.space response (truncated):', JSON.stringify(ocrJson).slice(0, 2000));
    } catch {
      // ignore
    }

    // Collect debugable fields from OCR.space response if present
    const ocrDebug: Record<string, unknown> = {
      status: ocrResponse.status,
      headers: Array.from(ocrResponse.headers.entries()).slice(0, 10),
    };

    if (ocrJson && typeof ocrJson === 'object' && ocrJson !== null) {
      const oj = ocrJson as Record<string, unknown>;
      ocrDebug.OCRExitCode = oj.OCRExitCode;
      ocrDebug.IsErroredOnProcessing = oj.IsErroredOnProcessing;
      ocrDebug.ErrorMessage = oj.ErrorMessage;
      ocrDebug.ProcessingTimeInMilliseconds = oj.ProcessingTimeInMilliseconds;
    }

    // Validate ParsedResults exists
    if (!ocrJson || typeof ocrJson !== 'object' || ocrJson === null) {
      console.error('OCR.space returned invalid JSON', ocrDebug);
      return NextResponse.json({ success: false, message: 'OCR returned invalid JSON', ocrDebug }, { status: 502 });
    }

    const oj = ocrJson as Record<string, unknown>;
    const parsedResults = oj['ParsedResults'];
    if (!parsedResults || !Array.isArray(parsedResults) || parsedResults.length === 0) {
      console.error('OCR.space returned no ParsedResults', ocrDebug);
      return NextResponse.json({ success: false, message: 'OCR returned no parsed results', ocrDebug }, { status: 502 });
    }

    // Extract the OCR text from the response safely
    const firstResult = parsedResults[0];
    let ocrText = '';
    if (firstResult && typeof firstResult === 'object') {
      const fr = firstResult as Record<string, unknown>;
      if (fr['ParsedText'] !== undefined && fr['ParsedText'] !== null) {
        ocrText = String(fr['ParsedText']);
      }
    }

    // Trigger the second API call to process and format the OCR text
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
    const aiUrl = `${baseUrl}/api/ai`;

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
