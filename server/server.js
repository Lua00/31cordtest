const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();

const mongoUrl = 'mongodb+srv://14at558:sU55mLitfA3WDwkx@31cord.fvq5d.mongodb.net/?retryWrites=true&w=majority&appName=31CORD';
const dbName = '31CORD';

app.use(express.json());

let db;

MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    console.log('MongoDB\'ye başarıyla bağlandı');
    db = client.db(dbName);
  })
  .catch(error => console.error('MongoDB bağlantı hatası:', error));

// Oda oluşturma
app.post('/api/rooms', async (req, res) => {
  try {
    const { roomId, nickname } = req.body;
    const room = {
      roomId: roomId,
      createdBy: nickname,
      participants: [nickname]
    };
    await db.collection('rooms').insertOne(room);
    res.json({ success: true, roomId: roomId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Oda oluşturulamadı' });
  }
});

// Odaya katılma
app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomId, nickname } = req.body;
    const room = await db.collection('rooms').findOne({ roomId: roomId });
    if (!room) {
      return res.status(404).json({ success: false, message: 'Oda bulunamadı' });
    }
    await db.collection('rooms').updateOne(
      { roomId: roomId },
      { $addToSet: { participants: nickname } }
    );
    res.json({ success: true, roomId: roomId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Odaya katılınamadı' });
  }
});

// Odadan ayrılma
app.post('/api/rooms/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { nickname } = req.body;
    await db.collection('rooms').updateOne(
      { roomId: roomId },
      { $pull: { participants: nickname } }
    );
    const room = await db.collection('rooms').findOne({ roomId: roomId });
    if (room && room.participants.length === 0) {
      await db.collection('rooms').deleteOne({ roomId: roomId });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Odadan ayrılma işlemi başarısız oldu' });
  }
});

// Aktif odaları getirme
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await db.collection('rooms').find().toArray();
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Odalar getirilemedi' });
  }
});

// Katılımcı ekleme

app.post('/api/participants', async (req, res) => {
  try {
    await db.collection('participants').insertOne(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Katılımcı eklenemedi' });
  }
});

// Katılımcı silme
app.delete('/api/participants/:roomId/:peerId', async (req, res) => {
  try {
    await db.collection('participants').deleteOne({
      roomId: req.params.roomId,
      peerId: req.params.peerId
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Katılımcı silinemedi' });
  }
});

// Mesaj gönderme
app.post('/api/messages/:roomId', async (req, res) => {
  try {
    await db.collection('messages').insertOne({
      roomId: req.params.roomId,
      ...req.body
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesaj gönderilemedi' });
  }
});

// Mesajları getirme
app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const messages = await db.collection('messages')
      .find({ roomId: req.params.roomId })
      .sort({ timestamp: 1 })
      .toArray();
    res.json(messages);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesajlar getirilemedi' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
