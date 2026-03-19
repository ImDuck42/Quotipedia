/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                           github-db.js                           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Every record is a JSON file committed directly to your repo.
 * Every write is a git commit — message, author, timestamp, diff — stored forever.
 *
 * ─────────────────────────────────────────────────────────────────
 * QUICK START
 * ─────────────────────────────────────────────────────────────────
 *
 * 1. OWNER MODE — your own PAT, full control
 *    const db = GitHubDB.owner({ owner, repo, token })
 *
 * 2. PUBLIC MODE — embedded bot token, open read/write
 *    const db = GitHubDB.public({ owner, repo, publicToken })
 *
 * 3. CDN MODE (recommended for public read-heavy apps)
 *    const db = GitHubDB.public({ owner, repo, publicToken, useCDN: false })
 *
 * ─────────────────────────────────────────────────────────────────
 * COLLECTIONS  (stored at  `<basePath>/<collection>/<id>.json`)
 * ─────────────────────────────────────────────────────────────────
 *
 *    const posts = db.collection('posts')
 *
 *    await posts.add({ title: 'Hello' })                    // create
 *    await posts.get(id)                                    // fetch one -> record | null
 *    await posts.list()                                     // fetch all
 *    await posts.update(id, { title: 'New' })               // partial patch
 *    await posts.replace(id, { title: 'New' })              // full replace
 *    await posts.remove(id)                                 // delete
 *    await posts.upsert(id, data)                           // create-or-patch
 *    await posts.query(record => record.published)          // filter in memory
 *    await posts.query(fn, { sort, limit, offset })         // with options
 *    await posts.findOne(record => record.slug === 'hello') // first match | null
 *    await posts.count()                                    // total count
 *    await posts.count(record => record.published)          // filtered count
 *    await posts.exists(id)                                 // boolean
 *    await posts.bulkAdd([{ ... }, { ... }])                // add many
 *    await posts.bulkRemove([id1, id2])                     // remove many
 *    await posts.clear()                                    // delete all (irreversible)
 *    const stop = posts.subscribe(records => { ... }, 5000) // poll for changes
 *    stop()                                                 // cancel subscription
 *
 * ─────────────────────────────────────────────────────────────────
 * KEY-VALUE STORE  (stored at  `<basePath>/_kv/<key>.json`)
 * ─────────────────────────────────────────────────────────────────
 *
 *    await db.kv.set('theme', 'dark')
 *    await db.kv.get('theme')                               // value | null
 *    await db.kv.delete('theme')
 *    await db.kv.has('theme')                               // boolean
 *    await db.kv.increment('views')                         // atomic-ish counter
 *    await db.kv.increment('score', 5)                      // increment by N
 *    await db.kv.getMany('key1', 'key2')                    // { key1: v1, key2: v2 }
 *    await db.kv.setMany({ key1: v1, key2: v2 })
 *    await db.kv.getAll()                                   // { key: value } for all KV entries
 *
 * ─────────────────────────────────────────────────────────────────
 * AUTH  (stored at  `<basePath>/_auth/users.json`)
 * ─────────────────────────────────────────────────────────────────
 *
 *    await db.auth.register(username, password)             // -> safe user object
 *    await db.auth.login(username, password)                // -> safe user object
 *    await db.auth.verifySession()                          // -> boolean
 *    db.auth.logout()
 *    await db.auth.changePassword(username, oldPass, newPass)
 *    await db.auth.deleteAccount(username, password)
 *    await db.auth.listUsers()                              // safe fields only
 *    db.auth.currentUser                                    // { id, username, role, createdAt } | null
 *    db.auth.isLoggedIn                                     // boolean
 *
 * ─────────────────────────────────────────────────────────────────
 * UTILITIES
 * ─────────────────────────────────────────────────────────────────
 *
 *    await db.getCommitHistory(path?, limit?)               // git audit log
 *    await db.validateConnection()                          // throws if token/repo unreachable
 *    GitHubDB.encodeToken(plainToken)                       // obfuscate PAT for embedding
 *    GitHubDB.decodeToken(encodedToken)                     // reverse (for debugging)
 */

'use strict'

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const GITHUB_API_BASE    = 'https://api.github.com'
const JSDELIVR_RAW_BASE  = 'https://cdn.jsdelivr.net/gh'
const GITHUB_API_VERSION = '2022-11-28'

/** Session storage key for persisting login state across page loads. */
const SESSION_STORAGE_KEY = '__githubdb_session__'

/** Session lifetime: 8 hours in milliseconds. */
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000

/** Minimum acceptable password length for new accounts. */
const MIN_PASSWORD_LENGTH = 6

/** How many times to retry a write that fails with a SHA conflict (HTTP 409). */
const MAX_WRITE_RETRIES = 2

/** Global salt suffix mixed into password hashes — changing this invalidates all stored passwords. */
const PASSWORD_SALT_SUFFIX = 'ghdb-salt-4269'

/** Prefix to definitively identify encoded tokens. */
const ENCODE_PREFIX = 'ghdb_enc_'

/**
 * XOR obfuscation key for token encoding.
 * Not encryption — just keeps a PAT from being an immediately readable string.
 */
const TOKEN_XOR_KEY = 'GHDB'

// ═══════════════════════════════════════════════════════════════════
// Custom error class & Validation
// ═══════════════════════════════════════════════════════════════════

/**
 * All library errors are instances of DatabaseError.
 */
class DatabaseError extends Error {
  /**
   * @param {string} message        Human-readable description of the error.
   * @param {number} [httpStatus=0] The HTTP status code that triggered this.
   */
  constructor(message, httpStatus = 0) {
    super(message)
    this.name       = 'DatabaseError'
    this.httpStatus = httpStatus
  }
}

/**
 * Validates IDs and keys to prevent path traversal exploits.
 * 
 * @param {string} id The string to validate.
 */
function assertValidId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_\-]+$/.test(id)) {
    throw new DatabaseError(`Invalid ID or key format: "${id}". Use letters, numbers, hyphens, and underscores only.`)
  }
}

