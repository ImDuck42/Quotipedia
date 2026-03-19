import { GitHubDB, DatabaseError } from './github-db.js'
import { GitHubDB as LegacyDB } from './legacy-db.js'

// ── Config ────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
    owner: 'ImDuck42',
    repo: 'Quotipedia',
    publicToken: 'ghdb_enc_ICEwKjIqGzImPBtzdgoFcBQOcAN3GSsXARAhKg8PFDEGFz0Adw4nKj0xBzJ/PykXETAqICgFLxoKHTUnPhwqKn97AxYXLBcPNTgwCxAfDnR0HwkaFyYgLhIkIg8T',
    useCDN: true,
}

function getConfig() {
    const saved = localStorage.getItem('quotidian_cfg')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG
}

// ── State ─────────────────────────────────────────────────────────

let db = null   // new db (PBKDF2) — used for everything after login/migration
let legacyDb = null   // legacy db (SHA-256) — only used as login fallback

// Credentials held temporarily between legacy login success and migration confirmation
let pendingMigration = null  // { username, password } | null

let authMode = 'login'

// ── DOM refs ──────────────────────────────────────────────────────

const feed = document.getElementById('feed')
const feedCount = document.getElementById('feedCount')
const submitPanel = document.getElementById('submitPanel')
const submitMsg = document.getElementById('submitMsg')
const navArea = document.getElementById('navArea')
const authModal = document.getElementById('authModal')
const modalTitle = document.getElementById('modalTitle')
const authUser = document.getElementById('authUser')
const authPass = document.getElementById('authPass')
const authError = document.getElementById('authError')
const authSubmitBtn = document.getElementById('authSubmitBtn')
const modalSwitch = document.getElementById('modalSwitch')
const modalToggle = document.getElementById('modalToggleLink')
const modalCloseBtn = document.getElementById('modalCloseBtn')
const migrateModal = document.getElementById('migrateModal')
const migrateError = document.getElementById('migrateError')
const migrateBtn = document.getElementById('migrateBtn')
const migrateSkipBtn = document.getElementById('migrateSkipBtn')
const toast = document.getElementById('toast')

// ── Toast ─────────────────────────────────────────────────────────

let toastTimer = null

