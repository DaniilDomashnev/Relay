import { auth, db } from './firebase.js'
import {
	createUserWithEmailAndPassword,
	signInWithEmailAndPassword,
	onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import {
	doc,
	setDoc,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// DOM элементы
const loginForm = document.getElementById('login-form')
const registerForm = document.getElementById('register-form')
const toggleLink = document.getElementById('toggle-auth')
const formTitle = document.getElementById('form-title')
const subtitle = document.getElementById('subtitle')
const loader = document.getElementById('loader')
const errorMsg = document.getElementById('error-msg')

// Функция показа ошибки
function showError(msg) {
	errorMsg.textContent = msg
	errorMsg.style.display = 'block'
	setTimeout(() => (errorMsg.style.display = 'none'), 5000)
}

// Проверка сессии (если уже вошел - кидаем в чат)
onAuthStateChanged(auth, user => {
	if (user) {
		window.location.href = 'chat.html'
	} else {
		// Убираем лоадер только если пользователь НЕ авторизован
		loader.style.opacity = '0'
		setTimeout(() => (loader.style.display = 'none'), 500)
	}
})

// Переключение между Входом и Регистрацией
let isLogin = true

toggleLink.addEventListener('click', () => {
	isLogin = !isLogin
	errorMsg.style.display = 'none' // Скрыть старые ошибки

	if (isLogin) {
		// Режим ВХОДА
		loginForm.style.display = 'flex'
		registerForm.style.display = 'none'
		formTitle.innerText = 'Вход'
		subtitle.innerText = 'С возвращением!'
		toggleLink.innerHTML = 'Нет аккаунта? <span>Зарегистрироваться</span>'
	} else {
		// Режим РЕГИСТРАЦИИ
		loginForm.style.display = 'none'
		registerForm.style.display = 'flex'
		formTitle.innerText = 'Регистрация'
		subtitle.innerText = 'Создайте новый аккаунт'
		toggleLink.innerHTML = 'Уже есть аккаунт? <span>Войти</span>'
	}
})

// === ЛОГИКА РЕГИСТРАЦИИ ===
registerForm.addEventListener('submit', async e => {
	e.preventDefault()
	const username = document.getElementById('reg-username').value
	const email = document.getElementById('reg-email').value
	const password = document.getElementById('reg-password').value

	if (password.length < 6) {
		showError('Пароль должен быть не менее 6 символов')
		return
	}

	try {
		loader.style.display = 'flex'
		loader.style.opacity = '1'

		// 1. Создаем юзера в Auth
		const userCredential = await createUserWithEmailAndPassword(
			auth,
			email,
			password
		)
		const user = userCredential.user

		// 2. Создаем запись в Firestore
		await setDoc(doc(db, 'users', user.uid), {
			uid: user.uid,
			username: username,
			email: email,
			avatar: '', // Пустая аватарка по умолчанию
			createdAt: new Date(),
		})

		// Редирект сработает автоматически через onAuthStateChanged
	} catch (error) {
		loader.style.display = 'none'
		if (error.code === 'auth/email-already-in-use') {
			showError('Этот Email уже занят.')
		} else {
			showError('Ошибка: ' + error.message)
		}
	}
})

// === ЛОГИКА ВХОДА ===
loginForm.addEventListener('submit', async e => {
	e.preventDefault()
	const email = document.getElementById('login-email').value
	const password = document.getElementById('login-password').value

	try {
		loader.style.display = 'flex'
		loader.style.opacity = '1'
		await signInWithEmailAndPassword(auth, email, password)
		// Редирект авто
	} catch (error) {
		loader.style.display = 'none'
		if (error.code === 'auth/invalid-credential') {
			showError('Неверный email или пароль')
		} else {
			showError('Ошибка входа: ' + error.message)
		}
	}
})
