import fs from 'fs';
import path from 'path';

export async function generateReceiptImage(slipData) {
  const fileName = `receipt_${Date.now()}.png`;
  const imagePath = path.join('public/uploads', fileName);

  // 👇 ใช้ template PNG เปล่า (หรือสร้างใหม่เองได้)
  fs.copyFileSync('public/receipt-template.png', imagePath); // Replace this with dynamic drawing logic

  return `https://sitswaiting.onrender.com/public/uploads/${fileName}`;
}

