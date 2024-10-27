let room_id;
let local_stream;
let screenStream;
let peer = null;
let currentPeer = null;
let screenSharing = false;
let nickname = "";
let participants = {};
let isMuted = false;
let isCameraOff = false;

function createRoom() {
    nickname = document.getElementById("nickname-input").value;
    if (!nickname) {
        alert("Lütfen takma adınızı girin.");
        return;
    }

    room_id = generateRoomId();
    document.getElementById("room-input").value = room_id;
    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    initializePeer(room_id);
}

function joinRoom() {
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

    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    initializePeer();
}

function sendJoinRequest(roomId) {
    document.getElementById("joinRequestMessage").textContent = `${nickname} ${roomId} numaralı odaya katılmak istiyor`;
    new bootstrap.Modal(document.getElementById("joinRequestModal")).show();
}

function acceptJoinRequest() {
    bootstrap.Modal.getInstance(document.getElementById("joinRequestModal")).hide();
    initializePeer();
}

function initializePeer(id) {
    peer = new Peer(id);

    peer.on('open', (peerId) => {
        console.log("Peer ID'im: " + peerId);
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
            .then((stream) => {
                local_stream = stream;
                setLocalStream(local_stream);
                if (id) {
                    notify("Oda başarıyla oluşturuldu. Oda ID: " + id);
                } else {
                    notify("Odaya katılınıyor...");
                    connectToPeer(room_id, stream);
                }

                document.getElementById('leave-room-btn').style.display = 'inline-block';
                initConnectionListeners();
            })
            .catch((err) => {
                console.error("Medya cihazlarına erişim hatası.", err);
                notify("Medya cihazlarına erişilemedi. Lütfen kamera ve mikrofon izinlerinizi kontrol edin.");
            });
    });

    peer.on('error', (error) => {
        console.error("PeerJS hatası:", error);
        if (error.type === 'unavailable-id') {
            notify("Oda oluşturulamadı. Lütfen tekrar deneyin.");
        } else if (error.type === 'peer-unavailable') {
            notify("Odaya katılınamadı. Oda mevcut olmayabilir veya dolu olabilir.");
        } else {
            notify("Bir hata oluştu. Lütfen tekrar deneyin.");
        }
    });

    peer.on('call', (call) => {
        call.answer(local_stream);
        handleCall(call);
    });
}

function connectToPeer(peerId, stream) {
    console.log(`Connecting to peer: ${peerId}`);
    const conn = peer.connect(peerId);
    conn.on('open', () => {
        console.log(`Connection to ${peerId} opened`);
        const call = peer.call(peerId, stream, { metadata: { nickname } });
        handleCall(call);
    });
}

function handleCall(call) {
    console.log(`Handling call from: ${call.peer}`);
    call.on('stream', (remoteStream) => {
        console.log(`Received stream from: ${call.peer}`);
        const remoteNickname = call.metadata?.nickname || `Katılımcı ${call.peer}`;
        addParticipant(remoteNickname, remoteStream, call.peer);
    });
}

function setLocalStream(stream) {
    addParticipant(nickname, stream, peer.id);
}

function addParticipant(name, stream, peerId) {
    console.log(`Adding participant: ${name}, PeerID: ${peerId}`);
    if (participants[peerId]) {
        console.log(`${name} (${peerId}) zaten katılımcı listesinde var.`);
        return;
    }

    let container = document.createElement("div");
    container.className = "col-4 pt-4";
    container.id = `participant-${peerId}`;
    container.innerHTML = `<h5>${name}</h5><video height="200" controls autoplay ${name === nickname ? 'muted' : ''}></video>`;
    document.getElementById("participants-container").appendChild(container);

    let video = container.querySelector("video");
    video.srcObject = stream;
    participants[peerId] = { video, stream, name };
    console.log(`Participant added: ${name}, PeerID: ${peerId}`);
    console.log("Current participants:", Object.keys(participants));
}

function toggleScreenShare() {
    if (screenSharing) {
        stopScreenSharing();
    } else {
        startScreenShare();
    }
}

