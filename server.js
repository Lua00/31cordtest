// server.js
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

// public/index.html
<!DOCTYPE html>
<html lang="tr" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modern Video Chat</title>
    <link href="/output.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 dark:bg-gray-900 h-full">
    <div class="flex flex-col h-full">
        <header class="bg-white dark:bg-gray-800 shadow">
            <nav class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Top">
                <div class="flex w-full items-center justify-between border-b border-indigo-500 py-6 lg:border-none">
                    <div class="flex items-center">
                        <a href="#">
                            <span class="sr-only">Modern Video Chat</span>
                            <i class="fas fa-video text-indigo-600 text-2xl mr-2"></i>
                        </a>
                        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Modern Video Chat</h1>
                    </div>
                    <div class="ml-10 space-x-4">
                        <button id="createRoomBtn" class="inline-block bg-indigo-600 py-2 px-4 border border-transparent rounded-md text-base font-medium text-white hover:bg-opacity-75">Oda Oluştur</button>
                        <button id="joinRoomBtn" class="inline-block bg-white py-2 px-4 border border-transparent rounded-md text-base font-medium text-indigo-600 hover:bg-indigo-50">Odaya Katıl</button>
                    </div>
                </div>
            </nav>
        </header>

        <main class="flex-grow">
            <div class="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
                <div id="current-room-id" class="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-4 hidden" role="alert">
                    <p class="font-bold">Mevcut Oda ID:</p>
                    <p id="room-id-display"></p>
                </div>

                <div id="video-controls" class="mb-4 hidden">
                    <button id="toggle-audio" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2">
                        <i class="fas fa-microphone"></i> Mikrofon
                    </button>
                    <button id="toggle-video" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2">
                        <i class="fas fa-video"></i> Kamera
                    </button>
                    <button id="share-screen" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
                        <i class="fas fa-desktop"></i> Ekran Paylaş
                    </button>
                </div>

                <div id="participants-container" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4"></div>

                <button id="leave-room-btn" class="mt-4 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm hidden">
                    Odadan Ayrıl
                </button>

                <div class="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg mt-6">
                    <div class="px-4 py-5 sm:px-6">
                        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                            Aktif Odalar
                        </h3>
                    </div>
                    <ul id="active-rooms-list" class="divide-y divide-gray-200 dark:divide-gray-700"></ul>
                </div>
            </div>
        </main>

        <footer class="bg-white dark:bg-gray-800">
            <div class="mx-auto max-w-7xl py-4 px-4 sm:px-6 lg:px-8">
                <p class="text-center text-sm text-gray-500 dark:text-gray-400">
                    &copy; 2023 Modern Video Chat. Tüm hakları saklıdır.
                </p>
            </div>
        </footer>
    </div>

    <!-- Create Room Modal -->
    <div id="createRoomModal" class="fixed z-10 inset-0 overflow-y-auto hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div class="sm:flex sm:items-start">
                        <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                            <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                Yeni Oda Oluştur
                            </h3>
                            <div class="mt-2">
                                <input type="text" id="create-nickname-input" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" placeholder="Takma Adınız">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm" onclick="createRoom()">
                        Oda Oluştur
                    </button>
                    <button type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" onclick="closeModal('createRoomModal')">
                        İptal
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Join Room Modal -->
    <div id="joinRoomModal" class="fixed z-10 inset-0 overflow-y-auto hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div class="sm:flex sm:items-start">
                        <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                            <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                Odaya Katıl
                            </h3>
                            <div class="mt-2">
                                <input type="text" id="join-nickname-input" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" placeholder="Takma Adınız">
                                <input type="text" id="room-input" class="mt-3 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" placeholder="Oda ID">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm" onclick="joinRoom()">
                        Odaya  Katıl
                    </button>
                    <button type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" onclick="closeModal('joinRoomModal')">
                        İptal
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div id="notification" class="fixed bottom-5 right-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-sm w-full hidden" role="alert">
        <div class="flex items-center">
            <div class="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 text-blue-500 bg-blue-100 rounded-lg">
                <i class="fas fa-info"></i>
            </div>
            <div class="ml-3 text-sm font-normal text-gray-800 dark:text-gray-200" id="notification-text"></div>
        </div>
    </div>

    <button id="toggle-dark-mode" class="fixed bottom-5 left-5 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
        <i class="fas fa-moon dark:hidden"></i>
        <i class="fas fa-sun hidden dark:inline"></i>
    </button>

    <script src="https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <script src="./renderer.js"></script>
