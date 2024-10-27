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
    
    initializePeer();
}

function joinRoom() {
    nickname = document.getElementById("nickname-input").value;
    if (!nickname) {
        alert("Lütfen takma adınızı girin.");
        return;
    }

    room_id = document.getElementById("room-input").value;
    if (!room_id) {
        alert("Lütfen oda ID'sini girin.");
        return;
    }

    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    initializePeer();
}

async function initializePeer() {
    try {
        local_stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        peer = new Peer();

        peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            document.getElementById('leave-room-btn').style.display = 'block';
            addLocalVideo(local_stream);
            joinExistingRoom();
        });

        peer.on('call', (call) => {
            call.answer(local_stream);
            call.on('stream', (remoteStream) => {
                addRemoteVideo(remoteStream, call.peer);
            });
        });

    } catch (error) {
        console.error('Medya erişimi hatası:', error);
        alert('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
    }
}

function joinExistingRoom() {
    // Odadaki diğer kullanıcılara bağlan
    const peers = Object.keys(peer.connections);
    peers.forEach(peerId => {
        if (!connections[peerId]) {
            const call = peer.call(peerId, local_stream);
            call.on('stream', (remoteStream) => {
                addRemoteVideo(remoteStream, peerId);
            });
            connections[peerId] = call;
        }
    });
}

function addLocalVideo(stream) {
    const container = document.createElement('div');
    container.className = 'col-md-4 mb-3';
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.className = 'w-100';
    
    const nameTag = document.createElement('div');
    nameTag.textContent = `${nickname} (Sen)`;
    nameTag.className = 'text-center mt-2';

    container.appendChild(video);
    container.appendChild(nameTag);
    document.getElementById('participants-container').appendChild(container);
}

function addRemoteVideo(stream, peerId) {
    if (!document.getElementById(`video-${peerId}`)) {
        const container = document.createElement('div');
        container.className = 'col-md-4 mb-3';
        container.id = `video-${peerId}`;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.className = 'w-100';
        
        const nameTag = document.createElement('div');
        nameTag.textContent = peerId;
        nameTag.className = 'text-center mt-2';

        container.appendChild(video);
        container.appendChild(nameTag);
        document.getElementById('participants-container').appendChild(container);
    }
}

// Dark Mode Toggle
const darkModeToggle = document.getElementById('darkModeToggle');
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
});

// Generate Room ID
function generateRoomId() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Diğer fonksiyonlar (toggleMute, toggleCamera, toggleScreenShare, leaveRoom) aynı kalabilir
