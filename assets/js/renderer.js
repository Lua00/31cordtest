// renderer.js

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

    initializePeer(true); // Oda oluşturan için true parametresi
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
    
    // Oda kontrolü kaldırıldı
    if (!room) {
        room = { roomId: room_id, participants: [] };
        rooms.push(room);
    }

    if (!room.participants.includes(nickname)) {
        room.participants.push(nickname);
        localStorage.setItem('rooms', JSON.stringify(rooms));
    }

    document.getElementById("room-id-display").textContent = room_id;
    document.getElementById("current-room-id").style.display = "block";
    initializePeer(false); // Odaya katılan için false parametresi
}

function initializePeer(isCreator) {
    peer = new Peer();

    peer.on('open', async (id) => {
        console.log('My peer ID is: ' + id);
        try {
            local_stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            addParticipant(nickname, local_stream, id);
            document.getElementById('leave-room-btn').style.display = 'inline-block';
            
            if (!isCreator) {
                // Odadaki diğer kullanıcılara bağlan
                let rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
                let room = rooms.find(r => r.roomId === room_id);
                if (room && room.participants) {
                    room.participants.forEach(participantNick => {
                        if (participantNick !== nickname) {
                            const call = peer.call(participantNick, local_stream, {
                                metadata: { nickname: nickname }
                            });
                            handleCall(call);
                        }
                    });
                }
            }
            
            updateActiveRooms();
        } catch (error) {
            console.error('Medya erişimi hatası:', error);
            alert('Kamera veya mikrofona erişim sağlanamadı. Lütfen izinleri kontrol edin.');
        }
    });

    peer.on('call', handleIncomingCall);
}

function handleIncomingCall(call) {
    try {
        call.answer(local_stream);
        handleCall(call);
    } catch (error) {
        console.error('Gelen çağrı hatası:', error);
    }
}

function handleCall(call) {
    call.on('stream', (remoteStream) => {
        console.log('Remote stream received:', remoteStream);
        addParticipant(call.metadata.nickname, remoteStream, call.peer);
    });

    call.on('error', (err) => {
        console.error('Call error:', err);
    });
}

function addParticipant(name, stream, peerId) {
    if (participants[peerId]) {
        console.log(`${name} (${peerId}) zaten katılımcı listesinde var.`);
        participants[peerId].video.srcObject = stream;
        return;
    }

    let container = document.createElement("div");
    container.className = "col-4 pt-4";
    container.id = `participant-${peerId}`;
    
    let video = document.createElement("video");
    video.autoplay = true;
    video.height = 200;
    video.playsInline = true;
    if (peerId === peer.id) video.muted = true;
    
    container.innerHTML = `<h5>${name}</h5>`;
    container.appendChild(video);
    document.getElementById("participants-container").appendChild(container);

    video.srcObject = stream;
    participants[peerId] = { video, stream, name };
    
    console.log(`Participant added: ${name}, PeerID: ${peerId}`);
    console.log("Current participants:", Object.keys(participants));
}