function showToast(msg, type = '') {
    toast.textContent = msg
    toast.className = `show ${type}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.className = '' }, 3500)
}

// ── Error handling ────────────────────────────────────────────────

function userMessage(error) {
    if (error instanceof DatabaseError) return error.message
    console.error('[Quotidian] Unexpected error:', error)
    return 'Something went wrong. Please try again.'
}

function toastError(error) {
    showToast(userMessage(error), 'error')
}

function feedError(error) {
    const msg = userMessage(error)
    const hint = error instanceof DatabaseError && error.httpStatus === 403
        ? '<br><small>GitHub API rate limit hit — try again in a minute.</small>'
        : error instanceof DatabaseError && error.httpStatus === 401
            ? '<br><small>You\'re not authorised to read this collection.</small>'
            : ''
    feed.innerHTML = `
    <div class="empty error-state">
      <p>${escHtml(msg)}${hint}</p>
      <button class="btn" id="retryBtn">Retry</button>
    </div>
  `
    feed.querySelector('#retryBtn').addEventListener('click', loadQuotes)
}

// ── Helpers ───────────────────────────────────────────────────────

function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function timeAgo(date) {
    const diff = (Date.now() - date) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Rendering ─────────────────────────────────────────────────────

function renderQuote(q) {
    const isOwner = db?.auth?.isLoggedIn && db.auth.currentUser?.username === q.postedBy
    const when = q.createdAt ? timeAgo(new Date(q.createdAt)) : ''
    const deleteBtn = isOwner
        ? `<button class="btn btn-sm btn-danger" data-id="${q.id}">delete</button>`
        : ''
    const attribution = q.author
        ? `<span class="quote-by">&mdash; ${escHtml(q.author)}</span>`
        : ''

    return `
    <div class="quote-card" id="card-${q.id}">
      <div class="quote-mark">"</div>
      <p class="quote-text">${escHtml(q.text)}</p>
      <div class="quote-meta">
        <div>${attribution}</div>
        <div class="quote-actions">${deleteBtn}</div>
      </div>
      <div class="quote-time">
        <span class="quote-author"><span>by</span> ${escHtml(q.postedBy || 'anon')}</span>
        &nbsp;&middot;&nbsp; ${when}
      </div>
    </div>
  `
}

// ── Feed ──────────────────────────────────────────────────────────

async function loadQuotes() {
    feed.innerHTML = '<div class="loading">Loading quotes</div>'
    try {
        const quotes = await db.collection('quotes').query(
            () => true,
            { sort: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) }
        )
        const count = quotes.length
        feedCount.textContent = count ? `${count} quote${count !== 1 ? 's' : ''}` : ''

        if (!count) {
            feed.innerHTML = '<div class="empty">No quotes yet.<br>Be the first to share one.</div>'
            return
        }

        feed.innerHTML = quotes.map(renderQuote).join('')

        feed.querySelectorAll('[data-id]').forEach(btn => {
            btn.addEventListener('click', () => deleteQuote(btn.dataset.id))
        })
    } catch (e) {
        feedError(e)
    }
}

async function deleteQuote(id) {
    if (!confirm('Delete this quote?')) return
    try {
        await db.collection('quotes').remove(id)
        document.getElementById(`card-${id}`)?.remove()
        showToast('Quote removed.', 'success')
        if (!feed.querySelector('.quote-card')) {
            feed.innerHTML = '<div class="empty">No quotes yet.</div>'
        }
    } catch (e) {
        toastError(e)
    }
}

// ── Submit ────────────────────────────────────────────────────────

document.getElementById('submitQuoteBtn').addEventListener('click', async () => {
    const text = document.getElementById('qText').value.trim()
    const author = document.getElementById('qAuthor').value.trim()
    if (!text) { submitMsg.textContent = 'The quote cannot be empty.'; return }
    submitMsg.textContent = 'Publishing...'
    try {
        await db.collection('quotes').add({
            text,
            author: author || null,
            postedBy: db.auth.currentUser.username,
        })
        document.getElementById('qText').value = ''
        document.getElementById('qAuthor').value = ''
        submitMsg.textContent = ''
        showToast('Quote published!', 'success')
        loadQuotes()
    } catch (e) {
        submitMsg.textContent = userMessage(e)
        toastError(e)
    }
})

// ── Auth modal ────────────────────────────────────────────────────

function openModal(mode) {
    authMode = mode
    syncModal()
    authModal.classList.add('open')
    authUser.focus()
}

function closeModal() {
    authModal.classList.remove('open')
    authError.textContent = ''
    authPass.value = ''
}

function syncModal(clearError = true) {
    const isReg = authMode === 'register'
    modalTitle.textContent = isReg ? 'Create account' : 'Welcome back'
    authSubmitBtn.textContent = isReg ? 'Create account' : 'Sign in'
    modalSwitch.innerHTML = isReg
        ? 'Already have one? <a id="modalToggleLink">Sign in</a>'
        : 'No account? <a id="modalToggleLink">Create one</a>'
    if (clearError) authError.textContent = ''
    document.getElementById('modalToggleLink').addEventListener('click', () => {
        authMode = authMode === 'login' ? 'register' : 'login'
        syncModal()
    })
}

authSubmitBtn.addEventListener('click', doAuth)
modalCloseBtn.addEventListener('click', closeModal)
authModal.addEventListener('click', e => { if (e.target === authModal) closeModal() })

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && authModal.classList.contains('open')) doAuth()
    if (e.key === 'Enter' && migrateModal.classList.contains('open')) doMigrate()
})

modalToggle.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'register' : 'login'
    syncModal()
})

// ── Login with legacy fallback ────────────────────────────────────

async function doAuth() {
    const username = authUser.value.trim()
    const password = authPass.value
    authError.textContent = ''
    if (!username || !password) { authError.textContent = 'Fill in both fields.'; return }

    authSubmitBtn.disabled = true
    authSubmitBtn.textContent = authMode === 'login' ? 'Signing in...' : 'Creating...'

    try {
        if (authMode === 'register') {
            // New accounts always go into the new db
            await db.auth.register(username, password)
            closeModal()
            updateNav(db.auth.currentUser)
            showToast(`Account created, welcome ${username}!`, 'success')
            loadQuotes()
            return
        }

        // ── Login: try new db first ──────────────────────────────────
        let usedLegacy = false
        try {
            await db.auth.login(username, password)
        } catch (newDbErr) {
            // Only fall back on credential errors — not network or rate-limit failures
            const isCredentialError = newDbErr instanceof DatabaseError
                && (newDbErr.httpStatus === 401 || newDbErr.httpStatus === 404)

            if (!isCredentialError) throw newDbErr

            // ── Fall back to legacy db ───────────────────────────────
            try {
                await legacyDb.auth.login(username, password)
                usedLegacy = true
            } catch {
                // Both failed
                throw newDbErr
            }
        }

        closeModal()

        if (usedLegacy) {
            // Credentials are valid but only against the old hash
            pendingMigration = { username, password }
            openMigrateModal(username)
        } else {
            updateNav(db.auth.currentUser)
            showToast(`Welcome back, ${username}!`, 'success')
            loadQuotes()
        }
    } catch (e) {
        authError.textContent = userMessage(e)
    } finally {
        authSubmitBtn.disabled = false
        syncModal(false)
    }
}

// ── Migration modal ───────────────────────────────────────────────

function openMigrateModal(username) {
    document.getElementById('migrateUsername').textContent = username
    migrateError.textContent = ''
    migrateModal.classList.add('open')
}

function closeMigrateModal() {
    migrateModal.classList.remove('open')
    migrateError.textContent = ''
    pendingMigration = null
}

migrateModal.addEventListener('click', e => e.stopPropagation())

migrateSkipBtn.addEventListener('click', () => {
    // User skips — grant access by syncing the legacy session into the new db
    // Next login they'll be prompted again until they migrate
    if (pendingMigration) {
        const legacyUser = legacyDb.auth.currentUser
        db.session.persistUser(legacyUser)
        updateNav(legacyUser)
        showToast(`Welcome back, ${legacyUser.username}! You can migrate anytime.`, '')
        loadQuotes()
    }
    closeMigrateModal()
})

migrateBtn.addEventListener('click', doMigrate)

async function doMigrate() {
  if (!pendingMigration) return
  const { username, password } = pendingMigration
 
  migrateBtn.disabled      = true
  migrateBtn.textContent   = 'Migrating…'
  migrateError.textContent = ''
 
  try {
    const usersFile = `${legacyDb.basePath}/_auth/users.json`
    const file      = await legacyDb.filesystem.readFile(usersFile)
    if (!file) throw new DatabaseError('User store not found', 404)
 
    const users     = file.content
    const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase())
    if (userIndex === -1) throw new DatabaseError('User not found', 404)
 
    // Compute new PBKDF2 hash — same context format as github-db's hashPassword()
    users[userIndex].passwordHash = await GitHubDB.hashSecret(password, username.toLowerCase())
    users[userIndex].updatedAt    = new Date().toISOString()
 
    await legacyDb.filesystem.writeFile(
      usersFile,
      users,
      `auth: migrate hash ${username}`,
      file.sha
    )
 
    // Now the file has a PBKDF2 hash — log in with the new db normally
    await db.auth.login(username, password)
 
    closeMigrateModal()
    updateNav(db.auth.currentUser)
    showToast('Password migrated successfully!', 'success')
    loadQuotes()
  } catch (e) {
    migrateError.textContent = userMessage(e)
  } finally {
    migrateBtn.disabled    = false
    migrateBtn.textContent = 'Migrate now'
  }
}

// ── Nav ───────────────────────────────────────────────────────────

function updateNav(user) {
    if (user) {
        navArea.innerHTML = `
      <div class="user-chip">
        <span><strong>${escHtml(user.username)}</strong></span>
        <button class="btn btn-sm" id="logoutBtn">Sign out</button>
      </div>
    `
        navArea.querySelector('#logoutBtn').addEventListener('click', logout)
        submitPanel.style.display = 'block'
    } else {
        navArea.innerHTML = `
      <button class="btn" id="loginBtn">Sign in</button>
      <button class="btn btn-primary" id="registerBtn">Join free</button>
    `
        navArea.querySelector('#loginBtn').addEventListener('click', () => openModal('login'))
        navArea.querySelector('#registerBtn').addEventListener('click', () => openModal('register'))
        submitPanel.style.display = 'none'
    }
}

function logout() {
    db.auth.logout()
    legacyDb.auth.logout()  // clear legacy session too if it exists
    updateNav(null)
    showToast('Signed out.', 'success')
    loadQuotes()
}

// ── Init ──────────────────────────────────────────────────────────

function init(cfg) {
    if (!cfg.owner || !cfg.repo || !cfg.publicToken) {
        feed.innerHTML = '<div class="empty">Configure your GitHub repo to get started.</div>'
        return
    }
    try {
        db = GitHubDB.public({
            owner: cfg.owner,
            repo: cfg.repo,
            publicToken: cfg.publicToken,
            useCDN: cfg.useCDN,
        }).rules({ quotes: { read: 'public', write: 'auth' } })

        legacyDb = LegacyDB.public({
            owner: cfg.owner,
            repo: cfg.repo,
            publicToken: cfg.publicToken,
            useCDN: false,  // legacy is write-path only, CDN unnecessary
        })

        if (db.auth.isLoggedIn) updateNav(db.auth.currentUser)
        loadQuotes()
    } catch (e) {
        toastError(e)
        feed.innerHTML = '<div class="empty error-state"><p>Could not connect to the database.</p></div>'
    }
}

document.getElementById('loginBtn').addEventListener('click', () => openModal('login'))
document.getElementById('registerBtn').addEventListener('click', () => openModal('register'))

init(getConfig())