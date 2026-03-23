import { GitHubDB, DatabaseError } from './github-db.js'

// ── Config ────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
    owner: 'ImDuck42',
    repo: 'Quotipedia',
    publicToken: 'ghdb_enc_ICEwKjIqGzImPBtzdgoFcBQOcAN3GSsXARAhKg8PFDEGFz0Adw4nKj0xBzJ/PykXETAqICgFLxoKHTUnPhwqKn97AxYXLBcPNTgwCxAfDnR0HwkaFyYgLhIkIg8T',
    useCDN: true,
}

function getConfig() {
    const saved = localStorage.getItem('quotipedia_cfg')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG
}

// ── State ─────────────────────────────────────────────────────────

let db       = null
let authMode = 'login'

// ── DOM refs ──────────────────────────────────────────────────────

const feed           = document.getElementById('feed')
const feedCount      = document.getElementById('feedCount')
const submitPanel    = document.getElementById('submitPanel')
const submitMsg      = document.getElementById('submitMsg')
const navArea        = document.getElementById('navArea')
const authModal      = document.getElementById('authModal')
const modalTitle     = document.getElementById('modalTitle')
const authUser       = document.getElementById('authUser')
const authPass       = document.getElementById('authPass')
const authError      = document.getElementById('authError')
const authSubmitBtn  = document.getElementById('authSubmitBtn')
const modalSwitch    = document.getElementById('modalSwitch')
const modalCloseBtn  = document.getElementById('modalCloseBtn')
const toast          = document.getElementById('toast')
const profileView    = document.getElementById('profileView')

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
    console.error('[Quotipedia] Unexpected error:', error)
    return 'Something went wrong. Please try again.'
}

function toastError(error) {
    showToast(userMessage(error), 'error')
}

