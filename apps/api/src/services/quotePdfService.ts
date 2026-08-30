import PDFDocument from "pdfkit";
import type {
  QuoteDocumentContext,
  QuoteRecord,
  QuoteVersionRecord,
} from "@fence-estimator/contracts";

const COLOURS = {
  ink: "#10232A",
  muted: "#5E6E73",
  line: "#D9E2E4",
  pale: "#F4F8F8",
  teal: "#0E7770",
  white: "#FFFFFF",
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}
function formatDate(value: string | null): string {
  if (!value) return "Not specified";
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
function cleanFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "quote";
}

export function quotePdfFileName(quote: QuoteRecord, version: QuoteVersionRecord): string {
  return `${cleanFileName(quote.reference)}-v${version.versionNumber}.pdf`;
}

export async function renderQuotePdf(input: {
  quote: QuoteRecord;
  version: QuoteVersionRecord;
  document: QuoteDocumentContext;
}): Promise<Buffer> {
  const { quote, version, document } = input;
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 58, left: 52, right: 52 },
    bufferPages: true,
    compress: true,
    info: {
      Title: `${quote.reference} - ${version.title}`,
      Author: document.sellerName,
      Subject: `Quote version ${version.versionNumber}`,
      Keywords: `quote,${quote.reference}`,
      CreationDate: new Date(version.issuedAtIso ?? version.createdAtIso),
      ModDate: new Date(version.updatedAtIso),
    },
  });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: unknown) => {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  });
  const completed = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  const pageWidth = pdf.page.width;
  const contentWidth = pageWidth - pdf.page.margins.left - pdf.page.margins.right;
  const left = pdf.page.margins.left;
  const addContinuationPage = () => {
    pdf.addPage();
    pdf
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOURS.teal)
      .text(document.sellerName, left, 45, {
        width: contentWidth / 2,
        lineBreak: false,
        ellipsis: true,
      });
    pdf
      .font("Helvetica")
      .fillColor(COLOURS.muted)
      .text(`${quote.reference} - pricing continued`, left + contentWidth / 2, 45, {
        width: contentWidth / 2,
        align: "right",
        lineBreak: false,
      });
    pdf
      .moveTo(left, 64)
      .lineTo(left + contentWidth, 64)
      .strokeColor(COLOURS.line)
      .lineWidth(0.7)
      .stroke();
    pdf.y = 82;
  };
  const ensureSpace = (height: number) => {
    if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom) {
      addContinuationPage();
    }
  };
  const label = (text: string, x: number, y: number, width: number) => {
    pdf
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLOURS.muted)
      .text(text.toUpperCase(), x, y, { width, characterSpacing: 0.8 });
  };
  const value = (
    text: string,
    x: number,
    y: number,
    width: number,
    options: PDFKit.Mixins.TextOptions = {},
  ) => {
    pdf
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLOURS.ink)
      .text(text, x, y, { width, ...options });
  };

  pdf.rect(0, 0, pageWidth, 118).fill(COLOURS.teal);
  let sellerFontSize = 23;
  pdf.font("Helvetica-Bold");
  while (
    sellerFontSize > 13 &&
    pdf.fontSize(sellerFontSize).widthOfString(document.sellerName) > contentWidth - 150
  )
    sellerFontSize -= 1;
  pdf
    .fontSize(sellerFontSize)
    .fillColor(COLOURS.white)
    .text(document.sellerName, left, 43, {
      width: contentWidth - 150,
      lineBreak: false,
      ellipsis: true,
    });
  pdf
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#D8F1EE")
    .text("Commercial fencing estimate", left, 78, { lineBreak: false });
  pdf.roundedRect(pageWidth - 172, 38, 120, 42, 5).fill("#0A5E59");
  pdf
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOURS.white)
    .text("QUOTATION", pageWidth - 160, 52, { width: 96, align: "center", characterSpacing: 1.2 });
  pdf.y = 146;

  if (version.status === "DRAFT") {
    pdf
      .save()
      .fillColor("#DCE9E8")
      .font("Helvetica-Bold")
      .fontSize(54)
      .opacity(0.32)
      .rotate(-24, { origin: [pageWidth / 2, 340] })
      .text("DRAFT", 88, 295, { width: 420, align: "center" })
      .restore();
  }

  const metaTop = pdf.y;
  const colWidth = contentWidth / 4;
  const meta = [
    { l: "Quote reference", v: quote.reference },
    { l: "Version", v: String(version.versionNumber) },
    { l: "Status", v: version.status.charAt(0) + version.status.slice(1).toLowerCase() },
    { l: "Valid until", v: formatDate(version.validUntilIso) },
  ];
  pdf.roundedRect(left, metaTop, contentWidth, 58, 6).fill(COLOURS.pale);
  meta.forEach((item, index) => {
    const x = left + index * colWidth + 14;
    label(item.l, x, metaTop + 13, colWidth - 28);
    pdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLOURS.ink)
      .text(item.v, x, metaTop + 31, { width: colWidth - 28 });
  });
  pdf.y = metaTop + 82;

  const addressTop = pdf.y;
  const addressWidth = (contentWidth - 22) / 2;
  label("Prepared for", left, addressTop, addressWidth);
  pdf.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.ink);
  const customerNameHeight = pdf.heightOfString(document.customerName, { width: addressWidth });
  pdf.text(document.customerName, left, addressTop + 17, { width: addressWidth });
  const contactLines = [
    document.customerContactName,
    document.customerEmail,
    document.customerPhone,
  ].filter((line): line is string => Boolean(line));
  const customerDetails = contactLines.join("\n") || "No named contact";
  pdf.font("Helvetica").fontSize(10);
  const customerDetailsY = addressTop + 23 + customerNameHeight;
  const customerDetailsHeight = pdf.heightOfString(customerDetails, {
    width: addressWidth,
    lineGap: 3,
  });
  value(customerDetails, left, customerDetailsY, addressWidth, { lineGap: 3 });
  label("Project and site", left + addressWidth + 22, addressTop, addressWidth);
  pdf.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.ink);
  const projectNameHeight = pdf.heightOfString(document.projectName, { width: addressWidth });
  pdf.text(document.projectName, left + addressWidth + 22, addressTop + 17, {
    width: addressWidth,
  });
  const siteLines = [document.siteName, ...document.siteAddressLines].filter(
    (line): line is string => Boolean(line),
  );
  const siteDetails = siteLines.join("\n") || document.projectReference;
  pdf.font("Helvetica").fontSize(10);
  const siteDetailsY = addressTop + 23 + projectNameHeight;
  const siteDetailsHeight = pdf.heightOfString(siteDetails, { width: addressWidth, lineGap: 3 });
  value(siteDetails, left + addressWidth + 22, siteDetailsY, addressWidth, { lineGap: 3 });
  pdf.y =
    Math.max(
      customerDetailsY + customerDetailsHeight,
      siteDetailsY + siteDetailsHeight,
      addressTop + 88,
    ) + 24;

  if (document.projectScope) {
    ensureSpace(70);
    label("Scope", left, pdf.y, contentWidth);
    pdf.moveDown(0.65);
    value(document.projectScope, left, pdf.y, contentWidth, { lineGap: 3 });
    pdf.moveDown(1.4);
  }
  if (version.customerMessage) {
    ensureSpace(76);
    const boxY = pdf.y;
    const messageHeight =
      pdf.heightOfString(version.customerMessage, { width: contentWidth - 32, lineGap: 3 }) + 43;
    pdf.roundedRect(left, boxY, contentWidth, messageHeight, 6).fill(COLOURS.pale);
    label("Message", left + 16, boxY + 13, contentWidth - 32);
    value(version.customerMessage, left + 16, boxY + 31, contentWidth - 32, { lineGap: 3 });
    pdf.y = boxY + messageHeight + 22;
  }

  ensureSpace(80);
  const pricingTitleTop = pdf.y;
  pdf.font("Helvetica-Bold").fontSize(16).fillColor(COLOURS.ink);
  const pricingTitleHeight = pdf.heightOfString(version.title, { width: contentWidth });
  pdf.text(version.title, left, pricingTitleTop, { width: contentWidth });
  pdf.y = pricingTitleTop + pricingTitleHeight + 7;
  pdf
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOURS.muted)
    .text(
      version.presentation.displayMode === "DETAILED"
        ? "Detailed pricing schedule"
        : version.presentation.displayMode === "SUMMARY"
          ? "Pricing summary"
          : "Quoted total",
      left,
      pdf.y,
      { lineBreak: false },
    );
  pdf.y += 24;
  for (const section of version.presentation.sections) {
    ensureSpace(58);
    const sectionTop = pdf.y;
    pdf.rect(left, sectionTop, contentWidth, 31).fill(COLOURS.pale);
    pdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLOURS.ink)
      .text(section.title, left + 12, sectionTop + 10, { width: contentWidth - 126 });
    pdf.text(formatMoney(section.amount), left + contentWidth - 116, sectionTop + 10, {
      width: 104,
      align: "right",
    });
    pdf.y = sectionTop + 38;
    for (const row of section.rows) {
      pdf.font("Helvetica").fontSize(9.5);
      const descriptionWidth = contentWidth - 230;
      const rowHeight = Math.max(
        30,
        pdf.heightOfString(row.description, { width: descriptionWidth }) + 16,
      );
      ensureSpace(rowHeight);
      const rowTop = pdf.y;
      pdf
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(COLOURS.ink)
        .text(row.description, left + 12, rowTop, { width: descriptionWidth });
      pdf
        .fontSize(8.5)
        .fillColor(COLOURS.muted)
        .text(`${row.quantity} ${row.unit}`, left + contentWidth - 214, rowTop, {
          width: 92,
          align: "right",
        });
      pdf
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(COLOURS.ink)
        .text(formatMoney(row.amount), left + contentWidth - 112, rowTop, {
          width: 100,
          align: "right",
        });
      pdf.y = rowTop + rowHeight - 8;
      pdf
        .moveTo(left + 12, pdf.y)
        .lineTo(left + contentWidth - 12, pdf.y)
        .strokeColor(COLOURS.line)
        .lineWidth(0.5)
        .stroke();
      pdf.y = rowTop + rowHeight;
    }
    pdf.y += 8;
  }

  ensureSpace(126);
  const totalsWidth = 238;
  const totalsX = left + contentWidth - totalsWidth;
  const totalRows = [
    { label: "Net total", amount: version.presentation.netTotal, bold: false },
    {
      label: `VAT (${version.presentation.vatRate}%)`,
      amount: version.presentation.vatAmount,
      bold: false,
    },
    { label: "Total including VAT", amount: version.presentation.grossTotal, bold: true },
  ];
  totalRows.forEach((row, index) => {
    const y = pdf.y + index * 30;
    if (row.bold) pdf.roundedRect(totalsX, y - 5, totalsWidth, 34, 5).fill(COLOURS.teal);
    pdf
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.bold ? 11 : 9.5)
      .fillColor(row.bold ? COLOURS.white : COLOURS.muted)
      .text(row.label, totalsX + 12, y + 5, { width: 130 });
    pdf.text(formatMoney(row.amount), totalsX + 142, y + 5, { width: 84, align: "right" });
  });
  pdf.y += 112;
  ensureSpace(70);
  pdf
    .moveTo(left, pdf.y)
    .lineTo(left + contentWidth, pdf.y)
    .strokeColor(COLOURS.line)
    .lineWidth(0.8)
    .stroke();
  pdf.y += 15;
  pdf
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLOURS.muted)
    .text(
      `Prepared by ${document.preparedByName}. This document records ${quote.reference} version ${version.versionNumber}. Any commercial change requires a new quote version.`,
      left,
      pdf.y,
      { width: contentWidth, lineGap: 3 },
    );

  const range = pdf.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    pdf.switchToPage(pageIndex);
    const footerY = pdf.page.height - 36;
    const bottomMargin = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf
      .moveTo(left, footerY - 9)
      .lineTo(left + contentWidth, footerY - 9)
      .strokeColor(COLOURS.line)
      .lineWidth(0.5)
      .stroke();
    pdf
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLOURS.muted)
      .text(`${quote.reference} - version ${version.versionNumber}`, left, footerY, {
        width: contentWidth / 2,
        lineBreak: false,
      });
    pdf.text(
      `Page ${pageIndex - range.start + 1} of ${range.count}`,
      left + contentWidth / 2,
      footerY,
      { width: contentWidth / 2, align: "right", lineBreak: false },
    );
    pdf.page.margins.bottom = bottomMargin;
  }
  pdf.end();
  return completed;
}
