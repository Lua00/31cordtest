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
    
    let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
    rooms.push({ roomId: room_id, createdBy: nickname, participants: [nickname] });
    localStorage.setItem('rooms', JSON.stringify(rooms));

    initializePeer();
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

    let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
    let room = rooms.find(r => r.roomId === room_id);
    if (!room) {
        room = { roomId: room_id, participants: [] };
        rooms.push(room);
    }

    room.participants.push(nickname);
    localStorage.setItem('rooms', JSON.stringify(rooms));

    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    initializePeer();
}

function initializePeer() {
    peer = new Peer();

    peer.on('open', async (id) => {
        console.log('My peer ID is: ' + id);
        try {
            local_stream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            addParticipant(nickname, local_stream, id);
            document.getElementById('leave-room-btn').style.display = 'inline-block';

            // Diğer katılımcılara bağlan
            let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
            let currentRoom = rooms.find(r => r.roomId === room_id);
            if (currentRoom && currentRoom.participants) {
                currentRoom.participants.forEach(participantNick => {
                    if (participantNick !== nickname) {
                        const call = peer.call(participantNick, local_stream, {
                            metadata: { nickname: nickname }
                        });
                        if (call) {
                            call.on('stream', (remoteStream) => {
                                addParticipant(participantNick, remoteStream, call.peer);
                            });
                        }
                    }
                });
            }
            updateActiveRooms();
        } catch (error) {
            console.error('Medya erişimi hatası:', error);
            alert('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
        }
    });

    peer.on('call', async (call) => {
        try {
            call.answer(local_stream);
            call.on('stream', (remoteStream) => {
                addParticipant(call.metadata.nickname, remoteStream, call.peer);
            });
        } catch (error) {
            console.error('Gelen çağrı hatası:', error);
        }
    });
}

function addParticipant(name, stream, peerId) {
    if (participants[peerId]) {
        participants[peerId].video.srcObject = stream;
        return;
    }

    const container = document.createElement("div");
    container.className = "col-4 pt-4";
    container.id = `participant-${peerId}`;

    const videoElement = document.createElement("video");
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    if (peerId === peer.id) videoElement.muted = true;
    videoElement.height = 200;

    container.innerHTML = `<h5>${name}</h5>`;
    container.appendChild(videoElement);
    document.getElementById("participants-container").appendChild(container);

    videoElement.srcObject = stream;
    participants[peerId] = { 
        video: videoElement, 
        stream: stream, 
        name: name 
    };
}

function removeParticipant(peerId) {
    if (participants[peerId]) {
        let participantDiv = document.getElementById(`participant-${peerId}`);
        if (participantDiv) {
            participantDiv.remove();
        }
        delete participants[peerId];

        let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
        let roomIndex = rooms.findIndex(r => r.roomId === room_id);
        if (roomIndex !== -1) {
            rooms[roomIndex].participants = rooms[roomIndex].participants.filter(p => p !== participants[peerId].name);
            localStorage.setItem('rooms', JSON.stringify(rooms));
        }
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
    
    let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
    let roomIndex = rooms.findIndex(r => r.roomId === room_id);
    if (roomIndex !== -1) {
        rooms[roomIndex].participants = rooms[roomIndex].participants.filter(p => p !== nickname);
        if (rooms[roomIndex].participants.length === 0) {
            rooms.splice(roomIndex, 1);
        }
        localStorage.setItem('rooms', JSON.stringify(rooms));
    }

    participants = {};
    connections = {};
    notify("Odadan ayrıldınız.");
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

async function toggleScreenShare() {
    if (!screenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            screenSharing = true;
            document.getElementById("screen-share-btn").innerHTML = 
                '<i class="fas fa-desktop"></i> Ekran Paylaşımını Kapat';
            if (local_stream) {
                local_stream.getTracks().forEach(track => track.stop());
            }
            local_stream = screenStream;
            addParticipant(nickname, local_stream, peer.id);
            notify("Ekran paylaşımı başladı.");
        } catch (error) {
            console.error('Ekran paylaşımı hatası:', error);
            alert('Ekran paylaşımı başlatılamadı. Lütfen izinleri kontrol edin.');
        }
    } else {
        screenSharing = false;
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }
        document.getElementById("screen-share-btn").innerHTML = 
            '<i class="fas fa-desktop"></i> Ekran Paylaşımını Aç';
        notify("Ekran paylaşımı kapatıldı.");
    }
}

function notify(message) {
    console.log(message);
    alert(message);
}

function updateActiveRooms() {
    let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
    let activeRooms = rooms.filter(r => r.participants.length > 0);
    document.getElementById("active-rooms-list").innerHTML = "";
    activeRooms.forEach(room => {
        let roomElement = document.createElement("li");
        roomElement.textContent = `Oda ID: ${room.roomId} - Katılımcılar: ${room.participants.join(", ")}`;
        document.getElementById("active-rooms-list").appendChild(roomElement);
    });
}

function generateRoomId() {
    return Math.floor(10000000 + Math.random() * 90000000);
}
// Peer bağlantı yönetimi
peer.on('connection', (conn) => {
    connections[conn.peer] = conn;
    
    conn.on('data', (data) => {
        try {
            const parsedData = JSON.parse(data);
            if (parsedData.type === 'chat') {
                displayChatMessage(parsedData.data);
            } else if (parsedData.type === 'newParticipant') {
                handleNewParticipant(parsedData.data);
            }
        } catch (error) {
            console.error('Veri işleme hatası:', error);
        }
    });

    conn.on('close', () => {
        removeParticipant(conn.peer);
        delete connections[conn.peer];
        updateActiveRooms();
    });
});

// Hata yönetimi
peer.on('error', (err) => {
    console.error('Peer bağlantı hatası:', err);
    notify(`Bağlantı hatası: ${err.type}`);
});

// Yeni katılımcı işleme
function handleNewParticipant(data) {
    if (!participants[data.peerId]) {
        const call = peer.call(data.peerId, local_stream, {
            metadata: { nickname: nickname }
        });
        
        call.on('stream', (remoteStream) => {
            addParticipant(data.name, remoteStream, data.peerId);
        });
    }
}

// Katılımcı durumunu güncelleme
function updateParticipantStatus(peerId, status) {
    const participantDiv = document.getElementById(`participant-${peerId}`);
    if (participantDiv) {
        const statusIndicator = participantDiv.querySelector('.status-indicator') || 
            document.createElement('div');
        statusIndicator.className = `status-indicator ${status}`;
        statusIndicator.textContent = status;
        if (!participantDiv.querySelector('.status-indicator')) {
            participantDiv.appendChild(statusIndicator);
        }
    }
}

// Medya cihazları yönetimi
async function getAvailableDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        
        // Cihaz listelerini güncelle
        updateDeviceList('video-devices', videoDevices);
        updateDeviceList('audio-devices', audioDevices);
    } catch (error) {
        console.error('Cihaz listesi alınamadı:', error);
    }
}

