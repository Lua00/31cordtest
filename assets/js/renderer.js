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

// API base URL'sini tanımlayalım
const API_BASE_URL = window.location.origin;

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
        } else {
            console.error("Oda oluşturma başarısız:", data);
            alert("Oda oluşturulamadı. Lütfen tekrar deneyin.");
        }
    })
    .catch(error => {
        console.error('Oda oluşturma hatası:', error);
        alert("Oda oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.");
    });
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
            document.getElementById("current-room-id").style.display = "block";
            initializePeer();
        } else {
            console.error("Odaya katılma başarısız:", data);
            alert("Odaya katılınamadı. Lütfen geçerli bir oda ID'si girdiğinizden emin olun.");
        }
    })
    .catch(error => {
        console.error('Odaya katılma hatası:', error);
        alert("Odaya katılırken bir hata oluştu. Lütfen tekrar deneyin.");
    });
}

function initializePeer() {
    peer = new Peer(undefined, {
        host: window.location.hostname,
        port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
        path: '/peerjs'
    });

    peer.on('open', async (id) => {
        console.log('My peer ID is: ' + id);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            local_stream = stream;
            addParticipant(nickname, stream, id);
            document.getElementById('leave-room-btn').style.display = 'inline-block';
            updateActiveRooms();
            connectToExistingPeers();
        } catch (error) {
            console.error('Medya erişimi hatası:', error);
            alert('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
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
    container.className = "col-4 pt-4";
    container.id = `participant-${peerId}`;
    container.innerHTML = `<h5>${name}</h5><video height="200" controls autoplay ${peerId === peer.id ? 'muted' : ''}></video>`;
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
    document.getElementById('leave-room-btn').style.display = 'none';
    document.getElementById('room-input').value = '';
    document.getElementById('current-room-id').style.display = 'none';
    
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

function updateActiveRooms() {
    fetch(`${API_BASE_URL}/api/rooms`)
        .then(response => {
            if  (!response.ok) {
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
        activeRoomsList.innerHTML = '<li class="list-group-item">Aktif oda bulunmuyor.</li>';
    } else {
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
}

// Her 5 saniyede bir aktif odaları güncelle
setInterval(updateActiveRooms, 5000);
