const { MongoClient } = require('mongodb');

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

// MongoDB bağlantı URL'si
const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'psychordDB';
let db;

// MongoDB'ye bağlan
MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    console.log('MongoDB\'ye başarıyla bağlandı');
    db = client.db(dbName);
  })
  .catch(error => console.error('MongoDB bağlantı hatası:', error));

async function createRoom() {
    nickname = document.getElementById("nickname-input").value;
    if (!nickname) {
        alert("Lütfen takma adınızı girin.");
        return;
    }

    room_id = generateRoomId();
    document.getElementById("room-input").value = room_id;
    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    
    // Odayı MongoDB'ye kaydet
    try {
        await db.collection('rooms').insertOne({ 
            roomId: room_id, 
            createdBy: nickname,
            createdAt: new Date()
        });
        console.log('Oda başarıyla kaydedildi');
    } catch (error) {
        console.error('Oda kaydedilirken hata oluştu:', error);
    }

    initializePeer(room_id);
}

async function joinRoom() {
    nickname = document.getElementById("nickname-input").value;
    if (!nickname) {
        alert("Lütfen takma adınızı girin.");
        return;
    }

    room_id = document.getElementById("room-input").value;
    if (!room_id || !/^\d{8,}$/.test(room_id)) {
        alert("Lütfen geçerli bir oda ID'si girin (en az 8 rakam).");
        return;
    }

    // Odanın varlığını kontrol et
    try {
        const room = await db.collection('rooms').findOne({ roomId: room_id });
        if (!room) {
            alert("Bu ID'ye sahip bir oda bulunamadı.");
            return;
        }
    } catch (error) {
        console.error('Oda kontrolü sırasında hata oluştu:', error);
        alert("Oda kontrolü sırasında bir hata oluştu. Lütfen tekrar deneyin.");
        return;
    }

    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    initializePeer();
}

// ... (diğer fonksiyonlar aynı kalacak)

async function addParticipant(name, stream, peerId) {
    console.log(`Adding participant: ${name}, PeerID: ${peerId}`);
    if (participants[peerId]) {
        console.log(`${name} (${peerId}) zaten katılımcı listesinde var.`);
        participants[peerId].video.srcObject = stream;
        return;
    }

    let container = document.createElement("div");
    container.className = "col-4 pt-4";
    container.id = `participant-${peerId}`;
    container.innerHTML = `<h5>${name}</h5><video height="200" controls autoplay ${peerId === peer.id ? 'muted' : ''}></video>`;
    document.getElementById("participants-container").appendChild(container);

    let video = container.querySelector("video");
    video.srcObject = stream;
    participants[peerId] = { video, stream, name };
    console.log(`Participant added: ${name}, PeerID: ${peerId}`);
    console.log("Current participants:", Object.keys(participants));

    // Katılımcıyı MongoDB'ye kaydet
    try {
        await db.collection('participants').insertOne({
            roomId: room_id,
            peerId: peerId,
            name: name,
            joinedAt: new Date()
        });
        console.log('Katılımcı başarıyla kaydedildi');
    } catch (error) {
        console.error('Katılımcı kaydedilirken hata oluştu:', error);
    }

    broadcastNewParticipant(name, peerId);
}

async function removeParticipant(peerId) {
    if (participants[peerId]) {
        let participantDiv = document.getElementById(`participant-${peerId}`);
        if (participantDiv) {
            participantDiv.remove();
        }
        delete participants[peerId];
        console.log(`Participant removed: ${peerId}`);
        console.log("Current participants:", Object.keys(participants));

        // Katılımcıyı MongoDB'den sil
        try {
            await db.collection('participants').deleteOne({ roomId: room_id, peerId: peerId });
            console.log('Katılımcı başarıyla silindi');
        } catch (error) {
            console.error('Katılımcı silinirken hata oluştu:', error);
        }
    }
}

async function leaveRoom() {
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
    document.getElementById('leave-room-btn').style.display = 'none';
    document.getElementById('room-input').value = '';
    document.getElementById('current-room-id').style.display = 'none';
    
    // Odadan ayrılan kullanıcıyı MongoDB'den sil
    try {
        await db.collection('participants').deleteOne({ roomId: room_id, peerId: peer.id });
        console.log('Kullanıcı odadan başarıyla ayrıldı');
    } catch (error) {
        console.error('Kullanıcı odadan ayrılırken hata oluştu:', error);
    }

    participants = {};
    connections = {};
    notify("Odadan ayrıldınız.");
}

