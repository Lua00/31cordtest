const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/peerjs'
});

app.use('/peerjs', peerServer);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let rooms = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/rooms', (req, res) => {
    const { roomId, nickname } = req.body;
    if (!rooms[roomId]) {
        rooms[roomId] = { participants: [] };
    }
    rooms[roomId].participants.push({ nickname });
    res.json({ success: true, roomId });
});

app.post('/api/rooms/join', (req, res) => {
    const { roomId, nickname } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].participants.push({ nickname });
        res.json({ success: true, roomId });
    } else {
        res.status(404).json({ success: false, message: 'Oda bulunamadı' });
    }
});

app.get('/api/rooms', (req, res) => {
    const activeRooms = Object.keys(rooms).map(roomId => ({
        roomId,
        participants: rooms[roomId].participants
    }));
    res.json(activeRooms);
});

app.post('/api/participants', (req, res) => {
    const { roomId, peerId, nickname } = req.body;
    if (rooms[roomId]) {
        const participant = rooms[roomId].participants.find(p => p.nickname === nickname);
        if (participant) {
            participant.peerId = peerId;
        } else {
            rooms[roomId].participants.push({ nickname, peerId });
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Oda bulunamadı' });
    }
});

app.get('/api/participants/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (rooms[roomId]) {
        res.json(rooms[roomId].participants);
    } else {
        res.status(404).json({ success: false, message: 'Oda bulunamadı' });
    }
});

app.delete('/api/participants/:roomId/:peerId', (req, res) => {
    const { roomId, peerId } = req.params;
    if (rooms[roomId]) {
        rooms[roomId].participants = rooms[roomId].participants.filter(p => p.peerId !== peerId);
        if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Oda bulunamadı' });
    }
});

app.post('/api/rooms/:roomId/leave', (req, res) => {
    const { roomId } = req.params;
    const { nickname } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].participants = rooms[roomId].participants.filter(p => p.nickname !== nickname);
        if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Oda bulunamadı' });
    }
});

io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı');

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});
