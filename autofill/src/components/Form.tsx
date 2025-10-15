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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, files, type } = e.target as HTMLInputElement;
    const fileValue = type === 'file' ? (files && files.length ? files[0] : null) : undefined;
    setFormData(prev => ({
      ...prev,
      [name]: fileValue !== undefined ? fileValue : value,
    } as unknown as FormState));

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
      const body = new FormData();
      body.append('topImage', file);
      const res = await fetch('/api/imagetotext', { method: 'POST', body });
      const data = await res.json();
      console.log('OCR response:', data);

      if (data?.success && data.ai && data.ai.generatedText) {
        const generated = data.ai.generatedText;
        try {
          const parsed = JSON.parse(generated);
          setFormData(prev => ({
            ...prev,
            transactionRole: parsed.transactionRole ?? prev.transactionRole,
            amount: parsed.amount ?? prev.amount,
            paymentTerms: parsed.paymentTerms ?? prev.paymentTerms,
            lcType: parsed.lcType ?? prev.lcType,
            isLcIssued: parsed.isLcIssued ?? prev.isLcIssued,
            issuingBank: parsed.issuingBank ?? prev.issuingBank,
            confirmingBanks: parsed.confirmingBanks ?? prev.confirmingBanks,
            productDescription: parsed.productDescription ?? prev.productDescription,
            importerName: parsed.importerName ?? prev.importerName,
            exporterName: parsed.exporterName ?? prev.exporterName,
            confirmationCharges: parsed.confirmationCharges ?? prev.confirmationCharges,
            lastDateForReceivingBids: parsed.lastDateForReceivingBids ?? prev.lastDateForReceivingBids,
          }));
        } catch (parseErr) {
          console.error('Failed to parse AI mapping JSON', parseErr, 'generated:', generated);
        }
      }
    } catch (err) {
      console.error('Upload failed', err);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl mx-auto p-4 bg-gray-100">
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
        <select
          name="transactionRole"
          id="transactionRole"
          value={formData.transactionRole}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300 text-gray-900 bg-white"
        >
          <option value="exporter">Exporter/Supplier (Beneficiary)</option>
          <option value="importer">Importer (Applicant)</option>
        </select>
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
          Amount:
        </label>
        <input
          type="number"
          id="amount"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300"
          placeholder="Enter Amount"
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
          className="mt-2 block w-full rounded-md border-gray-300"
          placeholder="e.g., Sight LC, Usance LC"
        />
      </div>

      {/* LC Type */}
      <div>
        <label htmlFor="lcType" className="block text-sm font-medium text-gray-700">
          LC Type:
        </label>
        <select
          name="lcType"
          id="lcType"
          value={formData.lcType}
          onChange={handleChange}
          className="mt-2 block w-full rounded-md border-gray-300"
        >
          <option value="local">Local</option>
          <option value="international">International</option>
        </select>
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
          className="mt-2 block w-full rounded-md border-gray-300"
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
          className="mt-2 block w-full rounded-md border-gray-300"
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
          className="mt-2 block w-full rounded-md border-gray-300"
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
          className="mt-2 block w-full rounded-md border-gray-300"
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
          className="mt-2 block w-full rounded-md border-gray-300"
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
          className="mt-2 block w-full"
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
          className="mt-2 block w-full rounded-md border-gray-300"
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
