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
    if (!room_id) {
        notify("Lütfen bir oda ID'si girin.");
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
        <video class="w-full h-auto" autoplay ${peerId === peer.id ? 'muted' : ''}></video>
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
            document.getElementById('active-rooms-list').innerHTML = '<li class="px-4 py-2">Odalar yüklenirken bir hata oluştu.</li>';
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
                <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-sm" onclick="joinExistingRoom('${room.roomId}')">Katıl</button>
            `;
            activeRoomsList.appendChild(listItem);
        });
    }
}

function joinExistingRoom(roomId) {
    document.getElementById('room-input').value = roomId;
    document.getElementById('joinRoomModal').classList.remove('hidden');
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
