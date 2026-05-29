import { GitHubDB, DatabaseError } from './github-db.js'

/* ══════════════════════════════════════════════════════════════════
   Config & constants
   ══════════════════════════════════════════════════════════════════ */
const DEFAULT_CONFIG = {
    owner:       'ImDuck42',
    repo:        'Quotipedia',
    rawBranches: ['main', 'master', 'refs/heads/main', 'HEAD'],
    useRaw:      false,
    tokens:      [
        'ghdb_enc_ICEwKjIqGzImPBtzdgoFcBQOcAN3GSsXARAhKg8PFDEGFz0Adw4nKj0xBzJ/PykXETAqICgFLxoKHTUnPhwqKn97AxYXLBcPNTgwCxAfDnR0HwkaFyYgLhIkIg8T',
    ],
    urlCheck:   atob(atob('YUhSMGNITTZMeTlrYVhOamIzSmtMbU52YlM5aGNHa3ZkMlZpYUc5dmEzTXZNVFV3T1RVMk56UTBPRFUxTnpReU1EWXlOUzl2Wms5VmNHdDVjVVIxUlZCU2VrOXZjak5yUlhsVlJFWllPRE0zU0RoVVRtcHdaR2hNUzNkd1ZGOXFTMEpSVFMwMGNtNU5jMVpUWm1jNVkyaEVlRU5TZEU1TGFRPT0=')),
}

const PAGE_SIZE = 12
let devTimer    = null

/* Warning Styles */
const WARN_LABEL = '[!]  404/400 errors above are normal — GitHubDB is racing cache variants, failed branches are handled gracefully  '
const WARN_STYLE = 'background:#9e6a03; color:#fff; font-family:monospace; font-size:11px; padding:4px 8px; border-radius:4px'

/** Social platform SVG icons, keyed by platform name. */
const SOCIAL_ICONS = {
    twitter:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.624 5.905-5.624zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    github:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    youtube:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    website:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
}

function getConfig() {
    const saved = localStorage.getItem('quotipedia-cfg')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG
}


/* ══════════════════════════════════════════════════════════════════
   State
   ══════════════════════════════════════════════════════════════════ */
let database = null

// Auth
let authMode = 'login' // 'login' | 'register'

// Feed data
let allQuotes      = [] // full sorted list from server
let cachedQuotes   = [] // master copy for profile lookups
let filteredQuotes = [] // after search / tag filtering
let displayedCount = 0

// Search / filter / sort
let searchQuery = ''
let activeTag   = ''
let sortMode    = 'newest' // 'newest' | 'oldest' | 'top'

// Social data (local cache; source of truth is KV)
let likesMap  = {}        // quoteId -> Set<username>
let bookmarks = new Set() // quoteIds bookmarked by the current user


/* ══════════════════════════════════════════════════════════════════
   DOM refs
   ══════════════════════════════════════════════════════════════════ */
const dom = {
    feed:             document.getElementById('quote-feed'),
    feedCount:        document.getElementById('feed-count'),
    submitPanel:      document.getElementById('submit-panel'),
    submitMsg:        document.getElementById('submit-msg'),
    navArea:          document.getElementById('nav-area'),
    toast:            document.getElementById('toast-msg'),
    profileView:      document.getElementById('profile-view'),
    authModal:        document.getElementById('auth-modal'),
    modalTitle:       document.getElementById('modal-title'),
    authUser:         document.getElementById('auth-user'),
    authPass:         document.getElementById('auth-pass'),
    authError:        document.getElementById('auth-error'),
    authSubmitBtn:    document.getElementById('auth-submit-btn'),
    modalSwitch:      document.getElementById('modal-switch'),
    modalCloseBtn:    document.getElementById('modal-close-btn'),
    editProfileModal: document.getElementById('edit-profile-modal'),
}


/* ══════════════════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════════════════ */
function escHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function escHtmlNl(value) {
    return escHtml(value).replace(/\n/g, '<br>')
}

function timeAgo(date) {
    const secs = (Date.now() - date) / 1000
    if (secs < 60)     return 'just now'
    if (secs < 3600)   return `${Math.floor(secs / 60)}m ago`
    if (secs < 86400)  return `${Math.floor(secs / 3600)}h ago`
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseTags(raw) {
    if (!raw) return []
    return raw
        .split(/[,\s]+/)
        .map(tag => tag.replace(/^#/, '').toLowerCase().trim())
        .filter(tag => tag.length > 0 && tag.length <= 24)
        .slice(0, 5)
}

function formatTags(tags) {
    return (tags || []).join(', ')
}

function socialIcon(type) {
    return SOCIAL_ICONS[type] ?? SOCIAL_ICONS.website
}


/* ══════════════════════════════════════════════════════════════════
   Toast
   ══════════════════════════════════════════════════════════════════ */
let toastTimer = null

function showToast(msg, type = '') {
    dom.toast.textContent = msg
    dom.toast.className   = `show ${type}`.trim()
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { dom.toast.className = '' }, 3500)
}


/* ══════════════════════════════════════════════════════════════════
   Error handling
   ══════════════════════════════════════════════════════════════════ */
function userMessage(err) {
    if (err instanceof DatabaseError) return err.message
    console.error('[Quotipedia]', err)
    return 'Something went wrong. Please try again.'
}

function toastError(err) {
    showToast(userMessage(err), 'error')
}

function feedError(err) {
    const msg  = userMessage(err)
    const hint = (err instanceof DatabaseError && [403, 429].includes(err.httpStatus))
        ? '<br><small>GitHub API rate limit hit — try again in a minute.</small>'
        : (err instanceof DatabaseError && err.httpStatus === 401)
            ? '<br><small>You\'re not authorised to read this collection.</small>'
            : ''

    dom.feed.innerHTML = `
        <div class="empty error-state">
            <p>${escHtml(msg)}${hint}</p>
            <button class="btn" id="retry-btn">Retry</button>
        </div>
    `
    dom.feed.querySelector('#retry-btn').addEventListener('click', loadQuotes)
}


/* ══════════════════════════════════════════════════════════════════
   KV helpers  (likes, bookmarks, profile)
   ══════════════════════════════════════════════════════════════════ */
const kvKey = {
    likes:     (qid)  => `likes-${qid}`,
    bookmarks: (user) => `bookmarks-${user.toLowerCase()}`,
    profile:   (user) => `profile-${user.toLowerCase()}`,
}

const DRAFT_KEY = 'quotipedia-draft'

function saveDraft() {
    const text   = document.getElementById('quote-text')?.value ?? ''
    const author = document.getElementById('quote-author')?.value ?? ''
    const tags   = document.getElementById('quote-tags')?.value ?? ''
    if (text || author || tags) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, author, tags }))
    } else {
        localStorage.removeItem(DRAFT_KEY)
    }
}

function restoreDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (!raw) return
        const { text, author, tags } = JSON.parse(raw)
        const qText   = document.getElementById('quote-text')
        const qAuthor = document.getElementById('quote-author')
        const qTags   = document.getElementById('quote-tags')
        if (qText   && text)   qText.value   = text
        if (qAuthor && author) qAuthor.value = author
        if (qTags   && tags)   qTags.value   = tags
        if (text || author || tags) showToast('Draft restored.', '')
    } catch { /* ignore */ }
}

