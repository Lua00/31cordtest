const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { ExpressPeerServer } = require('peer');
const path = require('path');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const mongoUrl = 'mongodb+srv://14at558:sU55mLitfA3WDwkx@31cord.fvq5d.mongodb.net/?retryWrites=true&w=majority&appName=31CORD';
const dbName = '31CORD';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});

app.use('/peerjs', peerServer);

let db;

MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    console.log('MongoDB\'ye başarıyla bağlandı');
    db = client.db(dbName);
  })
  .catch(error => console.error('MongoDB bağlantı hatası:', error));

// API rotaları
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await db.collection('rooms').find().toArray();
    res.json(rooms);
  } catch (error) {
    console.error('Odaları getirme hatası:', error);
    res.status(500).json({ error: 'Odalar getirilemedi' });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { roomId, nickname } = req.body;
    const room = {
      roomId: roomId,
      createdBy: nickname,
      participants: [nickname],
      createdAt: new Date()
    };
    const result = await db.collection('rooms').insertOne(room);
    res.json({ success: true, roomId: roomId });
  } catch (error) {
    console.error('Oda oluşturma hatası:', error);
    res.status(500).json({ error: 'Oda oluşturulamadı' });
  }
});

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
    console.error('Odaya katılma hatası:', error);
    res.status(500).json({ error: 'Odaya katılınamadı' });
  }
});

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
    console.error('Odadan ayrılma hatası:', error);
    res.status(500).json({ error: 'Odadan ayrılma işlemi başarısız oldu' });
  }
});

app.post('/api/participants', async (req, res) => {
  try {
    await db.collection('participants').insertOne(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Katılımcı ekleme hatası:', error);
    res.status(500).json({ error: 'Katılımcı eklenemedi' });
  }
});

app.delete('/api/participants/:roomId/:peerId', async (req, res) => {
  try {
    await db.collection('participants').deleteOne({
      roomId: req.params.roomId,
      peerId: req.params.peerId
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Katılımcı silme hatası:', error);
    res.status(500).json({ error: 'Katılımcı silinemedi' });
  }
});

app.post('/api/messages/:roomId', async (req, res) => {
  try {
    await db.collection('messages').insertOne({
      roomId: req.params.roomId,
      ...req.body
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    res.status(500).json({ error: 'Mesaj gönderilemedi' });
  }
});

app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const messages = await db.collection('messages')
      .find({ roomId: req.params.roomId })
      .sort({ timestamp: 1 })
      .toArray();
    res.json(messages);
  } catch (error) {
    console.error('Mesajları getirme hatası:', error);
    res.status(500).json({ error: 'Mesajlar getirilemedi' });
  }
});

// Tüm GET isteklerini index.html'e yönlendir
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı');

  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).broadcast.emit('user-connected', userId);

    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