/**
 * Executes an array of tasks with a strict concurrency limit to prevent rate limit exhaustion.
 * 
 * @param   {Array<T>}                items      The array of items to process.
 * @param   {function(T): Promise<R>} fn         The async function to execute for each item.
 * @param   {number}                  [limit=10] The maximum number of concurrent executions.
 * @returns {Promise<Array<R>>}
 */
async function runWithConcurrency(items, fn, limit = 10) {
  const results = []
  const executing = new Set()
  
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item))
    results.push(p)
    executing.add(p)
    
    const clean = () => executing.delete(p)
    p.then(clean).catch(clean)
    
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

/**
 * Retries an asynchronous operation if it throws an HTTP 409 (Conflict).
 * Essential for resolving optimistic concurrency write races.
 * 
 * @param   {function(): Promise<T>} operation      The async operation to attempt.
 * @param   {number}                 [maxRetries=2] The maximum number of retry attempts.
 * @returns {Promise<T>}
 */
async function retryOnConflict(operation, maxRetries = MAX_WRITE_RETRIES) {
  let attempts = 0
  while (true) {
    try {
      return await operation()
    } catch (error) {
      if (error.httpStatus === 409 && attempts < maxRetries) {
        attempts++
        continue
      }
      throw error
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Token obfuscation (XOR + base64)
// ═══════════════════════════════════════════════════════════════════

/**
 * XOR every character in `text` against the rotating key.
 * Applying this twice returns the original string.
 * 
 * @param   {string} text The text to transform.
 * @returns {string}
 */
function xorRotate(text) {
  return Array.from(text)
    .map((char, index) =>
      String.fromCharCode(
        char.charCodeAt(0) ^ TOKEN_XOR_KEY.charCodeAt(index % TOKEN_XOR_KEY.length)
      )
    )
    .join('')
}

/**
 * Encode a plain token to a base64+XOR string safe to embed in source.
 * 
 * @param   {string} plainToken The unencrypted raw string.
 * @returns {string}
 */
function encodeToken(plainToken) {
  return ENCODE_PREFIX + encodeBase64(xorRotate(plainToken))
}

/**
 * Reverse {@link encodeToken}. Useful for debugging.
 * 
 * @param   {string} encodedToken The obfuscated string.
 * @returns {string}
 */
function decodeToken(encodedToken) {
  if (!encodedToken.startsWith(ENCODE_PREFIX)) return encodedToken
  return xorRotate(decodeBase64(encodedToken.slice(ENCODE_PREFIX.length)))
}

// ═══════════════════════════════════════════════════════════════════
// GitHub base64 <-> JavaScript object helpers
// ═══════════════════════════════════════════════════════════════════

function encodeBase64(string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(string, 'utf-8').toString('base64')
  }
  const bytes = new TextEncoder().encode(string)
  const chunkSize = 8192
  const chunks = []
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)))
  }
  return btoa(chunks.join(''))
}

function decodeBase64(base64) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8')
  }
  const bin = atob(base64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

/**
 * Serialize a JavaScript value to base64 for the GitHub Contents API.
 * Uses TextEncoder so all Unicode code points are handled correctly.
 * 
 * @param   {unknown} value The value to stringify and encode.
 * @returns {string}        Base64-encoded UTF-8 JSON.
 */
function encodeContentForGitHub(value) {
  return encodeBase64(JSON.stringify(value, null, 2))
}

/**
 * Deserialize a base64 string returned by the GitHub Contents API back to a JavaScript value.
 * 
 * @param   {string}  base64 The base64 response from GitHub.
 * @returns {unknown}        The parsed JavaScript object.
 */
function decodeContentFromGitHub(base64) {
  return JSON.parse(decodeBase64(base64))
}

// ═══════════════════════════════════════════════════════════════════
// ID generation
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a collision-resistant record ID.
 * Format: `<timestamp-base36>-<random-bytes-base36>`
 * Uses `crypto.getRandomValues` when available for better entropy.
 * 
 * @returns {string} E.g. "lf3k2-a8x9z4b2"
 */
function generateId() {
  const timestampPart = Date.now().toString(36)
  let randomPart      = ''

  try {
    const randomBytes = crypto.getRandomValues(new Uint8Array(6))
    randomPart = Array.from(randomBytes)
      .map(byte => byte.toString(36).padStart(2, '0'))
      .join('')
  } catch {
    randomPart = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36).slice(0, 12)
  }

  return `${timestampPart}-${randomPart}`
}

// ═══════════════════════════════════════════════════════════════════
// Cryptographic helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Hash an arbitrary string with SHA-256 and return the hex digest.
 * 
 * @param   {string}          text The raw text to hash.
 * @returns {Promise<string>}
 */
async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Hash a password with SHA-256, mixing in a username-derived salt and a global suffix.
 * 
 * @param   {string}          password The raw password string.
 * @param   {string}          username Used as part of the salt (normalised to lower-case).
 * @returns {Promise<string>}          Hex digest.
 */
async function hashPassword(password, username) {
  const saltedInput = `${PASSWORD_SALT_SUFFIX}:${username.toLowerCase()}:${password}`
  return sha256Hex(saltedInput)
}

/**
 * Constant-time equality check to prevent timing attacks.
 * 
 * @param   {string}           a The first string to compare.
 * @param   {string}           b The second string to compare.
 * @returns {Promise<boolean>}
 */
async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const hashA = await sha256Hex(a)
  const hashB = await sha256Hex(b)
  
  if (hashA.length !== hashB.length) return false
  
  let result = 0
  for (let i = 0; i < hashA.length; i++) {
    result |= hashA.charCodeAt(i) ^ hashB.charCodeAt(i)
  }
  return result === 0
}

// ═══════════════════════════════════════════════════════════════════
// Session state
// ═══════════════════════════════════════════════════════════════════

class IsomorphicStorage {
  constructor() {
    this.memory = new Map()
    this.isBrowser = typeof globalThis !== 'undefined' && !!globalThis.sessionStorage
  }

  getItem(key) {
    if (this.isBrowser) {
      try { return globalThis.sessionStorage.getItem(key) } catch { return this.memory.get(key) || null }
    }
    return this.memory.get(key) || null
  }

