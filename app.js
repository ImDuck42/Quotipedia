import { GitHubDB, DatabaseError } from './github-db.js'

/* ══════════════════════════════════════════════════════════════════
   Config & constants
   ══════════════════════════════════════════════════════════════════ */
const DEFAULT_CONFIG = {
    owner:        'ImDuck42',
    repo:         'Quotipedia',
    rawBranch:    'master',
    publicTokens: [
        'ghdb_enc_ICEwKjIqGzImPBtzdgoFcBQOcAN3GSsXARAhKg8PFDEGFz0Adw4nKj0xBzJ/PykXETAqICgFLxoKHTUnPhwqKn97AxYXLBcPNTgwCxAfDnR0HwkaFyYgLhIkIg8T',
    ],
}

const PAGE_SIZE = 12

/** Social platform SVG icons, keyed by platform name. */
const SOCIAL_ICONS = {
    twitter:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.624 5.905-5.624zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    github:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    youtube:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    website:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
}

function getConfig() {
    const saved = localStorage.getItem('quotipedia_cfg')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG
}


/* ══════════════════════════════════════════════════════════════════
   State
   ══════════════════════════════════════════════════════════════════ */
let db = null

// Auth modal
let authMode = 'login' // 'login' | 'register'

// Feed data
let allQuotes      = []   // full sorted list from server
let cachedQuotes   = []   // master copy for profile lookups
let filteredQuotes = []   // after search / tag filtering
let displayedCount = 0

// Search / filter / sort
let searchQuery = ''
let activeTag   = ''
let sortMode    = 'newest' // 'newest' | 'oldest' | 'top'

// Social data (local cache; source of truth is KV)
let likesMap  = {}       // quoteId → Set<username>
let bookmarks = new Set() // quoteIds bookmarked by the current user


/* ══════════════════════════════════════════════════════════════════
   DOM refs
   ══════════════════════════════════════════════════════════════════ */
const dom = {
    feed:             document.getElementById('feed'),
    feedCount:        document.getElementById('feedCount'),
    submitPanel:      document.getElementById('submitPanel'),
    submitMsg:        document.getElementById('submitMsg'),
    navArea:          document.getElementById('navArea'),
    toast:            document.getElementById('toast'),
    profileView:      document.getElementById('profileView'),
    authModal:        document.getElementById('authModal'),
    modalTitle:       document.getElementById('modalTitle'),
    authUser:         document.getElementById('authUser'),
    authPass:         document.getElementById('authPass'),
    authError:        document.getElementById('authError'),
    authSubmitBtn:    document.getElementById('authSubmitBtn'),
    modalSwitch:      document.getElementById('modalSwitch'),
    modalCloseBtn:    document.getElementById('modalCloseBtn'),
    editProfileModal: document.getElementById('editProfileModal'),
}


/* ══════════════════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════════════════ */
/** Escape a value for safe HTML insertion. */
function escHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** Escape and convert newlines to `<br>` tags. */
function escHtmlNl(value) {
    return escHtml(value).replace(/\n/g, '<br>')
}

