import axios from 'axios';
import { NextResponse } from 'next/server';

export async function POST(request) {
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

    // Make the request to OCR.space API
    const response = await axios.post('https://api.ocr.space/parse/image', ocrFormData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    // Extract the OCR text from the response
    const ocrText = response.data.ParsedResults[0].ParsedText;

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
    let aiData: any;
    const contentType = aiResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        aiData = await aiResponse.json();
      } catch (err) {
        const raw = await aiResponse.text().catch(() => '<no-body>');
        console.error('Failed to parse AI JSON response', err, raw);
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