  setItem(key, value) {
    if (this.isBrowser) {
      try { globalThis.sessionStorage.setItem(key, value) } catch { this.memory.set(key, value) }
    } else {
      this.memory.set(key, value)
    }
  }

  removeItem(key) {
    if (this.isBrowser) {
      try { globalThis.sessionStorage.removeItem(key) } catch { this.memory.delete(key) }
    } else {
      this.memory.delete(key)
    }
  }
}

/**
 * Manages the in-memory and sessionStorage login state.
 * Session is cleared on tab close (sessionStorage) and expires after `SESSION_LIFETIME_MS` milliseconds.
 */
class SessionState {
  constructor() {
    this.activeUser = null
    this.storage = new IsomorphicStorage()
    this.restoreFromStorage()
  }

  // ── Private ──────────────────────────────────────────────────────

  restoreFromStorage() {
    try {
      const stored = this.storage.getItem(SESSION_STORAGE_KEY)
      if (!stored) return

      const session = JSON.parse(stored)

      if (session.expiresAt && Date.now() > session.expiresAt) {
        this.storage.removeItem(SESSION_STORAGE_KEY)
        return
      }

      this.activeUser = session.user
    } catch {
      this.storage.removeItem(SESSION_STORAGE_KEY)
    }
  }

  // ── Public ───────────────────────────────────────────────────────

  /**
   * Persist a user object to session and memory.
   * 
   * @param {{ id: string, username: string, role: string, createdAt: string }} user The user data.
   */
  persistUser(user) {
    this.activeUser = user
    this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      user,
      expiresAt: Date.now() + SESSION_LIFETIME_MS,
    }))
  }

  /**
   * Remove all session data.
   */
  clearSession() {
    this.activeUser = null
    this.storage.removeItem(SESSION_STORAGE_KEY)
  }

  /** The currently logged-in user, or `null`. */
  get currentUser() { return this.activeUser }

  /** `true` if a user is logged in. */
  get isLoggedIn() { return !!this.activeUser }
}

// ═══════════════════════════════════════════════════════════════════
// GitHub filesystem layer
// ═══════════════════════════════════════════════════════════════════

/**
 * Low-level wrapper around the GitHub Contents API.
 */