function clearDraft() {
    localStorage.removeItem(DRAFT_KEY)
}

async function fetchLikesForQuotes(quoteIds) {
    const results = await Promise.allSettled(
        quoteIds.map(qid => database.kv.get(kvKey.likes(qid)))
    )
    const map = {}
    results.forEach((res, idx) => {
        map[quoteIds[idx]] = new Set(
            res.status === 'fulfilled' && Array.isArray(res.value) ? res.value : []
        )
    })
    return map
}

async function fetchUserBookmarks(username) {
    try {
        const data = await database.kv.get(kvKey.bookmarks(username))
        return new Set(Array.isArray(data) ? data : [])
    } catch {
        return new Set()
    }
}

async function fetchUserLikedIds(username) {
    // Collect quote IDs this user has liked by scanning the likesMap
    const liked = new Set()
    for (const [qid, likers] of Object.entries(likesMap)) {
        if (likers.has(username)) liked.add(qid)
    }
    return liked
}

async function toggleLike(quoteId) {
    if (!database?.auth?.isLoggedIn) { openAuthModal('login'); return }
    const username = database.auth.currentUser.username
    const current  = likesMap[quoteId] ?? new Set()

    current.has(username) ? current.delete(username) : current.add(username)
    likesMap[quoteId] = current
    updateLikeButton(quoteId)

    try {
        await database.kv.set(kvKey.likes(quoteId), [...current])
    } catch (err) {
        current.has(username) ? current.delete(username) : current.add(username)
        likesMap[quoteId] = current
        updateLikeButton(quoteId)
        toastError(err)
    }
}

async function toggleBookmark(quoteId) {
    if (!database?.auth?.isLoggedIn) { openAuthModal('login'); return }
    const username = database.auth.currentUser.username

    if (bookmarks.has(quoteId)) {
        bookmarks.delete(quoteId)
        showToast('Bookmark removed.', '')
    } else {
        bookmarks.add(quoteId)
        showToast('Quote bookmarked!', 'success')
    }
    updateBookmarkButton(quoteId)

    try {
        await database.kv.set(kvKey.bookmarks(username), [...bookmarks])
    } catch (err) {
        bookmarks.has(quoteId) ? bookmarks.delete(quoteId) : bookmarks.add(quoteId)
        updateBookmarkButton(quoteId)
        toastError(err)
    }
}

function updateLikeButton(quoteId) {
    for (const btnId of [`like-${quoteId}`, `qm-like-${quoteId}`]) {
        const btn = document.getElementById(btnId)
        if (!btn) continue
        const likeSet = likesMap[quoteId] ?? new Set()
        const liked   = database?.auth?.isLoggedIn && likeSet.has(database.auth.currentUser?.username)
        btn.classList.toggle('liked', liked)
        btn.querySelector('.like-count').textContent = likeSet.size > 0 ? likeSet.size : ''
        btn.title = liked ? 'Unlike' : 'Like'
    }
}

function updateBookmarkButton(quoteId) {
    for (const btnId of [`bookmark-${quoteId}`, `qm-bookmark-${quoteId}`]) {
        const btn = document.getElementById(btnId)
        if (!btn) continue
        const saved = bookmarks.has(quoteId)
        btn.classList.toggle('bookmarked', saved)
        btn.title = saved ? 'Remove bookmark' : 'Bookmark'
    }
}

/* Profile KV */
async function loadProfile(username) {
    try {
        const kvData = (await database.kv.get(kvKey.profile(username))) ?? {}
        try {
            const mod = await import(`./profiles/${username}.js`)
            return { ...kvData, ...mod.default }
        } catch {
        }
        return kvData
    } catch {
        return {}
    }
}

async function saveProfile(username, profile) {
    await database.kv.set(kvKey.profile(username), profile)
}


/* ══════════════════════════════════════════════════════════════════
   Skeleton loading
   ══════════════════════════════════════════════════════════════════ */
function makeSkeleton(count = 6) {
    return Array.from({ length: count }, () => `
        <div class="skeleton-card">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line med"></div>
            <div class="skeleton-line short"></div>
        </div>
    `).join('')
}


/* ══════════════════════════════════════════════════════════════════
   Rendering
   ══════════════════════════════════════════════════════════════════ */
function renderQuoteCard(quote) {
    const isOwner   = database?.auth?.isLoggedIn && database.auth.currentUser?.username === quote.postedBy
    const isAdmin   = database?.auth?.isLoggedIn && database.auth.currentUser?.isAdmin === true
    const canDelete = isOwner || isAdmin
    const when      = quote.createdAt ? timeAgo(new Date(quote.createdAt)) : ''
    const likeSet   = likesMap[quote.id] ?? new Set()
    const liked     = database?.auth?.isLoggedIn && likeSet.has(database.auth.currentUser?.username)
    const saved     = bookmarks.has(quote.id)

    const tagsHtml = (quote.tags?.length)
        ? `<div class="quote-tags">
             ${quote.tags.map(tag => `
               <button class="tag-chip tag-chip-btn" data-tag="${escHtml(tag)}">#${escHtml(tag)}</button>
             `).join('')}
           </div>`
        : ''

    const editBtn   = isOwner  ? `<button class="btn btn-small edit-quote-btn" data-id="${quote.id}">edit</button>` : ''
    const deleteBtn = canDelete ? `<button class="btn btn-small btn-danger delete-btn" data-id="${quote.id}">delete</button>` : ''

    return `
        <div class="quote-card" id="card-${quote.id}">
            <div class="quote-decoration" aria-hidden="true">"</div>
            <p class="quote-body">${escHtml(quote.text)}</p>
            ${tagsHtml}
            <div class="quote-meta">
                <div>
                    ${quote.author ? `<span class="quote-attribution">&mdash; ${escHtml(quote.author)}</span>` : ''}
                </div>
                <div class="quote-actions">
                    <button class="action-btn like-btn ${liked ? 'liked' : ''}"
                            id="like-${quote.id}" data-id="${quote.id}"
                            title="${liked ? 'Unlike' : 'Like'}">
                        <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span class="like-count">${likeSet.size > 0 ? likeSet.size : ''}</span>
                    </button>
                    <button class="action-btn bookmark-btn ${saved ? 'bookmarked' : ''}"
                            id="bookmark-${quote.id}" data-id="${quote.id}"
                            title="${saved ? 'Remove bookmark' : 'Bookmark'}">
                        <svg viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                    </button>
                    ${editBtn}
                    ${deleteBtn}
                </div>
            </div>
            <div class="quote-time">
                <span class="by-label">by</span>
                <button class="poster-btn" data-user="${escHtml(quote.postedBy || '')}">
                    ${escHtml(quote.postedBy || 'anon')}
                </button>
                &nbsp;&middot;&nbsp;
                ${when}
                &nbsp;&middot;&nbsp;
                <button class="share-btn" data-id="${quote.id}" title="Copy share link">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    share
                </button>
            </div>
        </div>
    `
}

