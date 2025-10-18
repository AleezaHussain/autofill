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
    // Parse the incoming JSON data - accept text `data`, `imageBase64`, and optional `debug` flag
  const { data, prompt, imageBase64 } = await request.json();

    if (!prompt || (!data && !imageBase64)) {
      return NextResponse.json(
        { success: false, message: 'Missing prompt or data/imageBase64' },
        { status: 400 }
      );
    }

    // Strong, defensive system prompt with explicit output schema and example
    const systemMessage = `You are a strict JSON extractor. Follow these rules exactly:\n
1) If an image (base64) is provided, first extract the full textual content from the image and label that block EXTRACTED_TEXT.\n
2) After extraction (or if text input was provided), produce ONLY a single, valid JSON object with the exact keys listed below. Do NOT output any explanatory text, bullets, or code fences — ONLY the JSON object.\n
Keys (must match exactly): transactionRole, amount, paymentTerms, lcType, isLcIssued, issuingBank, confirmingBanks, productDescription, importerName, exporterName, confirmationCharges, lastDateForReceivingBids.\n
If a field cannot be found, set its value to an empty string (\"\"). Do not add or remove keys. The JSON should be parseable by a JSON.parse call.\n
Example output exactly (spacing/ordering may differ but must be valid JSON):\n{\n  "transactionRole": "",\n  "amount": "100.000,OO USD",\n  "paymentTerms": "100 PCT. VALUE OF GOODS SHIPPED",\n  "lcType": "IRREVOCABLE CONFIRMED LETTER OF CREDIT",\n  "isLcIssued": "",\n  "issuingBank": "HSBC",\n  "confirmingBanks": "",\n  "productDescription": "DOORES AND WINDOWS ACCESORY",\n  "importerName": "THE LIBYAN RUSSIAN UKRANIAN SPECIALIZED CENTER",\n  "exporterName": "FLUID LIMITED",\n  "confirmationCharges": "",\n  "lastDateForReceivingBids": ""\n}\n
Always return only the JSON object (no commentary).`;
     // Important: If you determine that you cannot reliably extract usable text from the input or cannot map
     // the content to the requested fields, respond with the single word: error
     // (that is the literal token: error -- lowercase, no punctuation, no explanation). This allows the caller
     // to detect failure deterministically.

    // Build user content depending on whether imageBase64 was provided
    const userContent = imageBase64
      ? `${prompt}\n\nIMAGE_BASE64:\n${imageBase64}\n\nPlease first extract the full text from the image (label it EXTRACTED_TEXT), then return ONLY the JSON mapping.`
      : `${prompt}\n\nTEXT_INPUT:\n${data}\n\nReturn ONLY the JSON mapping.`;

    // Call OpenAI to run the two-step instruction
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
    });

    const generatedText = response.choices?.[0]?.message?.content || '';

    // Try to detect an EXTRACTED_TEXT block in the assistant reply for logging
    let extractedTextFromAssistant: string | null = null;
    try {
      // 1) fenced code block after EXTRACTED_TEXT
      const codeBlockMatch = generatedText.match(/EXTRACTED_TEXT\s*[:\-]?\s*```(?:\w*\n)?([\s\S]*?)```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        extractedTextFromAssistant = codeBlockMatch[1].trim();
      } else {
        // 2) up to the next JSON object (assumes JSON starts with a '{')
        const upToJsonMatch = generatedText.match(/EXTRACTED_TEXT\s*[:\-]?\s*([\s\S]*?)(?=\{)/i);
        if (upToJsonMatch && upToJsonMatch[1]) {
          extractedTextFromAssistant = upToJsonMatch[1].trim();
        } else {
          // 3) simple inline label
          const simpleMatch = generatedText.match(/EXTRACTED_TEXT\s*[:\-]?\s*([\s\S]*)/i);
          if (simpleMatch && simpleMatch[1]) {
            extractedTextFromAssistant = simpleMatch[1].trim();
          }
        }
      }
    } catch (_e) {
      // ignore extraction errors
    }

    if (extractedTextFromAssistant) {
      console.log('EXTRACTED_TEXT (from assistant):', extractedTextFromAssistant.slice(0, 3000));
    }

    // Try to parse JSON strictly, otherwise extract first JSON object in the reply
    const parsed = tryParseJSON(generatedText);

    let extractedFields: ExtractedFields;
    if (parsed && typeof parsed === 'object') {
      extractedFields = parseFields(parsed); // Use parsed JSON fields
    } else {
      // Fallback: regex extraction if parsing fails
      extractedFields = parseExtractedData(generatedText);
    }

    // Return the processed fields as JSON. Include extractedText and raw assistant reply when requested.
    const resultPayload: Record<string, unknown> = {
      success: true,
      generatedText,
      extractedFields,
    };
    if (extractedTextFromAssistant) resultPayload.extractedText = extractedTextFromAssistant;
    // If the client requested debug, echo the raw assistant reply
    const reqBody = await request.json().catch(() => ({}));
    if (reqBody && typeof (reqBody as { debug?: unknown }).debug === 'boolean' && (reqBody as { debug?: boolean }).debug) {
      resultPayload.rawAssistant = generatedText;
    }

    return NextResponse.json(resultPayload);
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
