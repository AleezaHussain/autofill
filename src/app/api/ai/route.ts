import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Use your OpenAI API key here
});

type ExtractedFields = {
  transactionRole: string;
  amount: string;
  paymentTerms: string;
  lcType: string;
  isLcIssued: string;
  issuingBank: string;
  confirmingBanks: string;
  productDescription: string;
  importerName: string;
  exporterName: string;
  confirmationCharges: string;
  lastDateForReceivingBids: string;
};

export async function POST(request: Request) {
  try {
    // Parse the incoming JSON data
    const { data, prompt } = await request.json();

    if (!data || !prompt) {
      return NextResponse.json(
        { success: false, message: 'Missing data or prompt' },
        { status: 400 }
      );
    }

    // System message to tell GPT to only extract a valid JSON object
    const systemMessage = `You are a JSON extractor. Given the user's prompt and OCR text, produce ONLY a single valid JSON object (no surrounding text) with these keys exactly: transactionRole, amount, paymentTerms, lcType, isLcIssued, issuingBank, confirmingBanks, productDescription, importerName, exporterName, confirmationCharges, lastDateForReceivingBids. If a field is not present, set its value to an empty string. Do not include any additional keys.`;

    // Make a call to OpenAI GPT-4 to process the prompt and extracted OCR text
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
        { role: 'assistant', content: data }, // OCR data as input
      ],
    });

    const generatedText = response.choices?.[0]?.message?.content || '';

    // Try to parse JSON strictly, otherwise extract first JSON object in the reply
    const parsed = tryParseJSON(generatedText);

    let extractedFields: ExtractedFields;
    if (parsed && typeof parsed === 'object') {
      extractedFields = parseFields(parsed); // Use parsed JSON fields
    } else {
      // Fallback: regex extraction if parsing fails
      extractedFields = parseExtractedData(generatedText);
    }

    // Return the processed fields as JSON
    return NextResponse.json({ success: true, generatedText, extractedFields });
  } catch (err) {
    console.error('Error processing request in /api/ai:', err);
    return NextResponse.json({ success: false, message: 'AI processing error', error: String(err) }, { status: 500 });
  }
}

// Function to parse the extracted fields from JSON response
function parseFields(parsed: unknown): ExtractedFields {
  const p = (parsed as Record<string, unknown> | null) ?? {};

  return {
    transactionRole: String((p['transactionRole'] as string) ?? ''),
    amount: String((p['amount'] as string) ?? ''),
    paymentTerms: String((p['paymentTerms'] as string) ?? ''),
    lcType: String((p['lcType'] as string) ?? ''),
    isLcIssued: String((p['isLcIssued'] as string) ?? ''),
    issuingBank: String((p['issuingBank'] as string) ?? ''),
    confirmingBanks: String((p['confirmingBanks'] as string) ?? ''),
    productDescription: String((p['productDescription'] as string) ?? ''),
    importerName: String((p['importerName'] as string) ?? ''),
    exporterName: String((p['exporterName'] as string) ?? ''),
    confirmationCharges: String((p['confirmationCharges'] as string) ?? ''),
    lastDateForReceivingBids: String((p['lastDateForReceivingBids'] as string) ?? ''),
  };
}

// Function to parse the generated text using regex if GPT fails to return a valid JSON
function parseExtractedData(generatedText: string): ExtractedFields {
  const fields: ExtractedFields = {
    transactionRole: '',
    amount: '',
    paymentTerms: '',
    lcType: '',
    isLcIssued: '',
    issuingBank: '',
    confirmingBanks: '',
    productDescription: '',
    importerName: '',
    exporterName: '',
    confirmationCharges: '',
    lastDateForReceivingBids: '',
  };

  const regexMap: Record<keyof ExtractedFields, RegExp> = {
    transactionRole: /transaction role[:\s]+([\w\s]+)/i,
    amount: /(?:total price|total|amount)[:\s]+([\d,\.\sA-Za-z]+)/i,
    paymentTerms: /payment terms?[:\s]+([\w\s]+)/i,
    lcType: /letter of credit|l\/c|lc type[:\s]+([\w\s]+)/i,
    isLcIssued: /(?:is this lc issued|is lc issued|issued)[:\s]+([\w\s]+)/i,
    issuingBank: /issuing bank[:\s]+([\w\s]+)/i,
    confirmingBanks: /confirming banks?[:\s]+([\w\s,]+)/i,
    productDescription: /description[:\s]+([\w\s]+)/i,
    importerName: /consignee|importer name[:\s]+([\w\s,]+)/i,
    exporterName: /seller|exporter name[:\s]+([\w\s,]+)/i,
    confirmationCharges: /confirmation charges?[:\s]+([\d,\.]+)/i,
    lastDateForReceivingBids: /date[:\s]+([\d\.\-\/\sA-Za-z]+)/i,
  } as const;

  // Run regex to extract data for each field
  for (const key of Object.keys(regexMap) as (keyof ExtractedFields)[]) {
    const re = regexMap[key];
    const m = generatedText.match(re);
    if (m) fields[key] = (m[1] || '').trim();
  }

  return fields;
}

// Try to parse JSON strictly
function tryParseJSON(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
