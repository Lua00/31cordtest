// renderer.js

let peer;
let room_id;
let local_stream;

// Socket.IO bağlantısı
const socket = io('/');

function initializePeer() {
  return new Promise((resolve, reject) => {
    peer = new Peer(undefined, {
      host: '/',
      path: '/peerjs'
    });

    peer.on('open', id => {
      console.log('My peer ID is: ' + id);
      resolve(id);
    });

    peer.on('error', error => {
      console.error('PeerJS error:', error);
      reject(error);
    });
  });
}

async function joinRoom() {
  try {
    const userId = await initializePeer();
    room_id = document.getElementById('room-input').value;
    
    if (!room_id) {
      throw new Error('Oda ID\'si girilmedi');
    }

    local_stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addVideoStream('local-video', local_stream);

    socket.emit('join-room', room_id, userId);

    peer.on('call', call => {
      call.answer(local_stream);
      call.on('stream', userVideoStream => {
        addVideoStream('remote-video', userVideoStream);
      });
    });

    socket.on('user-connected', userId => {
      connectToNewUser(userId, local_stream);
    });

  } catch (error) {
    console.error('Odaya katılma hatası:', error);
    alert('Odaya katılırken bir hata oluştu: ' + error.message);
  }
}

function connectToNewUser(userId, stream) {
  const call = peer.call(userId, stream);
  call.on('stream', userVideoStream => {
    addVideoStream('remote-video', userVideoStream);
  });
}

function addVideoStream(videoId, stream) {
  const video = document.getElementById(videoId);
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });
}

// Event listeners
document.getElementById('join-room-btn').addEventListener('click', joinRoom);
