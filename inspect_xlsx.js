
const XLSX = require('xlsx');
const path = '/Users/yogs87/Downloads/1 Crore Online SHoppers Data/India-Online-Shoppers-6-Lack.xlsx';

try {
  const workbook = XLSX.readFile(path, { sheetRows: 5 });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  console.log('Headers/Sample for:', path);
  console.log(JSON.stringify(data[0], null, 2));
} catch (e) {
  console.error('Error reading XLSX:', e.message);
}