</body>
</html>

// public/renderer.js
let room_id;
let local_stream;
let screenStream;
let peer = null;
let connections = {};
let screenSharing = false;
let nickname = "";
let participants = {};
let isMuted = false;
let isCameraOff = false;

const socket = io('/');

const API_BASE_URL = window.location.origin;

function createRoom() {
    nickname = document.getElementById("create-nickname-input").value;
    if (!nickname) {
        notify("Lütfen takma adınızı girin.");
        return;
    }

    room_id = generateRoomId();
    document.getElementById("room-input").value = room_id;
    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").classList.remove("hidden");
    
    fetch(`${API_BASE_URL}/api/rooms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId: room_id, nickname: nickname }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log("Oda başarıyla oluşturuldu:", data);
            initializePeer();
            notify("Oda başarıyla oluşturuldu.");
            closeModal('createRoomModal');
        } else {
            console.error("Oda oluşturma başarısız:", data);
            notify("Oda oluşturulamadı. Lütfen tekrar deneyin.");
        }
    })
    .catch(error => {
        console.error('Oda oluşturma hatası:', error);
        notify("Oda oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.");
    });
}

function joinRoom() {
    nickname = document.getElementById("join-nickname-input").value;
    if (!nickname) {
        notify("Lütfen takma adınızı girin.");
        return;
    }

    room_id = document.getElementById("room-input").value;
    if (!room_id || !/^\d{8,}$/.test(room_id)) {
        notify("Lütfen geçerli bir oda ID'si girin (en az 8 rakam).");
        return;
    }

    fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId: room_id, nickname: nickname }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log("Odaya başarıyla katılındı:", data);
            document.getElementById("room-id-display").textContent = room_id;
            document.getElementById("current-room-id").classList.remove("hidden");
            initializePeer();
            notify("Odaya başarıyla katıldınız.");
            closeModal('joinRoomModal');
        } else {
            console.error("Odaya katılma başarısız:", data);
            notify("Odaya katılınamadı. Lütfen geçerli bir oda ID'si girdiğinizden emin olun.");
        }
    })
    .catch(error => {
        console.error('Odaya katılma hatası:', error);
        notify("Odaya katılırken bir hata oluştu. Lütfen tekrar deneyin.");
    });
}

function initializePeer() {
    peer = new Peer(undefined, {
        host: '/',
        path: '/peerjs'
    });

    peer.on('open', async (id) => {
        console.log('My peer ID is: ' + id);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            local_stream = stream;
            addParticipant(nickname, stream, id);
            document.getElementById('leave-room-btn').classList.remove('hidden');
            document.getElementById('video-controls').classList.remove('hidden');
            updateActiveRooms();
            connectToExistingPeers();
        } catch (error) {
            console.error('Medya erişimi hatası:', error);
            notify('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
        }
    });

    peer.on('call', handleIncomingCall);
}

function connectToExistingPeers() {
    fetch(`${API_BASE_URL}/api/participants/${room_id}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(participants => {
            participants.forEach(participant => {
                if (participant.peerId !== peer.id) {
                    const call = peer.call(participant.peerId, local_stream, { metadata: { nickname } });
                    handleOutgoingCall(call);
                }
            });
        })
        .catch(error => console.error('Mevcut katılımcıları alma hatası:', error));
}

async function handleIncomingCall(call) {
    try {
        call.answer(local_stream);
        call.on('stream', (remoteStream) => {
            addParticipant(call.metadata.nickname, remoteStream, call.peer);
        });
    } catch (error) {
        console.error('Gelen çağrı hatası:', error);
    }
}

function handleOutgoingCall(call) {
    call.on('stream', (remoteStream) => {
        addParticipant(call.metadata.nickname, remoteStream, call.peer);
    });
}

function addParticipant(name, stream, peerId) {
    console.log(`Adding participant: ${name}, PeerID: ${peerId}`);
    if (participants[peerId]) {
        console.log(`${name} (${peerId}) zaten katılımcı listesinde var.`);
        participants[peerId].video.srcObject = stream;
        return;
    }

    let container = document.createElement("div");
    container.className = "participant-video";
    container.id = `participant-${peerId}`;
    container.innerHTML = `
        <h5>${name}</h5>
        <video class="w-full h-auto" controls autoplay ${peerId === peer.id ? 'muted' : ''}></video>
    `;
    document.getElementById("participants-container").appendChild(container);

    let video = container.querySelector("video");
    video.srcObject = stream;
    participants[peerId] = { video, stream, name };
    console.log(`Participant added: ${name}, PeerID: ${peerId}`);
    console.log("Current participants:", Object.keys(participants));

    fetch(`${API_BASE_URL}/api/participants`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId: room_id, peerId: peerId, nickname: name }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => console.log('Katılımcı başarıyla eklendi:', data))
    .catch(error => console.error('Katılımcı ekleme hatası:', error));
}