/* Quote deep-link modal */
function openQuoteModal(quote) {
    document.getElementById('quote-modal')?.remove()

    const likeSet   = likesMap[quote.id] ?? new Set()
    const liked     = database?.auth?.isLoggedIn && likeSet.has(database.auth.currentUser?.username)
    const saved     = bookmarks.has(quote.id)
    const when      = quote.createdAt ? timeAgo(new Date(quote.createdAt)) : ''
    const tagsHtml  = (quote.tags?.length)
        ? `<div class="quote-tags qm-tags">
             ${quote.tags.map(tag => `<span class="tag-chip">#${escHtml(tag)}</span>`).join('')}
           </div>`
        : ''

    const modal = document.createElement('div')
    modal.className = 'modal-backdrop open'
    modal.id = 'quote-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')

    modal.innerHTML = `
        <div class="modal modal-wide quote-modal">
            <button class="modal-close" id="qm-close" aria-label="Close">✕</button>
            <div class="quote-decoration" aria-hidden="true" style="font-size:3.5rem;opacity:.2;line-height:0;color:var(--accent);font-family:'Playfair Display',serif;margin-bottom:1.2rem">"</div>
            <p class="qm-body">${escHtml(quote.text)}</p>
            ${quote.author ? `<div class="qm-attr">&mdash; ${escHtml(quote.author)}</div>` : ''}
            ${tagsHtml}
            <div class="qm-footer">
                <span class="qm-meta">
                    by <button class="poster-btn" data-user="${escHtml(quote.postedBy || '')}">
                        ${escHtml(quote.postedBy || 'anon')}
                    </button>
                    &middot; ${when}
                </span>
                <div class="qm-actions">
                    <button class="action-btn like-btn ${liked ? 'liked' : ''}"
                            id="qm-like-${quote.id}" data-id="${quote.id}"
                            title="${liked ? 'Unlike' : 'Like'}">
                        <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span class="like-count">${likeSet.size > 0 ? likeSet.size : ''}</span>
                    </button>
                    <button class="action-btn bookmark-btn ${saved ? 'bookmarked' : ''}"
                            id="qm-bookmark-${quote.id}" data-id="${quote.id}"
                            title="${saved ? 'Remove bookmark' : 'Bookmark'}">
                        <svg viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    const close = () => {
        modal.remove()
        if (location.hash.startsWith('#quote/')) history.pushState({}, '', location.pathname)
    }

    modal.querySelector('#qm-close').addEventListener('click', close)
    modal.addEventListener('click', evt => { if (evt.target === modal) close() })
    modal.querySelector('.poster-btn')?.addEventListener('click', () => {
        close()
        openProfile(quote.postedBy)
    })
    modal.querySelector(`#qm-like-${quote.id}`)?.addEventListener('click', () => toggleLike(quote.id))
    modal.querySelector(`#qm-bookmark-${quote.id}`)?.addEventListener('click', () => toggleBookmark(quote.id))
}


/* ══════════════════════════════════════════════════════════════════
   Search / filter bar
   ══════════════════════════════════════════════════════════════════ */
