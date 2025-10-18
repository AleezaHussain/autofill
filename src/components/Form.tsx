"use client";

import React, { useState } from 'react';

const Form: React.FC = () => {
  type FormState = {
    topImage: File | null;
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
    attachments: File | null;
    lastDateForReceivingBids: string;
  };

  const [formData, setFormData] = useState<FormState>({
    topImage: null,
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
    attachments: null,
    lastDateForReceivingBids: ''
  });
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, files, type } = e.target as HTMLInputElement;
    const fileValue = type === 'file' ? (files && files.length ? files[0] : null) : undefined;
    setFormData(prev => ({
      ...prev,
      [name]: fileValue !== undefined ? fileValue : value,
    } as unknown as FormState));

    // If the user selected the topImage, upload it immediately
    if (name === 'topImage' && fileValue) {
      void uploadTopImage(fileValue as File);
    }
  };

  const topImageRef = React.useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(formData);
  };

  async function uploadTopImage(file: File) {
    try {
      // Clear previous upload error
      setUploadError(null);
      const body = new FormData();
      body.append('topImage', file);
      const res = await fetch('/api/imagetotext', { method: 'POST', body });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        const msg = (data && data.message) || `Failed to fetch OCR (${res.status})`;
        console.error('OCR upload error', msg, data);
        setUploadError(msg);
        return;
      }
      // For now server returns placeholder; when OCR implemented, data.text will contain recognized text
      console.log('OCR response:', data);

      // The server returns extractedText. Now call the mapping AI route with that text.
      const extractedText = data?.extractedText ?? data?.text ?? null;
      if (!extractedText) {
        console.warn('No extracted text returned from /api/imagetotext', data);
        setUploadError('No text extracted from image');
        return;
      }

      // If extracted text is too short, it's likely an extraction failure; show error and stop
      const wordCount = (extractedText || '').trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 3) {
        setUploadError('Could not extract usable data from this image (too little text). Try a clearer photo or upload a different document.');
        return;
      }

      // Build a clear prompt that includes the extracted text and the current form values
      const currentFieldsForPrompt = {
        transactionRole: formData.transactionRole,
        amount: formData.amount,
        paymentTerms: formData.paymentTerms,
        lcType: formData.lcType,
        isLcIssued: formData.isLcIssued,
        issuingBank: formData.issuingBank,
        confirmingBanks: formData.confirmingBanks,
        productDescription: formData.productDescription,
        importerName: formData.importerName,
        exporterName: formData.exporterName,
        confirmationCharges: formData.confirmationCharges,
        lastDateForReceivingBids: formData.lastDateForReceivingBids,
      };

      const prompt = `You are given extracted text from a document and the current form field values. Map the extracted text to the form fields. Only return a JSON object with keys for fields that should be updated (omit fields that should remain unchanged). Allowed keys: transactionRole, amount, paymentTerms, lcType, isLcIssued, issuingBank, confirmingBanks, productDescription, importerName, exporterName, confirmationCharges, lastDateForReceivingBids. Values should be strings. Do not include nulls. Do not add any explanation or extra keys.\n\nEXTRACTED_TEXT:\n${extractedText}\n\nCURRENT_FORM_VALUES:\n${JSON.stringify(currentFieldsForPrompt, null, 2)}\n\nReturn only valid JSON.`;

      // Call mapping endpoint (server-side mapping route uses a strong system prompt as well)
      const mapRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: extractedText, prompt }),
      });
      const mapJson = await mapRes.json().catch(() => null);
      if (!mapRes.ok || !mapJson) {
        console.error('Mapping failed', mapRes.status, mapJson);
        setUploadError('Mapping failed');
        return;
      }

      // If the assistant returned an explicit failure marker, show a friendly error and stop
      const assistantRaw: string | null =
        (mapJson && typeof mapJson.rawAssistant === 'string' && mapJson.rawAssistant) ||
        (mapJson?.rawAssistantChoice?.message?.content as string) ||
        (typeof mapJson?.generatedText === 'string' ? mapJson.generatedText : null);

      if (assistantRaw) {
        // The server is instructed to return the single literal token `error` when it cannot extract or map.
        if (/^\s*error\s*$/i.test(assistantRaw)) {
          console.warn('Assistant returned explicit error token:', assistantRaw);
          setUploadError('Could not extract usable data from this image. Try a clearer photo or upload a different document.');
          return;
        }

        const failRegex = /sorry[,\s]+your message is not clear|not clear|unable to (?:extract|parse)|cannot (?:extract|parse)|could not extract|no text extracted|i cannot find|i can'?t find/i;
        if (failRegex.test(assistantRaw)) {
          console.warn('Assistant indicates extraction failure:', assistantRaw);
          setUploadError('Could not extract usable data from this image. Try a clearer photo or upload a different document.');
          return;
        }
      }

  // Prefer structured extractedFields when available, otherwise try to parse generatedText
  let mapped: Partial<typeof formData> | null = null;
      if (mapJson?.extractedFields && typeof mapJson.extractedFields === 'object') mapped = mapJson.extractedFields;
      else if (mapJson?.generatedText && typeof mapJson.generatedText === 'string') {
        try { mapped = JSON.parse(mapJson.generatedText); } catch { mapped = null; }
      } else if (mapJson && typeof mapJson === 'object') {
        // maybe the mapping endpoint returned fields directly
        mapped = mapJson as Partial<typeof formData>;
      }

      if (mapped) {
        const isNonEmpty = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
        setFormData(prev => ({
          ...prev,
          transactionRole: isNonEmpty(mapped.transactionRole) ? String(mapped.transactionRole) : prev.transactionRole,
          amount: isNonEmpty(mapped.amount) ? String(mapped.amount) : prev.amount,
          paymentTerms: isNonEmpty(mapped.paymentTerms) ? String(mapped.paymentTerms) : prev.paymentTerms,
          lcType: isNonEmpty(mapped.lcType) ? String(mapped.lcType) : prev.lcType,
          isLcIssued: isNonEmpty(mapped.isLcIssued) ? String(mapped.isLcIssued) : prev.isLcIssued,
          issuingBank: isNonEmpty(mapped.issuingBank) ? String(mapped.issuingBank) : prev.issuingBank,
          confirmingBanks: isNonEmpty(mapped.confirmingBanks) ? String(mapped.confirmingBanks) : prev.confirmingBanks,
          productDescription: isNonEmpty(mapped.productDescription) ? String(mapped.productDescription) : prev.productDescription,
          importerName: isNonEmpty(mapped.importerName) ? String(mapped.importerName) : prev.importerName,
          exporterName: isNonEmpty(mapped.exporterName) ? String(mapped.exporterName) : prev.exporterName,
          confirmationCharges: isNonEmpty(mapped.confirmationCharges) ? String(mapped.confirmationCharges) : prev.confirmationCharges,
          lastDateForReceivingBids: isNonEmpty(mapped.lastDateForReceivingBids) ? String(mapped.lastDateForReceivingBids) : prev.lastDateForReceivingBids,
        }));
      }
    } catch (err) {
      console.error('Upload failed', err);
      setUploadError('Upload failed — could not reach OCR service');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl mx-auto p-4 bg-gray-100">
      {/* OCR upload error banner */}
      {uploadError && (
        <div className="p-3 bg-red-100 border border-red-300 text-red-800 rounded">
          <div className="flex items-center justify-between">
            <div>{uploadError}</div>
            <div className="ml-4">
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
                  topImageRef.current?.click();
                }}
                className="px-3 py-1 bg-red-600 text-white rounded"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top Image Upload */}
      <div>
        <label htmlFor="topImage" className="block text-sm font-medium text-gray-700">
          Upload top image:
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={topImageRef}
            type="file"
            id="topImage"
            name="topImage"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => topImageRef.current?.click()}
            className="px-3 py-2 bg-blue-600 text-white rounded-md"
          >
            Choose image
          </button>
          <span className="text-sm text-gray-700">
            {formData.topImage ? (formData.topImage as File).name : 'No file chosen'}
          </span>
        </div>
      </div>

      {/* Transaction Role */}
      <div>
        <label htmlFor="transactionRole" className="block text-sm font-medium text-gray-700">
          In this transaction you are:
        </label>
        <input
          type="text"
          name="transactionRole"
          id="transactionRole"
          value={formData.transactionRole}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Exporter/Supplier (Beneficiary) or Importer (Applicant)"
        />
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
          Amount:
        </label>
        <input
          type="text"
          id="amount"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Enter Amount (e.g. 100.000,OO USD)"
        />
      </div>

      {/* Payment Terms */}
      <div>
        <label htmlFor="paymentTerms" className="block text-sm font-medium text-gray-700">
          Payment Terms:
        </label>
        <input
          type="text"
          id="paymentTerms"
          name="paymentTerms"
          value={formData.paymentTerms}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="e.g., Sight LC, Usance LC"
        />
      </div>

      {/* LC Type */}
      <div>
        <label htmlFor="lcType" className="block text-sm font-medium text-gray-700">
          LC Type:
        </label>
        <input
          type="text"
          id="lcType"
          name="lcType"
          value={formData.lcType}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="e.g., Local or International"
        />
      </div>

      {/* Is LC Issued */}
      <div>
        <label htmlFor="isLcIssued" className="block text-sm font-medium text-gray-700">
          Is this LC issued?
        </label>
        <input
          type="text"
          id="isLcIssued"
          name="isLcIssued"
          value={formData.isLcIssued}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Yes or No"
        />
      </div>

      {/* Issuing Bank */}
      <div>
        <label htmlFor="issuingBank" className="block text-sm font-medium text-gray-700">
          LC Issuing Bank:
        </label>
        <input
          type="text"
          id="issuingBank"
          name="issuingBank"
          value={formData.issuingBank}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Enter Issuing Bank"
        />
      </div>

      {/* Product Description */}
      <div>
        <label htmlFor="productDescription" className="block text-sm font-medium text-gray-700">
          Product Description:
        </label>
        <input
          type="text"
          id="productDescription"
          name="productDescription"
          value={formData.productDescription}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Enter product description"
        />
      </div>

      {/* Importer Name */}
      <div>
        <label htmlFor="importerName" className="block text-sm font-medium text-gray-700">
          Importer Name:
        </label>
        <input
          type="text"
          id="importerName"
          name="importerName"
          value={formData.importerName}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Enter Importer Name"
        />
      </div>

      {/* Exporter Name */}
      <div>
        <label htmlFor="exporterName" className="block text-sm font-medium text-gray-700">
          Exporter Name:
        </label>
        <input
          type="text"
          id="exporterName"
          name="exporterName"
          value={formData.exporterName}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white placeholder-gray-400"
          style={{ color: '#111', backgroundColor: '#fff' }}
          placeholder="Enter Exporter Name"
        />
      </div>

      {/* Attachments */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Attach Documents (LC Drafts, Invoice, etc.):
        </label>
        <input
          type="file"
          name="attachments"
          onChange={handleChange}
          className="mt-2 block w-full text-gray-900 bg-white"
          style={{ color: '#111', backgroundColor: '#fff' }}
        />
      </div>

      {/* Last Date for Receiving Bids */}
      <div>
        <label htmlFor="lastDateForReceivingBids" className="block text-sm font-medium text-gray-700">
          Last Date for Receiving Bids:
        </label>
        <input
          type="date"
          id="lastDateForReceivingBids"
          name="lastDateForReceivingBids"
          value={formData.lastDateForReceivingBids}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white"
          style={{ color: '#111', backgroundColor: '#fff' }}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-md"
        >
          Submit Request
        </button>
      </div>
    </form>
  );
};

export default Form;
