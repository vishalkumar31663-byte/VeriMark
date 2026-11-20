import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { ReceiptRecord, ResultRecord } from '../shared/types';

export interface MarksheetPdfData {
  result: ResultRecord;
  receipt: ReceiptRecord;
  verifyUrl: string;
  institutionName?: string;
}

/**
 * Generates an official academic A4 PDF marksheet with VeriMark shield emblem,
 * student & subject marks breakdown, short cryptographic fingerprint, and embedded QR code.
 */
export async function generateMarksheetPdf(
  data: MarksheetPdfData
): Promise<Uint8Array> {
  const { result, receipt, verifyUrl } = data;
  const institutionName = data.institutionName ?? 'Demo University';

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`VeriMark Official Marksheet - ${result.registrationNumber}`);
  pdfDoc.setAuthor('VeriMark Tamper-Proof Exam Result Ledger');
  pdfDoc.setSubject(`${result.subjectCode} - ${result.subjectName}`);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const navy = rgb(0.06, 0.09, 0.16);
  const indigo = rgb(0.31, 0.27, 0.9);
  const slate = rgb(0.39, 0.45, 0.55);
  const border = rgb(0.84, 0.87, 0.92);
  const lightSurface = rgb(0.97, 0.98, 0.99);
  const emerald = rgb(0.02, 0.59, 0.41);

  // Outer institutional border
  page.drawRectangle({
    x: 28,
    y: 28,
    width: width - 56,
    height: height - 56,
    borderColor: border,
    borderWidth: 1,
  });

  // Top header band
  page.drawRectangle({
    x: 28,
    y: height - 132,
    width: width - 56,
    height: 104,
    color: navy,
  });

  // VeriMark Shield Accent Box
  page.drawRectangle({
    x: 48,
    y: height - 104,
    width: 42,
    height: 46,
    color: indigo,
  });
  page.drawText('VM', {
    x: 56,
    y: height - 88,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(institutionName.toUpperCase(), {
    x: 104,
    y: height - 74,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('OFFICIAL CRYPTOGRAPHICALLY ANCHORED STATEMENT OF MARKS', {
    x: 104,
    y: height - 92,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.78, 0.84, 0.94),
  });
  page.drawText('VeriMark Ledger · Every Mark Verified. Every Change Accountable.', {
    x: 104,
    y: height - 108,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.6, 0.68, 0.82),
  });

  // Document Version & Receipt ID on right of header
  page.drawText(`VERSION ${receipt.version}`, {
    x: width - 148,
    y: height - 74,
    size: 10,
    font: fontMono,
    color: rgb(0.65, 0.95, 0.82),
  });
  page.drawText(`BLOCK #${receipt.ledgerSequence}`, {
    x: width - 148,
    y: height - 92,
    size: 9.5,
    font: fontMono,
    color: rgb(0.85, 0.9, 1),
  });

  // Student Details Section
  let cursorY = height - 168;
  page.drawText('CANDIDATE INFORMATION', {
    x: 48,
    y: cursorY,
    size: 9.5,
    font: fontBold,
    color: indigo,
  });
  cursorY -= 12;
  page.drawLine({
    start: { x: 48, y: cursorY },
    end: { x: width - 48, y: cursorY },
    thickness: 0.75,
    color: border,
  });

  const infoLeft: Array<[string, string]> = [
    ['Student Name', result.studentName],
    ['Registration No.', result.registrationNumber],
    ['Academic Course', result.course],
  ];
  const infoRight: Array<[string, string]> = [
    ['Academic Session', result.academicSession],
    ['Semester', `Semester ${result.semester}`],
    ['Examination ID', result.examCode],
  ];

  cursorY -= 22;
  for (let i = 0; i < infoLeft.length; i++) {
    const [lk, lv] = infoLeft[i];
    const [rk, rv] = infoRight[i];

    page.drawText(lk, { x: 48, y: cursorY, size: 8.5, font: fontRegular, color: slate });
    page.drawText(lv, { x: 48, y: cursorY - 13, size: 11, font: fontBold, color: navy });

    page.drawText(rk, { x: 325, y: cursorY, size: 8.5, font: fontRegular, color: slate });
    page.drawText(rv, { x: 325, y: cursorY - 13, size: 11, font: fontBold, color: navy });

    cursorY -= 38;
  }

  // Marks Table
  cursorY -= 10;
  page.drawText('EXAMINATION PERFORMANCE RECORD', {
    x: 48,
    y: cursorY,
    size: 9.5,
    font: fontBold,
    color: indigo,
  });

  cursorY -= 14;
  // Table header background
  page.drawRectangle({
    x: 48,
    y: cursorY - 24,
    width: width - 96,
    height: 24,
    color: lightSurface,
    borderColor: border,
    borderWidth: 0.75,
  });

  page.drawText('Subject Code', { x: 58, y: cursorY - 15, size: 8.5, font: fontBold, color: slate });
  page.drawText('Subject Name', { x: 145, y: cursorY - 15, size: 8.5, font: fontBold, color: slate });
  page.drawText('Max Marks', { x: 372, y: cursorY - 15, size: 8.5, font: fontBold, color: slate });
  page.drawText('Obtained', { x: 444, y: cursorY - 15, size: 8.5, font: fontBold, color: slate });
  page.drawText('Status', { x: 504, y: cursorY - 15, size: 8.5, font: fontBold, color: slate });

  // Table row
  const rowTop = cursorY - 24;
  page.drawRectangle({
    x: 48,
    y: rowTop - 36,
    width: width - 96,
    height: 36,
    borderColor: border,
    borderWidth: 0.75,
  });

  const percentage = Math.round((result.obtainedMarks / result.maxMarks) * 1000) / 10;
  const passFail = percentage >= 40 ? 'PASS' : 'FAIL';

  page.drawText(result.subjectCode, {
    x: 58,
    y: rowTop - 22,
    size: 10.5,
    font: fontMono,
    color: navy,
  });
  page.drawText(result.subjectName.slice(0, 34), {
    x: 145,
    y: rowTop - 22,
    size: 10.5,
    font: fontBold,
    color: navy,
  });
  page.drawText(String(result.maxMarks), {
    x: 386,
    y: rowTop - 22,
    size: 10.5,
    font: fontMono,
    color: navy,
  });
  page.drawText(String(result.obtainedMarks), {
    x: 454,
    y: rowTop - 22,
    size: 11,
    font: fontMono,
    color: indigo,
  });
  page.drawText(passFail, {
    x: 504,
    y: rowTop - 22,
    size: 9.5,
    font: fontBold,
    color: passFail === 'PASS' ? emerald : rgb(0.86, 0.15, 0.15),
  });

  // Summary strip
  const sumY = rowTop - 64;
  page.drawText(
    `Percentage: ${percentage}%    |    Record Version: v${receipt.version}    |    Published: ${new Date(
      receipt.createdAt
    ).toUTCString()}`,
    {
      x: 48,
      y: sumY,
      size: 9,
      font: fontRegular,
      color: slate,
    }
  );

  // Cryptographic Verification Block + Embedded QR Code
  const qrBoxY = 148;
  page.drawRectangle({
    x: 48,
    y: qrBoxY,
    width: width - 96,
    height: 225,
    color: lightSurface,
    borderColor: border,
    borderWidth: 0.85,
  });

  const qrPngBuffer = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 280,
    margin: 2,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  page.drawImage(qrImage, {
    x: 66,
    y: qrBoxY + 42,
    width: 140,
    height: 140,
  });

  const metaX = 228;
  page.drawText('CRYPTOGRAPHIC RECEIPT & INDEPENDENT VERIFICATION', {
    x: metaX,
    y: qrBoxY + 195,
    size: 9.5,
    font: fontBold,
    color: indigo,
  });

  const cryptoFields: Array<[string, string]> = [
    ['Receipt Identifier', receipt.receiptId],
    ['Short Fingerprint', receipt.shortFingerprint],
    ['Ledger Block Sequence', `#${receipt.ledgerSequence} (Version ${receipt.version})`],
    ['Payload SHA-256', `${receipt.payloadHash.slice(0, 34)}...`],
    ['Block Hash', `${receipt.blockHash.slice(0, 34)}...`],
  ];

  let metaY = qrBoxY + 170;
  for (const [k, v] of cryptoFields) {
    page.drawText(`${k}:`, { x: metaX, y: metaY, size: 8, font: fontRegular, color: slate });
    page.drawText(v, { x: metaX + 108, y: metaY, size: 8.5, font: fontMono, color: navy });
    metaY -= 20;
  }

  page.drawText('Verification Instructions:', {
    x: metaX,
    y: qrBoxY + 58,
    size: 8.5,
    font: fontBold,
    color: navy,
  });
  page.drawText(
    'Scan the QR code or open the URL below without logging in to verify this marksheet',
    { x: metaX, y: qrBoxY + 44, size: 8, font: fontRegular, color: slate }
  );
  page.drawText(
    'against Demo University pinned Ed25519 keys and the external signed checkpoint.',
    { x: metaX, y: qrBoxY + 32, size: 8, font: fontRegular, color: slate }
  );
  page.drawText(verifyUrl.slice(0, 74), {
    x: metaX,
    y: qrBoxY + 14,
    size: 7.5,
    font: fontMono,
    color: indigo,
  });

  // Footer
  page.drawLine({
    start: { x: 48, y: 102 },
    end: { x: width - 48, y: 102 },
    thickness: 0.6,
    color: border,
  });
  page.drawText(
    'Printed receipts remain permanently verifiable even if an authorized two-signer correction is published later.',
    { x: 48, y: 84, size: 8, font: fontRegular, color: slate }
  );
  page.drawText(
    'Issued by Demo University Examination Cell · Secured by VeriMark Append-Only Hash-Chain Ledger',
    { x: 48, y: 68, size: 8, font: fontBold, color: navy }
  );

  return await pdfDoc.save();
}

export async function generateQrDataUrl(verifyUrl: string): Promise<string> {
  return await QRCode.toDataURL(verifyUrl, {
    width: 240,
    margin: 2,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}
