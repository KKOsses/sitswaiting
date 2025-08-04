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

app.post('/webhook', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');

    const fileName = file.filename;
    const publicUrl = `https://${process.env.DOMAIN}/public/uploads/${fileName}`;
    console.log('📤 Uploaded File:', publicUrl);

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
    res.status(200).json({ verified: true, result: response.data });

  } catch (err) {
    console.error('❌ ERROR:', err.response?.data || err.message);
    res.status(500).send('Error verifying slip.');
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