function startScreenShare() {
    navigator.mediaDevices.getDisplayMedia({ video: true }).then((stream) => {
        let videoTrack = stream.getVideoTracks()[0];
        participants[peer.id].video.srcObject = stream;
        videoTrack.onended = stopScreenSharing;

        for (let peerId in peer.connections) {
            let peerConnection = peer.connections[peerId][0];
            let sender = peerConnection.peerConnection.getSenders().find(s => s.track.kind === videoTrack.kind);
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        }

        screenSharing = true;
        document.getElementById("screen-share-btn").innerHTML = '<i class="fas fa-desktop"></i> Paylaşımı Durdur';
    }).catch((err) => {
        console.error("Ekran paylaşımı hatası:", err);
    });
}

function stopScreenSharing() {
    screenSharing = false;
    let videoTrack = local_stream.getVideoTracks()[0];
    participants[peer.id].video.srcObject = local_stream;

    for (let peerId in peer.connections) {
        let peerConnection = peer.connections[peerId][0];
        let sender = peerConnection.peerConnection.getSenders().find(s => s.track.kind === videoTrack.kind);
        if (sender) {
            sender.replaceTrack(videoTrack);
        }
    }

    document.getElementById("screen-share-btn").innerHTML = '<i class="fas fa-desktop"></i> Ekran Paylaş';
    console.log("Ekran paylaşımı durduruldu.");
}

function initConnectionListeners() {
    if (!peer) return;

    peer.on('connection', (conn) => {
        conn.on('open', () => {
            console.log(`Yeni katılımcı bağlandı: ${conn.peer}`);
            
            conn.on('data', (data) => {
                try {
                    const parsedData = JSON.parse(data);
                    if (parsedData.type === 'chat') {
                        displayChatMessage(parsedData.data);
                    } else if (parsedData.type === 'activeRooms') {
                        updateActiveRoomsList(parsedData.rooms);
                    }
                } catch (error) {
                    console.error('Veri işleme hatası:', error);
                }
            });
        });

        conn.on('close', () => {
            removeParticipant(conn.peer);
        });
    });
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
    document.getElementById('participants-container').innerHTML = '';
    document.getElementById('leave-room-btn').style.display = 'none';
    document.getElementById('room-input').value = '';
    document.getElementById('current-room-id').style.display = 'none';
    participants = {};
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
    if (peer && peer.connections) {
        const activeRooms = [];
        for (const [peerId, conns] of Object.entries(peer.connections)) {
            if (Array.isArray(conns) && conns.length > 0) {
                activeRooms.push({
                    id: peerId,
                    participants: conns.length + 1
                });
            }
        }
        updateActiveRoomsList(activeRooms);

        // Aktif odaları diğer katılımcılara gönder
        for (const conns of Object.values(peer.connections)) {
            if (Array.isArray(conns)) {
                for (const conn of conns) {
                    if (conn.open && typeof conn.send === 'function') {
                        try {
                            conn.send(JSON.stringify({ type: 'activeRooms', rooms: activeRooms }));
                        } catch (error) {
                            console.error('Veri gönderme hatası:', error);
                        }
                    }
                }
            }
        }
    }
}

// Her 5 saniyede bir aktif odaları güncelle
setInterval(updateActiveRooms, 5000);

const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

darkModeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    body.classList.toggle('light-mode');
});

// Sayfa yüklendiğinde tercih edilen temayı kontrol et
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    body.classList.add('dark-mode');
} else {
    body.classList.add('light-mode');
}

// Chat fonksiyonları
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

        if (peer && peer.connections) {
            Object.values(peer.connections).forEach(conns => {
                conns.forEach(conn => {
                    if (conn.open && typeof conn.send === 'function') {
                        try {
                            conn.send(JSON.stringify({ type: 'chat', data: chatMessage }));
                        } catch (error) {
                            console.error('Sohbet mesajı gönderme hatası:', error);
                        }
                    }
                });
            });
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

document.getElementById('chat-input').addEventListener('keypress', function(e) 

 {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});
