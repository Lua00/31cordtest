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
    document.getElementById("current-room-id").style.display = " block";

    initPeer();
}

function joinRoom() {
    room_id = document.getElementById("room-input").value;
    if (!room_id) {
        alert("Lütfen oda ID'sini girin.");
        return;
    }

    nickname = document.getElementById("nickname-input").value;
    if (!nickname) {
        alert("Lütfen takma adınızı girin.");
        return;
    }

    initPeer();
}

function initPeer() {
    peer = new Peer(nickname, {
        host: "localhost",
        port: 9000,
        path: "/peerjs",
        debug: 3
    });

    peer.on("open", (id) => {
        console.log("Peer connected with id: " + id);
    });

    peer.on("connection", (conn) => {
        console.log("Connected to: " + conn.peer);
        connections[conn.peer] = conn;
        conn.on("data", (data) => {
            console.log("Received data from: " + conn.peer);
            handleData(data);
        });
    });

    peer.on("call", (call) => {
        console.log("Received call from: " + call.peer);
        call.answer(local_stream);
        call.on("stream", (stream) => {
            console.log("Received stream from: " + call.peer);
            handleStream(stream, call.peer);
        });
    });

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
            local_stream = stream;
            document.getElementById("leave-room-btn").style.display = "block";
        })
        .catch((err) => {
            console.error("Error getting user media: ", err);
        });
}

function handleData(data) {
    if (data.type === "chat") {
        addChatMessage(data.sender, data.message);
    } else if (data.type === "participant") {
        addParticipant(data.sender);
    } else if (data.type === "leave") {
        removeParticipant(data.sender);
    }
}

function handleStream(stream, peer) {
    addParticipant(peer);
    addStream(stream, peer);
}

function addParticipant(peer) {
    if (!participants[peer]) {
        participants[peer] = true;
        const participantElement = document.createElement("div");
        participantElement.className = "col-md-4";
        participantElement.innerHTML = `<h5>${peer}</h5>`;
        document.getElementById("participants-container").appendChild(participantElement);
    }
}

function addStream(stream, peer) {
    const videoElement = document.createElement("video");
    videoElement.srcObject = stream;
    videoElement.play();
    videoElement.className = "col-md-4";
    document.getElementById("participants-container").appendChild(videoElement);
}

function removeParticipant(peer) {
    if (participants[peer]) {
        delete participants[peer];
        const participantElements = document.getElementById("participants-container").children;
        for (let i = 0; i < participantElements.length; i++) {
            if (participantElements[i].textContent === peer) {
                participantElements[i].remove();
                break;
            }
        }
    }
}

function sendChatMessage() {
    const message = document.getElementById("chat-input").value;
    if (!message) {
        return;
    }

    document.getElementById("chat-input").value = "";
    sendData({ type: "chat", message: message });
}

function sendData(data) {
    for (let peer in connections) {
        connections[peer].send(data);
    }
}

function toggleScreenShare() {
    if (!screenSharing) {
        navigator.mediaDevices.getDisplayMedia({ video: true })
            .then((stream) => {
                screenStream = stream;
                screenSharing = true;
                document.getElementById("screen-share-btn").textContent = "Ekran Paylaşımını Durdur";
                sendData({ type: "screen-share", stream: stream });
            })
            .catch((err) => {
                console.error("Error getting display media: ", err);
            });
    } else {
        screenStream.getTracks().forEach((track) => {
            track.stop();
        });
        screenSharing = false;
        document.getElementById("screen-share-btn").textContent = "Ekran Paylaş";
    }
}

function toggleMute() {
    if (!isMuted) {
        local_stream.getAudioTracks()[0].enabled = false;
        isMuted = true;
        document.getElementById("mute-btn").textContent = "Sesi Aç";
    } else {
        local_stream.getAudioTracks()[0].enabled = true;
        isMuted = false;
        document.getElementById("mute-btn").textContent = "Sesi Kapat";
    }
}

function toggleCamera() {
    if (!isCameraOff) {
        local_stream.getVideoTracks()[0].enabled = false;
        isCameraOff = true;
        document.getElementById("camera-btn").textContent = "Kamerayı Aç";
    } else {
        local_stream.getVideoTracks()[0].enabled = true;
        isCameraOff = false;
        document.getElementById("camera-btn").textContent = "Kamerayı Kapat";
    }
}

function leaveRoom() {
    sendData({ type: "leave" });
    peer.disconnect();
    peer.destroy();
    peer = null;
    local_stream.getTracks().forEach((track) => {
        track.stop();
    });
    document.getElementById("leave-room-btn").style.display = "none";
    document.getElementById("current-room-id").style.display = "none";
}

function generateRoomId() {
    return Math.floor(Math.random() * 100000000);
}

document.getElementById("darkModeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
});
