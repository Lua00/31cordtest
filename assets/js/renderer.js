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
            connectToNewUser();
        });

        peer.on('call', handleIncomingCall);
        
        peer.on('connection', (conn) => {
            connections[conn.peer] = conn;
            conn.on('data', handlePeerData);
        });

    } catch (error) {
        console.error('Medya erişimi hatası:', error);
        alert('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
    }
}

function handleIncomingCall(call) {
    call.answer(local_stream);
    call.on('stream', (remoteStream) => {
        addRemoteVideo(remoteStream, call.peer);
    });
}

function connectToNewUser() {
    const existingPeers = Object.keys(peer.connections);
    existingPeers.forEach(peerId => {
        const call = peer.call(peerId, local_stream);
        call.on('stream', (remoteStream) => {
            addRemoteVideo(remoteStream, peerId);
        });
    });
}

function addLocalVideo(stream) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'col-md-4 mb-3';
    videoContainer.id = 'local-video-container';
    
    const videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.muted = true; // Yerel video sessiz olmalı
    videoElement.playsInline = true;
    videoElement.className = 'w-100';
    
    const nameTag = document.createElement('div');
    nameTag.textContent = `${nickname} (Sen)`;
    nameTag.className = 'text-center mt-2';

    videoContainer.appendChild(videoElement);
    videoContainer.appendChild(nameTag);
    document.getElementById('participants-container').appendChild(videoContainer);
}

function addRemoteVideo(stream, peerId) {
    if (!document.getElementById(`video-${peerId}`)) {
        const videoContainer = document.createElement('div');
        videoContainer.className = 'col-md-4 mb-3';
        videoContainer.id = `video-${peerId}`;
        
        const videoElement = document.createElement('video');
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.className = 'w-100';
        
        const nameTag = document.createElement('div');
        nameTag.textContent = peerId;
        nameTag.className = 'text-center mt-2';

        videoContainer.appendChild(videoElement);
        videoContainer.appendChild(nameTag);
        document.getElementById('participants-container').appendChild(videoContainer);
    }
}

async function toggleScreenShare() {
    if (!screenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true,
                audio: true 
            });
            
            // Ekran paylaşımı stream'ini tüm bağlantılara gönder
            Object.keys(peer.connections).forEach(peerId => {
                const calls = peer.connections[peerId];
                calls.forEach(call => {
                    const videoTrack = screenStream.getVideoTracks()[0];
                    const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }
                });
            });

            // Yerel videoyu güncelle
            const localVideo = document.querySelector('#local-video-container video');
            if (localVideo) {
                localVideo.srcObject = screenStream;
            }

            screenSharing = true;
            document.getElementById("screen-share-btn").innerHTML = '<i class="fas fa-desktop"></i> Ekranı Durdur';

            // Ekran paylaşımı bittiğinde
            screenStream.getVideoTracks()[0].onended = () => {
                stopScreenSharing();
            };
        } catch (err) {
            console.error("Ekran paylaşımı hatası:", err);
        }
    } else {
        stopScreenSharing();
    }
}

async function stopScreenSharing() {
    try {
        // Ekran paylaşımını durdur
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }

        // Kamera stream'ini geri yükle
        Object.keys(peer.connections).forEach(peerId => {
            const calls = peer.connections[peerId];
            calls.forEach(call => {
                const videoTrack = local_stream.getVideoTracks()[0];
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            });
        });

        // Yerel videoyu güncelle
        const localVideo = document.querySelector('#local-video-container video');
        if (localVideo) {
            localVideo.srcObject = local_stream;
        }

        screenSharing = false;
        document.getElementById("screen-share-btn").innerHTML = '<i class="fas fa-desktop"></i> Ekran Paylaş';
    } catch (err) {
        console.error("Ekran paylaşımını durdurma hatası:", err);
    }
}

function toggleMute() {
    if (local_stream) {
        const audioTracks = local_stream.getAudioTracks();
        if (audioTracks.length > 0) {
            const isEnabled = !audioTracks[0].enabled;
            audioTracks[0].enabled = isEnabled;
            isMuted = !isEnabled;
            document.getElementById("mute-btn").innerHTML = isMuted ? 
                '<i class="fas fa-microphone-slash"></i> Sesi Aç' : 
                '<i class="fas fa-microphone"></i> Sesi Kapat'; }
    }
}

function toggleCamera() {
    if (local_stream) {
        const videoTracks = local_stream.getVideoTracks();
        if (videoTracks.length > 0) {
            const isEnabled = !videoTracks[0].enabled;
            videoTracks[0].enabled = isEnabled;
            isCameraOff = !isEnabled;
            document.getElementById("camera-btn").innerHTML = isCameraOff ? 
                '<i class="fas fa-video"></i> Kamerayı Aç' : 
                '<i class="fas fa-video-slash"></i> Kamerayı Kapat'; 
        }
    }
}

function leaveRoom() {
    if (peer) {
        peer.disconnect();
        peer.destroy();
        peer = null;
    }

    if (local_stream) {
        local_stream.getTracks().forEach(track => track.stop());
    }

    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    document.getElementById("leave-room-btn").style.display = "none";
    document.getElementById("current-room-id").style.display = "none";
}
