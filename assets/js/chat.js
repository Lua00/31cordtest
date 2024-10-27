let chatMessages = [];

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    if (message) {
        const chatMessage = {
            sender: nickname,
            message: message,
            timestamp: new Date().toISOString()
        };
        chatMessages.push(chatMessage);
        displayChatMessage(chatMessage);
        chatInput.value = '';

        if (peer && peer.connections) {
            Object.values(peer.connections).forEach(conns => {
                conns.forEach(conn => {
                    if (conn.open) {
                        conn.send(JSON.stringify({ type: 'chat', data: chatMessage }));
                    }
                });
            });
        }
    }
}

function displayChatMessage(chatMessage) {
    const chatMessagesDiv = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `
        <span class="sender">${chatMessage.sender}:</span>
        <span class="message">${escapeHtml(chatMessage.message)}</span>
        <span class="timestamp">${new Date(chatMessage.timestamp).toLocaleTimeString()}</span>
    `;
    chatMessagesDiv.appendChild(messageElement);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

function handleIncomingMessage(data) {
    if (data.type === 'chat') {
        displayChatMessage(data.data);
    }
}

function initChatListeners(connection) {
    connection.on('data', (data) => {
        const parsedData = JSON.parse(data);
        handleIncomingMessage(parsedData);
    });
}