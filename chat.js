// chat.js
import { auth, db, storage } from './firebase.js'
import {
	signOut,
	onAuthStateChanged,
	updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import {
	collection,
	query,
	where,
	onSnapshot,
	addDoc,
	serverTimestamp,
	orderBy,
	getDocs,
	getDoc,
	doc,
	updateDoc,
	deleteDoc,
	limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import {
	ref,
	uploadBytes,
	getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'

// --- State ---
let currentUser = null
let currentChatId = null
let unsubscribeMessages = null
let unsubscribeChatMeta = null
let editingMessageId = null
let contextMenuTargetId = null
let contextMenuTargetText = null

// --- Elements ---
const loader = document.getElementById('loader')
const chatsList = document.getElementById('chats-list')
const messagesArea = document.getElementById('messages-area')
const messageForm = document.getElementById('message-form')
const messageInput = document.getElementById('message-input')
const chatHeader = document.getElementById('chat-header')
const pinnedBar = document.getElementById('pinned-bar')
const ctxMenu = document.getElementById('ctx-menu')

// --- 1. Initialization ---
onAuthStateChanged(auth, async user => {
	if (!user) {
		window.location.href = 'index.html'
		return
	}
	currentUser = user
	await loadUserProfile()
	loadMyChats()
	loader.style.display = 'none'
})

async function loadUserProfile() {
	const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
	if (userDoc.exists()) {
		const data = userDoc.data()
		// Настройки: заполняем поля
		document.getElementById('settings-username').value = data.username
		if (data.avatar) {
			document.getElementById(
				'settings-avatar-preview'
			).innerHTML = `<img src="${data.avatar}">`
		}
	}
}

// --- 2. Chats List ---
function loadMyChats() {
	const q = query(
		collection(db, 'chats'),
		where('participants', 'array-contains', currentUser.uid)
	)

	onSnapshot(q, snapshot => {
		chatsList.innerHTML = ''
		snapshot.forEach(async chatDoc => {
			const chatData = chatDoc.data()
			const otherUserId = chatData.participants.find(
				uid => uid !== currentUser.uid
			)

			// Получаем данные собеседника
			let otherUsername = 'User'
			let otherAvatar = null

			const userSnap = await getDoc(doc(db, 'users', otherUserId))
			if (userSnap.exists()) {
				otherUsername = userSnap.data().username
				otherAvatar = userSnap.data().avatar
			}

			const div = document.createElement('div')
			div.className = `chat-item ${
				currentChatId === chatDoc.id ? 'active' : ''
			}`

			const avatarHtml = otherAvatar
				? `<div class="avatar"><img src="${otherAvatar}"></div>`
				: `<div class="avatar">${otherUsername[0].toUpperCase()}</div>`

			div.innerHTML = `
                ${avatarHtml}
                <div class="chat-info">
                    <h4>${otherUsername}</h4>
                    <p>${chatData.lastMessage || 'Нет сообщений'}</p>
                </div>
            `
			div.onclick = () =>
				openChat(chatDoc.id, otherUserId, otherUsername, otherAvatar)
			chatsList.appendChild(div)
		})
	})
}

// --- 3. Open Chat ---
async function openChat(chatId, otherId, name, avatar) {
	currentChatId = chatId

	// UI Update
	chatHeader.style.display = 'flex'
	messageForm.style.display = 'flex'
	messagesArea.innerHTML = '' // Очистка

	document.getElementById('header-username').textContent = name
	const hAvatar = document.getElementById('header-avatar')
	hAvatar.innerHTML = avatar ? `<img src="${avatar}">` : name[0]

	// Mobile Logic
	if (window.innerWidth <= 768) {
		document.getElementById('sidebar').classList.remove('visible')
		document.getElementById('back-btn').style.display = 'block'
	}

	// Pinned Message Listener
	if (unsubscribeChatMeta) unsubscribeChatMeta()
	unsubscribeChatMeta = onSnapshot(doc(db, 'chats', chatId), snap => {
		const d = snap.data()
		if (d?.pinnedMessageId) showPinned(d.pinnedMessageId)
		else pinnedBar.style.display = 'none'
	})

	// Messages Listener
	if (unsubscribeMessages) unsubscribeMessages()
	const q = query(
		collection(db, 'messages'),
		where('chatId', '==', chatId),
		orderBy('timestamp', 'asc')
	)

	unsubscribeMessages = onSnapshot(q, snapshot => {
		messagesArea.innerHTML = ''
		snapshot.forEach(renderMessage)
		messagesArea.scrollTop = messagesArea.scrollHeight
	})

	// Обновляем UI списка чатов (чтобы выделить активный)
	loadMyChats()
}

// --- 4. Messages Logic ---
function renderMessage(docSnap) {
	const msg = docSnap.data()
	const isMe = msg.senderId === currentUser.uid

	const div = document.createElement('div')
	div.className = `message ${isMe ? 'sent' : 'received'}`

	let content = ''
	if (msg.imageUrl)
		content += `<img src="${msg.imageUrl}" class="msg-image" onclick="window.viewImage('${msg.imageUrl}')">`
	if (msg.text) content += `<span>${msg.text}</span>`

	const time = msg.timestamp
		? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
		  })
		: '...'

	div.innerHTML = `
        ${content}
        <div class="msg-meta">
            ${msg.isEdited ? '<span>изм.</span>' : ''}
            <span>${time}</span>
            ${isMe ? '<i class="ri-check-double-line"></i>' : ''}
        </div>
    `

	// Context Menu Trigger
	div.addEventListener('contextmenu', e => {
		e.preventDefault()
		showCtxMenu(e, docSnap.id, isMe, msg.text)
	})

	messagesArea.appendChild(div)
}

// --- 5. Sending & Editing ---
messageForm.addEventListener('submit', async e => {
	e.preventDefault()
	const text = messageInput.value.trim()
	const file = document.getElementById('file-input').files[0]

	if (!text && !file) return

	// Edit Mode
	if (editingMessageId) {
		await updateDoc(doc(db, 'messages', editingMessageId), {
			text,
			isEdited: true,
		})
		cancelEdit()
		return
	}

	messageInput.value = ''

	let imageUrl = null
	if (file) {
		const refStorage = ref(
			storage,
			`chat_${currentChatId}/${Date.now()}_${file.name}`
		)
		await uploadBytes(refStorage, file)
		imageUrl = await getDownloadURL(refStorage)
		document.getElementById('file-input').value = ''
	}

	await addDoc(collection(db, 'messages'), {
		chatId: currentChatId,
		senderId: currentUser.uid,
		text,
		imageUrl,
		timestamp: serverTimestamp(),
	})

	await updateDoc(doc(db, 'chats', currentChatId), {
		lastMessage: imageUrl ? '📷 Фотография' : text,
		updatedAt: serverTimestamp(),
	})
})

// --- 6. Modal Functions (Search & Settings) ---

// Settings
document.getElementById('open-settings-btn').onclick = () =>
	window.openModal('modal-settings')

document.getElementById('save-settings-btn').onclick = async () => {
	const newName = document.getElementById('settings-username').value
	const file = document.getElementById('avatar-upload').files[0]

	let avatarUrl = null
	if (file) {
		const refStorage = ref(storage, `avatars/${currentUser.uid}`)
		await uploadBytes(refStorage, file)
		avatarUrl = await getDownloadURL(refStorage)
	}

	const updateData = { username: newName }
	if (avatarUrl) updateData.avatar = avatarUrl

	// Update in Firestore
	await updateDoc(doc(db, 'users', currentUser.uid), updateData)
	// Update visual
	window.location.reload()
}

document.getElementById('logout-btn').onclick = () => signOut(auth)

// Create Chat & Search
document.getElementById('fab-create-chat').onclick = () =>
	window.openModal('modal-new-chat')

const searchInput = document.getElementById('user-search-input')
const searchResults = document.getElementById('search-results')

searchInput.addEventListener('input', async e => {
	const val = e.target.value.trim()
	if (val.length < 3) return

	// Ищем точное совпадение по email (Firestore limited searching)
	// В продакшене лучше использовать Algolia, но для демо:
	const q = query(collection(db, 'users'), where('email', '==', val))
	const snap = await getDocs(q)

	searchResults.innerHTML = ''
	if (snap.empty) {
		searchResults.innerHTML =
			'<div style="padding:10px; color:#aaa;">Пользователь не найден</div>'
		return
	}

	snap.forEach(docSnap => {
		const user = docSnap.data()
		if (user.uid === currentUser.uid) return

		const div = document.createElement('div')
		div.className = 'user-list-item'
		div.innerHTML = `
            <div class="avatar" style="width:35px; height:35px; font-size:0.9rem;">${user.username[0]}</div>
            <div>
                <div style="font-weight:600;">${user.username}</div>
                <div style="font-size:0.8rem; color:#888;">${user.email}</div>
            </div>
        `
		div.onclick = () => createChat(user.uid)
		searchResults.appendChild(div)
	})
})

async function createChat(targetUid) {
	// Check existing
	// NOTE: В реальном приложении нужна сложная проверка, здесь упрощенно создаем новый
	// или ищем первый попавшийся. Для упрощения просто создадим документ

	const docRef = await addDoc(collection(db, 'chats'), {
		participants: [currentUser.uid, targetUid],
		lastMessage: '',
		updatedAt: serverTimestamp(),
	})

	window.closeModal('modal-new-chat')
	loadMyChats()
}

// --- 7. Helpers (Ctx Menu, Pin, Edit, Viewer) ---
function showCtxMenu(e, id, isMe, text) {
	contextMenuTargetId = id
	contextMenuTargetText = text

	ctxMenu.style.top = `${e.clientY}px`
	ctxMenu.style.left = `${e.clientX}px`
	ctxMenu.style.display = 'block'

	document.getElementById('ctx-edit').style.display = isMe ? 'flex' : 'none'
	document.getElementById('ctx-delete').style.display = isMe ? 'flex' : 'none'
}
document.addEventListener('click', () => (ctxMenu.style.display = 'none'))

document.getElementById('ctx-delete').onclick = async () => {
	if (confirm('Удалить?'))
		await deleteDoc(doc(db, 'messages', contextMenuTargetId))
}
document.getElementById('ctx-pin').onclick = async () => {
	await updateDoc(doc(db, 'chats', currentChatId), {
		pinnedMessageId: contextMenuTargetId,
	})
}
document.getElementById('ctx-edit').onclick = () => {
	editingMessageId = contextMenuTargetId
	messageInput.value = contextMenuTargetText
	document.getElementById('edit-badge').style.display = 'block'
	document.getElementById('editing-preview').textContent = contextMenuTargetText
}

function cancelEdit() {
	editingMessageId = null
	document.getElementById('edit-badge').style.display = 'none'
	messageInput.value = ''
}
document.getElementById('cancel-edit').onclick = cancelEdit

// Image Viewer
window.viewImage = url => {
	document.getElementById('viewer-img').src = url
	document.getElementById('image-viewer').style.display = 'flex'
}
document.getElementById('close-viewer').onclick = () =>
	(document.getElementById('image-viewer').style.display = 'none')

// Pinned Message Loader
async function showPinned(id) {
	const m = await getDoc(doc(db, 'messages', id))
	if (m.exists()) {
		pinnedBar.style.display = 'block'
		const t = m.data().text || 'Фотография'
		document.getElementById('pinned-text').textContent = t
	}
}

// Nav
document.getElementById('attach-btn').onclick = () =>
	document.getElementById('file-input').click()
document.getElementById('back-btn').onclick = () => {
	document.getElementById('sidebar').classList.add('visible')
	currentChatId = null
}
