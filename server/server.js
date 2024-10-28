const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { ExpressPeerServer } = require('peer');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const mongoUrl = 'mongodb+srv://14at558:sU55mLitfA3WDwkx@31cord.fvq5d.mongodb.net/?retryWrites=true&w=majority&appName=31CORD';
const dbName = '31CORD';

app.use(express.json());
app.use(express.static('public'));

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

// Hata yakalama middleware'i
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

// Aktif odaları getirme
app.get('/api/rooms', async (req, res, next) => {
  try {
    const rooms = await db.collection('rooms').find().toArray();
    console.log('Aktif odalar:', rooms);
    res.json(rooms);
  } catch (error) {
    console.error('Odaları getirme hatası:', error);
    next(error);
  }
});

// Oda oluşturma
app.post('/api/rooms', async (req, res, next) => {
  try {
    const { roomId, nickname } = req.body;
    const room = {
      roomId: roomId,
      createdBy: nickname,
      participants: [nickname],
      createdAt: new Date()
    };
    const result = await db.collection('rooms').insertOne(room);
    console.log('Oda oluşturuldu:', result);
    res.json({ success: true, roomId: roomId });
  } catch (error) {
    console.error('Oda oluşturma hatası:', error);
    next(error);
  }
});

// Odaya katılma
app.post('/api/rooms/join', async (req, res, next) => {
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
    next(error);
  }
});

// Odadan ayrılma
app.post('/api/rooms/:roomId/leave', async (req, res, next) => {
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
    next(error);
  }
});

// Katılımcı ekleme
app.post('/api/participants', async (req, res, next) => {
  try {
    const result = await db.collection('participants').insertOne(req.body);
    console.log('Katılımcı eklendi:', result);
    res.json({ success: true });
  } catch (error) {
    console.error('Katılımcı ekleme hatası:', error);
    next(error);
  }
});

// Katılımcı silme
app.delete('/api/participants/:roomId/:peerId', async (req, res, next) => {
  try {
    const result = await db.collection('participants').deleteOne({
      roomId: req.params.roomId,
      peerId: req.params.peerId
    });
    console.log('Katılımcı silindi:', result);
    res.json({ success: true });
  } catch (error) {
    console.error('Katılımcı silme hatası:', error);
    next(error);
  }
});

// Mesaj gönderme
app.post('/api/messages/:roomId', async (req, res, next) => {
  try {
    const result = await db.collection('messages').insertOne({
      roomId: req.params.roomId,
      ...req.body
    });
    console.log('Mesaj gönderildi:', result);
    res.json({ success: true });
  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    next(error);
  }
});

// Mesajları getirme
app.get('/api/messages/:roomId', async (req, res, next) => {
  try {
    const messages = await db.collection('messages')
      .find({ roomId: req.params.roomId })
      .sort({ timestamp: 1 })
      .toArray();
    res.json(messages);
  } catch (error) {
    console.error('Mesajları getirme hatası:', error);
    next(error);
  }
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