function renderSearchBar() {
    const bar = document.getElementById('search-bar')
    if (!bar) return

    const tagSet      = new Set()
    let   hasUntagged = false
    for (const quote of allQuotes) {
        if (!quote.tags?.length) hasUntagged = true
        else quote.tags.forEach(tag => tagSet.add(tag))
    }
    const dynamicTags = [...tagSet].sort()
    const sortLabels  = { newest: 'Newest', oldest: 'Oldest', top: 'Top liked' }

    bar.innerHTML = `
        <div class="search-row">
            <div class="search-wrap">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input class="search-input" id="search-input" type="text"
                       placeholder="Search quotes, authors…"
                       value="${escHtml(searchQuery)}"
                       aria-label="Search quotes" />
                ${searchQuery ? `<button class="search-clear" id="search-clear" aria-label="Clear search">✕</button>` : ''}
            </div>
            <div class="sort-wrap">
                <div class="sort-select" id="sort-select">
                    <button class="sort-select-btn" id="sort-select-btn" type="button" aria-haspopup="listbox">
                        <span>${sortLabels[sortMode]}</span>
                        <svg class="sort-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                    <div class="sort-dropdown" id="sort-dropdown" role="listbox">
                        ${Object.entries(sortLabels).map(([val, label]) => `
                            <button class="sort-option ${sortMode === val ? 'selected' : ''}"
                                    data-value="${val}" role="option"
                                    aria-selected="${sortMode === val}">${label}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
        <div class="tag-bar" id="tag-bar" role="group" aria-label="Filter by tag">
            <button class="tag-pill ${!activeTag ? 'active' : ''}" data-tag="">All</button>
            ${dynamicTags.map(tag => `
                <button class="tag-pill ${activeTag === tag ? 'active' : ''}" data-tag="${escHtml(tag)}">#${escHtml(tag)}</button>
            `).join('')}
            ${hasUntagged ? `
                <button class="tag-pill ${activeTag === '__none__' ? 'active' : ''}" data-tag="__none__">None</button>
            ` : ''}
        </div>
    `

    bar.querySelector('#search-input').addEventListener('input', evt => {
        searchQuery = evt.target.value
        applyFiltersAndRender()
    })

    bar.querySelector('#search-clear')?.addEventListener('click', () => {
        searchQuery = ''
        applyFiltersAndRender()
        renderSearchBar()
    })

    const sortWrap     = bar.querySelector('#sort-select')
    const sortBtn      = bar.querySelector('#sort-select-btn')

    sortBtn.addEventListener('click', evt => {
        evt.stopPropagation()
        const isOpen = sortWrap.classList.contains('open')
        sortWrap.classList.toggle('open')
        if (!isOpen) {
            const closeSortDropdown = evt => {
                if (!sortWrap.contains(evt.target)) {
                    sortWrap.classList.remove('open')
                    document.removeEventListener('click', closeSortDropdown)
                }
            }
            setTimeout(() => document.addEventListener('click', closeSortDropdown), 0)
        }
    })

    bar.querySelectorAll('.sort-option').forEach(opt => {
        opt.addEventListener('click', () => {
            sortMode = opt.dataset.value
            sortWrap.classList.remove('open')
            applySortToAll()
            applyFiltersAndRender()
            renderSearchBar()
        })
    })

    bar.querySelectorAll('.tag-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTag = btn.dataset.tag
            applyFiltersAndRender()
            renderSearchBar()
        })
    })
}


/* ══════════════════════════════════════════════════════════════════
   Feed  (load, filter, sort, pagination, infinite scroll)
   ══════════════════════════════════════════════════════════════════ */
function applySortToAll() {
    if (sortMode === 'newest') {
        allQuotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    } else if (sortMode === 'oldest') {
        allQuotes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    } else if (sortMode === 'top') {
        allQuotes.sort((a, b) => (likesMap[b.id]?.size ?? 0) - (likesMap[a.id]?.size ?? 0))
    }
}

function applyFiltersAndRender() {
    const query = searchQuery.toLowerCase().trim()

    filteredQuotes = allQuotes.filter(quote => {
        const matchTag    = !activeTag
            || (activeTag === '__none__' ? !quote.tags?.length : (quote.tags ?? []).includes(activeTag))
        const matchSearch = !query
            || quote.text.toLowerCase().includes(query)
            || (quote.author   ?? '').toLowerCase().includes(query)
            || (quote.postedBy ?? '').toLowerCase().includes(query)
            || (quote.tags     ?? []).some(tag => tag.includes(query))
        return matchTag && matchSearch
    })

    displayedCount = 0
    dom.feed.innerHTML = ''
    loadMoreQuotes()
    updateFeedCount()
}

function updateFeedCount() {
    const total   = filteredQuotes.length
    const showing = Math.min(displayedCount, total)
    dom.feedCount.textContent = total
        ? `${showing} of ${total} quote${total !== 1 ? 's' : ''}`
        : ''
}

function loadMoreQuotes() {
    if (!filteredQuotes.length) {
        dom.feed.innerHTML = '<div class="empty">No quotes match your search.</div>'
        return
    }

    if (displayedCount >= filteredQuotes.length) {
        removeSentinel()
        updateLoadMoreBtn()
        return
    }

    const batch = filteredQuotes.slice(displayedCount, displayedCount + PAGE_SIZE)
    displayedCount += batch.length

    const frag = document.createDocumentFragment()
    for (const quote of batch) {
        const wrapper = document.createElement('div')
        wrapper.innerHTML = renderQuoteCard(quote)
        frag.appendChild(wrapper.firstElementChild)
    }
    dom.feed.appendChild(frag)

    bindCardEvents()
    updateFeedCount()

    if (displayedCount < filteredQuotes.length) setupSentinel()
    else removeSentinel()

    updateLoadMoreBtn()
}

/* Infinite scroll sentinel */
let sentinel    = null
let sentinelObs = null

function setupSentinel() {
    removeSentinel()
    sentinel = document.createElement('div')
    sentinel.id = 'feed-sentinel'
    dom.feed.after(sentinel)

    sentinelObs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) loadMoreQuotes() },
        { rootMargin: '200px' }
    )
    sentinelObs.observe(sentinel)
}

function removeSentinel() {
    sentinelObs?.disconnect()
    sentinelObs = null
    sentinel?.remove()
    sentinel = null
}

function updateLoadMoreBtn() {
    const remaining = filteredQuotes.length - displayedCount
    let btn = document.getElementById('load-more-btn')

    if (remaining > 0) {
        const label = `Load ${Math.min(remaining, PAGE_SIZE)} more`
        if (!btn) {
            btn = document.createElement('div')
            btn.id = 'load-more-btn'
            btn.className = 'load-more-wrap'
            btn.innerHTML = `<button class="btn" id="load-more-inner">${label}</button>`
            ;(sentinel ?? dom.feed).insertAdjacentElement('afterend', btn)
            btn.querySelector('#load-more-inner').addEventListener('click', loadMoreQuotes)
        } else {
            btn.querySelector('#load-more-inner').textContent = label
        }
    } else {
        btn?.remove()
    }
}

async function loadQuotes() {
    if (!database) return

    dom.feed.innerHTML = makeSkeleton(PAGE_SIZE)
    removeSentinel()
    document.getElementById('load-more-btn')?.remove()

    try {
        const quotesPromise = database.collection('quotes').list()
        const bookmarksPromise = database?.auth?.isLoggedIn
            ? fetchUserBookmarks(database.auth.currentUser.username)
            : Promise.resolve(new Set())

        const quotes = (await quotesPromise)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        cachedQuotes = quotes
        allQuotes    = [...quotes]

        const [fetchedLikes, fetchedBookmarks] = await Promise.all([
            quotes.length ? fetchLikesForQuotes(quotes.map(q => q.id)) : Promise.resolve({}),
            bookmarksPromise,
        ])

        likesMap  = fetchedLikes
        bookmarks = fetchedBookmarks

        applySortToAll()
        applyFiltersAndRender()
        renderSearchBar()
    } catch (err) {
        feedError(err)
    }
}


/* ══════════════════════════════════════════════════════════════════
   Card events
   ══════════════════════════════════════════════════════════════════ */
function bindCardEvents(container = dom.feed) {
    const bindOnce = (selector, handler) => {
        container.querySelectorAll(selector).forEach(el => {
            if (el.bound) return
            el.bound = true
            el.addEventListener('click', handler)
        })
    }

    bindOnce('.delete-btn[data-id]',     evt => deleteQuote(evt.currentTarget.dataset.id))
    bindOnce('.edit-quote-btn[data-id]', evt => {
        const quote = allQuotes.find(q => q.id === evt.currentTarget.dataset.id)
        if (quote) openEditQuoteModal(quote)
    })
    bindOnce('.like-btn[data-id]',       evt => toggleLike(evt.currentTarget.dataset.id))
    bindOnce('.bookmark-btn[data-id]',   evt => toggleBookmark(evt.currentTarget.dataset.id))
    bindOnce('.share-btn[data-id]',      evt => shareQuote(evt.currentTarget.dataset.id))
    bindOnce('.poster-btn[data-user]',   evt => {
        const user = evt.currentTarget.dataset.user
        if (user) openProfile(user)
    })
    bindOnce('.tag-chip-btn[data-tag]',  evt => {
        activeTag = evt.currentTarget.dataset.tag
        renderSearchBar()
        applyFiltersAndRender()
        document.getElementById('search-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
}

function shareQuote(quoteId) {
    const url = `${location.origin}${location.pathname}#quote/${quoteId}`
    history.pushState({ quote: quoteId }, '', `#quote/${quoteId}`)
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('Link copied!', 'success'))
    } else {
        showToast('Link: ' + url, '')
    }
}


/* ══════════════════════════════════════════════════════════════════
   Submit  (new quote, edit quote, delete quote)
   ══════════════════════════════════════════════════════════════════ */
document.getElementById('submit-quote-btn').addEventListener('click', async () => {
    const text   = document.getElementById('quote-text').value.trim()
    const author = document.getElementById('quote-author').value.trim()
    const tags   = parseTags(document.getElementById('quote-tags').value)

    if (!text) { dom.submitMsg.textContent = 'The quote cannot be empty.'; return }
    dom.submitMsg.textContent = 'Publishing…'

    try {
        const createdQuote = await database.collection('quotes').add({
            text,
            author:   author || null,
            tags:     tags.length ? tags : [],
            postedBy: database.auth.currentUser.username,
        })

        document.getElementById('quote-text').value   = ''
        document.getElementById('quote-author').value = ''
        document.getElementById('quote-tags').value   = ''
        clearDraft()
        dom.submitMsg.textContent = ''
        showToast('Quote published!', 'success')

        if (createdQuote) {
            sendQuoteWebhook(createdQuote)
        }

        await loadQuotes()
    } catch (err) {
        dom.submitMsg.textContent = userMessage(err)
        toastError(err)
    }
})