/** Human-readable relative timestamp. */
function timeAgo(date) {
    const seconds = (Date.now() - date) / 1000
    if (seconds < 60)     return 'just now'
    if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Parse a raw tag string into a clean array (max 5 tags, max 24 chars each). */
function parseTags(raw) {
    if (!raw) return []
    return raw
        .split(/[,\s]+/)
        .map(t => t.replace(/^#/, '').toLowerCase().trim())
        .filter(t => t.length > 0 && t.length <= 24)
        .slice(0, 5)
}

/** Format a tags array back to a comma-separated string. */
function formatTags(tags) {
    return (tags || []).join(', ')
}

/** Return a social platform SVG icon, falling back to the website icon. */
function socialIcon(type) {
    return SOCIAL_ICONS[type] ?? SOCIAL_ICONS.website
}


/* ══════════════════════════════════════════════════════════════════
   Toast
   ══════════════════════════════════════════════════════════════════ */
let toastTimer = null

/** Display a transient notification. */
function showToast(msg, type = '') {
    dom.toast.textContent = msg
    dom.toast.className = `show ${type}`.trim()
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { dom.toast.className = '' }, 3500)
}


/* ══════════════════════════════════════════════════════════════════
   Error handling
   ══════════════════════════════════════════════════════════════════ */
/** Extract a user-friendly message from an error. */
function userMessage(error) {
    if (error instanceof DatabaseError) return error.message
    console.error('[Quotipedia]', error)
    return 'Something went wrong. Please try again.'
}

function toastError(error) {
    showToast(userMessage(error), 'error')
}

/** Render an error state in the feed with a retry button. */
function feedError(error) {
    const msg  = userMessage(error)
    const hint = (error instanceof DatabaseError && [403, 429].includes(error.httpStatus))
        ? '<br><small>GitHub API rate limit hit — try again in a minute.</small>'
        : (error instanceof DatabaseError && error.httpStatus === 401)
            ? '<br><small>You\'re not authorised to read this collection.</small>'
            : ''

    dom.feed.innerHTML = `
        <div class="empty error-state">
            <p>${escHtml(msg)}${hint}</p>
            <button class="btn" id="retryBtn">Retry</button>
        </div>
    `
    dom.feed.querySelector('#retryBtn').addEventListener('click', loadQuotes)
}


/* ══════════════════════════════════════════════════════════════════
   KV helpers  (likes, bookmarks, profile)
   ══════════════════════════════════════════════════════════════════ */
const kvKey = {
    likes:     id       => `likes-${id}`,
    bookmarks: username => `bookmarks-${username.toLowerCase()}`,
    profile:   username => `profile-${username.toLowerCase()}`,
}

/** Fetch like-sets for multiple quote IDs in parallel. */
async function fetchLikesForQuotes(quoteIds) {
    const results = await Promise.allSettled(
        quoteIds.map(id => db.kv.get(kvKey.likes(id)))
    )
    const map = {}
    results.forEach((r, i) => {
        map[quoteIds[i]] = new Set(
            r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []
        )
    })
    return map
}

/** Fetch the bookmark set for a user. Returns an empty Set on failure. */
async function fetchUserBookmarks(username) {
    try {
        const data = await db.kv.get(kvKey.bookmarks(username))
        return new Set(Array.isArray(data) ? data : [])
    } catch {
        return new Set()
    }
}

/** Toggle a like with optimistic UI update, reverting on failure. */
async function toggleLike(quoteId) {
    if (!db?.auth?.isLoggedIn) { openAuthModal('login'); return }
    const username = db.auth.currentUser.username
    const current  = likesMap[quoteId] ?? new Set()

    // Optimistic update
    current.has(username) ? current.delete(username) : current.add(username)
    likesMap[quoteId] = current
    updateLikeButton(quoteId)

    try {
        await db.kv.set(kvKey.likes(quoteId), [...current])
    } catch (error) {
        // Revert
        current.has(username) ? current.delete(username) : current.add(username)
        likesMap[quoteId] = current
        updateLikeButton(quoteId)
        toastError(error)
    }
}

/** Toggle a bookmark with optimistic UI update, reverting on failure. */
async function toggleBookmark(quoteId) {
    if (!db?.auth?.isLoggedIn) { openAuthModal('login'); return }
    const username = db.auth.currentUser.username

    // Optimistic update
    if (bookmarks.has(quoteId)) {
        bookmarks.delete(quoteId)
        showToast('Bookmark removed.', '')
    } else {
        bookmarks.add(quoteId)
        showToast('Quote bookmarked!', 'success')
    }
    updateBookmarkButton(quoteId)

    try {
        await db.kv.set(kvKey.bookmarks(username), [...bookmarks])
    } catch (error) {
        // Revert
        bookmarks.has(quoteId) ? bookmarks.delete(quoteId) : bookmarks.add(quoteId)
        updateBookmarkButton(quoteId)
        toastError(error)
    }
}

/** Sync a like button's visual state to current data. */
function updateLikeButton(quoteId) {
    // Update both the feed card and the open quote modal (if any)
    for (const id of [`like-${quoteId}`, `qm-like-${quoteId}`]) {
        const btn = document.getElementById(id)
        if (!btn) continue
        const likeSet = likesMap[quoteId] ?? new Set()
        const liked   = db?.auth?.isLoggedIn && likeSet.has(db.auth.currentUser?.username)
        btn.classList.toggle('liked', liked)
        btn.querySelector('.like-count').textContent = likeSet.size > 0 ? likeSet.size : ''
        btn.title = liked ? 'Unlike' : 'Like'
    }
}

/** Sync a bookmark button's visual state to current data. */
function updateBookmarkButton(quoteId) {
    for (const id of [`bookmark-${quoteId}`, `qm-bookmark-${quoteId}`]) {
        const btn = document.getElementById(id)
        if (!btn) continue
        const saved = bookmarks.has(quoteId)
        btn.classList.toggle('bookmarked', saved)
        btn.title = saved ? 'Remove bookmark' : 'Bookmark'
    }
}

/* Profile KV. */
async function loadProfile(username) {
    try {
        return (await db.kv.get(kvKey.profile(username))) ?? {}
    } catch {
        return {}
    }
}

async function saveProfile(username, profile) {
    await db.kv.set(kvKey.profile(username), profile)
}


/* ══════════════════════════════════════════════════════════════════
   Rendering
   ══════════════════════════════════════════════════════════════════ */
/* Quote card HTML. */
function renderQuoteCard(quote) {
    const isOwner   = db?.auth?.isLoggedIn && db.auth.currentUser?.username === quote.postedBy
    const isAdmin   = db?.auth?.isLoggedIn && db.auth.currentUser?.isAdmin === true
    const canDelete = isOwner || isAdmin
    const when      = quote.createdAt ? timeAgo(new Date(quote.createdAt)) : ''
    const likeSet   = likesMap[quote.id] ?? new Set()
    const liked     = db?.auth?.isLoggedIn && likeSet.has(db.auth.currentUser?.username)
    const saved     = bookmarks.has(quote.id)

    const tagsHtml = (quote.tags?.length)
        ? `<div class="quote-tags">
             ${quote.tags.map(t => `
               <button class="tag-chip tag-chip-btn" data-tag="${escHtml(t)}">#${escHtml(t)}</button>
             `).join('')}
           </div>`
        : ''

    const editBtn   = isOwner  ? `<button class="btn btn-sm edit-quote-btn" data-id="${quote.id}">edit</button>` : ''
    const deleteBtn = canDelete ? `<button class="btn btn-sm btn-danger delete-btn" data-id="${quote.id}">delete</button>` : ''

    return `
        <div class="quote-card" id="card-${quote.id}">
            <div class="quote-mark" aria-hidden="true">"</div>
            <p class="quote-text">${escHtml(quote.text)}</p>
            ${tagsHtml}
            <div class="quote-meta">
                <div>
                    ${quote.author ? `<span class="quote-by">&mdash; ${escHtml(quote.author)}</span>` : ''}
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
                <button class="quote-author-btn" data-user="${escHtml(quote.postedBy || '')}">
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

/* Quote deep-link modal. */
function openQuoteModal(quote) {
    document.getElementById('quoteModal')?.remove()

    const likeSet   = likesMap[quote.id] ?? new Set()
    const liked     = db?.auth?.isLoggedIn && likeSet.has(db.auth.currentUser?.username)
    const saved     = bookmarks.has(quote.id)
    const when      = quote.createdAt ? timeAgo(new Date(quote.createdAt)) : ''
    const tagsHtml  = (quote.tags?.length)
        ? `<div class="quote-tags qm-tags">
             ${quote.tags.map(t => `<span class="tag-chip">#${escHtml(t)}</span>`).join('')}
           </div>`
        : ''

    const modal = document.createElement('div')
    modal.className = 'modal-backdrop open'
    modal.id = 'quoteModal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')

    modal.innerHTML = `
        <div class="modal modal-wide qm-modal">
            <button class="modal-close" id="qmClose" aria-label="Close">✕</button>
            <div class="quote-mark" aria-hidden="true" style="font-size:3.5rem;opacity:.2;line-height:0;color:var(--accent);font-family:'Playfair Display',serif;margin-bottom:1.2rem">"</div>
            <p class="qm-text">${escHtml(quote.text)}</p>
            ${quote.author ? `<div class="qm-attr">&mdash; ${escHtml(quote.author)}</div>` : ''}
            ${tagsHtml}
            <div class="qm-footer">
                <span class="qm-meta">
                    by <button class="quote-author-btn" data-user="${escHtml(quote.postedBy || '')}">
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

    modal.querySelector('#qmClose').addEventListener('click', close)
    modal.addEventListener('click', e => { if (e.target === modal) close() })
    modal.querySelector('.quote-author-btn')?.addEventListener('click', () => {
        close()
        openProfile(quote.postedBy)
    })
    modal.querySelector(`#qm-like-${quote.id}`)?.addEventListener('click', () => toggleLike(quote.id))
    modal.querySelector(`#qm-bookmark-${quote.id}`)?.addEventListener('click', () => toggleBookmark(quote.id))
}

/* Search / filter bar */
function renderSearchBar() {
    const bar = document.getElementById('searchBar')
    if (!bar) return

    // Build tag list from all quotes
    const tagSet     = new Set()
    let   hasUntagged = false
    for (const q of allQuotes) {
        if (!q.tags?.length) hasUntagged = true
        else q.tags.forEach(t => tagSet.add(t))
    }
    const dynamicTags = [...tagSet].sort()

    const sortLabels = { newest: 'Newest', oldest: 'Oldest', top: 'Top liked' }

    bar.innerHTML = `
        <div class="search-row">
            <div class="search-input-wrap">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input class="search-input" id="searchInput" type="text"
                       placeholder="Search quotes, authors…"
                       value="${escHtml(searchQuery)}"
                       aria-label="Search quotes" />
                ${searchQuery ? `<button class="search-clear" id="searchClear" aria-label="Clear search">✕</button>` : ''}
            </div>
            <div class="sort-wrap">
                <div class="custom-select" id="customSortSelect">
                    <button class="custom-select-btn" id="customSortBtn" type="button" aria-haspopup="listbox">
                        <span>${sortLabels[sortMode]}</span>
                        <svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                    <div class="custom-select-dropdown" id="customSortDropdown" role="listbox">
                        ${Object.entries(sortLabels).map(([value, label]) => `
                            <button class="custom-select-option ${sortMode === value ? 'selected' : ''}"
                                    data-value="${value}" role="option"
                                    aria-selected="${sortMode === value}">${label}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
        <div class="tag-bar" id="tagBar" role="group" aria-label="Filter by tag">
            <button class="tag-pill ${!activeTag ? 'active' : ''}" data-tag="">All</button>
            ${dynamicTags.map(tag => `
                <button class="tag-pill ${activeTag === tag ? 'active' : ''}" data-tag="${escHtml(tag)}">#${escHtml(tag)}</button>
            `).join('')}
            ${hasUntagged ? `
                <button class="tag-pill ${activeTag === '__none__' ? 'active' : ''}" data-tag="__none__">None</button>
            ` : ''}
        </div>
    `

    // Search input
    bar.querySelector('#searchInput').addEventListener('input', e => {
        searchQuery = e.target.value
        applyFiltersAndRender()
    })

    bar.querySelector('#searchClear')?.addEventListener('click', () => {
        searchQuery = ''
        applyFiltersAndRender()
        renderSearchBar()
    })

    // Sort dropdown
    const sortWrap     = bar.querySelector('#customSortSelect')
    const sortBtn      = bar.querySelector('#customSortBtn')
    const sortDropdown = bar.querySelector('#customSortDropdown')

    sortBtn.addEventListener('click', e => {
        e.stopPropagation()
        const isOpen = sortWrap.classList.contains('open')
        sortWrap.classList.toggle('open')
        
        if (!isOpen) {
            const closeSortDropdown = e => {
                if (!sortWrap.contains(e.target)) {
                    sortWrap.classList.remove('open')
                    document.removeEventListener('click', closeSortDropdown)
                }
            }
            setTimeout(() => document.addEventListener('click', closeSortDropdown), 0)
        }
    })

    sortDropdown.querySelectorAll('.custom-select-option').forEach(opt => {
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
/** Sort `allQuotes` in-place according to `sortMode`. */
function applySortToAll() {
    if (sortMode === 'newest') {
        allQuotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    } else if (sortMode === 'oldest') {
        allQuotes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    } else if (sortMode === 'top') {
        allQuotes.sort((a, b) => (likesMap[b.id]?.size ?? 0) - (likesMap[a.id]?.size ?? 0))
    }
}

/** Apply current search + tag filters, then re-render the feed from the top. */
function applyFiltersAndRender() {
    const q = searchQuery.toLowerCase().trim()

    filteredQuotes = allQuotes.filter(quote => {
        const matchTag = !activeTag
            || (activeTag === '__none__' ? !quote.tags?.length : (quote.tags ?? []).includes(activeTag))
        const matchSearch = !q
            || quote.text.toLowerCase().includes(q)
            || (quote.author  ?? '').toLowerCase().includes(q)
            || (quote.postedBy ?? '').toLowerCase().includes(q)
            || (quote.tags    ?? []).some(t => t.includes(q))
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

/** Append the next PAGE_SIZE quotes to the feed. */
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
    sentinel.id = 'feedSentinel'
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

/* "Load N more" fallback button. */
function updateLoadMoreBtn() {
    const remaining = filteredQuotes.length - displayedCount
    let btn = document.getElementById('loadMoreBtn')

    if (remaining > 0) {
        const label = `Load ${Math.min(remaining, PAGE_SIZE)} more`
        if (!btn) {
            btn = document.createElement('div')
            btn.id = 'loadMoreBtn'
            btn.className = 'load-more-wrap'
            btn.innerHTML = `<button class="btn" id="loadMoreBtnInner">${label}</button>`
            ;(sentinel ?? dom.feed).insertAdjacentElement('afterend', btn)
            btn.querySelector('#loadMoreBtnInner').addEventListener('click', loadMoreQuotes)
        } else {
            btn.querySelector('#loadMoreBtnInner').textContent = label
        }
    } else {
        btn?.remove()
    }
}

/** Fetch all quotes from the DB and refresh the feed. */
async function loadQuotes() {
    if (!db) return
    dom.feed.innerHTML = '<div class="loading">Loading quotes</div>'
    removeSentinel()
    document.getElementById('loadMoreBtn')?.remove()

    try {
        const quotes = (await db.collection('quotes').list())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        cachedQuotes = quotes
        allQuotes    = [...quotes]

        if (quotes.length) {
            likesMap = await fetchLikesForQuotes(quotes.map(q => q.id))
        }

        if (db?.auth?.isLoggedIn) {
            bookmarks = await fetchUserBookmarks(db.auth.currentUser.username)
        }

        applySortToAll()
        applyFiltersAndRender()
        renderSearchBar()
    } catch (error) {
        feedError(error)
    }
}


/* ══════════════════════════════════════════════════════════════════
   Card events  (delegated via bindCardEvents)
   ══════════════════════════════════════════════════════════════════ */
/** Bind click handlers to interactive elements inside quote cards. */
function bindCardEvents(container = dom.feed) {
    const bindOnce = (selector, handler) => {
        container.querySelectorAll(selector).forEach(el => {
            if (el.bound) return
            el.bound = true
            el.addEventListener('click', handler)
        })
    }

    bindOnce('.delete-btn[data-id]', e => deleteQuote(e.currentTarget.dataset.id))

    bindOnce('.edit-quote-btn[data-id]', e => {
        const quote = allQuotes.find(q => q.id === e.currentTarget.dataset.id)
        if (quote) openEditQuoteModal(quote)
    })

    bindOnce('.like-btn[data-id]',     e => toggleLike(e.currentTarget.dataset.id))
    bindOnce('.bookmark-btn[data-id]', e => toggleBookmark(e.currentTarget.dataset.id))
    bindOnce('.share-btn[data-id]',    e => shareQuote(e.currentTarget.dataset.id))

    bindOnce('.quote-author-btn[data-user]', e => {
        const user = e.currentTarget.dataset.user
        if (user) openProfile(user)
    })

    bindOnce('.tag-chip-btn[data-tag]', e => {
        activeTag = e.currentTarget.dataset.tag
        renderSearchBar()
        applyFiltersAndRender()
        document.getElementById('searchBar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
}

/** Copy a shareable URL for a quote to the clipboard. */
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
   Submit  (new quote, edit quote, delete quote, image export)
   ══════════════════════════════════════════════════════════════════ */
document.getElementById('submitQuoteBtn').addEventListener('click', async () => {
    const text   = document.getElementById('qText').value.trim()
    const author = document.getElementById('qAuthor').value.trim()
    const tags   = parseTags(document.getElementById('qTags').value)

    if (!text) { dom.submitMsg.textContent = 'The quote cannot be empty.'; return }
    dom.submitMsg.textContent = 'Publishing…'

    try {
        await db.collection('quotes').add({
            text,
            author:   author || null,
            tags:     tags.length ? tags : [],
            postedBy: db.auth.currentUser.username,
        })
        document.getElementById('qText').value   = ''
        document.getElementById('qAuthor').value = ''
        document.getElementById('qTags').value   = ''
        dom.submitMsg.textContent = ''
        showToast('Quote published!', 'success')
        loadQuotes()
    } catch (error) {
        dom.submitMsg.textContent = userMessage(error)
        toastError(error)
    }
})

/** Open a modal to edit an existing quote. */
function openEditQuoteModal(quote) {
    document.getElementById('editQuoteModal')?.remove()

    const modal = document.createElement('div')
    modal.className = 'modal-backdrop open'
    modal.id = 'editQuoteModal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')

    modal.innerHTML = `
        <div class="modal modal-wide">
            <button class="modal-close" id="eqClose" aria-label="Close">✕</button>
            <h2>Edit quote</h2>
            <div class="field">
                <label for="eqText">The quote</label>
                <textarea id="eqText" rows="4">${escHtml(quote.text)}</textarea>
            </div>
            <div class="field">
                <label for="eqAuthor">Attributed to <span class="optional">(optional)</span></label>
                <input type="text" id="eqAuthor" value="${escHtml(quote.author || '')}" placeholder="e.g. Marcus Aurelius" />
            </div>
            <div class="field">
                <label for="eqTags">Tags <span class="optional">(optional, comma-separated, max 5)</span></label>
                <input type="text" id="eqTags" value="${escHtml(formatTags(quote.tags))}" placeholder="e.g. stoicism, life" />
            </div>
            <div id="eqError" role="alert" aria-live="assertive"></div>
            <div class="modal-footer ep-footer">
                <button class="btn"             id="eqCancel">Cancel</button>
                <button class="btn btn-primary" id="eqSave">Save changes</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    const close = () => modal.remove()
    modal.querySelector('#eqClose').addEventListener('click', close)
    modal.querySelector('#eqCancel').addEventListener('click', close)
    modal.addEventListener('click', e => { if (e.target === modal) close() })

    modal.querySelector('#eqSave').addEventListener('click', async () => {
        const text   = modal.querySelector('#eqText').value.trim()
        const author = modal.querySelector('#eqAuthor').value.trim()
        const tags   = parseTags(modal.querySelector('#eqTags').value)
        const errEl  = modal.querySelector('#eqError')

        if (!text) { errEl.textContent = 'Quote cannot be empty.'; return }

        const saveBtn = modal.querySelector('#eqSave')
        saveBtn.disabled = true
        saveBtn.textContent = 'Saving…'

        try {
            await db.collection('quotes').update(quote.id, {
                text,
                author: author || null,
                tags:   tags.length ? tags : [],
            })

            // Sync local caches
            const patch = { text, author: author || null, tags: tags.length ? tags : [] }
            for (const arr of [allQuotes, cachedQuotes, filteredQuotes]) {
                const idx = arr.findIndex(q => q.id === quote.id)
                if (idx !== -1) arr[idx] = { ...arr[idx], ...patch }
            }

            close()
            showToast('Quote updated.', 'success')
            applyFiltersAndRender()
            renderSearchBar()
        } catch (error) {
            errEl.textContent    = userMessage(error)
            saveBtn.disabled     = false
            saveBtn.textContent  = 'Save changes'
        }
    })
}

/** Delete a quote by ID (with confirmation). */
async function deleteQuote(id) {
    if (!confirm('Delete this quote?')) return
    try {
        await db.collection('quotes').remove(id)
        allQuotes    = allQuotes.filter(q => q.id !== id)
        cachedQuotes = cachedQuotes.filter(q => q.id !== id)
        document.getElementById(`card-${id}`)?.remove()
        showToast('Quote removed.', 'success')
        applyFiltersAndRender()
        if (!dom.feed.querySelector('.quote-card')) {
            dom.feed.innerHTML = '<div class="empty">No quotes yet.</div>'
        }
    } catch (error) {
        toastError(error)
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

/** Sync modal labels & toggle link to current authMode. */
function syncAuthModal(clearError = true) {
    const isRegister = authMode === 'register'
    dom.modalTitle.textContent    = isRegister ? 'Create account' : 'Welcome back'
    dom.authSubmitBtn.textContent = isRegister ? 'Create account' : 'Sign in'
    dom.modalSwitch.innerHTML     = isRegister
        ? 'Already have one? <a id="modalToggleLink">Sign in</a>'
        : 'No account? <a id="modalToggleLink">Create one</a>'
    if (clearError) dom.authError.textContent = ''

    document.getElementById('modalToggleLink').addEventListener('click', () => {
        authMode = authMode === 'login' ? 'register' : 'login'
        syncAuthModal()
    })
}

async function doAuth() {
    if (!db) { dom.authError.textContent = 'Still connecting, please wait…'; return }

    const username = dom.authUser.value.trim()
    const password = dom.authPass.value
    dom.authError.textContent = ''

    if (!username || !password) { dom.authError.textContent = 'Fill in both fields.'; return }

    dom.authSubmitBtn.disabled    = true
    dom.authSubmitBtn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating…'

    try {
        if (authMode === 'register') {
            await db.auth.register(username, password)
            closeAuthModal()
            updateNav(db.auth.currentUser)
            showToast(`Account created, welcome ${username}!`, 'success')
        } else {
            await db.auth.login(username, password)
            closeAuthModal()
            updateNav(db.auth.currentUser)
            showToast(`Welcome back, ${username}!`, 'success')
        }
        loadQuotes()
    } catch (error) {
        dom.authError.textContent = userMessage(error)
    } finally {
        dom.authSubmitBtn.disabled = false
        syncAuthModal(false)
    }
}

// Auth modal listeners
dom.authSubmitBtn.addEventListener('click', doAuth)
dom.modalCloseBtn.addEventListener('click', closeAuthModal)
dom.authModal.addEventListener('click', e => { if (e.target === dom.authModal) closeAuthModal() })


/* ══════════════════════════════════════════════════════════════════
   Profile view & edit
   ══════════════════════════════════════════════════════════════════ */
function openProfile(username) {
    renderProfileView(username)
    dom.profileView.classList.add('open')
    document.body.style.overflow = 'hidden'
    history.pushState({ profile: username }, '', `#profile/${username}`)
}

function closeProfile() {
    dom.profileView.classList.remove('open')
    document.body.style.overflow = ''
    if (location.hash.startsWith('#profile/')) {
        history.pushState({}, '', location.pathname)
    }
}

async function renderProfileView(username, activeTab = 'quotes') {
    dom.profileView.innerHTML = `
        <div class="pv-inner">
            <button class="pv-close" id="pvCloseBtn" aria-label="Close profile">✕</button>
            <div class="pv-loading">Loading profile</div>
        </div>
    `
    document.getElementById('pvCloseBtn').addEventListener('click', closeProfile)

    const isOwnProfile = db?.auth?.isLoggedIn && db.auth.currentUser?.username === username
    const isAdmin      = db?.auth?.isLoggedIn && db.auth.currentUser?.isAdmin === true

    const [profile, savedQuoteIds] = await Promise.all([
        loadProfile(username),
        isOwnProfile ? fetchUserBookmarks(username) : Promise.resolve(new Set()),
    ])

    const allUserQuotes = cachedQuotes.filter(r => r.postedBy === username)
    const savedQuotes   = isOwnProfile ? cachedQuotes.filter(q => savedQuoteIds.has(q.id)) : []
    const socials       = profile.socials ?? {}

    const socialLinksHtml = Object.entries(socials)
        .filter(([, url]) => url)
        .map(([type, url]) => `
            <a class="pv-social" href="${escHtml(url)}" target="_blank" rel="noopener" title="${escHtml(type)}">
                ${socialIcon(type)}
            </a>
        `).join('')

    const renderProfileCards = (quotes, showOwnerActions = false) => {
        if (!quotes.length) {
            return `<p class="pv-no-quotes">${activeTab === 'saved' ? 'No saved quotes yet.' : 'No quotes yet.'}</p>`
        }
        return quotes.map(q => {
            const actionsHtml = (showOwnerActions || isAdmin) ? `
                <div class="pv-quote-actions">
                    ${showOwnerActions ? `<button class="btn btn-sm edit-quote-btn" data-id="${q.id}">edit</button>` : ''}
                    <button class="btn btn-sm btn-danger delete-btn" data-id="${q.id}">delete</button>
                </div>` : ''

            return `
                <div class="pv-quote-card" id="card-${q.id}">
                    <div class="pv-quote-mark" aria-hidden="true">"</div>
                    <p class="pv-quote-text">${escHtml(q.text)}</p>
                    ${q.author ? `<span class="pv-quote-by">&mdash; ${escHtml(q.author)}</span>` : ''}
                    ${(q.tags?.length) ? `
                        <div class="pv-quote-tags">
                            ${q.tags.map(t => `<span class="tag-chip">#${escHtml(t)}</span>`).join('')}
                        </div>` : ''}
                    ${actionsHtml}
                </div>`
        }).join('')
    }

    const tabsHtml = isOwnProfile ? `
        <div class="pv-tabs">
            <button class="pv-tab ${activeTab === 'quotes' ? 'active' : ''}" data-tab="quotes">
                Quotes <span class="pv-tab-count">${allUserQuotes.length}</span>
            </button>
            <button class="pv-tab ${activeTab === 'saved' ? 'active' : ''}" data-tab="saved">
                Saved <span class="pv-tab-count">${savedQuotes.length}</span>
            </button>
        </div>
    ` : `<div class="pv-section-label">Quotes by ${escHtml(username)}</div>`

    const displayQuotes   = activeTab === 'saved' ? savedQuotes : allUserQuotes
    const showOwner       = isOwnProfile && activeTab === 'quotes'
    const profileCardsHtml = renderProfileCards(displayQuotes, showOwner)

    dom.profileView.innerHTML = `
        <div class="pv-inner">
            <button class="pv-close" id="pvCloseBtn" aria-label="Close profile">✕</button>

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
                        ${isOwnProfile ? `<button class="btn btn-sm pv-edit-btn" id="pvEditBtn">Edit profile</button>` : ''}
                    </div>
                </div>

                ${tabsHtml}
                <div class="pv-quotes" id="pvQuotesArea">${profileCardsHtml}</div>
            </div>
        </div>
    `

    document.getElementById('pvCloseBtn').addEventListener('click', closeProfile)

    // Bind card events inside profile; also re-render profile after deletion
    const pvArea = document.getElementById('pvQuotesArea')
    if (pvArea) {
        bindCardEvents(pvArea)
        pvArea.querySelectorAll('.delete-btn[data-id]').forEach(btn => {
            btn.bound = false
            btn.addEventListener('click', async () => {
                await deleteQuote(btn.dataset.id)
                renderProfileView(username, activeTab)
            })
            btn.bound = true
        })
    }

    if (isOwnProfile) {
        document.getElementById('pvEditBtn')?.addEventListener('click', () => openEditProfileModal(username, profile))
        dom.profileView.querySelectorAll('.pv-tab').forEach(tab => {
            tab.addEventListener('click', () => renderProfileView(username, tab.dataset.tab))
        })
    }
}

/* Edit profile modal */

function openEditProfileModal(username, profile) {
    const socials = profile.socials ?? {}
    document.getElementById('epAvatar').value    = profile.avatar    ?? ''
    document.getElementById('epBanner').value    = profile.banner    ?? ''
    document.getElementById('epBio').value       = profile.bio       ?? ''
    document.getElementById('epTwitter').value   = socials.twitter   ?? ''
    document.getElementById('epGithub').value    = socials.github    ?? ''
    document.getElementById('epInstagram').value = socials.instagram ?? ''
    document.getElementById('epYoutube').value   = socials.youtube   ?? ''
    document.getElementById('epWebsite').value   = socials.website   ?? ''
    document.getElementById('epError').textContent = ''
    dom.editProfileModal.classList.add('open')
}

function closeEditProfileModal() {
    dom.editProfileModal.classList.remove('open')
}

document.getElementById('epCloseBtn').addEventListener('click', closeEditProfileModal)
document.getElementById('epCancelBtn').addEventListener('click', closeEditProfileModal)
dom.editProfileModal.addEventListener('click', e => {
    if (e.target === dom.editProfileModal) closeEditProfileModal()
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
    btn.disabled    = true
    btn.textContent = 'Saving…'

    try {
        await saveProfile(username, profile)
        closeEditProfileModal()
        showToast('Profile saved.', 'success')
        renderProfileView(username)
    } catch (error) {
        document.getElementById('epError').textContent = userMessage(error)
    } finally {
        btn.disabled    = false
        btn.textContent = 'Save'
    }
})


/* ══════════════════════════════════════════════════════════════════
   Navigation  (nav bar, user chip)
   ══════════════════════════════════════════════════════════════════ */
/** Render the nav area based on auth state. */
function updateNav(user) {
    if (user) {
        dom.navArea.innerHTML = `
            <div class="user-chip">
                <button class="user-chip-name" id="myProfileBtn">
                    <strong>${escHtml(user.username)}</strong>
                </button>
                <button class="btn btn-sm" id="logoutBtn">Sign out</button>
            </div>
        `
        dom.navArea.querySelector('#logoutBtn').addEventListener('click', logout)
        dom.navArea.querySelector('#myProfileBtn').addEventListener('click', () => openProfile(user.username))
        dom.submitPanel.style.display = 'block'
    } else {
        dom.navArea.innerHTML = `
            <button class="btn"             id="loginBtn">Sign in</button>
            <button class="btn btn-primary" id="registerBtn">Join free</button>
        `
        dom.navArea.querySelector('#loginBtn').addEventListener('click', () => openAuthModal('login'))
        dom.navArea.querySelector('#registerBtn').addEventListener('click', () => openAuthModal('register'))
        dom.submitPanel.style.display = 'none'
    }
}

function logout() {
    db.auth.logout()
    bookmarks = new Set()
    updateNav(null)
    showToast('Signed out.', 'success')
    applyFiltersAndRender()
}


/* ══════════════════════════════════════════════════════════════════
   Global keyboard + history routing
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && dom.authModal.classList.contains('open')) { doAuth(); return }

    if (e.key === 'Escape') {
        if (document.getElementById('quoteModal'))           { document.getElementById('quoteModal').remove(); return }
        if (dom.editProfileModal.classList.contains('open')) { closeEditProfileModal(); return }
        if (document.getElementById('editQuoteModal'))       { document.getElementById('editQuoteModal').remove(); return }
        if (dom.authModal.classList.contains('open'))        { closeAuthModal(); return }
        if (dom.profileView.classList.contains('open'))      { closeProfile(); return }
    }
})

window.addEventListener('popstate', () => {
    if (location.hash.startsWith('#quote/')) {
        const id    = decodeURIComponent(location.hash.slice(7))
        const quote = allQuotes.find(q => q.id === id)
        if (quote) openQuoteModal(quote)
    } else if (location.hash.startsWith('#profile/')) {
        const username = decodeURIComponent(location.hash.slice(9))
        if (username) openProfile(username)
    } else {
        dom.profileView.classList.remove('open')
        document.body.style.overflow = ''
        document.getElementById('quoteModal')?.remove()
    }
})


/* ══════════════════════════════════════════════════════════════════
   Init
   ══════════════════════════════════════════════════════════════════ */
async function init(cfg) {
    if (!cfg.owner || !cfg.repo || !cfg.publicTokens?.length) {
        dom.feed.innerHTML = '<div class="empty">Configure your GitHub repo to get started.</div>'
        return
    }

    try {
        db = await GitHubDB.public({
            owner:        cfg.owner,
            repo:         cfg.repo,
            rawBranch:    cfg.rawBranch,
            publicTokens: cfg.publicTokens,
        })

        db.permissions({
            quotes: { read: 'public', write: 'auth' },
            _kv:    { read: 'public', write: 'auth' },
        })

        if (db.auth.isLoggedIn) await db.auth.verifySession()

        updateNav(db.auth.isLoggedIn ? db.auth.currentUser : null)
        dom.authSubmitBtn.disabled = false

        await loadQuotes()

        // Handle deep links on initial load
        if (location.hash.startsWith('#profile/')) {
            const username = decodeURIComponent(location.hash.slice(9))
            if (username) openProfile(username)
        } else if (location.hash.startsWith('#quote/')) {
            const id    = decodeURIComponent(location.hash.slice(7))
            const quote = allQuotes.find(q => q.id === id)
            if (quote) openQuoteModal(quote)
        }
    } catch (error) {
        toastError(error)
        dom.feed.innerHTML = '<div class="empty error-state"><p>Could not connect to the database.</p></div>'
    }
}

updateNav(null)
dom.authSubmitBtn.disabled = true
init(getConfig())