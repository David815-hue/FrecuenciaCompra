import * as XLSX from 'xlsx';

const RMS_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-x6oan91deeTNI7zSDoxK7OoxkZJtAU13krsHxij8Ujv07f_H9R5YHA7wUwLwXw/pub?output=csv";

async function run() {
  try {
    console.log("Downloading Google Sheet...");
    const response = await fetch(RMS_SHEET_URL);
    if (!response.ok) {
      throw new Error(`Google Sheet download failed with status ${response.status}`);
    }

    const csvText = await response.text();
    console.log("Parsing CSV...");
    const workbook = XLSX.read(csvText, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

    console.log(`Parsed ${rows.length} total rows.`);

    console.log("\nSearching for rows matching order number 87855 (clean or raw)...");
    const matchingRows = rows.filter(row => {
      const rawOrderId = row['NoPEdido'] || row['NoPedido'] || row['Pedido'] || '';
      const orderId = String(rawOrderId).split('-')[0].replace(/^0+/, '').trim();
      return orderId === '87855';
    });

    console.log(`Found ${matchingRows.length} matching rows in the spreadsheet:`);
    matchingRows.forEach((row, idx) => {
      console.log(`\nRow #${idx + 1}:`);
      console.log(JSON.stringify(row, null, 2));
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