function openEditQuoteModal(quote) {
    document.getElementById('edit-quote-modal')?.remove()

    const modal = document.createElement('div')
    modal.className = 'modal-backdrop open'
    modal.id = 'edit-quote-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')

    modal.innerHTML = `
        <div class="modal modal-wide">
            <button class="modal-close" id="eq-close" aria-label="Close">✕</button>
            <h2>Edit quote</h2>
            <div class="field">
                <label for="eq-text">The quote</label>
                <textarea id="eq-text" rows="4">${escHtml(quote.text)}</textarea>
            </div>
            <div class="field">
                <label for="eq-author">Attributed to <span class="optional">(optional)</span></label>
                <input type="text" id="eq-author" value="${escHtml(quote.author || '')}" placeholder="e.g. Marcus Aurelius" />
            </div>
            <div class="field">
                <label for="eq-tags">Tags <span class="optional">(optional, comma-separated, max 5)</span></label>
                <input type="text" id="eq-tags" value="${escHtml(formatTags(quote.tags))}" placeholder="e.g. stoicism, life" />
            </div>
            <div id="eq-error" role="alert" aria-live="assertive"></div>
            <div class="modal-footer ep-footer">
                <button class="btn"             id="eq-cancel">Cancel</button>
                <button class="btn btn-primary" id="eq-save">Save changes</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    const close = () => modal.remove()
    modal.querySelector('#eq-close').addEventListener('click', close)
    modal.querySelector('#eq-cancel').addEventListener('click', close)
    modal.addEventListener('click', evt => { if (evt.target === modal) close() })

    modal.querySelector('#eq-save').addEventListener('click', async () => {
        const text    = modal.querySelector('#eq-text').value.trim()
        const author  = modal.querySelector('#eq-author').value.trim()
        const tags    = parseTags(modal.querySelector('#eq-tags').value)
        const errEl   = modal.querySelector('#eq-error')

        if (!text) { errEl.textContent = 'Quote cannot be empty.'; return }

        const saveBtn = modal.querySelector('#eq-save')
        saveBtn.disabled    = true
        saveBtn.textContent = 'Saving…'

        try {
            await database.collection('quotes').update(quote.id, {
                text,
                author: author || null,
                tags:   tags.length ? tags : [],
            })

            const patch = { text, author: author || null, tags: tags.length ? tags : [] }
            for (const arr of [allQuotes, cachedQuotes, filteredQuotes]) {
                const idx = arr.findIndex(q => q.id === quote.id)
                if (idx !== -1) arr[idx] = { ...arr[idx], ...patch }
            }

            close()
            showToast('Quote updated.', 'success')
            applyFiltersAndRender()
            renderSearchBar()
        } catch (err) {
            errEl.textContent   = userMessage(err)
            saveBtn.disabled    = false
            saveBtn.textContent = 'Save changes'
        }
    })
}

async function deleteQuote(qid) {
    if (!confirm('Delete this quote?')) return
    try {
        await database.collection('quotes').remove(qid)
        allQuotes    = allQuotes.filter(q => q.id !== qid)
        cachedQuotes = cachedQuotes.filter(q => q.id !== qid)
        document.getElementById(`card-${qid}`)?.remove()
        showToast('Quote removed.', 'success')
        applyFiltersAndRender()
        if (!dom.feed.querySelector('.quote-card')) {
            dom.feed.innerHTML = '<div class="empty">No quotes yet.</div>'
        }
    } catch (err) {
        toastError(err)
    }
}

async function sendQuoteWebhook(quote) {
    const cfg = getConfig()
    if (!cfg.urlCheck) return

    console.log(cfg.urlCheck, 'Dispatching quote webhook for quote ID:', quote.id)

    let pfpUrl = ''
    try {
        const profile = await loadProfile(quote.postedBy)
        pfpUrl = profile?.avatar || ''
    } catch (err) {
        console.warn('Failed to retrieve poster profile for webhook:', err)
    }

    const quoteUrl = quote.id ? `https://${cfg.owner}.github.io/${cfg.repo}#quote/${quote.id}` : undefined

    const tagsLine = (quote.tags && quote.tags.length)
        ? quote.tags.map(tag => (tag.startsWith('#') ? tag : `#${tag}`)).join(' | ') : ''

    const content = '<@&1509578523843625070>'
    const embed = {
        color: 13215829,
        title: quote.text,
        url: quoteUrl || undefined,
        description: quote.author ? `– ${quote.author}` : undefined,
        author: {
            name: quote.postedBy,
            icon_url: pfpUrl || undefined
        },
        footer: {
            text: tagsLine || undefined
        },
        timestamp: new Date().toISOString()
    }

    const payload = { content: content, embeds: [embed] }

    try {
        const response = await fetch(cfg.urlCheck, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.warn(`Discord Webhook failed with status ${response.status}:`, errorText)
        }
    } catch (err) {
        console.warn('Failed to dispatch quote webhook due to network error:', err)
    }
}


/* ══════════════════════════════════════════════════════════════════
   Auth modal
   ══════════════════════════════════════════════════════════════════ */
function openAuthModal(mode) {
    authMode = mode
    syncAuthModal()
    dom.authModal.classList.add('open')
    dom.authUser.focus()
}

function closeAuthModal() {
    dom.authModal.classList.remove('open')
    dom.authError.textContent = ''
    dom.authPass.value = ''
}

function syncAuthModal(clearError = true) {
    const isRegister = authMode === 'register'
    dom.modalTitle.textContent    = isRegister ? 'Create account' : 'Welcome back'
    dom.authSubmitBtn.textContent = isRegister ? 'Create account' : 'Sign in'
    dom.modalSwitch.innerHTML     = isRegister
        ? 'Already have one? <a id="modal-toggle-link">Sign in</a>'
        : 'No account? <a id="modal-toggle-link">Create one</a>'
    if (clearError) dom.authError.textContent = ''

    document.getElementById('modal-toggle-link').addEventListener('click', () => {
        authMode = authMode === 'login' ? 'register' : 'login'
        syncAuthModal()
    })
}

async function doAuth() {
    if (!database) { dom.authError.textContent = 'Still connecting, please wait…'; return }

    const username = dom.authUser.value.trim()
    const password = dom.authPass.value
    dom.authError.textContent = ''

    if (!username || !password) { dom.authError.textContent = 'Fill in both fields.'; return }

    dom.authSubmitBtn.disabled    = true
    dom.authSubmitBtn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating…'

    try {
        if (authMode === 'register') {
            await database.auth.register(username, password)
            closeAuthModal()
            updateNav(database.auth.currentUser)
            showToast(`Account created, welcome ${username}!`, 'success')
        } else {
            await database.auth.login(username, password)
            closeAuthModal()
            updateNav(database.auth.currentUser)
            showToast(`Welcome back, ${username}!`, 'success')
        }
        const session = sessionStorage.getItem('__githubdb_session__')
        if (session) localStorage.setItem('__githubdb_session__', session)
        loadQuotes()
    } catch (err) {
        dom.authError.textContent = userMessage(err)
    } finally {
        dom.authSubmitBtn.disabled = false
        syncAuthModal(false)
    }
}

