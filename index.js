require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: 'public/uploads/' });

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.json());

// LINE Webhook
app.post('/webhook', upload.none(), async (req, res) => {
  const event = req.body.events?.[0];
  if (!event || event.type !== 'message' || event.message.type !== 'image') {
    return res.status(200).send('Not image type.');
  }

  const userId = event.source.userId;
  const messageId = event.message.id;
  console.log('📩 messageId:', messageId);

  try {
    const imageBuffer = await getImageFromLINE(messageId);
    const filePath = saveImageToLocal(imageBuffer, messageId);
    const publicUrl = `https://${process.env.DOMAIN}/public/uploads/${messageId}.jpg`;

    const slipResult = await verifySlipWithSlipOK(publicUrl);
    if (slipResult?.data?.verified) {
      await replyMessage(userId, `✅ ตรวจสอบแล้ว: ได้รับเงินจาก ${slipResult.data.sender_name || 'ไม่ทราบชื่อ'} จำนวน ${slipResult.data.amount} บาท`);
    } else {
      await replyMessage(userId, '❌ สลิปไม่ถูกต้อง กรุณาส่งใหม่');
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ ERROR:', err.message || err);
    await replyMessage(userId, '❌ เกิดข้อผิดพลาดขณะตรวจสอบสลิป');
    return res.status(500).send('Error');
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});

// ดึงรูปจาก LINE
async function getImageFromLINE(messageId) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });
  return response.data;
}

// บันทึกภาพ
function saveImageToLocal(buffer, name) {
  const filePath = path.join(__dirname, 'public/uploads', `${name}.jpg`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ตรวจสอบสลิป
async function verifySlipWithSlipOK(imageUrl) {
  const api = `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_BRANCH_ID}`;
  const response = await axios.post(api, { url: imageUrl }, {
    headers: {
      'x-authorization': process.env.SLIPOK_API_KEY,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

// ตอบกลับไลน์
async function replyMessage(to, text) {
  const payload = {
    to,
    messages: [{ type: 'text', text }]
  };

  await axios.post('https://api.line.me/v2/bot/message/push', payload, {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}
