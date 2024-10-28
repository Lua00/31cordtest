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
    
    fetch('/api/rooms', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId: room_id, nickname: nickname }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            initializePeer();
        } else {
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

    fetch('/api/rooms/join', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId: room_id, nickname: nickname }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById("room-id-display").textContent = room_id;
            document.getElementById("current-room-id").style.display = "block";
            initializePeer();
        } else {
            alert("Odaya katılınamadı. Lütfen geçerli bir oda ID'si girdiğinizden emin olun.");
        }
    })
    .catch(error => {
        console.error('Odaya katılma hatası:', error);
        alert("Odaya katılırken bir hata oluştu. Lütfen tekrar deneyin.");
    });
}

function initializePeer() {
    peer = new Peer();

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
    fetch(`/api/participants/${room_id}`)
        .then(response => response.json())
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

    fetch('/api/participants', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId: room_id, peerId: peerId, nickname: name }),
    }).catch(error => console.error('Katılımcı ekleme hatası:', error));
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

        fetch(`/api/participants/${room_id}/${peerId}`, {
            method: 'DELETE'
        }).catch(error => console.error('Katılımcı silme hatası:', error));
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
    
    fetch(`/api/rooms/${room_id}/leave`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nickname: nickname }),
    }).catch(error => console.error('Odadan ayrılma hatası:', error));

    participants = {};
    connections = {};
    notify("Odadan ayrıldınız.");
}

// Diğer fonksiyonlar aynı kalacak...

// Her 5 saniyede bir aktif odaları güncelle
setInterval(updateActiveRooms, 5000);
