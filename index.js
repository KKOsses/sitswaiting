require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ dest: 'public/uploads/' });

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ✅ รับภาพจาก LINE → อัปโหลด → ตรวจสลิป → ส่งข้อความกลับ
app.post('/webhook', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');

    const fileName = file.filename;
    const publicUrl = `https://${process.env.DOMAIN}/public/uploads/${fileName}`;
    console.log('📤 Uploaded File:', publicUrl);

    // ✅ เรียก API SlipOK ตรวจสอบ
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
    const data = response.data;
    console.log('✅ SlipOK Response:', data);
    const userId = data.data?.userId || ''; // ตรวจสอบว่าได้ userId มาหรือไม่

   if (data.code === 1009) {
     await replyText(userId, '⚠️ช่วงเวลา23:00-02:00 เป็นเวลาปรับปรุงระบบธนาคาร ทำให้ไม่สามารถตรวจสอบสลิปได้\nกรุณาส่งใหม่อีกครั้งในภายหลัง');
     return res.status(200).send('Bank unavailable');
   }

    if (!data?.data?.verified) {
     await replyText(userId, '❌ สลิปไม่ถูกต้อง กรุณาส่งใหม่อีกครั้ง');
      return res.status(200).send('Slip not verified');
    }

    // ✅ สร้างใบเสร็จ (ข้อความแบบ Flex)
   await replyFlexReceipt(userId, data.data, publicUrl);

    res.status(200).json({ verified: true, data: data.data });

  } catch (err) {
    console.error('❌ ERROR:', err.response?.data || err.message);
    res.status(500).send('Error verifying slip.');
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});

// ✅ ฟังก์ชันส่งข้อความกลับ LINE
async function replyText(userId, text) {
  return axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: userId,
      messages: [{ type: 'text', text }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

// ✅ ฟังก์ชันส่ง Flex Message ใบเสร็จ
async function replyFlexReceipt(userId, slip, receiptImageUrl) {
  const flex = {
    to: userId,
    messages: [{
      type: 'flex',
      altText: 'ใบเสร็จของคุณ',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: receiptImageUrl,
          size: 'full',
          aspectRatio: '4:3',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '✅ โอนเงินสำเร็จ',
              weight: 'bold',
              size: 'lg',
              color: '#1DB446'
            },
            {
              type: 'text',
              text: `ชื่อ: ${slip.sender_name}\nจำนวน: ${slip.amount} บาท\nเวลา: ${slip.transaction_date}`,
              size: 'sm',
              wrap: true
            }
          ]
        }
      }
    }]
  };

  return axios.post(
    'https://api.line.me/v2/bot/message/push',
    flex,
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