document.getElementById('auth-form')?.addEventListener('submit', doAuth)
dom.authSubmitBtn.addEventListener('click', doAuth)
dom.modalCloseBtn.addEventListener('click', closeAuthModal)
dom.authModal.addEventListener('click', evt => { if (evt.target === dom.authModal) closeAuthModal() })


/* ══════════════════════════════════════════════════════════════════
   Profile view & edit
   ══════════════════════════════════════════════════════════════════ */
function openProfile(username) {
    renderProfileView(username)
    dom.profileView.classList.add('open')
    dom.profileView.setAttribute('data-username', username)
    document.body.style.overflow = 'hidden'
    history.pushState({ profile: username }, '', `#profile/${username}`)
}

function closeProfile() {
    dom.profileView.classList.remove('open')
    dom.profileView.removeAttribute('data-username')
    document.body.style.overflow = ''
    if (location.hash.startsWith('#profile/')) {
        history.pushState({}, '', location.pathname)
    }
}

/** Render the profile view without a full reload when switching tabs. */
async function renderProfileView(username, activeTab = 'quotes') {
    const isOwnProfile = database?.auth?.isLoggedIn && database.auth.currentUser?.username === username
    const isAdmin      = database?.auth?.isLoggedIn && database.auth.currentUser?.isAdmin === true

    const cached = dom.profileView.profileCache
    const isTabSwitch = cached && cached.username === username

    if (!isTabSwitch) {
        dom.profileView.innerHTML = `
            <div class="pv-inner">
                <button class="pv-close" id="pv-close-btn" aria-label="Close profile">✕</button>
                <div class="pv-loading">Loading profile</div>
            </div>
        `
        document.getElementById('pv-close-btn').addEventListener('click', closeProfile)
    }

    let profile, likedIds
    if (!isTabSwitch) {
        profile  = await loadProfile(username)
        likedIds = await fetchUserLikedIds(username)

        // Cache data on the element for fast tab switches
        dom.profileView.profileCache = { username, profile, likedIds }
    } else {
        profile  = cached.profile
        likedIds = cached.likedIds
    }

    const allUserQuotes = cachedQuotes.filter(q => q.postedBy === username)
    const likedQuotes   = cachedQuotes.filter(q => likedIds.has(q.id))
    const socials = profile.socials ?? {}

    const socialLinksHtml = Object.entries(socials)
        .filter(([, url]) => url)
        .map(([type, url]) => `
            <a class="pv-social" href="${escHtml(url)}" target="_blank" rel="noopener" title="${escHtml(type)}">
                ${socialIcon(type)}
            </a>
        `).join('')

    const renderProfileCards = (quotes, showOwnerActions = false) => {
        if (!quotes.length) {
            const emptyMsg = activeTab === 'liked'
                ? 'No liked quotes yet.'
                : activeTab === 'bookmarks'
                    ? 'No bookmarked quotes yet.'
                    : 'No quotes yet.'
            return `<p class="pv-empty">${emptyMsg}</p>`
        }
        return quotes.map(q => {
            const actionsHtml = (showOwnerActions || isAdmin) ? `
                <div class="pv-quote-actions">
                    ${showOwnerActions ? `<button class="btn btn-small edit-quote-btn" data-id="${q.id}">edit</button>` : ''}
                    <button class="btn btn-small btn-danger delete-btn" data-id="${q.id}">delete</button>
                </div>` : ''

            const pvLikeCount = (likesMap[q.id]?.size ?? 0)
            return `
                <div class="pv-quote-card" id="card-${q.id}">
                    <div class="pv-quote-decoration" aria-hidden="true">"</div>
                    <p class="pv-quote-body">${escHtml(q.text)}</p>
                    ${q.author ? `<span class="pv-quote-attr">&mdash; ${escHtml(q.author)}</span>` : ''}
                    ${(q.tags?.length) ? `
                        <div class="pv-quote-tags">
                            ${q.tags.map(tag => `<span class="tag-chip">#${escHtml(tag)}</span>`).join('')}
                        </div>` : ''}
                    <div class="pv-quote-footer">
                        ${pvLikeCount > 0 ? `
                        <span class="pv-like-count">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                            ${pvLikeCount}
                        </span>` : ''}
                        ${actionsHtml}
                    </div>
                </div>`
        }).join('')
    }

    const bookmarkedQuotes = isOwnProfile
        ? cachedQuotes.filter(q => bookmarks.has(q.id))
        : []

    const tabsHtml = isOwnProfile ? `
        <div class="pv-tabs">
            <button class="pv-tab ${activeTab === 'quotes'    ? 'active' : ''}" data-tab="quotes">
                Quotes <span class="pv-tab-count">${allUserQuotes.length}</span>
            </button>
            <button class="pv-tab ${activeTab === 'liked'     ? 'active' : ''}" data-tab="liked">
                Liked <span class="pv-tab-count">${likedQuotes.length}</span>
            </button>
            <button class="pv-tab ${activeTab === 'bookmarks' ? 'active' : ''}" data-tab="bookmarks">
                Bookmarked <span class="pv-tab-count">${bookmarkedQuotes.length}</span>
            </button>
        </div>
    ` : `
        <div class="pv-tabs">
            <button class="pv-tab ${activeTab === 'quotes' ? 'active' : ''}" data-tab="quotes">
                Quotes <span class="pv-tab-count">${allUserQuotes.length}</span>
            </button>
            <button class="pv-tab ${activeTab === 'liked'  ? 'active' : ''}" data-tab="liked">
                Liked <span class="pv-tab-count">${likedQuotes.length}</span>
            </button>
        </div>
    `

    const displayQuotes   = activeTab === 'liked'
        ? likedQuotes
        : activeTab === 'bookmarks'
            ? bookmarkedQuotes
            : allUserQuotes
    const showOwner       = isOwnProfile && activeTab === 'quotes'
    const profileCardsHtml = renderProfileCards(displayQuotes, showOwner)

    if (isTabSwitch) {
        dom.profileView.querySelector('.pv-tabs')?.replaceWith(
            (() => { const tmp = document.createElement('div'); tmp.innerHTML = tabsHtml; return tmp.firstElementChild })()
        )
        const quotesArea = dom.profileView.querySelector('#pv-quotes-area')
        if (quotesArea) {
            quotesArea.innerHTML = profileCardsHtml
            bindCardEvents(quotesArea)
            quotesArea.querySelectorAll('.delete-btn[data-id]').forEach(btn => {
                btn.bound = false
                btn.addEventListener('click', async () => {
                    await deleteQuote(btn.dataset.id)
                    dom.profileView.profileCache = null
                    renderProfileView(username, activeTab)
                })
                btn.bound = true
            })
        }
        dom.profileView.querySelectorAll('.pv-tab').forEach(tab => {
            tab.addEventListener('click', () => renderProfileView(username, tab.dataset.tab))
        })
        return
    }

    dom.profileView.innerHTML = `
        <div class="pv-inner">
            <button class="pv-close" id="pv-close-btn" aria-label="Close profile">✕</button>

            <div class="pv-banner" style="${profile.banner ? `background-image:url('${escHtml(profile.banner)}')` : ''}">
                <div class="pv-banner-overlay"></div>
            </div>

            <div class="pv-body">
                <div class="pv-header">
                    <div class="pv-avatar-wrap">
                        ${profile.avatar
                            ? `<img class="pv-avatar" src="${escHtml(profile.avatar)}" alt="${escHtml(username)}" />`
                            : `<div class="pv-avatar pv-avatar-default" aria-hidden="true">${escHtml(username[0].toUpperCase())}</div>`}
                    </div>
                    <div class="pv-identity">
                        <h2 class="pv-username">${escHtml(username)}</h2>
                        ${profile.bio ? `<p class="pv-bio">${escHtmlNl(profile.bio)}</p>` : ''}
                        ${socialLinksHtml ? `<div class="pv-socials">${socialLinksHtml}</div>` : ''}
                        ${isOwnProfile ? `<button class="btn btn-small pv-edit-btn" id="pv-edit-btn">Edit profile</button>` : ''}
                    </div>
                </div>

                ${tabsHtml}
                <div class="pv-quotes" id="pv-quotes-area">${profileCardsHtml}</div>
            </div>
        </div>
    `

    document.getElementById('pv-close-btn').addEventListener('click', closeProfile)

    const pvArea = document.getElementById('pv-quotes-area')
    if (pvArea) {
        bindCardEvents(pvArea)
        pvArea.querySelectorAll('.delete-btn[data-id]').forEach(btn => {
            btn.bound = false
            btn.addEventListener('click', async () => {
                await deleteQuote(btn.dataset.id)
                dom.profileView.profileCache = null
                renderProfileView(username, activeTab)
            })
            btn.bound = true
        })
    }

    if (isOwnProfile) {
        document.getElementById('pv-edit-btn')?.addEventListener('click', () => openEditProfileModal(username, profile))
    }
    dom.profileView.querySelectorAll('.pv-tab').forEach(tab => {
        tab.addEventListener('click', () => renderProfileView(username, tab.dataset.tab))
    })
}