function updateDeviceList(elementId, devices) {
    const select = document.getElementById(elementId);
    if (select) {
        select.innerHTML = '';
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Device ${devices.indexOf(device) + 1}`;
            select.appendChild(option);
        });
    }
}

// Medya cihazı değiştirme
async function switchMediaDevice(deviceId, kind) {
    try {
        const newConstraints = {
            video: kind === 'video' ? { deviceId: { exact: deviceId } } : local_stream.getVideoTracks()[0].enabled,
            audio: kind === 'audio' ? { deviceId: { exact: deviceId } } : local_stream.getAudioTracks()[0].enabled
        };

        const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        
        if (kind === 'video') {
            const videoTrack = newStream.getVideoTracks()[0];
            const oldVideoTrack = local_stream.getVideoTracks()[0];
            if (oldVideoTrack) {
                oldVideoTrack.stop();
                local_stream.removeTrack(oldVideoTrack);
            }
            local_stream.addTrack(videoTrack);
        } else {
            const audioTrack = newStream.getAudioTracks()[0];
            const oldAudioTrack = local_stream.getAudioTracks()[0];
            if (oldAudioTrack) {
                oldAudioTrack.stop();
                local_stream.removeTrack(oldAudioTrack);
            }
            local_stream.addTrack(audioTrack);
        }

        // Yerel görüntüyü güncelle
        updateLocalVideo();
        
        // Diğer katılımcılara yeni medya akışını gönder
        Object.values(peer.connections).forEach(conns => {
            conns.forEach(conn => {
                const sender = conn.peerConnection.getSenders().find(s => s.track.kind === kind);
                if (sender) {
                    sender.replaceTrack(kind === 'video' ? videoTrack : audioTrack);
                }
            });
        });

    } catch (error) {
        console.error('Medya cihazı değiştirme hatası:', error);
        notify('Medya cihazı değiştirilemedi');
    }
}

function updateLocalVideo() {
    if (participants[peer.id]) {
        participants[peer.id].video.srcObject = local_stream;
    }
}

// Bağlantı durumu kontrolü
function checkConnection() {
    if (!peer || peer.disconnected) {
        notify('Bağlantı kesildi. Yeniden bağlanılıyor...');
        initializePeer();
    }
}

// Periyodik bağlantı kontrolü
setInterval(checkConnection, 5000);

// Sayfa yüklendiğinde
window.addEventListener('load', () => {
    getAvailableDevices();
    
    // Enter tuşu ile mesaj gönderme
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // Sayfa kapatıldığında odadan çıkış
    window.addEventListener('beforeunload', () => {
        leaveRoom();
    });
});

// Ekran paylaşımı durumunu kontrol et
document.addEventListener('visibilitychange', () => {
    if (document.hidden && screenSharing) {
        toggleScreenShare();
    }
});

// Medya cihazı değişikliklerini dinle
navigator.mediaDevices.addEventListener('devicechange', () => {
    getAvailableDevices();
});

// Aktif odaları periyodik olarak güncelle
setInterval(updateActiveRooms, 5000);
