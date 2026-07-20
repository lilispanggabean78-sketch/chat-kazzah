const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ============================================================
// 🔥 DATA UPSTASH TUAN 🔥
// ============================================================
const UPSTASH_URL = "https://saving-walleye-172347.upstash.io";
const UPSTASH_TOKEN = "gQAAAAAAAqE7AAIgcDJiMjFhOGZiOGFmODU0YzVlYjhkODZmZmUxOWU1NGEzNg";

const OWNER_EMAIL = "jckoomhardika21@gmail.com";
const OWNER_USERNAME = "Kazzah";
const GROUP_ID = "groupUtama";

// ============================================================
// FUNGSI PANGGIL UPSTASH
// ============================================================
async function upstash(command, args = []) {
    try {
        const response = await fetch(`${UPSTASH_URL}/cmd`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${UPSTASH_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([command, ...args]),
        });
        return response.json();
    } catch (error) {
        console.error('Upstash error:', error);
        return null;
    }
}

// ============================================================
// API ENDPOINTS
// ============================================================

// 1. Auth (Login/Register)
app.post('/api/auth', async (req, res) => {
    const { email, username } = req.body;
    if (!email || !username) {
        return res.status(400).json({ error: 'Email dan username wajib diisi!' });
    }

    try {
        const userData = await upstash('GET', [`user:${email}`]);
        if (userData) {
            const parsed = JSON.parse(userData);
            if (parsed.username === username) {
                return res.json({ success: true, user: parsed });
            } else {
                return res.status(401).json({ error: 'Username tidak cocok!' });
            }
        } else {
            const isOwner = (email === OWNER_EMAIL && username === OWNER_USERNAME);
            const newUser = { email, username, isOwner, joinedAt: new Date().toISOString() };
            await upstash('SET', [`user:${email}`, JSON.stringify(newUser)]);

            // Tambah ke group
            const groupData = await upstash('GET', [`group:${GROUP_ID}`]);
            let group = groupData ? JSON.parse(groupData) : { 
                name: 'Group Utama', 
                description: 'Diskusi bebas KAZZAH', 
                members: [] 
            };
            if (!group.members.includes(email)) {
                group.members.push(email);
                await upstash('SET', [`group:${GROUP_ID}`, JSON.stringify(group)]);
            }
            return res.json({ success: true, user: newUser });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// 2. Dapatkan semua user
app.get('/api/users', async (req, res) => {
    try {
        const keys = await upstash('KEYS', ['user:*']);
        const users = [];
        if (keys && Array.isArray(keys)) {
            for (const key of keys) {
                const data = await upstash('GET', [key]);
                if (data) users.push(JSON.parse(data));
            }
        }
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Dapatkan info group
app.get('/api/group', async (req, res) => {
    try {
        const data = await upstash('GET', [`group:${GROUP_ID}`]);
        if (data) {
            res.json(JSON.parse(data));
        } else {
            const defaultGroup = { 
                name: 'Group Utama', 
                description: 'Diskusi bebas KAZZAH', 
                members: [OWNER_EMAIL],
                messages: []
            };
            await upstash('SET', [`group:${GROUP_ID}`, JSON.stringify(defaultGroup)]);
            res.json(defaultGroup);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Kirim pesan group
app.post('/api/group/message', async (req, res) => {
    const { senderEmail, senderUsername, senderIsOwner, text, replyTo } = req.body;
    try {
        const message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            senderEmail,
            senderUsername,
            senderIsOwner: senderIsOwner || false,
            text: text || '',
            replyTo: replyTo || null,
            timestamp: new Date().toISOString()
        };
        await upstash('RPUSH', [`group:${GROUP_ID}:messages`, JSON.stringify(message)]);
        res.json({ success: true, message });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Ambil pesan group
app.get('/api/group/messages', async (req, res) => {
    try {
        const messages = await upstash('LRANGE', [`group:${GROUP_ID}:messages`, '0', '-1']);
        const parsed = (messages && Array.isArray(messages)) ? messages.map(m => JSON.parse(m)) : [];
        res.json({ messages: parsed });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Kirim pesan private
app.post('/api/private/message', async (req, res) => {
    const { senderEmail, senderUsername, senderIsOwner, targetEmail, text, replyTo } = req.body;
    try {
        const chatId = [senderEmail, targetEmail].sort().join('_');
        const message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            senderEmail,
            senderUsername,
            senderIsOwner: senderIsOwner || false,
            text: text || '',
            replyTo: replyTo || null,
            timestamp: new Date().toISOString()
        };
        await upstash('RPUSH', [`private:${chatId}:messages`, JSON.stringify(message)]);
        await upstash('SET', [`private:${chatId}:last`, text || '[Media]']);
        res.json({ success: true, message });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Ambil pesan private
app.get('/api/private/messages', async (req, res) => {
    const { email1, email2 } = req.query;
    const chatId = [email1, email2].sort().join('_');
    try {
        const messages = await upstash('LRANGE', [`private:${chatId}:messages`, '0', '-1']);
        const parsed = (messages && Array.isArray(messages)) ? messages.map(m => JSON.parse(m)) : [];
        res.json({ messages: parsed });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. Dapatkan daftar chat private
app.get('/api/private/chats', async (req, res) => {
    const { email } = req.query;
    try {
        const keys = await upstash('KEYS', ['private:*:messages']);
        const chats = [];
        if (keys && Array.isArray(keys)) {
            for (const key of keys) {
                const chatId = key.replace('private:', '').replace(':messages', '');
                const [email1, email2] = chatId.split('_');
                if (email1 === email || email2 === email) {
                    const lastMsg = await upstash('GET', [`private:${chatId}:last`]);
                    const targetEmail = email1 === email ? email2 : email1;
                    const userData = await upstash('GET', [`user:${targetEmail}`]);
                    if (userData) {
                        const user = JSON.parse(userData);
                        chats.push({
                            targetEmail,
                            targetUsername: user.username,
                            targetIsOwner: user.isOwner || false,
                            lastMessage: lastMsg || 'Mulai chat'
                        });
                    }
                }
            }
        }
        res.json({ chats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. Init
app.post('/api/init', async (req, res) => {
    try {
        const ownerData = await upstash('GET', [`user:${OWNER_EMAIL}`]);
        if (!ownerData) {
            await upstash('SET', [`user:${OWNER_EMAIL}`, JSON.stringify({
                email: OWNER_EMAIL,
                username: OWNER_USERNAME,
                isOwner: true,
                joinedAt: new Date().toISOString()
            })]);
        }
        const groupData = await upstash('GET', [`group:${GROUP_ID}`]);
        if (!groupData) {
            await upstash('SET', [`group:${GROUP_ID}`, JSON.stringify({
                name: 'Group Utama',
                description: 'Diskusi bebas KAZZAH',
                members: [OWNER_EMAIL],
                messages: []
            })]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// EKSPORT UNTUK VERCEL
// ============================================================
module.exports = app;

// Kalo jalan lokal
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🔥 KAZZAH Upstash Server running on port ${PORT}`);
    });
}
