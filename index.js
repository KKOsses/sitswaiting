import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateReceiptImage } from './utils/receiptGenerator.js';

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Setup Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads');
  },
  filename: function (req, file, cb) {
    const fileName = `${Date.now()}-${file.originalname}`;
    cb(null, fileName);
  }
});
const upload = multer({ storage: storage });

// Webhook Route
app.post('/webhook', upload.single('file'), async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.message.type !== 'image') return res.sendStatus(200);

    const userId = event.source.userId;
    const messageId = event.message.id;

    // 1. ดึงรูปภาพจาก LINE
    const imageResponse = await axios.get(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
        responseType: 'arraybuffer'
      }
    );

    // 2. เซฟรูปลง uploads/
    const fileName = `${messageId}.jpg`;
    const imagePath = path.join(__dirname, 'public/uploads', fileName);
    fs.writeFileSync(imagePath, Buffer.from(imageResponse.data, 'binary'));

    const slipUrl = `https://sitswaiting.onrender.com/public/uploads/${fileName}`;

    // 3. ส่งตรวจสอบกับ SlipOK
    const response = await axios.post(process.env.SLIPOK_API_ENDPOINT, { url: slipUrl });
    const slipData = response.data?.data;

    if (!slipData || !slipData.verified) {
      await pushText(userId, "❌ สลิปไม่ถูกต้อง กรุณาส่งใหม่อีกครั้ง");
      return res.sendStatus(200);
    }

    // 4. สร้างใบเสร็จ PNG
    const receiptImageUrl = await generateReceiptImage(slipData);

    // 5. ส่ง Flex Message
    await pushFlexReceipt(userId, slipData, receiptImageUrl);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.sendStatus(500);
  }
});

// Text Message
async function pushText(to, message) {
  await axios.post('https://api.line.me/v2/bot/message/push', {
    to,
    messages: [{ type: 'text', text: message }]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// Flex Message
async function pushFlexReceipt(to, slip, imageUrl) {
  const bubble = {
    type: 'bubble',
    hero: { type: 'image', url: imageUrl, size: 'full', aspectRatio: '4:3', aspectMode: 'fit' },
    body: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: '✅ รับเงินเรียบร้อย', weight: 'bold', size: 'lg', color: '#1DB446' },
        { type: 'text', text: `จาก: ${slip.sender_name}\nจำนวน: ${slip.amount} บาท\nเวลา: ${slip.transaction_date}`, size: 'sm', wrap: true }
      ]
    }
  };

  await axios.post('https://api.line.me/v2/bot/message/push', {
    to,
    messages: [{ type: 'flex', altText: 'ใบเสร็จรับเงินของคุณ', contents: bubble }]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Server is running on port ${process.env.PORT}`);
});

