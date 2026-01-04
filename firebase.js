// firebase.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'

const firebaseConfig = {
	apiKey: 'AIzaSyC2c6gEICqLojru4q8Lca1nKB22xyojI74',
	authDomain: 'relay-4c021.firebaseapp.com',
	databaseURL: 'https://relay-4c021-default-rtdb.firebaseio.com',
	projectId: 'relay-4c021',
	storageBucket: 'relay-4c021.firebasestorage.app',
	messagingSenderId: '429941820524',
	appId: '1:429941820524:web:51b09f58f5093cfbd99c49',
	measurementId: 'G-C8RR2S55LF',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

export { auth, db, storage }