class GitHubFilesystem {
  /**
   * @param {object} config
   * @param {string} config.owner          GitHub username or organisation.
   * @param {string} config.repo           Repository name.
   * @param {string} config.token          Personal Access Token with repo scope.
   * @param {string}[config.branch=master] The branch to read/write against.
   */
  constructor({ owner, repo, token, branch = 'master' }) {
    this.owner  = owner
    this.repo   = repo
    this.branch = branch
    this.token  = token
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Standard headers sent on every authenticated request.
   */
  get authHeaders() {
    return {
      Authorization:          `Bearer ${this.token}`,
      Accept:                 'application/vnd.github+json',
      'Content-Type':         'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    }
  }

  /**
   * Generates the GitHub Contents API URL for the given `path`.
   * 
   * @param   {string} filePath
   * @returns {string}
   */
  contentsUrl(filePath) {
    return `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/contents/${filePath}`
  }

  /**
   * Parse an error response body and throw a descriptive {@link DatabaseError}.
   * 
   * @param {Response} response        The raw fetch Response.
   * @param {string}   fallbackMessage Message used if the API does not provide one.
   */
  async throwFromResponse(response, fallbackMessage) {
    const body = await response.json().catch(() => ({}))
    throw new DatabaseError(body.message || fallbackMessage, response.status)
  }

  // ── Core operations ───────────────────────────────────────────────

  /**
   * Read any JSON file via the jsDelivr CDN.
   * This is unauthenticated and does not count against the API rate limit.
   *
   * @param   {string} path
   * @returns {Promise<unknown|null>} Parsed JSON or `null` on 404.
   */
  async readCDNFile(path) {
    const url = `${JSDELIVR_RAW_BASE}/${this.owner}/${this.repo}@${this.branch}/${path}`;
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new DatabaseError(`CDN read failed (${response.status})`, response.status);
    return response.json();
  }
  
  /**
   * Read a file or directory listing from the repo.
   * Returns `null` for 404, an array for directory listings, or a parsed file object for individual files.
   * 
   * @param   {string} path
   * @returns {Promise<null | Array<{ name: string, type: string }> | { content: unknown, sha: string, raw: object }>}
   */
  async readFile(path) {
    const url      = `${this.contentsUrl(path)}?ref=${this.branch}`
    const response = await fetch(url, { headers: this.authHeaders })

    if (response.status === 404) return null

    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      const resetUnix     = response.headers.get('x-ratelimit-reset')
      const resetReadable = resetUnix
        ? ` Resets at ${new Date(Number(resetUnix) * 1000).toISOString()}.`
        : ''
      throw new DatabaseError(`GitHub API rate limit exceeded.${resetReadable}`, 403)
    }

    if (!response.ok) {
      await this.throwFromResponse(response, `Read failed (${response.status})`)
    }

    const data = await response.json()

    if (Array.isArray(data)) return data

    return {
      content: decodeContentFromGitHub(data.content),
      sha:     data.sha,
      raw:     data,
    }
  }

  /**
   * Write (create or update) a JSON file in the repo.
   * 
   * @param   {string}  path          The destination file path.
   * @param   {unknown} content       JavaScript value to serialise as JSON.
   * @param   {string}  commitMessage The Git commit message.
   * @param   {string}[fileSha]     Pass the known SHA for updates.
   * @returns {Promise<object>}       GitHub API response.
   */
  async writeFile(path, content, commitMessage, fileSha = undefined) {
    const requestBody = {
      message: commitMessage,
      content: encodeContentForGitHub(content),
      branch:  this.branch,
      ...(fileSha ? { sha: fileSha } : {}),
    }

    const response = await fetch(this.contentsUrl(path), {
      method:  'PUT',
      headers: this.authHeaders,
      body:    JSON.stringify(requestBody),
    })

    if (!response.ok) {
      await this.throwFromResponse(response, `Write failed (${response.status})`)
    }

    return response.json()
  }

  /**
   * Delete a file from the repo.
   * 
   * @param   {string}  path          The file path to delete.
   * @param   {string}  commitMessage The Git commit message.
   * @returns {Promise<boolean>}
   */
  async deleteFile(path, commitMessage) {
    const existing = await this.readFile(path)
    if (!existing) return false

    const response = await fetch(this.contentsUrl(path), {
      method:  'DELETE',
      headers: this.authHeaders,
      body:    JSON.stringify({ message: commitMessage, sha: existing.sha, branch: this.branch }),
    })

    if (!response.ok) {
      await this.throwFromResponse(response, `Delete failed (${response.status})`)
    }

    return true
  }

  /**
   * List the direct children of a directory.
   * Returns an empty array if the path does not exist.
   * 
   * @param   {string} directoryPath
   * @returns {Promise<Array<{ name: string, type: string, sha: string }>>}
   */
  async listDirectory(directoryPath) {
    const result = await this.readFile(directoryPath)
    if (!result || !Array.isArray(result)) return[]
    return result
  }

  /**
   * Fetch the git commit history for a path.
   * 
   * @param   {string} [path='']  Scope to a specific file or directory.
   * @param   {number}[limit=30] Maximum number of commits to return.
   * @returns {Promise<Array<{ sha, message, author, date, url }>>}
   */
  async getCommitHistory(path = '', limit = 30) {
    const params = new URLSearchParams({ per_page: limit.toString(), sha: this.branch })
    if (path) params.set('path', path)

    const url      = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/commits?${params}`
    const response = await fetch(url, { headers: this.authHeaders })

    if (!response.ok) throw new DatabaseError(`Could not fetch commits (${response.status})`, response.status)

    return (await response.json()).map(commit => ({
      sha:     commit.sha,
      message: commit.commit.message,
      author:  commit.commit.author.name,
      date:    commit.commit.author.date,
      url:     commit.html_url,
    }))
  }

  /**
   * Verify that the token has access to the repository.
   * Throws a descriptive {@link DatabaseError} if not.
   * 
   * @returns {Promise<object>} GitHub repo metadata.
   */
  async validateConnection() {
    const url      = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}`
    const response = await fetch(url, { headers: this.authHeaders })
    if (!response.ok) {
      throw new DatabaseError(
        `Cannot access ${this.owner}/${this.repo} — check your token and repo name`,
        response.status
      )
    }
    return response.json()
  }
}

// ═══════════════════════════════════════════════════════════════════
// Collection
// ═══════════════════════════════════════════════════════════════════

/**
 * A named collection of JSON records.
 * Each record is stored as `<basePath>/<collectionName>/<id>.json`.
 * Obtain a Collection via `db.collection('name')` — do not instantiate directly.
 */
class Collection {
  /**
   * @param {GitHubFilesystem} filesystem
   * @param {string}           collectionName Must be alphanumeric + hyphens/underscores.
   * @param {string}           basePath       E.g. `data`.
   * @param {SessionState}     sessionState
   * @param {object|null}      accessRules    From `db.rules()`.
   * @param {boolean}          useCDN         Whether to use jsDelivr for reads.
   */
  constructor(filesystem, collectionName, basePath, sessionState, accessRules, useCDN = false) {
    assertValidId(collectionName)

    this.filesystem      = filesystem
    this.name            = collectionName
    this.basePath        = basePath
    this.session         = sessionState
    this.accessRules     = accessRules
    this.useCDN          = useCDN
    this.collectionPath  = `${basePath}/${collectionName}`
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Full file path for a record with the given `id`.
   */
  recordPath(id) {
    assertValidId(id)
    return `${this.collectionPath}/${id}.json`
  }

  /**
   * Enforce access-rule permissions before an operation.
   * Throws {@link DatabaseError} with status 401 if the rule is not satisfied.
   * 
   * @param {'read'|'write'} operation The type of operation being requested.
   */
  enforcePermission(operation) {
    const collectionRule = this.accessRules?.[this.name]
    if (!collectionRule) return

    const requiredLevel = operation === 'read' ? collectionRule.read : collectionRule.write

    if (!requiredLevel || requiredLevel === 'public') return

    if (requiredLevel === 'auth' && !this.session.isLoggedIn) {
      throw new DatabaseError(
        `Collection "${this.name}" requires a logged-in user for ${operation} operations`,
        401
      )
    }
  }

  /**
   * Add standard metadata timestamps to a record payload.
   * - `createdAt` is set on new records; preserved for existing ones.
   * - `updatedAt` is always set to now.
   * 
   * @param   {object}      data       The record fields to stamp.
   * @param   {object|null} [existing] Pass the current record to preserve `createdAt`.
   * @returns {object}
   */
  addTimestamps(data, existing = null) {
    const now = new Date().toISOString()
    return {
      ...data,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  /**
   * Create a new record and add `id`, `createdAt`, and `updatedAt` automatically.
   * You may supply your own `id` inside `data` to use a specific identifier.
   * 
   * @param   {object} data
   * @returns {Promise<object>} The created record.
   */
  async add(data) {
    this.enforcePermission('write')

    const recordId = data.id ?? generateId()
    assertValidId(recordId)

    const dataCopy = { ...data }
    delete dataCopy.id

    const record = { id: recordId, ...this.addTimestamps(dataCopy) }

    await this.filesystem.writeFile(
      this.recordPath(recordId),
      record,
      `${this.name}: add ${recordId}`
    )

    return record
  }

  /**
   * Fetch a single record by ID.
   * 
   * @param   {string} id
   * @returns {Promise<object|null>} The record, or `null` if not found.
   */
  async get(id) {
    this.enforcePermission('read');
    if (this.useCDN) {
      return this.filesystem.readCDNFile(this.recordPath(id));
    }
    const file = await this.filesystem.readFile(this.recordPath(id));
    return file ? file.content : null;
  }

  /**
   * Fetch all records in the collection.
   * Requests run with batched concurrency.
   * 
   * @returns {Promise<object[]>}
   */
  async list() {
    this.enforcePermission('read')

    const files = (await this.filesystem.listDirectory(this.collectionPath))
      .filter(entry => entry.name.endsWith('.json') && entry.type === 'file')

    const records = await runWithConcurrency(
      files,
      entry => this.get(entry.name.replace(/\.json$/, '')),
      10
    )

    return records.filter(Boolean)
  }

  /**
   * Partially update a record, meaning only the provided fields are changed.
   * The `id` and `createdAt` fields in `changes` are silently ignored.
   * 
   * @param   {string} id      The record ID to update.
   * @param   {object} changes Fields to merge in.
   * @returns {Promise<object>} The updated record.
   */
  async update(id, changes) {
    this.enforcePermission('write')

    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new DatabaseError('Changes must be a plain object', 400)
    }

    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.recordPath(id))
      if (!file) throw new DatabaseError(`Record not found: ${id}`, 404)

      const safeChanges = { ...changes }
      delete safeChanges.id
      delete safeChanges.createdAt

      const updatedRecord = {
        ...file.content,
        ...safeChanges,
        id,
        updatedAt: new Date().toISOString(),
      }

      await this.filesystem.writeFile(
        this.recordPath(id),
        updatedRecord,
        `${this.name}: update ${id}`,
        file.sha
      )

      return updatedRecord
    })
  }

