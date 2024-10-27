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
    
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ roomId: room_id, createdBy: nickname }),
        });
        if (!response.ok) {
            throw new Error('Oda oluşturma başarısız oldu');
        }
        console.log('Oda başarıyla kaydedildi');
    } catch (error) {
        console.error('Oda kaydedilirken hata oluştu:', error);
        alert('Oda oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.');
        return;
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

    try {
        const response = await fetch(`/api/rooms/${room_id}`);
        if (!response.ok) {
            throw new Error('Oda bulunamadı');
        }
        const room = await response.json();
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

async function initializePeer() {
    peer = new Peer();

    peer.on('open', async (id) => {
        console.log('My peer ID is: ' + id);
        try {
            await addParticipant(nickname, await navigator.mediaDevices.getUserMedia({ video: true, audio: true }), id);
            document.getElementById('leave-room-btn').style.display = 'inline-block';
            updateActiveRooms();
        } catch (error) {
            console.error('Medya erişimi hatası:', error);
            alert('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
        }
    });

    peer.on('call', handleIncomingCall);
}

async function handleIncomingCall(call) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        call.answer(stream);
        call.on('stream', (remoteStream) => {
            addParticipant(call.metadata.nickname, remoteStream, call.peer);
        });
    } catch (error) {
        console.error('Gelen çağrı hatası:', error);
    }
}

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

    try {
        await fetch('/api/participants', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                roomId: room_id,
                peerId: peerId,
                name: name
            }),
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

        try {
            await fetch(`/api/participants/${room_id}/${peerId}`, {
                method: 'DELETE',
            });
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
    
    try {
        await fetch(`/api/participants/${room_id}/${peer.id}`, {
            method: 'DELETE',
        });
        console.log('Kullanıcı odadan başarıyla ayrıldı');
    } catch (error) {
        console.error('Kullanıcı odadan ayrılırken hata oluştu:', error);
    }

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

async function updateActiveRooms() {
    try {
        const response = await fetch('/api/rooms');
        const rooms = await response.json();
        updateActiveRoomsList(rooms);
    } catch (error) {
        console.error('Aktif odaları güncellerken hata oluştu:', error);
    }
}

function updateActiveRoomsList(rooms) {
    const activeRoomsList = document.getElementById('active-rooms-list');
    activeRoomsList.innerHTML = '';
    rooms.forEach(room => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
        listItem.innerHTML = `
            ${room.roomId}
            <span class="badge bg-primary rounded-pill">${room.participants.length} katılımcı</span>
            <button class="btn btn-sm btn-outline-primary" onclick="joinRoom('${room.roomId}')">Katıl</button>
        `;
        activeRoomsList.appendChild(listItem);
    });
}

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
            for (let conn of Object.values(connections)) {
                const sender = conn.peerConnection.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(screenStream.getVideoTracks()[0]);
            }
            screenSharing = true;
            document.getElementById("screen-share-btn").innerHTML = '<i class="fas fa-desktop"></i> Ekran Paylaşımını Durdur';
        } catch (e) {
            console.error("Ekran paylaşımı başlatılamadı:", e);
        }
    } else {
        screenStream.getTracks().forEach(track => track.stop());
        for (let conn of Object.values(connections)) {
            const sender = conn.peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(local_stream.getVideoTracks()[0]);
        }
        screenSharing = false;
        document.getElementById("screen-share-btn").innerHTML = '<i class="fas fa-desktop"></i> Ekran Paylaş';
    }
}

// Her 5 saniyede bir aktif odaları güncelle
setInterval(updateActiveRooms, 5000);