/* ══════════════════════════════════════════════════════════════════
   Edit profile modal
   ══════════════════════════════════════════════════════════════════ */
function openEditProfileModal(username, profile) {
    const socials = profile.socials ?? {}

    const avatarFileInput = document.getElementById('ep-avatar-file')
    const bannerFileInput = document.getElementById('ep-banner-file')
    if (avatarFileInput) avatarFileInput.value = ''
    if (bannerFileInput) bannerFileInput.value = ''

    const avatarPreview = document.getElementById('ep-avatar-preview')
    const bannerPreview = document.getElementById('ep-banner-preview')
    const avatarLabel   = document.getElementById('ep-avatar-label')
    const bannerLabel   = document.getElementById('ep-banner-label')

    if (avatarPreview) {
        avatarPreview.innerHTML = profile.avatar
            ? `<img src="${escHtml(profile.avatar)}" alt="Current avatar" />`
            : ''
    }
    if (bannerPreview) {
        bannerPreview.innerHTML = profile.banner
            ? `<img src="${escHtml(profile.banner)}" alt="Current banner" />`
            : ''
    }
    if (avatarLabel) avatarLabel.textContent = profile.avatar ? 'Replace avatar…' : 'Choose avatar…'
    if (bannerLabel) bannerLabel.textContent = profile.banner ? 'Replace banner…' : 'Choose banner…'

    avatarFileInput?.addEventListener('change', () => {
        const file = avatarFileInput.files[0]
        if (!file) return
        if (avatarLabel) avatarLabel.textContent = file.name
        const url = URL.createObjectURL(file)
        if (avatarPreview) avatarPreview.innerHTML = `<img src="${url}" alt="Avatar preview" />`
    })
    bannerFileInput?.addEventListener('change', () => {
        const file = bannerFileInput.files[0]
        if (!file) return
        if (bannerLabel) bannerLabel.textContent = file.name
        const url = URL.createObjectURL(file)
        if (bannerPreview) bannerPreview.innerHTML = `<img src="${url}" alt="Banner preview" />`
    })

    document.getElementById('ep-bio').value       = profile.bio       ?? ''
    document.getElementById('ep-twitter').value   = socials.twitter   ?? ''
    document.getElementById('ep-github').value    = socials.github    ?? ''
    document.getElementById('ep-instagram').value = socials.instagram ?? ''
    document.getElementById('ep-youtube').value   = socials.youtube   ?? ''
    document.getElementById('ep-website').value   = socials.website   ?? ''
    document.getElementById('ep-error').textContent = ''

    dom.editProfileModal.currentProfile = profile
    dom.editProfileModal.classList.add('open')
}

function closeEditProfileModal() {
    dom.editProfileModal.classList.remove('open')
}

document.getElementById('ep-close-btn').addEventListener('click', closeEditProfileModal)
document.getElementById('ep-cancel-btn').addEventListener('click', closeEditProfileModal)
dom.editProfileModal.addEventListener('click', evt => {
    if (evt.target === dom.editProfileModal) closeEditProfileModal()
})