async function updateActiveRooms() {
    if (peer && connections) {
        try {
            const rooms = await db.collection('rooms').aggregate([
                {
                    $lookup: {
                        from: 'participants',
                        localField: 'roomId',
                        foreignField: 'roomId',
                        as: 'participants'
                    }
                },
                {
                    $project: {
                        id: '$roomId',
                        participants: { $size: '$participants' }
                    }
                }
            ]).toArray();

            updateActiveRoomsList(rooms);

            for (const conn of Object.values(connections)) {
                if (conn.open) {
                    try {
                        conn.send(JSON.stringify({ type: 'activeRooms', rooms: rooms }));
                    } catch (error) {
                        console.error('Veri gönderme hatası:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Aktif odaları güncellerken hata oluştu:', error);
        }
    }
}

// Chat fonksiyonları
async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    if (message) {
        const chatMessage = {
            sender: nickname,
            message: message,
            timestamp: new Date().toISOString()
        };
        displayChatMessage(chatMessage);
        
        chatInput.value = '';

        // Mesajı MongoDB'ye kaydet
        try {
            await db.collection('messages').insertOne({
                roomId: room_id,
                ...chatMessage
            });
            console.log('Mesaj başarıyla kaydedildi');
        } catch (error) {
            console.error('Mesaj kaydedilirken hata oluştu:', error);
        }

        for (const conn of Object.values(connections)) {
            if (conn.open) {
                try {
                    conn.send(JSON.stringify({ type: 'chat', data: chatMessage }));
                } catch (error) {
                    console.error('Sohbet mesajı gönderme hatası:', error);
                }
            }
        }
    }
}

// Diğer fonksiyonlar aynı kalacak...

// Her 5 saniyede bir aktif odaları güncelle
setInterval(updateActiveRooms, 5000);

        conn.on('close', () => {
            removeParticipant(conn.peer);
            delete connections[conn.peer];
        });

function handleIncomingData(data, senderId) {
    switch (data.type) {
        case 'chat':
            displayChatMessage(data.data);
            break;
        case 'newParticipant':
            if (!participants[data.data.peerId]) {
                const call = peer.call(data.data.peerId, screenSharing ? screenStream : local_stream, { metadata: { nickname, peerId: peer.id } });
                handleOutgoingCall(call);
            }
            break;
        case 'participantInfo':
            data.data.forEach(participant => {
                if (!participants[participant.peerId] && participant.peerId !== peer.id) {
                    const call = peer.call(participant.peerId, screenSharing ? screenStream : local_stream, { metadata: { nickname, peerId: peer.id } });
                    handleOutgoingCall(call);
                }
            });
            break;
        case 'activeRooms':
            updateActiveRoomsList(data.rooms);
            break;
    }
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
    }
}

function toggleMute() {
    isMuted = !isMuted;
    if (local_stream) {
        local_stream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
        document.getElementById("mute-btn").innerHTML = isMuted ? 
            '<i class="fas fa-microphone-slash"></i> Sesi Aç' : 
            '<i class="fas fa-microphone"></i> Sesi Kapat';
    }
}

function toggleCamera() {
    isCameraOff = !isCameraOff;
    if (local_stream) {
        local_stream.getVideoTracks().forEach(track => {
            track.enabled = !isCameraOff;
        });
        document.getElementById("camera-btn").innerHTML = isCameraOff ? 
            '<i class="fas fa-video-slash"></i> Kamerayı Aç' : 
            '<i class="fas fa-video"></i> Kamerayı Kapat';
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
    document.getElementById('leave-room-btn').style.display = 'none';
    document.getElementById('room-input').value = '';
    document.getElementById('current-room-id').style.display = 'none';
    participants = {};
    connections = {};
    notify("Odadan ayrıldınız.");
}

function notify(msg) {
    let notification = document.getElementById("notification");
    notification.innerHTML = msg;
    notification.hidden = false;
    setTimeout(() => {
        notification.hidden = true;
    }, 3000);
}

function generateRoomId() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function updateActiveRoomsList(rooms) {
    const activeRoomsList = document.getElementById('active-rooms-list');
    activeRoomsList.innerHTML = '';
    rooms.forEach(room => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
        listItem.innerHTML = `
            ${room.id}
            <span class="badge bg-primary rounded-pill">${room.participants} katılımcı</span>
            <button class="btn btn-sm btn-outline-primary" onclick="sendJoinRequest('${room.id}')">Katıl</button>
        `;
        activeRoomsList.appendChild(listItem);
    });
}

function updateActiveRooms() {
    if (peer && connections) {
        const activeRooms = [{
            id: room_id,
            participants: Object.keys(participants).length
        }];
        updateActiveRoomsList(activeRooms);

        for (const conn of Object.values(connections)) {
            if (conn.open) {
                try {
                    conn.send(JSON.stringify({ type: 'activeRooms', rooms: activeRooms }));
                } catch (error) {
                    console.error('Veri gönderme hatası:', error);
                }
            }
        }
    }
}

setInterval(updateActiveRooms, 5000);

const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

darkModeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    body.classList.toggle('light-mode');
});

if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    body.classList.add('dark-mode');
} else {
    body.classList.add('light-mode');
}

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    if (message) {
        const chatMessage = {
            sender: nickname,
            message: message,
            timestamp: new Date().toISOString()
        };
        displayChatMessage(chatMessage);
        
        chatInput.value = '';

        for (const conn of Object.values(connections)) {
            if (conn.open) {
                try {
                    conn.send(JSON.stringify({ type: 'chat', data: chatMessage }));
                } catch (error) {
                    console.error('Sohbet mesajı gönderme hatası:', error);
                }
            }
        }
    }
}

function displayChatMessage(chatMessage) {
    const chatMessagesDiv = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `
        <span class="sender">${chatMessage.sender}:</span>
        <span class="message">${escapeHtml(chatMessage.message)}</span>
        <span class="timestamp">${new Date(chatMessage.timestamp).toLocaleTimeString()}</span>
    `;
    chatMessagesDiv.appendChild(messageElement);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});