  /**
   * Fully replace a record, meaning all fields are overwritten.
   * `id` and `createdAt` are preserved regardless of what `data` contains.
   * Throws 404 if the record does not exist — use {@link upsert} for create-or-replace behaviour.
   * 
   * @param   {string} id   The record ID to replace.
   * @param   {object} data New field values.
   * @returns {Promise<object>} The replaced record.
   */
  async replace(id, data) {
    this.enforcePermission('write')

    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.recordPath(id))
      if (!file) throw new DatabaseError(`Record not found: ${id}`, 404)

      const record = { id, ...this.addTimestamps(data, file.content) }

      await this.filesystem.writeFile(
        this.recordPath(id),
        record,
        `${this.name}: replace ${id}`,
        file.sha
      )

      return record
    })
  }

  /**
   * Delete a record.
   * 
   * @param   {string} id
   * @returns {Promise<{ id: string, deleted: boolean }>}
   */
  async remove(id) {
    this.enforcePermission('write')
    const deleted = await this.filesystem.deleteFile(this.recordPath(id), `${this.name}: remove ${id}`)
    return { id, deleted }
  }

  /**
   * Update the record if it exists; create it if it does not.
   * 
   * @param   {string} id
   * @param   {object} data
   * @returns {Promise<object>} The resulting record.
   */
  async upsert(id, data) {
    this.enforcePermission('write')
    try {
      return await this.update(id, data)
    } catch (err) {
      if (err.httpStatus === 404) {
        return await this.add({ ...data, id })
      }
      throw err
    }
  }

  // ── Query helpers ─────────────────────────────────────────────────

  /**
   * Filter all records in memory using a predicate function.
   * 
   * @param   {function(object): boolean}        filterFn
   * @param   {object}                           [options]
   * @param   {function(object, object): number} [options.sort]     Comparator for `Array.sort`.
   * @param   {number}                           [options.limit]    Maximum number of results to return.
   * @param   {number}                           [options.offset=0] Number of results to skip.
   * @returns {Promise<object[]>}
   */
  async query(filterFn, { sort, limit, offset = 0 } = {}) {
    this.enforcePermission('read')

    let results = (await this.list()).filter(filterFn)
    if (sort)          results = results.sort(sort)
    if (offset > 0)    results = results.slice(offset)
    if (limit != null) results = results.slice(0, limit)

    return results
  }

  /**
   * Return the first record that satisfies the predicate or `null`.
   * 
   * @param   {function(object): boolean} filterFn
   * @returns {Promise<object|null>}
   */
  async findOne(filterFn) {
    this.enforcePermission('read')
    return (await this.list()).find(filterFn) ?? null
  }

  /**
   * Count records and if `filterFn` is provided, only matching records are counted.
   * 
   * @param   {function(object): boolean} [filterFn]
   * @returns {Promise<number>}
   */
  async count(filterFn = null) {
    this.enforcePermission('read')
    const allRecords = await this.list()
    return filterFn ? allRecords.filter(filterFn).length : allRecords.length
  }

  /**
   * Checks whether a record exists by making a single API call with no data returned.
   * 
   * @param   {string} id
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    this.enforcePermission('read')
    return !!(await this.filesystem.readFile(this.recordPath(id)))
  }

  // ── Bulk operations ───────────────────────────────────────────────

  /**
   * Add multiple records in parallel.
   * 
   * @param   {object[]} items
   * @returns {Promise<object[]>} Created records.
   */
  async bulkAdd(items) {
    this.enforcePermission('write')
    return runWithConcurrency(items, item => this.add(item), 10)
  }

  /**
   * Delete multiple records by ID in parallel.
   * 
   * @param   {string[]} ids
   * @returns {Promise<Array<{ id: string, deleted: boolean }>>}
   */
  async bulkRemove(ids) {
    this.enforcePermission('write')
    return runWithConcurrency(ids, id => this.remove(id), 10)
  }

  /**
   * Delete every record in the collection.
   * 
   * @returns {Promise<Array<{ id: string, deleted: boolean }>>}
   */
  async clear() {
    this.enforcePermission('write')
    const allRecords = await this.list()
    return this.bulkRemove(allRecords.map(record => record.id))
  }

  // ── Real-time polling ─────────────────────────────────────────────

  /**
   * Poll the collection for changes and call `callback` whenever the data changes.
   * The callback receives the full record array.
   * Changes are detected by comparing a hash of the full serialised list.
   * 
   * @param   {function(object[]): void} callback          The function to call upon change detection.
   * @param   {number}                   [intervalMs=5000] Polling interval in milliseconds.
   * @param   {function(Error): void}    [onError]         Called on any polling error.
   * @returns {function(): void}                           Call this to stop polling.
   * 
   * @example
   * const stopListening = db.collection('messages').subscribe(messages => {
   *   renderMessages(messages)
   * })
   * // Later:
   * stopListening()
   */
  subscribe(callback, intervalMs = 5000, onError = null) {
    let lastSnapshot = null
    let isPolling = false

    const poll = async () => {
      if (isPolling) return
      isPolling = true

      try {
        const dirInfo = await this.filesystem.listDirectory(this.collectionPath)
        const currentSnapshot = JSON.stringify(dirInfo.map(entry => entry.sha))

        if (currentSnapshot !== lastSnapshot) {
          lastSnapshot = currentSnapshot
          const records = await this.list()
          callback(records)
        }
      } catch (error) {
        if (onError) onError(error)
      } finally {
        isPolling = false
      }
    }

    poll()
    const intervalId = setInterval(poll, intervalMs)
    return () => clearInterval(intervalId)
  }
}

