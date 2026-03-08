export const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0
  }).format(amount);

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatInvoiceDate = (dateValue) =>
  new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(dateValue);

const getSafeItems = (items) =>
  items.map((item) => ({
    name: item.name || "Unnamed item",
    variation: item.variation || "",
    qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
    unitPrice: Number(item.unitPrice) || 0
  }));

const createInvoiceHtml = ({
  invoiceNumber,
  orderId,
  invoiceDate,
  buyerName,
  buyerEmail,
  status,
  storeName,
  items,
  shippingFee,
  note
}) => {
  const safeItems = getSafeItems(items);
  const subtotal = safeItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const total = subtotal + shippingFee;
  const rows = safeItems
    .map(
      (item) => `
      <tr>
        <td>
          ${escapeHtml(item.name)}
          ${item.variation ? `<div class="variation">${escapeHtml(item.variation)}</div>` : ""}
        </td>
        <td class="qty">${item.qty}</td>
        <td class="amount">${formatPhp(item.unitPrice)}</td>
        <td class="amount">${formatPhp(item.qty * item.unitPrice)}</td>
      </tr>
    `
    )
    .join("");

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(invoiceNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; color: #111827; }
      .page { max-width: 860px; margin: 0 auto; padding: 32px 24px; }
      .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; }
      .brand h1 { margin: 0; font-size: 26px; color: #065f46; }
      .brand p { margin: 4px 0 0; color: #4b5563; font-size: 13px; }
      .meta { text-align: right; }
      .meta p { margin: 2px 0; font-size: 13px; color: #374151; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
      .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
      .card h2 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; }
      .card p { margin: 4px 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 22px; }
      th { text-align: left; padding: 10px; font-size: 12px; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
      td { padding: 12px 10px; border-bottom: 1px solid #f3f4f6; font-size: 14px; vertical-align: top; }
      td.qty, td.amount { text-align: right; white-space: nowrap; }
      .variation { margin-top: 2px; font-size: 12px; color: #6b7280; }
      .summary { margin-top: 14px; margin-left: auto; width: min(320px, 100%); }
      .summary-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 14px; color: #374151; }
      .summary-row.total { border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 11px; font-size: 17px; font-weight: 700; color: #111827; }
      .note { margin-top: 24px; font-size: 12px; color: #6b7280; }
      @media print { .page { padding: 18px; } }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <div class="brand">
          <h1>Belfiore Succulents PH</h1>
          <p>Official Sales Invoice</p>
        </div>
        <div class="meta">
          <p><strong>Invoice No:</strong> ${escapeHtml(invoiceNumber)}</p>
          <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
          <p><strong>Date:</strong> ${escapeHtml(formatInvoiceDate(invoiceDate))}</p>
        </div>
      </section>

      <section class="grid">
        <div class="card">
          <h2>Sold To</h2>
          <p><strong>${escapeHtml(buyerName)}</strong></p>
          <p>${escapeHtml(buyerEmail)}</p>
        </div>
        <div class="card">
          <h2>Order Details</h2>
          <p><strong>Status:</strong> ${escapeHtml(status)}</p>
          <p><strong>Store:</strong> ${escapeHtml(storeName)}</p>
        </div>
      </section>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="qty">Qty</th>
            <th class="amount">Unit Price</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <section class="summary">
        <div class="summary-row">
          <span>Subtotal</span>
          <span>${formatPhp(subtotal)}</span>
        </div>
        <div class="summary-row">
          <span>Shipping</span>
          <span>${shippingFee === 0 ? "FREE" : formatPhp(shippingFee)}</span>
        </div>
        <div class="summary-row total">
          <span>Total</span>
          <span>${formatPhp(total)}</span>
        </div>
      </section>

      <p class="note">${escapeHtml(note)}</p>
    </main>
  </body>
</html>
`;
};

export const getBuyerDetails = () => {
  if (typeof window === "undefined") {
    return {
      name: "Valued Customer",
      email: "No email provided"
    };
  }

  return {
    name: window.localStorage.getItem("customerName") || "Valued Customer",
    email: window.localStorage.getItem("customerEmail") || "No email provided"
  };
};

export const getNextInvoiceNumber = (dateValue = new Date()) => {
  if (typeof window === "undefined") {
    return `INV-${dateValue.getFullYear()}-00001`;
  }

  const sequenceKey = "invoiceSequence";
  const currentSequence = Number.parseInt(window.localStorage.getItem(sequenceKey) || "0", 10);
  const nextSequence = Number.isFinite(currentSequence) && currentSequence > 0 ? currentSequence + 1 : 1;

  window.localStorage.setItem(sequenceKey, String(nextSequence));
  return `INV-${dateValue.getFullYear()}-${String(nextSequence).padStart(5, "0")}`;
};

export const printInvoice = ({
  invoiceNumber,
  orderId,
  invoiceDate,
  buyerName,
  buyerEmail,
  status,
  storeName,
  items,
  shippingFee = 0,
  note = "Thank you for shopping with Belfiore Succulents PH. This document serves as your generated sales invoice."
}) => {
  if (typeof window === "undefined") {
    return false;
  }

  let invoiceHtml = "";
  try {
    invoiceHtml = createInvoiceHtml({
      invoiceNumber,
      orderId,
      invoiceDate,
      buyerName,
      buyerEmail,
      status,
      storeName,
      items,
      shippingFee,
      note
    });
  } catch (error) {
    console.error("Failed to create invoice HTML:", error);
    window.alert("Unable to generate invoice. Please try again.");
    return false;
  }

  const invoiceWindow = window.open("", "_blank", "width=960,height=780");

  if (!invoiceWindow) {
    window.alert("Please allow pop-ups first to download your invoice.");
    return false;
  }

  try {
    invoiceWindow.document.open();
    invoiceWindow.document.write(invoiceHtml);
    invoiceWindow.document.close();

    window.setTimeout(() => {
      if (!invoiceWindow.closed) {
        invoiceWindow.focus();
        invoiceWindow.print();
      }
    }, 200);
  } catch (error) {
    console.error("Failed to write invoice window:", error);
    window.alert("Unable to render invoice window. Please try again.");
    return false;
  }

  return true;
};