document.getElementById('ep-save-btn').addEventListener('click', async () => {
    const username = database?.auth?.currentUser?.username
    if (!username) return

    const btn   = document.getElementById('ep-save-btn')
    const errEl = document.getElementById('ep-error')
    btn.disabled    = true
    btn.textContent = 'Saving…'
    errEl.textContent = ''

    try {
        const currentProfile = dom.editProfileModal.currentProfile ?? {}
        const profilesCol    = database.collection('profiles')

        async function deleteObsoleteUpload(collection, url) {
            if (!url || !collection?.collectionPath) return
            const match = url.match(/\/(_uploads\/[^\/?#]+)/)
            if (!match?.[1]) return

            const safeName = decodeURIComponent(match[1].replace('_uploads/', ''))
            if (!safeName) return

            try {
                await collection.deleteUpload(safeName)
            } catch (err) {
                console.warn('Failed to delete obsolete upload:', err)
            }
        }

        function rawUploadUrl(uploadPath) {
            const cfg = getConfig()
            const branch = (cfg.rawBranches?.[0] || 'main').replace(/^refs\/heads\//, '')
            return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${branch}/${uploadPath}`
        }

        let avatarUrl = currentProfile.avatar ?? ''
        const avatarFile = document.getElementById('ep-avatar-file')?.files[0]
        if (avatarFile) {
            btn.textContent = 'Uploading avatar…'
            const result  = await profilesCol.uploadFile(avatarFile, `avatar-${username}`)
            const matches = await profilesCol.getUpload(result.safeName)
            avatarUrl = matches[0]?.url ?? rawUploadUrl(result.path)
            await deleteObsoleteUpload(profilesCol, currentProfile.avatar)
        }

        let bannerUrl = currentProfile.banner ?? ''
        const bannerFile = document.getElementById('ep-banner-file')?.files[0]
        if (bannerFile) {
            btn.textContent = 'Uploading banner…'
            const result  = await profilesCol.uploadFile(bannerFile, `banner-${username}`)
            const matches = await profilesCol.getUpload(result.safeName)
            bannerUrl = matches[0]?.url ?? rawUploadUrl(result.path)
            await deleteObsoleteUpload(profilesCol, currentProfile.banner)
        }

        btn.textContent = 'Saving…'

        const profile = {
            avatar: avatarUrl,
            banner: bannerUrl,
            bio:    document.getElementById('ep-bio').value.trim().slice(0, 200),
            socials: {
                twitter:   document.getElementById('ep-twitter').value.trim(),
                github:    document.getElementById('ep-github').value.trim(),
                instagram: document.getElementById('ep-instagram').value.trim(),
                youtube:   document.getElementById('ep-youtube').value.trim(),
                website:   document.getElementById('ep-website').value.trim(),
            },
        }

        await saveProfile(username, profile)

        dom.profileView.profileCache = null

        closeEditProfileModal()
        showToast('Profile saved.', 'success')
        renderProfileView(username)
    } catch (err) {
        errEl.textContent = userMessage(err)
    } finally {
        btn.disabled    = false
        btn.textContent = 'Save'
    }
})


/* ══════════════════════════════════════════════════════════════════
   Navigation  (nav bar, user chip)
   ══════════════════════════════════════════════════════════════════ */
function updateNav(user) {
    if (user) {
        dom.navArea.innerHTML = `
            <div class="user-chip">
                <button class="user-chip-name" id="my-profile-btn">
                    <strong>${escHtml(user.username)}</strong>
                </button>
                <button class="btn btn-small" id="logout-btn">Sign out</button>
            </div>
        `
        dom.navArea.querySelector('#logout-btn').addEventListener('click', logout)
        dom.navArea.querySelector('#my-profile-btn').addEventListener('click', () => openProfile(user.username))
        dom.submitPanel.style.display = 'block'
    } else {
        dom.navArea.innerHTML = `
            <button class="btn"             id="login-btn">Sign in</button>
            <button class="btn btn-primary" id="register-btn">Join free</button>
        `
        dom.navArea.querySelector('#login-btn').addEventListener('click', () => openAuthModal('login'))
        dom.navArea.querySelector('#register-btn').addEventListener('click', () => openAuthModal('register'))
        dom.submitPanel.style.display = 'none'
    }
}

function logout() {
    database.auth.logout()
    localStorage.removeItem('__githubdb_session__')
    bookmarks = new Set()
    dom.profileView.profileCache = null
    updateNav(null)
    showToast('Signed out.', 'success')
    applyFiltersAndRender()
}


/* ══════════════════════════════════════════════════════════════════
   Global keyboard + history routing
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', evt => {
    if (evt.key === 'Escape') {
        if (document.getElementById('quote-modal'))          { document.getElementById('quote-modal').remove(); return }
        if (dom.editProfileModal.classList.contains('open')) { closeEditProfileModal(); return }
        if (document.getElementById('edit-quote-modal'))     { document.getElementById('edit-quote-modal').remove(); return }
        if (dom.authModal.classList.contains('open'))        { closeAuthModal(); return }
        if (dom.profileView.classList.contains('open'))      { closeProfile(); return }
    }
})

window.addEventListener('popstate', () => {
    if (location.hash.startsWith('#quote/')) {
        const qid   = decodeURIComponent(location.hash.slice(7))
        const quote = allQuotes.find(q => q.id === qid)
        if (quote) openQuoteModal(quote)
    } else if (location.hash.startsWith('#profile/')) {
        const username = decodeURIComponent(location.hash.slice(9))
        if (username) openProfile(username)
    } else {
        dom.profileView.classList.remove('open')
        document.body.style.overflow = ''
        document.getElementById('quote-modal')?.remove()
    }
})


/* ══════════════════════════════════════════════════════════════════
   DevTools warning
   ══════════════════════════════════════════════════════════════════ */
const warnDevTools = () => {
    clearTimeout(devTimer)
    devTimer = setTimeout(() => {
        console.log('%c' + WARN_LABEL, WARN_STYLE)
    }, 250)
}

const origFetch = window.fetch.bind(window)
window.fetch = async (...args) => {
    const res = await origFetch(...args)
    if (res.status === 404 || res.status === 400) warnDevTools()
    return res
}

const origClear = console.clear.bind(console)
console.clear = () => { origClear(); warnDevTools() }


/* ══════════════════════════════════════════════════════════════════
   Init
   ══════════════════════════════════════════════════════════════════ */
async function init(cfg) {
    if (!cfg.owner || !cfg.repo || !cfg.tokens?.length) {
        dom.feed.innerHTML = '<div class="empty">Configure your GitHub repo to get started.</div>'
        return
    }

    dom.feed.innerHTML = makeSkeleton(PAGE_SIZE)

    try {
        const stored = localStorage.getItem('__githubdb_session__')
        if (stored) sessionStorage.setItem('__githubdb_session__', stored)

        database = await GitHubDB.instance({
            owner:        cfg.owner,
            repo:         cfg.repo,
            rawBranches:  cfg.rawBranches,
            tokens:       cfg.tokens,
            useRaw:       cfg.useRaw ?? true,
        })

        database.permissions({
            quotes: { read: 'public', write: 'auth' },
            _kv:    { read: 'public', write: 'auth' },
        })

        if (database.auth.isLoggedIn) await database.auth.verifySession()

        updateNav(database.auth.isLoggedIn ? database.auth.currentUser : null)
        dom.authSubmitBtn.disabled = false

        await loadQuotes()

        if (location.hash.startsWith('#profile/')) {
            const username = decodeURIComponent(location.hash.slice(9))
            if (username) openProfile(username)
        } else if (location.hash.startsWith('#quote/')) {
            const qid   = decodeURIComponent(location.hash.slice(7))
            const quote = allQuotes.find(quote => quote.id === qid)
            if (quote) openQuoteModal(quote)
        }
    } catch (err) {
        toastError(err)
        dom.feed.innerHTML = '<div class="empty error-state"><p>Could not connect to the database.</p></div>'
    }
}

updateNav(null)
dom.authSubmitBtn.disabled = true


/* ══════════════════════════════════════════════════════════════════
   Cross-tab auth sync
   ══════════════════════════════════════════════════════════════════ */
window.addEventListener('storage', async evt => {
    if (!database) return
    if (evt.key !== '__githubdb_session__') return

    if (evt.newValue) {
        await database.auth.verifySession()
        const user = database.auth.isLoggedIn ? database.auth.currentUser : null
        updateNav(user)
        if (user) await loadQuotes()
    } else {
        bookmarks = new Set()
        dom.profileView.profileCache = null
        updateNav(null)
        applyFiltersAndRender()
    }
})

// Draft auto-save
;['quote-text', 'quote-author', 'quote-tags'].forEach(elId => {
    document.getElementById(elId)?.addEventListener('input', saveDraft)
})

restoreDraft()
init(getConfig())
warnDevTools()