// ═══════════════════════════════════════════════════════════════════
// Key-Value Store
// ═══════════════════════════════════════════════════════════════════

/**
 * A simple key-value store backed by files at `<basePath>/_kv/<key>.json`.
 * Access via `db.kv`
 */
class KeyValueStore {
  /**
   * @param {GitHubFilesystem} filesystem
   * @param {string}           basePath
   * @param {boolean}          useCDN
   */
  constructor(filesystem, basePath, useCDN = false) {
    this.filesystem = filesystem
    this.useCDN     = useCDN
    this.kvPath     = `${basePath}/_kv`
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Convert a KV key to a safe file path.
   * Non-alphanumeric characters (except `-` and `_`) are replaced with `_`.
   * 
   * @param   {string} key
   * @returns {string}
   */
  keyToPath(key) {
    assertValidId(key)
    return `${this.kvPath}/${key}.json`
  }

  // ── Public ───────────────────────────────────────────────────────

  /**
   * Store a value under `key`.
   * 
   * @param   {string}  key
   * @param   {unknown} value
   * @returns {Promise<unknown>} The value that was stored.
   */
  async set(key, value) {
    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.keyToPath(key))
      await this.filesystem.writeFile(
        this.keyToPath(key),
        { key, value, updatedAt: new Date().toISOString() },
        `kv: set ${key}`,
        file?.sha
      )
      return value
    })
  }

  /**
   * Retrieve the value stored under `key`, or `null` if not found.
   * 
   * @param   {string} key
   * @returns {Promise<unknown|null>}
   */
  async get(key) {
    if (this.useCDN) {
      const fileContent = await this.filesystem.readCDNFile(this.keyToPath(key));
      return fileContent ? fileContent.value : null;
    }
    const file = await this.filesystem.readFile(this.keyToPath(key));
    return file ? file.content.value : null;
  }

  /**
   * Delete the entry for `key`.
   * 
   * @param   {string} key
   * @returns {Promise<{ key: string, deleted: boolean }>}
   */
  async delete(key) {
    const deleted = await this.filesystem.deleteFile(this.keyToPath(key), `kv: delete ${key}`)
    return { key, deleted }
  }

  /**
   * Check whether a key exists.
   * 
   * @param   {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    return !!(await this.filesystem.readFile(this.keyToPath(key)))
  }

  /**
   * Atomic-ish increment a numeric counter.
   * Uses the file's SHA as an optimistic lock so retries on conflict.
   * 
   * @param   {string} key
   * @param   {number} [incrementBy=1]
   * @returns {Promise<number>} The new value.
   */
  async increment(key, incrementBy = 1) {
    return retryOnConflict(async () => {
      const file         = await this.filesystem.readFile(this.keyToPath(key))
      const currentValue = file ? Number(file.content.value) : 0
      const newValue     = currentValue + incrementBy

      await this.filesystem.writeFile(
        this.keyToPath(key),
        { key, value: newValue, updatedAt: new Date().toISOString() },
        `kv: increment ${key}`,
        file?.sha
      )

      return newValue
    })
  }

  /**
   * Get multiple keys in one call.
   * Accepts either spread args — `getMany('a', 'b')` — or a single array — `getMany(['a', 'b'])`.
   * 
   * @param   {...string|string[][]} keys
   * @returns {Promise<{ [key: string]: unknown }>}
   */
  async getMany(...keys) {
    const keyList = keys.length === 1 && Array.isArray(keys[0]) ? keys[0] : keys
    const pairs   = await runWithConcurrency(keyList, async key => [key, await this.get(key)])
    return Object.fromEntries(pairs)
  }

  /**
   * Set multiple keys at once (parallel writes).
   * 
   * @param   {{ [key: string]: unknown }} entries
   * @returns {Promise<unknown[]>} Array of stored values.
   */
  async setMany(entries) {
    return runWithConcurrency(Object.entries(entries), ([key, value]) => this.set(key, value))
  }

  /**
   * List all KV entries as a `{ key -> value }` map.
   * 
   * @returns {Promise<{ [key: string]: unknown }>}
   */
  async getAll() {
    const files = await this.filesystem.listDirectory(this.kvPath)
    const pairs = await runWithConcurrency(
      files.filter(entry => entry.name.endsWith('.json')),
      async entry => {
        const key = entry.name.replace(/\.json$/, '')
        return [key, await this.get(key)]
      }
    )
    return Object.fromEntries(pairs)
  }
}

// ═══════════════════════════════════════════════════════════════════
// Auth Manager
// ═══════════════════════════════════════════════════════════════════

/**
 * Username/password authentication backed by a JSON file in the repo.
 * Passwords are stored as SHA-256 hashes with a username salt + global pepper.
 * Access via `db.auth`
 */
class AuthManager {
  /**
   * @param {GitHubFilesystem} filesystem
   * @param {SessionState}     sessionState
   * @param {string}           [basePath='data']
   */
  constructor(filesystem, sessionState, basePath = 'data') {
    this.filesystem  = filesystem
    this.session     = sessionState
    this.usersFile   = `${basePath}/_auth/users.json`
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Load the full users array (with password hashes).
   * Returns `{ users, sha }`
   */
  async loadUsers() {
    const file = await this.filesystem.readFile(this.usersFile)
    return file
      ? { users: file.content, sha: file.sha }
      : { users:[],           sha: undefined }
  }

  /**
   * Return a "safe" user object stripped of the password hash.
   * 
   * @param   {{ id: string, username: string, role: string, createdAt: string, passwordHash?: string }} user
   * @returns {{ id: string, username: string, role: string, createdAt: string }}
   */
  safeUser(user) {
    return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt }
  }

