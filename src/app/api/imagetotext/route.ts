import { NextResponse, NextRequest } from 'next/server';
import AWS from 'aws-sdk';
import { OpenAI } from 'openai';

// Initialize AWS Textract and OpenAI client
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,   // Your AWS Access Key ID
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Your AWS Secret Access Key
  region: 'us-east-1', // Your AWS region
});

const textract = new AWS.Textract();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // Your OpenAI API Key
});

export async function POST(request: NextRequest) {
  try {
    // Log incoming request
    console.log("Incoming request...");

    // Get the uploaded image from the form data
    const formData = await request.formData();
    const fileEntry = formData.get('topImage');

    if (!fileEntry) {
      console.log('No file uploaded');
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    // Ensure the entry is a File/Blob before calling arrayBuffer()
    if (typeof fileEntry === 'string') {
      console.log('Invalid file uploaded');
      return NextResponse.json({ success: false, message: 'Invalid file uploaded' }, { status: 400 });
    }

    // Convert the File/Blob to a buffer
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    console.log('File converted to buffer successfully');

    // Upload image to Amazon Textract (as base64 or buffer)
    const params = {
      Document: {
        Bytes: buffer,
      },
    };

    // Call Amazon Textract for text extraction
    console.log('Calling Amazon Textract...');
    const textractResponse = await textract.detectDocumentText(params).promise();

    console.log('Textract response received', textractResponse);

    // Extract text from the response (guarding for possibly undefined Blocks)
    const blocks = Array.isArray(textractResponse?.Blocks) ? textractResponse.Blocks : [];
    const extractedText = blocks
      .filter((block: unknown) => {
        if (!block || typeof block !== 'object') return false;
        const b = block as { BlockType?: unknown; Text?: unknown };
        return b.BlockType === 'LINE' && typeof b.Text === 'string';
      })
      .map((block: unknown) => (block as { Text?: string }).Text || '')
      .join('\n'); // Join all extracted lines into one string

    if (!extractedText) {
      console.log('No text extracted from the image');
      return NextResponse.json({ success: false, message: 'No text extracted from the image' }, { status: 400 });
    }

    // If extracted text is too short, treat it as a failure so the client displays an error
    const wordCount = String(extractedText).trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      console.log('Extracted text too short, failing with 400', { extractedText, wordCount });
      return NextResponse.json({ success: false, message: 'Extracted text too short' }, { status: 400 });
    }

    console.log('Extracted Text:', extractedText);

    // Send the extracted text to OpenAI for processing
    console.log('Sending extracted text to OpenAI...');
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an assistant that processes OCR-extracted text.' },
        { role: 'user', content: extractedText },
      ],
    });

    console.log('OpenAI response received', openaiResponse);

    // Get the processed text from OpenAI
    const processedText = openaiResponse.choices[0].message.content;

    // Return extracted and processed text back to the client
    return NextResponse.json({
      success: true,
      extractedText: processedText, // Text processed by OpenAI
      // Include assistant choice object for debugging (if available)
      rawAssistantChoice: openaiResponse?.choices?.[0] ?? null,
    });
  } catch (error) {
    console.error('OCR Error:', error);
    return NextResponse.json({ success: false, message: 'OCR processing failed' }, { status: 500 });
  }
}
