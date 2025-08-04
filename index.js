require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

async function sendLineMessage(userId, messageText) {
  try {
    await axios.post(
      LINE_API_URL,
      {
        to: userId,
        messages: [{ type: 'text', text: messageText }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('❌ LINE ERROR:', err.response?.data || err.message);
  }
}


const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ dest: 'public/uploads/' });

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/webhook', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.body.userId; // <-- ต้องส่งมาด้วย

    if (!file || !userId) return res.status(400).send('Missing image or userId.');

    const fileName = file.filename;
    const publicUrl = `https://${process.env.DOMAIN}/public/uploads/${fileName}`;
    console.log('📤 Uploaded File:', publicUrl);

    // Call SlipOK
    const response = await axios.post(
      `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_BRANCH_ID}`,
      { url: publicUrl },
      {
        headers: {
          'x-authorization': process.env.SLIPOK_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ SlipOK response:', response.data);

    // Check result & Send LINE message
    const slipData = response.data.data;
    if (response.data.success && slipData?.verified) {
      const msg = `✅ ตรวจสอบสลิปเรียบร้อยแล้ว\nชื่อผู้โอน: ${slipData.sender_name}\nจำนวน: ${slipData.amount} บาท\nเวลา: ${slipData.transaction_date}`;
      await sendLineMessage(userId, msg);
    } else {
      await sendLineMessage(userId, '❌ สลิปไม่ถูกต้อง กรุณาส่งใหม่อีกครั้ง');
    }

    res.status(200).json({ verified: true, result: response.data });

  } catch (err) {
    console.error('❌ ERROR:', err.response?.data || err.message);
    res.status(500).send('Error verifying slip.');
  }
});


app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});