  // ── Public ───────────────────────────────────────────────────────

  /** The currently logged-in user, or `null`. */
  get currentUser() { return this.session.currentUser }

  /** `true` if a user is logged in. */
  get isLoggedIn() { return this.session.isLoggedIn }

  /**
   * Validates the active session against the live repository data.
   * Useful to detect deleted accounts or password resets.
   * 
   * @returns {Promise<boolean>}
   */
  async verifySession() {
    if (!this.session.isLoggedIn) return false
    const { users } = await this.loadUsers()
    const stillValid = users.some(u => u.id === this.session.currentUser.id)
    if (!stillValid) this.logout()
    return stillValid
  }

  /**
   * Create a new user account.
   * The first account is automatically an admin.
   * 
   * @param   {string} username 2–32 alphanumeric characters, hyphens, or underscores.
   * @param   {string} password Minimum 6 characters.
   * @returns {Promise<{ id: string, username: string, role: string, createdAt: string }>}
   */
  async register(username, password) {
    if (!username || !password) {
      throw new DatabaseError('Username and password are required', 400)
    }
    if (!/^[a-zA-Z0-9_\-]{2,32}$/.test(username)) {
      throw new DatabaseError('Username must be 2–32 characters: letters, numbers, hyphens, and underscores only', 400)
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new DatabaseError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
    }

    return retryOnConflict(async () => {
      const { users, sha } = await this.loadUsers()

      if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        throw new DatabaseError('That username is already taken', 409)
      }

      const newUser = {
        id:           generateId(),
        username,
        passwordHash: await hashPassword(password, username),
        createdAt:    new Date().toISOString(),
        role:         users.length === 0 ? 'admin' : 'user',
      }

      users.push(newUser)
      await this.filesystem.writeFile(this.usersFile, users, `auth: register ${username}`, sha)

      const safeUser = this.safeUser(newUser)
      this.session.persistUser(safeUser)
      return safeUser
    })
  }

  /**
   * Verify credentials and start a session.
   * 
   * @param   {string} username
   * @param   {string} password
   * @returns {Promise<{ id: string, username: string, role: string, createdAt: string }>}
   */
  async login(username, password) {
    if (!username || !password) {
      throw new DatabaseError('Username and password are required', 400)
    }

    const { users } = await this.loadUsers()
    const user      = users.find(u => u.username.toLowerCase() === username.toLowerCase())

    if (!user) throw new DatabaseError('User not found', 404)

    const passwordMatches = await timingSafeEqual(
      await hashPassword(password, username),
      user.passwordHash
    )
    if (!passwordMatches) throw new DatabaseError('Incorrect password', 401)

    const safeUser = this.safeUser(user)
    this.session.persistUser(safeUser)
    return safeUser
  }

  /** 
   * End the current session.
   */
  logout() {
    this.session.clearSession()
  }

  /**
   * Change the password for an account.
   * The old password must be correct.
   * 
   * @param   {string} username
   * @param   {string} currentPassword
   * @param   {string} newPassword
   * @returns {Promise<{ ok: true }>}
   */
  async changePassword(username, currentPassword, newPassword) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new DatabaseError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
    }

    return retryOnConflict(async () => {
      const { users, sha } = await this.loadUsers()
      const userIndex      = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase())

      if (userIndex === -1) throw new DatabaseError('User not found', 404)

      const currentHash  = await hashPassword(currentPassword, username)
      const hashMatches  = await timingSafeEqual(currentHash, users[userIndex].passwordHash)
      if (!hashMatches) throw new DatabaseError('Incorrect current password', 401)

      users[userIndex].passwordHash = await hashPassword(newPassword, username)
      users[userIndex].updatedAt    = new Date().toISOString()

      await this.filesystem.writeFile(this.usersFile, users, `auth: change password ${username}`, sha)
      return { ok: true }
    })
  }

  /**
   * Permanently delete an account.
   * The user is automatically logged out if they delete their own account.
   * 
   * @param   {string} username
   * @param   {string} password
   * @returns {Promise<{ deleted: true }>}
   */
  async deleteAccount(username, password) {
    return retryOnConflict(async () => {
      const { users, sha } = await this.loadUsers()
      const userIndex      = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase())

      if (userIndex === -1) throw new DatabaseError('User not found', 404)

      const hashMatches = await timingSafeEqual(
        await hashPassword(password, users[userIndex].username),
        users[userIndex].passwordHash
      )
      if (!hashMatches) throw new DatabaseError('Incorrect password', 401)

      users.splice(userIndex, 1)
      await this.filesystem.writeFile(this.usersFile, users, `auth: delete account ${username}`, sha)
      
      if (this.session.currentUser?.username === username) {
        this.session.clearSession()
      }

      return { deleted: true }
    })
  }

  /**
   * List all registered users (safe fields only — no password hashes).
   * 
   * @returns {Promise<Array<{ id: string, username: string, role: string, createdAt: string }>>}
   */
  async listUsers() {
    const { users } = await this.loadUsers()
    return users.map(user => this.safeUser(user))
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main GitHubDB class
// ═══════════════════════════════════════════════════════════════════

/**
 * The main entry point.
 * Use the static factory methods to create instances:
 * `GitHubDB.owner()`, `GitHubDB.public()`, `GitHubDB.login()`, `GitHubDB.register()`
 * 
 * @example
 * // Owner mode — full access with your own PAT
 * const db = GitHubDB.owner({ owner: 'you', repo: 'my-db', token: 'ghp_...' })
 *
 * // Public mode — open read/write with an embedded bot token
 * const db = GitHubDB.public({ owner: 'you', repo: 'my-db', publicToken: 'encoded...' })
 *
 * // User auth mode
 * const db = await GitHubDB.login({ owner, repo, publicToken, username, password })
 */
class GitHubDB {
  /**
   * @param {GitHubFilesystem} filesystem
   * @param {object}           [options]
   * @param {string}           [options.basePath='data']
   * @param {boolean}          [options.useCDN=false]
   */
  constructor(filesystem, { basePath = 'data', useCDN = false } = {}) {
    this.filesystem  = filesystem
    this.basePath    = basePath
    this.useCDN      = useCDN
    this.session     = new SessionState()
    this.accessRules = null

    /**
     * Key-value store. Access via `db.kv`
     * @type {KeyValueStore}
     */
    this.kv   = new KeyValueStore(filesystem, basePath, useCDN)

    /**
     * Auth manager. Access via `db.auth`
     * @type {AuthManager}
     */
    this.auth = new AuthManager(filesystem, this.session, basePath)
  }

  // ── Static factory methods ───────────────────────────────────────

  /**
   * **Owner mode** — use your personal PAT. Full access to the repo.
   * 
   * @param   {object} config
   * @param   {string} config.owner
   * @param   {string} config.repo
   * @param   {string} config.token             Your Personal Access Token.
   * @param   {string}[config.branch='main']
   * @param   {string} [config.basePath='data']
   * @param   {boolean}[config.useCDN=false]   Enable CDN for reads.
   * @returns {GitHubDB}
   */
  static owner({ owner, repo, token, branch = 'main', basePath = 'data', useCDN = false }) {
    const filesystem = new GitHubFilesystem({ owner, repo, token, branch })
    return new GitHubDB(filesystem, { basePath, useCDN })
  }

  /**
   * **Public mode** — embed a bot token so any visitor can read and write without logging in.
   * The token is XOR-obfuscated to avoid being a plain readable string in view-source.
   * 
   * Encode your bot token once:
   * ```js
   * GitHubDB.encodeToken('ghp_yourBotToken')  // -> 'ghdb_enc_...'
   * ```
   * Then pass that encoded string as `publicToken`.
   * 
   * @param   {object} config
   * @param   {string} config.owner
   * @param   {string} config.repo
   * @param   {string} config.publicToken       Encoded (or plain) bot PAT.
   * @param   {string} [config.branch='main']
   * @param   {string}[config.basePath='data']
   * @param   {boolean}[config.useCDN=false]   Enable CDN for reads.
   * @returns {GitHubDB}
   */
  static public({ owner, repo, publicToken, branch = 'main', basePath = 'data', useCDN = false }) {
    const resolvedToken = decodeToken(publicToken)
    const filesystem = new GitHubFilesystem({ owner, repo, token: resolvedToken, branch })
    return new GitHubDB(filesystem, { basePath, useCDN })
  }

  /**
   * **Login mode** — authenticate an existing user account,
   * then return an authenticated `GitHubDB` instance.
   * 
   * @param   {object} config
   * @param   {string} config.owner
   * @param   {string} config.repo
   * @param   {string} config.publicToken       Bot token (encoded or plain).
   * @param   {string} config.username
   * @param   {string} config.password
   * @param   {string} [config.branch='main']
   * @param   {string} [config.basePath='data']
   * @returns {Promise<GitHubDB>}
   */
  static async login({ owner, repo, publicToken, username, password, branch = 'main', basePath = 'data' }) {
    const db = GitHubDB.public({ owner, repo, publicToken, branch, basePath, useCDN: false })
    await db.auth.login(username, password)
    return db
  }

  /**
   * **Register mode** — create a new user account,
   * then return an authenticated `GitHubDB` instance.
   * 
   * @param   {object} config
   * @param   {string} config.owner
   * @param   {string} config.repo
   * @param   {string} config.publicToken       Bot token (encoded or plain).
   * @param   {string} config.username
   * @param   {string} config.password
   * @param   {string} [config.branch='main']
   * @param   {string}[config.basePath='data']
   * @returns {Promise<GitHubDB>}
   */
  static async register({ owner, repo, publicToken, username, password, branch = 'main', basePath = 'data' }) {
    const db = GitHubDB.public({ owner, repo, publicToken, branch, basePath, useCDN: false })
    await db.auth.register(username, password)
    return db
  }

  // ── Token helpers ────────────────────────────────────────────────

  /**
   * Obfuscate a PAT for safe embedding in public source code.
   * 
   * @param   {string} plainToken
   * @returns {string}
   */
  static encodeToken(plainToken) { return encodeToken(plainToken) }

  /**
   * Reverse {@link encodeToken}. Useful for debugging.
   * 
   * @param   {string} encodedToken
   * @returns {string}
   */
  static decodeToken(encodedToken) { return decodeToken(encodedToken) }

  // ── Core API ─────────────────────────────────────────────────────

  /**
   * Get a handle on a named collection.
   * 
   * @param   {string} name  Letters, numbers, hyphens, and underscores.
   * @returns {Collection}
   * 
   * @example
   * const messages = db.collection('messages')
   * await messages.add({ author: 'Alice', text: 'Hello!' })
   */
  collection(name) {
    return new Collection(this.filesystem, name, this.basePath, this.session, this.accessRules, this.useCDN)
  }

  /**
   * Set per-collection access rules. Chainable.
   * 
   * @param   {{ [collectionName: string]: { read: string, write: string } }} rulesMap
   * @returns {this}
   * 
   * @example
   * db.rules({
   *   posts:    { read: 'public', write: 'auth' },
   *   settings: { read: 'owner',  write: 'owner' },
   * })
   */
  rules(rulesMap) {
    this.accessRules = rulesMap
    return this
  }

  /**
   * Fetch the git commit history for a path.
   * This is your free, immutable audit log.
   * Every write through this library creates a commit you can inspect here.
   * 
   * @param   {string} [path='']  Limit to this file or directory path.
   * @param   {number} [limit=30] Maximum number of commits to return.
   * @returns {Promise<Array<{ sha, message, author, date, url }>>}
   */
  getCommitHistory(path = '', limit = 30) {
    return this.filesystem.getCommitHistory(path, limit)
  }

  /**
   * Verify that the configured token and repo are accessible.
   * Throws a descriptive {@link DatabaseError} if not.
   * Useful for showing an error state on startup.
   * 
   * @returns {Promise<object>} GitHub repo metadata.
   */
  validateConnection() {
    return this.filesystem.validateConnection()
  }
}

// ═══════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════

export { GitHubDB, DatabaseError }
export default GitHubDB