function feedError(error) {
    const msg  = userMessage(error)
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

function escHtml(string) {
    return String(string ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// Like escHtml but converts newlines to <br> for display in HTML
function escHtmlNl(string) {
    return escHtml(string).replace(/\n/g, '<br>')
}

function timeAgo(date) {
    const diffSeconds = (Date.now() - date) / 1000
    if (diffSeconds < 60)     return 'just now'
    if (diffSeconds < 3600)   return `${Math.floor(diffSeconds / 60)}m ago`
    if (diffSeconds < 86400)  return `${Math.floor(diffSeconds / 3600)}h ago`
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Profile helpers ───────────────────────────────────────────────

const SOCIAL_ICONS = {
    twitter:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.624 5.905-5.624zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    github:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    youtube:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    website:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
}

function socialIcon(type) {
    return SOCIAL_ICONS[type] || SOCIAL_ICONS.website
}

function profileKvKey(username) {
    return `profile-${username.toLowerCase()}`
}

async function loadProfile(username) {
    try {
        const data = await db.kv.get(profileKvKey(username))
        return data || {}
    } catch {
        return {}
    }
}

async function saveProfile(username, profile) {
    await db.kv.set(profileKvKey(username), profile)
}

// ── Profile view ──────────────────────────────────────────────────

function openProfile(username) {
    renderProfileView(username)
    profileView.classList.add('open')
    document.body.style.overflow = 'hidden'
    history.pushState({ profile: username }, '', `#profile/${username}`)
}

function closeProfile() {
    profileView.classList.remove('open')
    document.body.style.overflow = ''
    if (location.hash.startsWith('#profile/')) {
        history.pushState({}, '', location.pathname)
    }
}

async function renderProfileView(username) {
    profileView.innerHTML = `
        <div class="pv-inner">
            <button class="pv-close" id="pvCloseBtn">✕</button>
            <div class="pv-loading">Loading profile</div>
        </div>
    `
    document.getElementById('pvCloseBtn').addEventListener('click', closeProfile)

    const [profile, quotes] = await Promise.all([
        loadProfile(username),
        db ? db.collection('quotes').query(r => r.postedBy === username, {
            sort: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
            limit: 6,
        }).catch(() => []) : Promise.resolve([]),
    ])

    const isOwnProfile = db?.auth?.isLoggedIn && db.auth.currentUser?.username === username
    const socials = profile.socials || {}

    const socialLinks = Object.entries(socials)
        .filter(([, url]) => url)
        .map(([type, url]) => `
            <a class="pv-social" href="${escHtml(url)}" target="_blank" rel="noopener" title="${escHtml(type)}">
                ${socialIcon(type)}
            </a>
        `).join('')

    const quoteCards = quotes.length
        ? quotes.map(q => `
            <div class="pv-quote-card">
                <div class="pv-quote-mark">"</div>
                <p class="pv-quote-text">${escHtml(q.text)}</p>
                ${q.author ? `<span class="pv-quote-by">&mdash; ${escHtml(q.author)}</span>` : ''}
            </div>
        `).join('')
        : `<p class="pv-no-quotes">No quotes yet.</p>`

    profileView.innerHTML = `
        <div class="pv-inner">
            <button class="pv-close" id="pvCloseBtn">✕</button>

            <div class="pv-banner" style="${profile.banner ? `background-image: url('${escHtml(profile.banner)}')` : ''}">
                <div class="pv-banner-overlay"></div>
            </div>

            <div class="pv-body">
                <div class="pv-header">
                    <div class="pv-avatar-wrap">
                        ${profile.avatar
                            ? `<img class="pv-avatar" src="${escHtml(profile.avatar)}" alt="${escHtml(username)}" />`
                            : `<div class="pv-avatar pv-avatar-default">${escHtml(username[0].toUpperCase())}</div>`
                        }
                    </div>
                    <div class="pv-identity">
                        <h2 class="pv-username">${escHtml(username)}</h2>
                        ${profile.bio ? `<p class="pv-bio">${escHtmlNl(profile.bio)}</p>` : ''}
                        ${socialLinks ? `<div class="pv-socials">${socialLinks}</div>` : ''}
                        ${isOwnProfile ? `<button class="btn btn-sm pv-edit-btn" id="pvEditBtn">Edit profile</button>` : ''}
                    </div>
                </div>

                <div class="pv-section-label">Quotes by ${escHtml(username)}</div>
                <div class="pv-quotes">${quoteCards}</div>
            </div>
        </div>
    `

    document.getElementById('pvCloseBtn').addEventListener('click', closeProfile)
    if (isOwnProfile) {
        document.getElementById('pvEditBtn').addEventListener('click', () => openEditModal(username, profile))
    }
}

// ── Profile edit modal ────────────────────────────────────────────

function openEditModal(username, profile) {
    const socials = profile.socials || {}
    const editModal = document.getElementById('editProfileModal')

    document.getElementById('epAvatar').value    = profile.avatar   || ''
    document.getElementById('epBanner').value    = profile.banner   || ''
    document.getElementById('epBio').value       = profile.bio      || ''
    document.getElementById('epTwitter').value   = socials.twitter   || ''
    document.getElementById('epGithub').value    = socials.github    || ''
    document.getElementById('epInstagram').value = socials.instagram || ''
    document.getElementById('epYoutube').value   = socials.youtube   || ''
    document.getElementById('epWebsite').value   = socials.website   || ''
    document.getElementById('epError').textContent = ''

    editModal.classList.add('open')
}

function closeEditModal() {
    document.getElementById('editProfileModal').classList.remove('open')
}

document.getElementById('epCancelBtn').addEventListener('click', closeEditModal)
document.getElementById('editProfileModal').addEventListener('click', e => {
    if (e.target === document.getElementById('editProfileModal')) closeEditModal()
})

document.getElementById('epSaveBtn').addEventListener('click', async () => {
    const username = db?.auth?.currentUser?.username
    if (!username) return

    const profile = {
        avatar: document.getElementById('epAvatar').value.trim(),
        banner: document.getElementById('epBanner').value.trim(),
        bio:    document.getElementById('epBio').value.trim().slice(0, 200),
        socials: {
            twitter:   document.getElementById('epTwitter').value.trim(),
            github:    document.getElementById('epGithub').value.trim(),
            instagram: document.getElementById('epInstagram').value.trim(),
            youtube:   document.getElementById('epYoutube').value.trim(),
            website:   document.getElementById('epWebsite').value.trim(),
        },
    }

    const btn = document.getElementById('epSaveBtn')
    btn.disabled = true
    btn.textContent = 'Saving...'

    try {
        await saveProfile(username, profile)
        closeEditModal()
        showToast('Profile saved.', 'success')
        renderProfileView(username)
    } catch (error) {
        document.getElementById('epError').textContent = userMessage(error)
    } finally {
        btn.disabled = false
        btn.textContent = 'Save'
    }
})

// ── Rendering ─────────────────────────────────────────────────────

function renderQuote(quote) {
    const isOwner    = db?.auth?.isLoggedIn && db.auth.currentUser?.username === quote.postedBy
    const when       = quote.createdAt ? timeAgo(new Date(quote.createdAt)) : ''
    const deleteBtn  = isOwner
        ? `<button class="btn btn-sm btn-danger" data-id="${quote.id}">delete</button>`
        : ''
    const attribution = quote.author
        ? `<span class="quote-by">&mdash; ${escHtml(quote.author)}</span>`
        : ''

    return `
        <div class="quote-card" id="card-${quote.id}">
            <div class="quote-mark">"</div>
            <p class="quote-text">${escHtml(quote.text)}</p>
            <div class="quote-meta">
                <div>${attribution}</div>
                <div class="quote-actions">${deleteBtn}</div>
            </div>
            <div class="quote-time">
                <span class="by-label">by</span> <button class="quote-author-btn" data-user="${escHtml(quote.postedBy || '')}">
                    ${escHtml(quote.postedBy || 'anon')}
                </button>
                &nbsp;&middot;&nbsp; ${when}
            </div>
        </div>
    `
}

// ── Feed ──────────────────────────────────────────────────────────

async function loadQuotes() {
    if (!db) return
    feed.innerHTML = '<div class="loading">Loading quotes</div>'
    try {
        const quotes = await db.collection('quotes').query(
            () => true,
            { sort: (quoteA, quoteB) => new Date(quoteB.createdAt) - new Date(quoteA.createdAt) }
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

        feed.querySelectorAll('.quote-author-btn[data-user]').forEach(btn => {
            if (btn.dataset.user) {
                btn.addEventListener('click', () => openProfile(btn.dataset.user))
            }
        })
    } catch (error) {
        feedError(error)
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
    } catch (error) {
        toastError(error)
    }
}

// ── Submit ────────────────────────────────────────────────────────

document.getElementById('submitQuoteBtn').addEventListener('click', async () => {
    const text   = document.getElementById('qText').value.trim()
    const author = document.getElementById('qAuthor').value.trim()
    if (!text) { submitMsg.textContent = 'The quote cannot be empty.'; return }
    submitMsg.textContent = 'Publishing...'
    try {
        await db.collection('quotes').add({
            text,
            author:   author || null,
            postedBy: db.auth.currentUser.username,
        })
        document.getElementById('qText').value   = ''
        document.getElementById('qAuthor').value = ''
        submitMsg.textContent = ''
        showToast('Quote published!', 'success')
        loadQuotes()
    } catch (error) {
        submitMsg.textContent = userMessage(error)
        toastError(error)
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
    const isRegister = authMode === 'register'
    modalTitle.textContent    = isRegister ? 'Create account' : 'Welcome back'
    authSubmitBtn.textContent = isRegister ? 'Create account' : 'Sign in'
    modalSwitch.innerHTML     = isRegister
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
authModal.addEventListener('click', event => { if (event.target === authModal) closeModal() })
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (document.getElementById('editProfileModal').classList.contains('open')) closeEditModal()
        else if (authModal.classList.contains('open')) closeModal()
        else if (profileView.classList.contains('open')) closeProfile()
    }
    if (event.key === 'Enter' && authModal.classList.contains('open')) doAuth()
})

window.addEventListener('popstate', () => {
    if (!location.hash.startsWith('#profile/')) {
        profileView.classList.remove('open')
        document.body.style.overflow = ''
    }
})

// ── Auth ──────────────────────────────────────────────────────────

async function doAuth() {
    const username = authUser.value.trim()
    const password = authPass.value
    authError.textContent = ''
    if (!username || !password) { authError.textContent = 'Fill in both fields.'; return }

    authSubmitBtn.disabled    = true
    authSubmitBtn.textContent = authMode === 'login' ? 'Signing in...' : 'Creating...'

    try {
        if (authMode === 'register') {
            await db.auth.register(username, password)
            closeModal()
            updateNav(db.auth.currentUser)
            showToast(`Account created, welcome ${username}!`, 'success')
            loadQuotes()
            return
        }

        await db.auth.login(username, password)
        closeModal()
        updateNav(db.auth.currentUser)
        showToast(`Welcome back, ${username}!`, 'success')
        loadQuotes()
    } catch (error) {
        authError.textContent = userMessage(error)
    } finally {
        authSubmitBtn.disabled    = false
        syncModal(false)
    }
}

// ── Nav ───────────────────────────────────────────────────────────

function updateNav(user) {
    if (user) {
        navArea.innerHTML = `
            <div class="user-chip">
                <button class="user-chip-name" id="myProfileBtn"><strong>${escHtml(user.username)}</strong></button>
                <button class="btn btn-sm" id="logoutBtn">Sign out</button>
            </div>
        `
        navArea.querySelector('#logoutBtn').addEventListener('click', logout)
        navArea.querySelector('#myProfileBtn').addEventListener('click', () => openProfile(user.username))
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
    updateNav(null)
    showToast('Signed out.', 'success')
    loadQuotes()
}

// ── Init ──────────────────────────────────────────────────────────

async function init(cfg) {
    if (!cfg.owner || !cfg.repo || !cfg.publicToken) {
        feed.innerHTML = '<div class="empty">Configure your GitHub repo to get started.</div>'
        return
    }
    try {
        db = await GitHubDB.public({
            owner:       cfg.owner,
            repo:        cfg.repo,
            publicToken: cfg.publicToken,
            useCDN:      cfg.useCDN,
            enrollToken: cfg.enrollToken,
        })
        db.permissions({
            quotes: { read: 'public', write: 'auth'},
            _kv:    { read: 'public', write: 'auth'},
        })

        if (db.auth.isLoggedIn) await db.auth.verifySession()

        updateNav(db.auth.isLoggedIn ? db.auth.currentUser : null)
        loadQuotes()

        if (location.hash.startsWith('#profile/')) {
            const username = decodeURIComponent(location.hash.slice(9))
            if (username) openProfile(username)
        }
    } catch (error) {
        toastError(error)
        feed.innerHTML = '<div class="empty error-state"><p>Could not connect to the database.</p></div>'
    }
}

init(getConfig())