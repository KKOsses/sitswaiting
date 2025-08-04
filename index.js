require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const upload = multer({ dest: 'public/uploads/' });
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/webhook', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const body = req.body;
    const userId = body.userId;

    if (!file || !userId) return res.status(400).send('Missing file or userId');

    const fileName = `${uuidv4()}.jpg`;
    const newPath = `public/uploads/${fileName}`;
    fs.renameSync(file.path, newPath);

    const publicUrl = `https://${process.env.DOMAIN}/public/uploads/${fileName}`;
    console.log('📤 Uploaded File:', publicUrl);

    // ส่งไปตรวจสอบกับ SlipOK
    const slipResponse = await axios.post(
      `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_BRANCH_ID}`,
      { url: publicUrl },
      {
        headers: {
          'x-authorization': process.env.SLIPOK_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = slipResponse.data;
    console.log('✅ SlipOK result:', result);

    if (result?.data?.verified) {
      // 📄 สร้างใบเสร็จ URL (จำลองเป็นภาพสลิปเลย)
      const receiptImageUrl = publicUrl;

      await replyFlexReceipt(userId, result.data, receiptImageUrl);
    } else {
      await replyText(userId, '❌ สลิปไม่ถูกต้อง กรุณาส่งใหม่อีกครั้ง');
    }

    res.status(200).send('OK');

  } catch (err) {
    console.error('❌ ERROR:', err.response?.data || err.message);
    res.status(500).send('Error verifying slip.');
  }
});

async function replyText(userId, text) {
  return axios.post('https://api.line.me/v2/bot/message/push', {
    to: userId,
    messages: [{ type: 'text', text }]
  }, {
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

async function replyFlexReceipt(userId, slip, receiptUrl) {
  const flexMessage = {
    to: userId,
    messages: [{
      type: 'flex',
      altText: 'ใบเสร็จรับเงินของคุณ',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: receiptUrl,
          size: 'full',
          aspectRatio: '4:3',
          aspectMode: 'fit'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: '✅ รับเงินเรียบร้อย',
              weight: 'bold',
              size: 'lg',
              color: '#1DB446'
            },
            {
              type: 'text',
              text: `จาก: ${slip.sender_name}\nจำนวน: ${slip.amount} บาท\nเวลา: ${slip.transaction_date}`,
              wrap: true,
              size: 'sm'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#1DB446',
            action: {
              type: 'uri',
              label: 'เปิดใบเสร็จ',
              uri: receiptUrl
            }
          }]
        }
      }
    }]
  };

  await axios.post('https://api.line.me/v2/bot/message/push', flexMessage, {
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