function removeParticipant(peerId) {
    if (participants[peerId]) {
        let participantDiv = document.getElementById(`participant-${peerId}`);
        if (participantDiv) {
            participantDiv.remove();
        }
        delete participants[peerId];
        console.log(`Participant removed: ${peerId}`);
        console.log("Current participants:", Object.keys(participants));

        fetch(`${API_BASE_URL}/api/participants/${room_id}/${peerId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => console.log('Katılımcı başarıyla silindi:', data))
        .catch(error => console.error('Katılımcı silme hatası:', error));
    }
}

function leaveRoom() {
    if (peer) {
        peer.destroy();
    }
    if (local_stream) {
        local_stream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('participants-container').innerHTML = '';
    document.getElementById('leave-room-btn').classList.add('hidden');
    document.getElementById('video-controls').classList.add('hidden');
    document.getElementById('room-input').value = '';
    document.getElementById('current-room-id').classList.add('hidden');
    
    fetch(`${API_BASE_URL}/api/rooms/${room_id}/leave`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nickname: nickname }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => console.log('Odadan başarıyla ayrıldı:', data))
    .catch(error => console.error('Odadan ayrılma hatası:', error));

    participants = {};
    connections = {};
    notify("Odadan ayrıldınız.");
}

function notify(msg) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    notificationText.textContent = msg;
    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

function generateRoomId() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function updateActiveRooms() {
    fetch(`${API_BASE_URL}/api/rooms`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(rooms => {
            updateActiveRoomsList(rooms);
        })
        .catch(error => {
            console.error('Aktif odaları getirme hatası:', error);
            document.getElementById('active-rooms-list').innerHTML = '<li class="list-group-item">Odalar yüklenirken bir hata oluştu.</li>';
        });
}

function updateActiveRoomsList(rooms) {
    const activeRoomsList = document.getElementById('active-rooms-list');
    activeRoomsList.innerHTML = '';
    if (rooms.length === 0) {
        activeRoomsList.innerHTML = '<li class="px-4 py-2">Aktif oda bulunmuyor.</li>';
    } else {
        rooms.forEach(room => {
            const listItem = document.createElement('li');
            listItem.className = 'px-4 py-2 flex justify-between items-center';
            listItem.innerHTML = `
                <span>${room.roomId}</span>
                <span class="text-sm text-gray-500">${room.participants.length} katılımcı</span>
                <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-sm" onclick="joinRoom('${room.roomId}')">Katıl</button>
            `;
            activeRoomsList.appendChild(listItem);
        });
    }
}

function toggleAudio() {
    if (local_stream) {
        const audioTrack = local_stream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !audioTrack.enabled;
            document.getElementById('toggle-audio').innerHTML = isMuted ? 
                '<i class="fas fa-microphone-slash"></i> Mikrofon Aç' : 
                '<i class="fas fa-microphone"></i> Mikrofon Kapat';
            notify(isMuted ? "Mikrofonunuz kapatıldı." : "Mikrofonunuz açıldı.");
        }
    }
}

function toggleVideo() {
    if (local_stream) {
        const videoTrack = local_stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isCameraOff = !videoTrack.enabled;
            document.getElementById('toggle-video').innerHTML = isCameraOff ? 
                '<i class="fas fa-video-slash"></i> Kamera Aç' : 
                '<i class="fas fa-video"></i> Kamera Kapat';
            notify(isCameraOff ? "Kameranız kapatıldı." : "Kameranız açıldı.");
        }
    }
}

async function shareScreen() {
    if (!screenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            
            Object.values(connections).forEach((connection) => {
                const sender = connection.peerConnection.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            });

            screenSharing = true;
            document.getElementById('share-screen').innerHTML = '<i class="fas fa-desktop"></i> Ekran Paylaşımını Durdur';
            notify("Ekran paylaşımı başlatıldı.");

            videoTrack.onended = () => {
                stopScreenSharing();
            };
        } catch (error) {
            console.error("Ekran paylaşımı hatası:", error);
            notify("Ekran paylaşımı başlatılamadı.");
        }
    } else {
        stopScreenSharing();
    }
}

function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        
        const videoTrack = local_stream.getVideoTracks()[0];
        Object.values(connections).forEach((connection) => {
            const sender = connection.peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(videoTrack);
        });

        screenSharing = false;
        document.getElementById('share-screen').innerHTML = '<i class="fas fa-desktop"></i> Ekran Paylaş';
        notify("Ekran paylaşımı durduruldu.");
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

document.getElementById('createRoomBtn').addEventListener('click', () => {
    document.getElementById('createRoomModal').classList.remove('hidden');
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
    document.getElementById('joinRoomModal').classList.remove('hidden');
});

document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
document.getElementById('toggle-audio').addEventListener('click', toggleAudio);
document.getElementById('toggle-video').addEventListener('click', toggleVideo);
document.getElementById('share-screen').addEventListener('click', shareScreen);

document.getElementById('toggle-dark-mode').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
});

setInterval(updateActiveRooms, 5000);

// package.json
{
  "name": "modern-video-chat",
  "version": "1.0.0",
  "description": "Modern video chat application",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "build-css": "tailwindcss -i ./public/styles.css -o ./public/output.css",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.17.1",
    "socket.io": "^4.3.1",
    "peer": "^0.6.1"
  },
  "devDependencies": {
    "tailwindcss": "^3.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.3.11",
    "nodemon": "^2.0.15"
  }
}

// tailwind.config.js
module.exports = {
  content: ["./public/**/*.{html,js}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {"50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd","400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a","950":"#172554"}
      },
      fontFamily: {
        'body': [
          'Inter', 
          'ui-sans-serif', 
          'system-ui', 
          '-apple-system', 
          'system-ui', 
          'Segoe UI', 
          'Roboto', 
          'Helvetica Neue', 
          'Arial', 
          'Noto Sans', 
          'sans-serif', 
          'Apple Color Emoji', 
          'Segoe UI Emoji', 
          'Segoe UI Symbol', 
          'Noto Color Emoji'
        ],
        'sans': [
          'Inter', 
          'ui-sans-serif', 
          'system-ui', 
          '-apple-system', 
          'system-ui', 
          'Segoe UI', 
          'Roboto', 
          'Helvetica Neue', 
          'Arial', 
          'Noto Sans', 
          'sans-serif', 
          'Apple Color Emoji', 
          'Segoe UI Emoji', 
          'Segoe UI Symbol', 
          'Noto Color Emoji'
        ]
      }
    },
  },
  plugins: [],
}

// public/styles.css
@tailwind base;
@tailwind components;
@tailwind utilities;

// .gitignore
node_modules/
.env
*.log
.DS_Store
