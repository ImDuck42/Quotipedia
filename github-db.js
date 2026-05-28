/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║                                                             github-db.js                                                             ║
 * ║                                   A JSON / GitHub based database where every write is a git commit                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══ QUICK START ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *  Create instance — embed bot tokens so visitors can interact without their own PAT:
 *    const db = await GitHubDB.instance({ owner, repo, tokens: ['ghdb_enc_...', 'ghdb_enc_...'] })
 *    const db = await GitHubDB.instance({ owner, repo, tokens, branch, rawBranches, basePath, useRaw })
 *
 *  Raw mode — recommended for public read-heavy apps (reads bypass API rate limits via raw.githubusercontent.com):
 *    const db = await GitHubDB.instance({ ..., useRaw: true, branch: main })
 *    // branch — branch used for GitHub API reads/writes and raw reads (default: 'main')
 *
 * ═══ PERMISSIONS ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *  Call db.permissions() after init to set per-collection or per-KV-key access.
 *  Any entry not listed defaults to { read: 'admin', write: 'admin' }.
 *
 *  Permission levels:
 *    'public' — anyone, no login required
 *    'auth'   — any logged-in user
 *    'admin'  — admin role only (the first registered user is automatically admin)
 *    custom   — any string or array of strings, e.g. 'moderator' or ['editor', 'moderator']
 *  Admins always pass any permission check regardless of the required level.
 *
 *  db.permissions({
 *    posts:          { read: 'public',                            write: 'auth'                    },
 *    settings:       { read: 'admin',                             write: 'admin'                   },
 *    reports:        { read: ['moderator', 'analyst', 'auditor'], write: ['moderator', 'admin']    },
 *    'posts.abc123': { read: 'admin',                             write: 'admin'                   },
 *    _kv:            { read: 'auth',                              write: 'admin'                   },
 *    '_kv.theme':    { read: 'public',                            write: ['moderator', 'designer'] },
 *  })
 *
 *  Lookup priority per operation:
 *    collection.recordId -> collection -> default 'admin'
 *    _kv.keyName         -> _kv        -> default 'admin'
 *
 * ═══ COLLECTIONS  (stored at <basePath>/<collection>/<id>.json) ═════════════════════════════════════════════════════════════════════════
 *
 *    const posts = db.collection('posts')
 *
 *    await posts.add({ title: 'Hello' })                                               // create
 *    await posts.get(id)                                                               // fetch one -> record | null
 *    await posts.list()                                                                // fetch all
 *    await posts.update(id, { title: 'New' })                                          // partial patch
 *    await posts.replace(id, { title: 'New' })                                         // full replace
 *    await posts.remove(id)                                                            // delete
 *    await posts.upsert(id, data)                                                      // create-or-patch
 *    await posts.query(record => record.published)                                     // filter in memory
 *    await posts.query(fn, { sort, limit, offset })                                    // with options
 *    await posts.count()                                                               // total count
 *    await posts.count(record => record.published)                                     // filtered count
 *    await posts.exists(id)                                                            // boolean
 *    await posts.bulkAdd([{ ... }, { ... }])                                           // add many
 *    await posts.bulkRemove([id1, id2])                                                // remove many
 *    await posts.uploadFile(fileBlob, 'avatar')                                        // upload a file
 *    await posts.deleteUpload('2026-05-18-photo.jpg')                                  // delete an upload by safe name
 *    await posts.getUpload('2026-05-18-photo.jpg')                                     // exact -> array of matched
 *    await posts.getUpload('photo')                                                    // partial -> array of matches
 *    await posts.listUploads()                                                         // list all uploads
 *    await posts.clear()                                                               // delete all (irreversible)
 *    const stop = posts.subscribe(({ records, added, changed, removed }) => { }, 5000) // poll for changes
 *    stop()                                                                            // cancel subscription
 *
 * ═══ SUBCOLLECTIONS  (nested collections inside a collection) ═══════════════════════════════════════════════════════════════════════════
 *
 *    // Nesting can go as deep as needed:
 *    const members = db.collection('orgs', 'acme', 'teams', 'eng', 'members')
 *    await members.add({ name: 'Alice' })
 *    await members.list()
 *
 * ═══ KEY-VALUE STORE  (stored at <basePath>/_kv/<key>.json) ═════════════════════════════════════════════════════════════════════════════
 *
 *    await db.kv.set('theme', 'dark')
 *    await db.kv.get('theme')                                                          // value | null
 *    await db.kv.delete('theme')
 *    await db.kv.has('theme')                                                          // boolean
 *    await db.kv.increment('views')                                                    // atomic-ish counter
 *    await db.kv.increment('score', 5)                                                 // increment by N
 *    await db.kv.getMany('key1', 'key2')                                               // { key1: v1, key2: v2 }
 *    await db.kv.getMany(['key1', 'key2'])                                             // array form also accepted
 *    await db.kv.setMany({ key1: v1, key2: v2 })
 *    await db.kv.getAll()                                                              // { key: value } for all KV entries
 *    const stop = db.kv.subscribe(({ entries, added, changed, removed }) => { }, 5000) // poll for changes
 *    stop()                                                                            // cancel subscription
 *
 * ═══ AUTH  (stored at <basePath>/_auth/<username>.json per user) ════════════════════════════════════════════════════════════════════════
 *
 *    await db.auth.register(username, password)                       // -> safe user object { id, username, roles, createdAt }
 *    await db.auth.login(username, password)                          // -> safe user object
 *    await db.auth.verifySession()                                    // -> boolean
 *    await db.auth.changePassword(username, oldPassword, newPassword) // admin bypasses oldPassword check
 *    await db.auth.deleteAccount(username, password)                  // admin bypasses password check
 *    await db.auth.listUsers()                                        // safe fields only
 *    await db.auth.setRoles(username, roles)                          // admin only
 *    db.auth.currentUser                                              // { id, username, roles, createdAt } | null
 *    db.auth.isLoggedIn                                               // boolean
 *    db.auth.logout()
 *
 *    Roles: the first registered user gets ['admin']. All others default to ['user'].
 *    Users can hold multiple roles — e.g. ['editor', 'moderator'].
 *    Admins always pass any permission check.
 *    'public' and 'auth' are reserved and cannot be used as role names.
 *
 * ═══ HASHING  (PBKDF2-SHA256, 200 000 iterations) ═══════════════════════════════════════════════════════════════════════════════════════
 *
 *    const hash = await GitHubDB.hashSecret('my-password', 'optional-context')
 *    const ok   = await GitHubDB.verifySecret('my-password', hash, 'optional-context')
 *
 * ═══ TOKEN ENCODING  (obfuscate a PAT before embedding in client-side code) ═════════════════════════════════════════════════════════════
 *
 *    const encoded = GitHubDB.encodeToken('ghp_myRealToken') // Note: obfuscation deters casual scraping only; it is not encryption.
 *    // Pass the encoded string as token — the library decodes it automatically.
 *
 * ═══ UTILITIES ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *    await db.getCommitHistory(path?, limit?) // git audit log
 *    await db.validateConnection()            // throws if token / repo is unreachable
 *    GitHubDB.encodeToken(plainToken)         // obfuscate PAT for embedding
 */

'use strict'


// ═══ Constants ════════════════════════════════════════════════════════════════

const DATABASE_VERSION    = '3.2.0-alpha-1'
const GITHUB_API_BASE     = 'https://api.github.com'
const RAW_GITHUB_BASE     = 'https://raw.githubusercontent.com'
const GITHUB_API_VERSION  = '2026-03-10'

const SESSION_STORAGE_KEY = '__githubdb_session__'
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000 // 8 hours
const MIN_PASSWORD_LENGTH = 8
const MAX_WRITE_RETRIES   = 5
const CONCURRENCY_LIMIT   = 10
const QUERY_BATCH_SIZE    = 50

// Changing any of the following constants invalidates all existing password hashes.
const PASSWORD_PEPPER   = 'ghdb-pepper-4269'
const PBKDF2_ITERATIONS = 200_000
const ENCODE_PREFIX     = 'ghdb_enc_'
const TOKEN_XOR_KEY     = 'GHDB'


// ═══ ADDONS ═══════════════════════════════════════════════════════════════════

const ADDON_BASE = 'https://imduck42.github.io/GHDB/addons'

// Check for library updates on GitHub and log changelog entries if a newer version is available.
try {
  const DATABASE_UPDATER = await import(`${ADDON_BASE}/updater.js`)
  await DATABASE_UPDATER.checkForUpdate(DATABASE_VERSION)
} catch { /* updater is optional */ }

// Import the workflow indexer addon.
const INDEX_WORKFLOW = await import(
  `${ADDON_BASE}/workflow.js`
) // catch { /* Sike, u need this*/ }

/**
 * Uses the imported workflow module to create a wrapper function using the first token.
 * @param {string}   owner
 * @param {string}   repo
 * @param {string[]} tokens
 * @param {string}   basePath
 */
async function installWorkflow(owner, repo, tokens, basePath) {
  try {
    const token = resolveToken(tokens[0])
    await INDEX_WORKFLOW.generateIndexerWorkflow(owner, repo, token, basePath)
  } catch (error) {
    throw new DatabaseError(`Could not update indexer workflow: ${error.message}`, 500)
  }
}


// ═══ Error ════════════════════════════════════════════════════════════════════

/** All errors thrown by this library are instances of DatabaseError. */
class DatabaseError extends Error {
  /**
   * @param {string} message        Human-readable description of the error.
   * @param {number} [httpStatus=0] HTTP status code that triggered this error (0 if not HTTP-related).
   */
  constructor(message, httpStatus = 0) {
    super(message)
    this.name       = 'DatabaseError'
    this.httpStatus = httpStatus
  }
}


// ═══ Validation ═══════════════════════════════════════════════════════════════

/**
 * Asserts that an ID or key only contains safe characters.  
 * Prevents path traversal — only letters, numbers, hyphens, and underscores are allowed.
 * @param {string} id
 */
function assertValidId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_\-]*$/.test(id)) {
    throw new DatabaseError(
      `Invalid ID or key: "${id}". Must use letters, numbers, hyphens, and underscores only.`, 400
    )
  }
}

/**
 * Validates factory configuration to catch misconfigurations early.
 * @param {{owner:string, repo:string, branch:string, tokens?:string[], basePath:string}} config
 */
function assertValidConfig({ owner, repo, branch, tokens, basePath }) {
  if (!owner || !repo || !branch) {
    throw new DatabaseError('owner, repo, and branch are required', 400)
  }
  const tokenArray = tokens
  if (!Array.isArray(tokenArray) || !tokenArray.length) {
    throw new DatabaseError('At least one token is required', 400)
  }
  if (/[?#]|(?:^|\/)\.\.?(?:\/|$)/.test(basePath)) {
    throw new DatabaseError('Invalid basePath', 400)
  }
}

/**
 * Recursively strip prototype-pollution keys from a plain object.
 * @param   {unknown} object
 * @returns {unknown}
 */
function sanitizeKeys(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return object
  const clean = {}
  for (const key of Object.keys(object)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    clean[key] = sanitizeKeys(object[key])
  }
  return clean
}


// ═══ ID Generation ════════════════════════════════════════════════════════════

/**
 * Generate a collision-resistant record ID in the form `<timestamp-base36>-<random-base36>`.
 * @returns {string}
 */
function generateId() {
  const timestamp  = Date.now().toString(36)
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(byte => byte.toString(36).padStart(2, '0'))
    .join('')
  return `${timestamp}-${randomPart}`
}


// ═══ Base64 ═══════════════════════════════════════════════════════════════════

/**
 * Encode a UTF-8 string to base64 (works in both Node.js and browsers).
 * @param   {string} text
 * @returns {string}
 */
function encodeBase64(text) {
  const bytes  = new TextEncoder().encode(text)
  const chunks = []
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }
  return btoa(chunks.join(''))
}

/**
 * Convert a File/Blob to a base64 string.
 * @param   {File|Blob} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(new Error('File read failed'))
  })
}

/**
 * Decode a base64 string to UTF-8.
 * @param   {string} base64
 * @returns {string}
 */
function decodeBase64(base64) {
  const binaryString = atob(base64.replace(/\s/g, ''))
  const bytes        = new Uint8Array(binaryString.length)
  for (let index = 0; index < binaryString.length; index++) {
    bytes[index] = binaryString.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

/** Serialize a value to base64-encoded JSON for the GitHub Contents API. */
const encodeFileContent = value  => encodeBase64(JSON.stringify(value, null, 2))

/** Deserialize a base64-encoded string returned by the GitHub Contents API. */
const decodeFileContent = base64 => JSON.parse(decodeBase64(base64))


// ═══ Token Obfuscation ════════════════════════════════════════════════════════

/**
 * XOR a string against the repeating TOKEN_XOR_KEY — shared by encode and resolve.
 * @param   {string} input
 * @returns {string}
 */
function xorToken(input) {
  return Array.from(input)
    .map((char, index) =>
      String.fromCharCode(char.charCodeAt(0) ^ TOKEN_XOR_KEY.charCodeAt(index % TOKEN_XOR_KEY.length))
    )
    .join('')
}

/**
 * Obfuscate a plain PAT to a prefixed base64+XOR string suitable for embedding in client code.
 * @param   {string} plainToken
 * @returns {string}
 */
const encodeToken = plainToken => ENCODE_PREFIX + encodeBase64(xorToken(plainToken))

/**
 * Resolve a token that may be plain or obfuscated.
 * @param   {string} token
 * @returns {string}
 */
function resolveToken(token) {
  if (!token.startsWith(ENCODE_PREFIX)) { return token }
  return xorToken(decodeBase64(token.slice(ENCODE_PREFIX.length)))
}


// ═══ Cryptographic Hashing (PBKDF2-SHA256) ═══════════════════════════════════

/**
 * Internal PBKDF2 driver — returns a hex-encoded derived key.
 * @param   {string}     secret
 * @param   {string}     context Optional binding context (e.g. username).
 * @param   {Uint8Array} salt
 * @param   {string}     pepper  Optional pepper override.
 * @returns {Promise<string>}
 */
async function deriveKey(secret, context, salt, pepper) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret + pepper + context),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  )
  return Array.from(new Uint8Array(bits))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert a byte array to a hex string.
 * @param   {Uint8Array} bytes
 * @returns {string}
 */
const bytesToHex = bytes => Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')

/**
 * Hash a secret using PBKDF2-SHA256.  
 * Output format: `<hex-salt>:<hex-derived-key>`.
 * @param   {string} secret
 * @param   {string} [context='']             Extra binding context (e.g. the username).
 * @param   {string} [pepper=PASSWORD_PEPPER] Optional custom pepper.
 * @returns {Promise<string>}
 */
async function hashSecret(secret, context = '', pepper = PASSWORD_PEPPER) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  return `${bytesToHex(saltBytes)}:${await deriveKey(secret, context, saltBytes, pepper)}`
}

/**
 * Verify a plaintext secret against a hash produced by {@link hashSecret}.  
 * Uses constant-time comparison to prevent timing attacks.
 * @param   {string} secret
 * @param   {string} storedHash               Value returned by `hashSecret`.
 * @param   {string} [context='']             Must match the context used during hashing.
 * @param   {string} [pepper=PASSWORD_PEPPER] Optional custom pepper.
 * @returns {Promise<boolean>}
 */
async function verifySecret(secret, storedHash, context = '', pepper = PASSWORD_PEPPER) {
  const [saltHex, expectedKey] = storedHash.split(':')
  if (!saltHex || !expectedKey) return false

  const saltBytes    = new Uint8Array(saltHex.match(/.{2}/g).map(pair => parseInt(pair, 16)))
  const candidateKey = await deriveKey(secret, context, saltBytes, pepper)

  if (candidateKey.length !== expectedKey.length) return false

  let bitDifferences = 0
  for (let index = 0; index < candidateKey.length; index++) {
    bitDifferences |= candidateKey.charCodeAt(index) ^ expectedKey.charCodeAt(index)
  }
  return bitDifferences === 0
}


// ═══ Concurrency Helpers ══════════════════════════════════════════════════════

/**
 * Run an async task over each item with at most `limit` tasks in-flight at once.
 * @template                          type
 * @param   {type[]}                  items
 * @param   {function(type): Promise} taskFn
 * @param   {number}                  [limit=CONCURRENCY_LIMIT]
 * @returns {Promise<any[]>}
 */
async function runConcurrently(items, taskFn, limit = CONCURRENCY_LIMIT) {
  const results  = []
  const inFlight = new Set()

  for (const item of items) {
    const promise = Promise.resolve().then(() => taskFn(item))
    results.push(promise)
    inFlight.add(promise)
    promise.then(() => inFlight.delete(promise), () => inFlight.delete(promise))
    if (inFlight.size >= limit) { await Promise.race(inFlight) }
  }

  return Promise.all(results)
}

/**
 * Retry an async operation on HTTP 409 (SHA race condition), up to `maxRetries` times.
 * @param   {function(): Promise} operation
 * @param   {number}              [maxRetries=MAX_WRITE_RETRIES]
 * @returns {Promise<any>}
 */
async function retryOnConflict(operation, maxRetries = MAX_WRITE_RETRIES) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (error.httpStatus === 409 && attempt < maxRetries) continue
      throw error
    }
  }
}


// ═══ Permission Helpers ═══════════════════════════════════════════════════════

/**
 * Returns `true` if `userRoles` satisfies `requiredLevel`.  
 * Supported levels: `'public'`, `'auth'`, `'admin'`, or any custom role string / array.
 * @param   {string|string[]} requiredLevel
 * @param   {string[]}        userRoles
 * @returns {boolean}
 */
function hasRequiredRole(requiredLevel, userRoles) {
  if (userRoles.includes('admin')) { return true }
  if (requiredLevel === 'auth')    { return userRoles.length > 0 }
  const required = Array.isArray(requiredLevel) ? requiredLevel : [requiredLevel]
  return required.some(role => userRoles.includes(role))
}

/**
 * Shared permission gate used by Collection and KeyValueStore.  
 * Throws DatabaseError 401 or 403 if the current session is insufficient.
 * @param {string}         subject   Human-readable subject name for error messages.
 * @param {'read'|'write'} operation
 * @param {object|null}    rule      Matched `{ read, write }` rule, or null.
 * @param {SessionState}   session
 */
function enforcePermission(subject, operation, rule, session) {
  const requiredLevel = operation === 'read' ? (rule?.read ?? 'admin') : (rule?.write ?? 'admin')

  if (!requiredLevel || requiredLevel === 'public' || (Array.isArray(requiredLevel) && !requiredLevel.length)) {
    return
  }

  if (!session.isLoggedIn) {
    throw new DatabaseError(`${subject} requires a logged-in user for ${operation} operations`, 401)
  }

  const userRoles = session.currentUser?.roles ?? []
  if (!hasRequiredRole(requiredLevel, userRoles)) {
    const humanRequired = Array.isArray(requiredLevel) ? requiredLevel.join(' or ') : requiredLevel
    throw new DatabaseError(`${subject} requires "${humanRequired}" role for ${operation} operations`, 403)
  }
}


// ═══ Polling / Subscribe Utility ══════════════════════════════════════════════

/**
 * Generic polling subscription used by both {@link Collection} and {@link KeyValueStore}.  
 * Calls `callback` immediately on first poll, then again on any data change.
 *
 * @param   {object}                                                  options
 * @param   {function(): Promise<object[]>}                           options.listEntries       Return raw directory entries for the target path.
 * @param   {function(string): Promise<any>}                          options.fetchRecord       Fetch a single record / value by its ID or key.
 * @param   {function(object): string|null}                           options.entryToId         Map a directory entry to its logical ID (null to skip the entry).
 * @param   {function({ records, added, changed, removed }): void}    options.callback
 * @param   {number}                                                  [options.intervalMs=5000]
 * @param   {function(Error): void}                                   [options.onError]
 * @returns {function(): void}                                                                  A stop function — call it to cancel polling.
 */
function subscribeToDirectory({ listEntries, fetchRecord, entryToId, callback, intervalMs = 5000, onError = null }) {
  const knownShas  = new Map() // id -> sha from last successful poll
  const cachedData = new Map() // id -> record / value
  let isPolling    = false
  let initialized  = false

  const poll = async () => {
    if (isPolling) { return }
    isPolling = true

    try {
      const dirEntries  = await listEntries()
      const currentShas = new Map(
        dirEntries
          .map(entry => { const id = entryToId(entry); return id ? [id, entry.sha] : null })
          .filter(Boolean)
      )

      const toFetch    = [...currentShas.keys()].filter(id => knownShas.get(id) !== currentShas.get(id))
      const deletedIds = [...knownShas.keys()].filter(id => !currentShas.has(id))

      if (toFetch.length > 0 || deletedIds.length > 0 || !initialized) {
        const added   = []
        const changed = []

        if (toFetch.length > 0) {
          const fetched = await runConcurrently(toFetch, id => fetchRecord(id))
          fetched.forEach((record, index) => {
            if (record == null) { return }
            const id = toFetch[index]
            if (!knownShas.has(id)) {
              added.push(record)
            } else {
              const oldRecord = cachedData.get(id)
              if (!oldRecord || JSON.stringify(oldRecord) !== JSON.stringify(record)) {
                changed.push(record)
              }
            }
            cachedData.set(id, record)
          })
        }

        const removedIds = deletedIds.filter(id => cachedData.has(id))
        removedIds.forEach(id => cachedData.delete(id))

        knownShas.clear()
        currentShas.forEach((sha, id) => knownShas.set(id, sha))

        callback({
          records: Array.from(cachedData.values()),
          added,
          changed,
          removed: removedIds,
        })
      }
    } catch (error) {
      if (onError) { onError(error) }
    } finally {
      initialized = true
      isPolling   = false
    }
  }

  poll()
  const intervalId = setInterval(poll, intervalMs)
  return () => clearInterval(intervalId)
}

// ═══ Session State ════════════════════════════════════════════════════════════

/**
 * Manages in-memory and sessionStorage login state.
 * Sessions expire after SESSION_LIFETIME_MS (8 hours).
 */
class SessionState {
  constructor() {
    this.activeUser = null
    this.restoreSession()
  }

  // ══ Storage Adapters ══════════════════════════════════════════════════════════

  storageGet(key) {
    try { return sessionStorage.getItem(key) }
    catch { return null }
  }

  storageSet(key, value) {
    try { sessionStorage.setItem(key, value) }
    catch (err) { console.error('[GitHubDB] Storage write error:', err) }
  }

  storageDelete(key) {
    try { sessionStorage.removeItem(key) }
    catch (err) { console.error('[GitHubDB] Storage delete error:', err) }
  }

  // ══ Session Lifecycle ═════════════════════════════════════════════════════════

  /** Restore a previously persisted session, discarding it if expired. */
  restoreSession() {
    try {
      const raw = this.storageGet(SESSION_STORAGE_KEY)
      if (!raw) { return }
      const session = JSON.parse(raw)
      if (session.expiresAt && Date.now() > session.expiresAt) {
        this.storageDelete(SESSION_STORAGE_KEY)
        return
      }
      if (!session.user || typeof session.user.username !== 'string'
        || !Array.isArray(session.user.roles)
        || typeof session.user.id !== 'string') {
        
        this.storageDelete(SESSION_STORAGE_KEY)
        return
      }
      this.activeUser = session.user
    } catch {
      this.storageDelete(SESSION_STORAGE_KEY)
    }
  }

  /**
   * Persist a user object to session storage and memory.
   * @param {{ id: string, username: string, roles: string[], createdAt: string }} user
   */
  persistUser(user) {
    this.activeUser = user
    this.storageSet(
      SESSION_STORAGE_KEY,
      JSON.stringify({ user, expiresAt: Date.now() + SESSION_LIFETIME_MS })
    )
  }

  /** Clear all session data. */
  clearSession() {
    this.activeUser = null
    this.storageDelete(SESSION_STORAGE_KEY)
  }

  /** The currently logged-in user, or `null`. */
  get currentUser() { return this.activeUser }

  /** `true` if a user is currently logged in. */
  get isLoggedIn()  { return this.activeUser !== null }
}


// ═══ GitHub Filesystem Layer ══════════════════════════════════════════════════

/** Low-level wrapper around the GitHub Contents API and raw.githubusercontent.com. */
class GitHubFilesystem {
  /**
   * @param {object}   config
   * @param {string}   config.owner
   * @param {string}   config.repo
   * @param {string[]} config.tokens                 Array of GitHub PATs with content/workflows read/write and metadata/commits read scopes.
   * @param {string}   [config.branch='main']        Branch used for GitHub API reads/writes.
   * @param {string[]} [config.rawBranches=['main']] Array of branches used for raw reads where the branch whose file has the most recent Last-Modified timestamp is used.
   */
  constructor({ owner, repo, tokens, branch = 'main', rawBranches = null }) {
    this.owner       = owner
    this.repo        = repo
    this.tokens      = tokens
    this.branch      = branch
    this.rawBranches = rawBranches ?? [branch]
    /** ETag cache for directory listings: path -> { etag, data } */
    this.etagCache = new Map()
  }

  // ══ Request Helpers ═══════════════════════════════════════════════════════════

  /**
   * Pick a random token from the pool.
   * @param   {Set<string>} [exclude] Tokens to skip (already tried and failed).
   * @returns {string|null}           A token, or `null` if all are excluded.
   */
  pickToken(exclude = new Set()) {
    const available = this.tokens.filter(token => !exclude.has(token))
    if (!available.length) { return null }
    return available[Math.floor(Math.random() * available.length)]
  }

  /**
   * Build Authorization headers for a specific token.
   * @param   {string} token
   * @returns {object}
   */
  headersForToken(token) {
    return {
      Authorization:          `Bearer ${token}`,
      Accept:                 'application/vnd.github+json',
      'Content-Type':         'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    }
  }

  /**
   * Execute a request using a random token from the pool.  
   * If the chosen token fails the call is retried with a different random token.
   * @param   {string}      url
   * @param   {RequestInit} [init]
   * @returns {Promise<Response>}
   */
  async apiRequest(url, init = { }) {
    const tried = new Set()
    for (let attempt = 0; attempt < this.tokens.length; attempt++) {
      const token = this.pickToken(tried)
      if (!token) {
        throw new DatabaseError('GitHub API request failed: all tokens in the pool are rate-limited or invalid', 429)
      }
      tried.add(token)

      const response = await fetch(url, { ...init, headers: { ...init.headers, ...this.headersForToken(token) } })

      if (this.isRateLimited(response) || response.status === 401) {
        if (tried.size < this.tokens.length) { continue }
        if (this.isRateLimited(response)) { this.throwRateLimitError(response) }
        await this.throwApiError(response, `Auth failed (${response.status})`)
      }

      return response
    }
    throw new DatabaseError('GitHub API request failed: all tokens in the pool are rate-limited or invalid', 429)
  }

  /**
   * Build the GitHub Contents API URL for a given file path.
   * @param   {string} filePath Repo-relative path (e.g. `data/posts/abc.json`).
   * @returns {string}
   */
  contentsUrl(filePath) {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
    return `${GITHUB_API_BASE}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodedPath}`
  }

  /**
   * Parse a failed GitHub API response and throw a DatabaseError.
   * @param   {Response} response
   * @param   {string}   fallbackMessage
   */
  async throwApiError(response, fallbackMessage) {
    const body = await response.json().catch(() => ({ }))
    throw new DatabaseError(body.message || fallbackMessage, response.status)
  }

  throwRateLimitError(response) {
    const resetTimestamp = response.headers.get('x-ratelimit-reset')
    const resetMessage   = resetTimestamp
      ? ` Resets at ${new Date(Number(resetTimestamp) * 1000).toISOString()}.`
      : ''
    throw new DatabaseError(`GitHub API rate limit exceeded.${resetMessage}`, 429)
  }

  isRateLimited(response) {
    return response.status === 429
      || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
  }

  // ══ File Read Operations ══════════════════════════════════════════════════════

  /**
   * Fetches the freshest branch from `rawBranches` for a given file path by comparing HTTP Last-Modified headers.  
   * Falls back to the first branch if no timestamps are available.
   * @param   {string} filePath
   * @returns {Promise<string>} The branch name with the most recently updated file.
   */
  async fetchFreshestRaw(filePath) {
    const results = await Promise.all(
      this.rawBranches.map(async branch => {
        const encodedBranch = branch.split('/').map(encodeURIComponent).join('/')
        const encodedPath   = filePath.split('/').map(encodeURIComponent).join('/')
        const encodedUrl = `${RAW_GITHUB_BASE}/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/${encodedBranch}/${encodedPath}`
        try {
          const response = await fetch(encodedUrl, { cache: 'reload' })
          if (!response.ok) { return { data: null, ms: -1 } }
          let data      = null
          try { data    = await response.json() } catch {}
          const lastMod = response.headers.get('last-modified')
          const ms = lastMod ? new Date(lastMod).getTime() : (data?.updatedAt ? new Date(data.updatedAt).getTime() : 0)
          return { data, ms }
        } catch {
          return { data: null, ms: -1 }
        }
      })
    )

    const best = results.reduce((a, b) => (b.ms > a.ms ? b : a))
    return best.data ?? null
  }

  /**
   * Read a JSON file. Dispatches to raw.githubusercontent.com or the GitHub API (ETag cached).  
   * When using raw mode, the branch with the most recently updated file is selected from `rawBranches`.
   * @param   {string}  filePath
   * @param   {boolean} [raw=false]
   * @returns {Promise<any|{content: string,sha: string}|null>} raw -> parsed JSON | api -> { content, sha } | null
   */
  async readFile(filePath, raw = false) {
    if (raw) {
      return this.fetchFreshestRaw(filePath)
    }
    const cached = this.etagCache.get(filePath)
    const response = await this.apiRequest(`${this.contentsUrl(filePath)}?ref=${encodeURIComponent(this.branch)}`, {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
    })
    if (response.status === 304) { return cached.data }
    if (response.status === 404)      { return null }
    if (this.isRateLimited(response)) { this.throwRateLimitError(response) }
    if (!response.ok)                 { await this.throwApiError(response, `Read failed (${response.status})`) }

    const data = await response.json()
    if (Array.isArray(data)) { return null }
    let parsedContent
    try { parsedContent = decodeFileContent(data.content) } catch { parsedContent = null }
    const result = { content: parsedContent, sha: data.sha }
    const etag = response.headers.get('etag')
    if (etag) {
      this.etagCache.set(filePath, { etag, data: result })
    }
    return result
  }

  /**
   * Returns the files array from the directory index, or `null` if the index file does not exist yet.
   * @param   {string} dirPath
   * @returns {Promise<string[]|null>}
   */
    async readIndex(dirPath) {
      const data = await this.readFile(`${dirPath}/_index.json`, true)
      return data
    }

  /**
   * Returns lightweight `{ name, type }` objects from the index, falling back to the API.
   * @param   {string} dirPath
   * @returns {Promise<object[]>}
   */
  async listDirectoryRaw(dirPath) {
    const index = await this.readIndex(dirPath)
    if (index === null) { return this.listDirectory(dirPath) }
    const sha = index.updatedAt || ''
    return (index.files ?? []).map(name => ({ name, type: 'file', sha }))
  }

  // ══ File Write / Delete Operations ════════════════════════════════════════════

  /**
   * Write (create or update) a JSON file in the repo.
   * @param   {string} filePath
   * @param   {object} content
   * @param   {string} commitMessage
   * @param   {string} [existingSha] Required when updating an existing file.
   * @returns {Promise<object>}      GitHub API response.
   */
  async writeFile(filePath, content, commitMessage, existingSha) {
    const body = {
      message: commitMessage,
      content: encodeFileContent(content),
      branch:  this.branch,
    }
    this.etagCache.delete(filePath)
    if (existingSha) body.sha = existingSha

    const response = await this.apiRequest(this.contentsUrl(filePath), {
      method: 'PUT',
      body:   JSON.stringify(body),
    })

    if (!response.ok) await this.throwApiError(response, `Write failed (${response.status})`)
    return response.json()
  }

  /**
   * Write a raw binary file (e.g. images, GIFs) to the repo without JSON-wrapping.
   * @param   {string} filePath
   * @param   {string} base64 Raw base64 content.
   * @param   {string} commitMessage
   * @param   {string} [existingSha]
   * @returns {Promise<object>}
   */
  async writeRawFile(filePath, base64, commitMessage, existingSha) {
    const body = {
      message: commitMessage,
      content: base64,
      branch:  this.branch,
    }
    this.etagCache.delete(filePath)
    if (existingSha) body.sha = existingSha

    const response = await this.apiRequest(this.contentsUrl(filePath), {
      method: 'PUT',
      body:   JSON.stringify(body),
    })

    if (!response.ok) await this.throwApiError(response, `Write failed (${response.status})`)
    return response.json()
  }

  /**
   * Delete a file from the repo.  
   * Returns `false` if the file did not exist, `true` on success.
   * @param   {string} filePath
   * @param   {string} commitMessage
   * @returns {Promise<boolean>}
   */
  async deleteFile(filePath, commitMessage, existingSha) {
      return retryOnConflict(async () => {
        let sha = existingSha
        if (!sha) {
          this.etagCache.delete(filePath)
          const existing = await this.readFile(filePath)
          if (!existing) { return false }
          sha = existing.sha
        }

        const response = await this.apiRequest(this.contentsUrl(filePath), {
          method: 'DELETE',
          body:   JSON.stringify({ message: commitMessage, sha, branch: this.branch }),
        })

        if (!response.ok) { await this.throwApiError(response, `Delete failed (${response.status})`) }
        return true
      })
    }
    
  /**
   * List the direct children of a directory.  
   * Uses ETags to avoid redundant API calls on unchanged directories.  
   * Returns an empty array if the directory does not exist.
   * @param   {string} dirPath
   * @returns {Promise<object[]>}
   */
  async listDirectory(dirPath) {
    const encodedUrl = `${this.contentsUrl(dirPath)}?ref=${encodeURIComponent(this.branch)}`
    const cached     = this.etagCache.get(dirPath)

    const response = await this.apiRequest(encodedUrl, {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : { },
    })

    if (response.status === 304) { return cached.data }
    if (response.status === 404) { return [] }
    if (this.isRateLimited(response)) { this.throwRateLimitError(response) }
    if (!response.ok) { await this.throwApiError(response, `List failed (${response.status})`) }

    const data = await response.json()
    if (!Array.isArray(data)) { return [] }

    const etag = response.headers.get('etag')
    if (etag) {
      this.etagCache.set(dirPath, { etag, data })
    }
    return data
  }

  // ══ Audit & Health ════════════════════════════════════════════════════════════

  /**
   * Fetch the git commit history for a given path.  
   * Every write through this library creates a commit you can inspect here.
   * @param   {string} [path='']
   * @param   {number} [limit=30]
   * @returns {Promise<Array<{ sha: string, message: string, author: string, date: string, url: string }>>}
   */
  async getCommitHistory(path = '', limit = 30) {
    const params = new URLSearchParams({ per_page: limit.toString(), sha: this.branch })
    if (path) { params.set('path', path) }

    const response = await this.apiRequest(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/commits?${params}`
    )

    if (!response.ok) {
      throw new DatabaseError(`Could not fetch commits (${response.status})`, response.status)
    }

    return (await response.json()).map(commit => ({
      sha:     commit.sha,
      message: commit.commit.message,
      author:  commit.commit.author.name,
      date:    commit.commit.author.date,
      url:     commit.html_url,
    }))
  }

  /**
   * Verify that the configured token has access to the repository.
   * @returns {Promise<object>} GitHub repo metadata.
   */
  async validateConnection() {
    const response = await this.apiRequest(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`
    )
    if (!response.ok) {
      throw new DatabaseError(
        `Cannot access ${this.owner}/${this.repo} — check your token and repo name`,
        response.status
      )
    }
    return response.json()
  }
}


// ═══ Collection ═══════════════════════════════════════════════════════════════

/**
 * A named collection of JSON records, each stored at `<collectionPath>/<id>.json`.  
 * Obtain an instance via `db.collection('name')`.
 */
class Collection {
  /**
   * @param {GitHubFilesystem}        filesystem
   * @param {string}                  collectionPath Full repo path (e.g. `data/posts`).
   * @param {string}                  collectionName Leaf collection name, used in permission lookups.
   * @param {SessionState}            session
   * @param {function(): object|null} getPermissions Returns the current permissions map.
   * @param {boolean}                 [useRaw=true]
   */
  constructor(filesystem, collectionPath, collectionName, session, getPermissions, useRaw = true) {
    this.filesystem     = filesystem
    this.collectionPath = collectionPath
    this.name           = collectionName
    this.session        = session
    this.getPermissions = typeof getPermissions === 'function' ? getPermissions : () => getPermissions
    this.useRaw         = useRaw
  }

  // ══ Internal Helpers ══════════════════════════════════════════════════════════

  /** Returns the full file path for a given record ID. */
  filePathForId(id) {
    assertValidId(id)
    return `${this.collectionPath}/${id}.json`
  }

  /**
   * Enforce the required permission for this collection.  
   * Pass a `recordId` to also consider per-record permission overrides.
   * @param {'read'|'write'} operation
   * @param {string|null}    [recordId]
   */
  checkPermission(operation, recordId = null) {
    const perms = this.getPermissions()
    const rule  = (recordId ? perms?.[`${this.name}.${recordId}`] : null) ?? perms?.[this.name]
    enforcePermission(`Collection "${this.name}"${recordId ? ` record "${recordId}"` : ''}`, operation, rule, this.session)
  }

  /**
   * Attach `createdAt` / `updatedAt` timestamps to `data`.  
   * Preserves the original `createdAt` from `existingRecord` when updating.
   * @param   {object}      data
   * @param   {object|null} [existingRecord]
   * @returns {object}
   */
  withTimestamps(data, existingRecord = null) {
    const now = new Date().toISOString()
    return { ...data, createdAt: existingRecord?.createdAt ?? now, updatedAt: now }
  }

  /**
   * Read a single record file, routing to raw or API depending on `this.useRaw`.
   * @param   {string} filePath
   * @returns {Promise<object|null>}
   */
  async readRecord(filePath) {
    if (this.useRaw) { return this.filesystem.readFile(filePath, true) }
    const file = await this.filesystem.readFile(filePath)
    return file ? file.content : null
  }

  /**
   * List directory entries, routing to raw or API depending on `this.useRaw`.
   * @param   {string} dirPath
   * @returns {Promise<object[]>}
   */
  listEntries(dirPath) {
    return this.useRaw
      ? this.filesystem.listDirectoryRaw(dirPath)
      : this.filesystem.listDirectory(dirPath)
  }

  // ══ CRUD ══════════════════════════════════════════════════════════════════════

  /**
   * Create a new record.  
   * `id`, `createdAt`, and `updatedAt` are added automatically.  
   * Supply `data.id` to use a specific ID; otherwise one is generated.
   * @param   {object} data
   * @returns {Promise<object>}
   */
  async add(data) {
    this.checkPermission('write')
    const id = data.id ?? generateId()
    assertValidId(id)
    const { id: stripped, ...rest } = sanitizeKeys(data)
    const record = { id, ...this.withTimestamps(rest) }
    await this.filesystem.writeFile(this.filePathForId(id), record, `${this.name}: add ${id}`)
    return record
  }

  /**
   * Fetch a single record by ID. Returns `null` if not found.
   * @param   {string} id
   * @returns {Promise<object|null>}
   */
  async get(id) {
    this.checkPermission('read', id)
    return this.readRecord(this.filePathForId(id))
  }

  /**
   * Fetch all records in the collection, with optional pagination.
   * @param   {{ limit?: number, offset?: number }} [options]
   * @returns {Promise<object[]>}
   */
  async list({ limit, offset = 0 } = { }) {
    this.checkPermission('read')
    let entries = (await this.listEntries(this.collectionPath))
      .filter(entry => entry.type === 'file' && !entry.name.startsWith('_') && entry.name.endsWith('.json'))

    const records = (await runConcurrently(entries, entry =>
      this.readRecord(`${this.collectionPath}/${entry.name}`)
    )).filter(Boolean)

    let result = records
    if (offset > 0)                           { result = result.slice(offset) }
    if (Number.isInteger(limit) && limit > 0) { result = result.slice(0, limit) }
    return result
  }

  /**
   * Partially update a record — only the provided fields are changed.  
   * `id` and `createdAt` in `changes` are ignored.
   * @param   {string} id
   * @param   {object} changes
   * @returns {Promise<object>}
   */
  async update(id, changes) {
    this.checkPermission('write', id)
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new DatabaseError('Changes must be a plain object', 400)
    }
    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.filePathForId(id))
      if (!file) { throw new DatabaseError(`Record not found: ${id}`, 404) }
      const { id: stripped, createdAt: stripped2, ...safeChanges } = sanitizeKeys(changes)
      const hasChanges = Object.keys(safeChanges).some(
        key => JSON.stringify(file.content[key]) !== JSON.stringify(safeChanges[key])
      )

      if (!hasChanges) {
        return { ...file.content, id }
      }

      const updated = { ...file.content, ...safeChanges, id, updatedAt: new Date().toISOString() }
      await this.filesystem.writeFile(this.filePathForId(id), updated, `${this.name}: update ${id}`, file.sha)
      return updated
    })
  }

  /**
   * Fully replace a record — all fields are overwritten.  
   * `id` and `createdAt` are preserved regardless of what `data` contains.
   * @param   {string} id
   * @param   {object} data
   * @returns {Promise<object>}
   */
  async replace(id, data) {
    this.checkPermission('write', id)
    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.filePathForId(id))
      if (!file) { throw new DatabaseError(`Record not found: ${id}`, 404) }
      const record = { id, ...this.withTimestamps(sanitizeKeys(data), file.content) }
      await this.filesystem.writeFile(this.filePathForId(id), record, `${this.name}: replace ${id}`, file.sha)
      return record
    })
  }

  /**
   * Delete a record by ID.
   * @param   {string} id
   * @returns {Promise<{ id: string, deleted: boolean }>}
   */
  async remove(id) {
    this.checkPermission('write', id)
    const deleted = await this.filesystem.deleteFile(this.filePathForId(id), `${this.name}: remove ${id}`)
    return { id, deleted }
  }

  /**
   * Update the record if it exists; create it with the given `id` if it does not.
   * @param   {string} id
   * @param   {object} data
   * @returns {Promise<object>}
   */
  async upsert(id, data) {
    this.checkPermission('write', id)
    return retryOnConflict(async () => {
      const file     = await this.filesystem.readFile(this.filePathForId(id))
      const safeData = sanitizeKeys(data)

      if (file) {
        const { id: stripped, createdAt, ...safeChanges } = safeData
        const hasChanges = Object.keys(safeChanges).some(
          key => JSON.stringify(file.content[key]) !== JSON.stringify(safeChanges[key])
        )

        if (!hasChanges) {
          return { ...file.content, id }
        }
        const updated = { ...file.content, ...safeChanges, id, updatedAt: new Date().toISOString() }
        await this.filesystem.writeFile(this.filePathForId(id), updated, `${this.name}: upsert ${id}`, file.sha)
        return updated
      }

      const { id: stripped, ...rest } = safeData
      const record = { id, ...this.withTimestamps(rest) }
      await this.filesystem.writeFile(this.filePathForId(id), record, `${this.name}: upsert (create) ${id}`)
      return record
    })
  }

  // ══ Query ═════════════════════════════════════════════════════════════════════

  /**
   * Filter all records using an in-memory predicate function, with optional sort / pagination.  
   * Exits early once `limit` is satisfied (no sort).
   * @param   {function(object): boolean}                            filterFn
   * @param   {{ sort?: function, limit?: number, offset?: number }} [options]
   * @returns {Promise<object[]>}
   */
  async query(filterFn, { sort, limit, offset = 0 } = { }) {
    this.checkPermission('read')

    let entries = (await this.listEntries(this.collectionPath))
      .filter(entry => entry.type === 'file' && !entry.name.startsWith('_') && entry.name.endsWith('.json'))

    if (sort) {
      const records = (await runConcurrently(entries, entry =>
        this.readRecord(`${this.collectionPath}/${entry.name}`)
      )).filter(Boolean)

      let results = records.filter(filterFn).sort(sort)
      if (offset > 0)                           { results = results.slice(offset) }
      if (Number.isInteger(limit) && limit > 0) { results = results.slice(0, limit) }
      return results
    }

    const results = []
    let skipped   = 0

    for (let index = 0; index < entries.length; index += QUERY_BATCH_SIZE) {
      const batchEntries = entries.slice(index, index + QUERY_BATCH_SIZE)
      const batchRecords = (await runConcurrently(batchEntries, entry =>
        this.readRecord(`${this.collectionPath}/${entry.name}`)
      )).filter(Boolean)

      for (const record of batchRecords) {
        if (!filterFn(record)) { continue }
        if (skipped < offset)  { skipped++; continue }
        results.push(record)
        if (Number.isInteger(limit) && results.length >= limit) { return results }
      }
    }

    return results
  }

  /**
   * Count records. If `filterFn` is provided, only matching records are counted.
   * @param   {function(object): boolean} [filterFn]
   * @returns {Promise<number>}
   */
  async count(filterFn = null) {
    this.checkPermission('read')
    if (!filterFn) {
    return (await this.listEntries(this.collectionPath))
      .filter(entry => entry.type === 'file' && !entry.name.startsWith('_') && entry.name.endsWith('.json')).length
    }
    return (await this.list()).filter(filterFn).length
  }

  /**
   * Check whether a record with the given ID exists.
   * @param   {string} id
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    this.checkPermission('read', id)
    if (this.useRaw) {
      const entries = await this.listEntries(this.collectionPath)
      return entries.some(entry => entry.name === `${id}.json`)
    }
    const file = await this.filesystem.readFile(this.filePathForId(id))
    return !!file
  }

  // ══ Bulk Operations ═══════════════════════════════════════════════════════════

  /**
   * Add multiple records in parallel.
   * @param   {object[]} items
   * @returns {Promise<object[]>}
   */
  async bulkAdd(items) {
    this.checkPermission('write')
    return runConcurrently(items, async item => {
      return retryOnConflict(async () => {
        const id = item.id ?? generateId()
        assertValidId(id)
        const { id: stripped, ...rest } = sanitizeKeys(item)
        const record = { id, ...this.withTimestamps(rest) }
        await this.filesystem.writeFile(this.filePathForId(id), record, `${this.name}: add ${id}`)
        return record
      })
    })
  }

  /**
   * Delete multiple records by ID in parallel.
   * @param   {string[]} ids
   * @returns {Promise<Array<{ id: string, deleted: boolean }>>}
   */
  async bulkRemove(ids) {
    this.checkPermission('write')
    return runConcurrently(ids, async id => {
      if (id.startsWith('_')) {
        throw new DatabaseError(`Cannot delete internal file: ${id}.json`, 403)
      }
      const deleted = await this.filesystem.deleteFile(this.filePathForId(id), `${this.name}: remove ${id}`)
      return { id, deleted }
    })
  }

  /**
   * Delete every record in the collection.
   * @returns {Promise<Array<{ id: string, deleted: boolean }>>}
   */
  async clear() {
    this.checkPermission('write')
    const ids = (await this.listEntries(this.collectionPath))
      .filter(entry => entry.type === 'file' && !entry.name.startsWith('_') && entry.name.endsWith('.json'))
      .map(entry => entry.name.replace(/\.json$/, ''))

    return runConcurrently(ids, async id => {
      const deleted = await this.filesystem.deleteFile(this.filePathForId(id), `${this.name}: remove ${id}`)
      return { id, deleted }
    })
  }

  // ══ File Uploads ══════════════════════════════════════════════════════════════

  /**
   * Upload a binary file into this collection's `_uploads` folder.
   * @param   {File|Blob} fileData
   * @param   {string}    [fileName] Logical name / tag for this upload (e.g. 'avatar').
   * @returns {Promise<{ path: string, safeName: string, originalName: string, tag: string }>}
   */
  async uploadFile(fileData, fileName = '') { // didn't wanna use uploadUpload()
    this.checkPermission('write')
    const base64     = await fileToBase64(fileData)
    const name       = fileName || fileData.name || 'upload'
    const extension  = (fileData.name ?? '').match(/\.[^.]+$/)?.[0] ?? ''
    const safeName   = `${Date.now()}-${name.replace(/\s+/g, '_')}${extension}`
    const uploadPath = `${this.collectionPath}/_uploads/${safeName}`

    await this.filesystem.writeRawFile(uploadPath, base64, `${this.name}: upload ${safeName}`)

    return { path: uploadPath, safeName, originalName: fileData.name ?? name, tag: name }
  }

  /**
   * Retrieve raw.githubusercontent.com URL for uploaded files matching `name`.
   * - Exact match on `safeName` -> returns the URL string directly.
   * - Partial match (e.g. 'photo') -> returns an array of `{ safeName, url }`.
   * @param   {string} name
   * @returns {Promise<string|Array<{safeName: string, url: string}>>}
   */
  async getUpload(name) {
    this.checkPermission('read')
    const indexPath = `${this.collectionPath}/_uploads/_index.json`
    const index     = await this.filesystem.readFile(indexPath, this.useRaw)
    if (!index) { return [] }

    const uploads = (this.useRaw ? index : index.content).files ?? []
    const rawBase = `${RAW_GITHUB_BASE}/${this.filesystem.owner}/${this.filesystem.repo}/${this.filesystem.branch}`
    const toUrl   = safeName => `${rawBase}/${this.collectionPath}/_uploads/${safeName}`

    const exact = uploads.find(upload => upload === name)
    if (exact) { return toUrl(exact) }

    const matches = uploads.filter(upload => {
      const base = upload.replace(/^\d+-/, '')
      return upload.includes(name) || base.includes(name)
    })
    return matches.map(safeName => ({ safeName, url: toUrl(safeName) }))
  }

  /**
   * List all uploaded files in this collection.
   * @returns {Promise<string[]>}
   */
  async listUploads() {
    this.checkPermission('read')
    const indexPath = `${this.collectionPath}/_uploads/_index.json`
    const uploads   = await this.filesystem.readFile(indexPath, this.useRaw)
    return uploads ? (this.useRaw ? uploads.files : uploads.content.files) : []
  }

  /**
   * Delete an uploaded file by its safeName from this collection's `_uploads` folder.
   * @param   {string} safeName
   * @returns {Promise<{ safeName: string, deleted: boolean }>} 
   */
  async deleteUpload(safeName) {
    this.checkPermission('write')
    if (typeof safeName !== 'string' || !safeName) {
      throw new DatabaseError('File name is required', 400)
    }

    const uploadPath = `${this.collectionPath}/_uploads/${safeName}`
    const deleted = await this.filesystem.deleteFile(uploadPath, `${this.name}: delete upload ${safeName}`)
    if (!deleted) {
      throw new DatabaseError(`Upload not found: ${safeName}`, 404)
    }
    return { safeName, deleted }
  }

  // ══ Polling ═══════════════════════════════════════════════════════════════════

  /**
   * Poll the collection for changes and invoke `callback` with a diff on each change.
   *
   * @param   {function({ records: object[], added: object[], changed: object[], removed: string[] }): void} callback
   * @param   {number}                                                                                       [intervalMs=5000] Polling interval in milliseconds.
   * @param   {function(Error): void}                                                                        [onError]         Called on fetch errors (polling continues).
   * @returns {function(): void}                                                                                               Call to stop polling.
   *
   * @example
   * const stop = db.collection('messages').subscribe(({ records, added, removed }) => {
   *   console.log('all:', records)
   *   console.log('new:', added)
   *   console.log('gone:', removed)
   * })
   * stop()
   */
  subscribe(callback, intervalMs = 5000, onError = null) {
    return subscribeToDirectory({
      listEntries: ()    => this.listEntries(this.collectionPath),
      fetchRecord: id    => this.get(id),
      entryToId:   entry =>
        entry.type === 'file' && !entry.name.startsWith('_')
          ? entry.name.replace(/\.json$/, '')
          : null,
      callback,
      intervalMs,
      onError,
    })
  }
}


// ═══ Key-Value Store ══════════════════════════════════════════════════════════

/**
 * A simple key-value store backed by files at `<basePath>/_kv/<key>.json`.  
 * Access via `db.kv`.
 */
class KeyValueStore {
  /**
   * @param {GitHubFilesystem}        filesystem
   * @param {string}                  basePath
   * @param {boolean}                 [useRaw=true]
   * @param {SessionState|null}       [session=null]
   * @param {function(): object|null} [getPermissions=null]
   */
  constructor(filesystem, basePath, useRaw = true, session = null, getPermissions = null) {
    this.filesystem     = filesystem
    this.useRaw         = useRaw
    this.kvPath         = `${basePath}/_kv`
    this.session        = session
    this.getPermissions = getPermissions
  }

  // ══ Internal Helpers ══════════════════════════════════════════════════════════

  filePathForKey(key) {
    assertValidId(key)
    return `${this.kvPath}/${key}.json`
  }

  checkPermission(operation, key = null) {
    if (!this.session || !this.getPermissions) { return }
    const perms = this.getPermissions()
    const rule  = (key ? perms?.[`_kv.${key}`] : null) ?? perms?.['_kv']
    enforcePermission(`KV${key ? ` key "${key}"` : ' store'}`, operation, rule, this.session)
  }

  /**
   * List directory entries, routing to raw or API based on `this.useRaw`.
   * @param   {string} dirPath
   * @returns {Promise<object[]>}
   */
  listDirEntries(dirPath) {
    return this.useRaw
      ? this.filesystem.listDirectoryRaw(dirPath)
      : this.filesystem.listDirectory(dirPath)
  }

  /**
   * Read a KV file, routing to raw or API based on `this.useRaw`.  
   * Returns the stored value (not the wrapper object), or `null` if not found.
   * @param   {string} key
   * @returns {Promise<unknown|null>}
   */
  async readValue(key) {
    const filePath = this.filePathForKey(key)
    if (this.useRaw) {
      const file = await this.filesystem.readFile(filePath, true)
      return file ? file.value : null
    }
    const file = await this.filesystem.readFile(filePath)
    return file ? file.content.value : null
  }

  // ══ Public API ════════════════════════════════════════════════════════════════

  /**
   * Store a value under `key`.
   * @param   {string}  key
   * @param   {unknown} value
   * @returns {Promise<unknown>} The stored value.
   */
  async set(key, value) {
    this.checkPermission('write', key)
    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.filePathForKey(key))
      await this.filesystem.writeFile(
        this.filePathForKey(key),
        { key, value, updatedAt: new Date().toISOString() },
        `kv: set ${key}`,
        file?.sha
      )
      return value
    })
  }

  /**
   * Retrieve the value stored under `key`, or `null` if not found.
   * @param   {string} key
   * @returns {Promise<unknown|null>}
   */
  async get(key) {
    this.checkPermission('read', key)
    return this.readValue(key)
  }

  /**
   * Delete the entry for `key`.
   * @param   {string} key
   * @returns {Promise<{ key: string, deleted: boolean }>}
   */
  async delete(key) {
    this.checkPermission('write', key)
    const deleted = await this.filesystem.deleteFile(this.filePathForKey(key), `kv: delete ${key}`)
    return { key, deleted }
  }

  /**
   * Check whether a key exists.
   * @param   {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    this.checkPermission('read', key)
    return (await this.readValue(key)) !== null
  }

  /**
   * Atomically increment a numeric counter.  
   * Creates the key with value `by` if it does not yet exist.
   * @param   {string} key
   * @param   {number} [by=1]
   * @returns {Promise<number>} The new value.
   */
  async increment(key, by = 1) {
    this.checkPermission('write', key)
    return retryOnConflict(async () => {
      const file    = await this.filesystem.readFile(this.filePathForKey(key))
      const current = file ? Number(file.content.value) : 0
      if (!Number.isFinite(current)) {
        throw new DatabaseError(`Key "${key}" is not a finite number`, 400)
      }
      const newValue = current + by
      await this.filesystem.writeFile(
        this.filePathForKey(key),
        { key, value: newValue, updatedAt: new Date().toISOString() },
        `kv: increment ${key}`,
        file?.sha
      )
      return newValue
    })
  }

  /**
   * Get multiple keys in a single call.  
   * Accepts spread args — `getMany('a', 'b')` — or a single array — `getMany(['a', 'b'])`.
   * @param   {...string|string[]} args
   * @returns {Promise<{ [key: string]: unknown }>}
   */
  async getMany(...args) {
    const keys = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
    this.checkPermission('read')
    const pairs = await runConcurrently(keys, async key => [key, await this.get(key)])
    return Object.fromEntries(pairs)
  }

  /**
   * Set multiple keys at once (parallel writes).
   * @param   {{ [key: string]: unknown }} entries
   * @returns {Promise<unknown[]>} Array of stored values in insertion order.
   */
  async setMany(entries) {
    this.checkPermission('write')
    return runConcurrently(Object.entries(entries), ([key, value]) => this.set(key, value))
  }

  /**
   * List all user-facing KV entries as a `{ key -> value }` map.  
   * Internal auth-system keys are excluded.
   * @returns {Promise<{ [key: string]: unknown }>}
   */
  async getAll() {
    this.checkPermission('read')
    const dirEntries = await this.listDirEntries(this.kvPath)
    const jsonFiles  = dirEntries.filter(entry =>
      entry.name.endsWith('.json') && !entry.name.startsWith('_')
    )

    const pairs = await runConcurrently(jsonFiles, async entry => {
      const key = entry.name.replace(/\.json$/, '')
      try {
        const value = await this.get(key)
        return [key, value]
      } catch (error) {
        if (error.httpStatus === 401 || error.httpStatus === 403) return null
        throw error
      }
    })

    return Object.fromEntries(pairs.filter(Boolean))
  }

  // ══ Polling ═══════════════════════════════════════════════════════════════════

  /**
   * Poll the key-value store for changes and invoke `callback` with a diff on each change.
   *
   * @param   {function({ entries: object, added: object, changed: object, removed: string[] }): void} callback
   * @param   {number}                                                                                 [intervalMs=5000] Polling interval in milliseconds.
   * @param   {function(Error): void}                                                                  [onError]         Called on fetch errors (polling continues).
   * @returns {function(): void}                                                                                         Call to stop polling.
   *
   * @example
   * const stop = db.kv.subscribe(({ entries, added, removed }) => {
   *   console.log('all:', entries)
   * })
   * stop()
   */
  subscribe(callback, intervalMs = 5000, onError = null) {
    const pairsToMap = array => Object.fromEntries(array.map(([key, value]) => [key, value]))

    return subscribeToDirectory({
      listEntries: () => this.listDirEntries(this.kvPath),
      fetchRecord: async key => {
        const value = await this.get(key)
        return value != null ? [key, value] : null
      },
      entryToId: entry => {
        if (!entry.name.endsWith('.json')) { return null }
        return entry.name.startsWith('_') ? null : entry.name.replace(/\.json$/, '')
      },
      callback: ({ records, added, changed, removed }) => callback({
        entries: pairsToMap(records),
        added:   pairsToMap(added),
        changed: pairsToMap(changed),
        removed,
      }),
      intervalMs,
      onError,
    })
  }
}


// ═══ Auth Manager ═════════════════════════════════════════════════════════════

/**
 * Username / password authentication backed by JSON files in the repo.  
 * Passwords are stored as PBKDF2-SHA256 hashes (200 000 iterations + per-user salt + global pepper).  
 * Access via `db.auth`.
 */
class AuthManager {
  /**
   * @param {GitHubFilesystem} filesystem
   * @param {SessionState}     session
   * @param {string}           [basePath='data']
   * @param {boolean}          [useRaw=true]
   * @param {string}           [pepper=PASSWORD_PEPPER] Optional custom pepper for hashing.
   */
  constructor(filesystem, session, basePath = 'data', useRaw = true, pepper = PASSWORD_PEPPER) {
    this.filesystem = filesystem
    this.session    = session
    this.useRaw     = useRaw
    this.pepper     = pepper
    this.kvPath     = `${basePath}/_kv`
    this.authPath   = `${basePath}/_auth`
  }

  // ══ Internal Helpers ══════════════════════════════════════════════════════════

  /** Full file path for a user record (username is lowercased). */
  userFilePath(username) {
    return `${this.authPath}/${username.toLowerCase()}.json`
  }

  /**
   * List directory entries, routing to raw or API based on `this.useRaw`.
   * @param   {string} dirPath
   * @returns {Promise<object[]>}
   */
  listDirEntries(dirPath) {
    return this.useRaw
      ? this.filesystem.listDirectoryRaw(dirPath)
      : this.filesystem.listDirectory(dirPath)
  }

  /**
   * Fetch a user's parsed record for read-only operations.
   * @param   {string} username
   * @returns {Promise<object|null>}
   */
  async fetchUserRaw(username) {
    return this.filesystem.readFile(this.userFilePath(username), true)
  }

  /**
   * Fetch a user record with its SHA for write operations.
   * @param   {string} username
   * @returns {Promise<{ user: object, sha: string }|null>}
   */
  async fetchUserWithSha(username) {
    const file = await this.filesystem.readFile(this.userFilePath(username))
    return file ? { user: file.content, sha: file.sha } : null
  }

  /** Fetch every user record from the _auth directory. */
  async fetchAllUsers() {
    const entries = (await this.listDirEntries(this.authPath))
      .filter(entry => !entry.name.startsWith('_'))

    const records = await runConcurrently(entries, async entry => {
      const username = entry.name.replace(/\.json$/, '')
      if (this.useRaw) { return this.fetchUserRaw(username) }
      const result = await this.fetchUserWithSha(username)
      return result ? result.user : null
    })

    return records.filter(Boolean)
  }

  /**
   * Strip sensitive fields from a user record for safe public exposure.
   * @param   {object} user
   * @returns {{ id: string, username: string, roles: string[], createdAt: string }}
   */
  toPublicUser({ id, username, roles, createdAt }) {
    return { id, username, roles, createdAt }
  }

  /**
   * Verify that the current session user is either the target user or an admin.
   * @param {string} username
   * @param {string} operation
   */
  assertOwnershipOrAdmin(username, operation) {
    const isSelf = this.session.currentUser?.username?.toLowerCase() === username.toLowerCase()
    const isAdmin = this.session.currentUser?.roles?.includes('admin')
    if (!isSelf && !isAdmin) {
      throw new DatabaseError(`Only the account owner or an admin can ${operation}`, 403)
    }
  }

  // ══ Public API ════════════════════════════════════════════════════════════════

  /** The currently logged-in user, or `null`. */
  get currentUser() { return this.session.currentUser }

  /** `true` if a user is currently logged in. */
  get isLoggedIn()  { return this.session.isLoggedIn }

  /**
   * Validate the active session against live repository data.  
   * If the user's roles have changed since login, the session is refreshed automatically.
   * @returns {Promise<boolean>}
   */
  async verifySession() {
    if (!this.session.isLoggedIn) { return false }

    const user = this.useRaw
      ? await this.fetchUserRaw(this.session.currentUser.username)
      : (await this.fetchUserWithSha(this.session.currentUser.username))?.user

    if (!user) {
      this.logout()
      return false
    }

    const storedRoles  = [...(user.roles ?? [])].sort().join(',')
    const sessionRoles = [...(this.session.currentUser.roles ?? [])].sort().join(',')
    if (storedRoles !== sessionRoles) { this.session.persistUser(this.toPublicUser(user)) }

    return true
  }

  /**
   * Create a new user account.  
   * The first registered account is automatically an admin.
   * @param   {string} username 2–32 characters: letters, numbers, hyphens, underscores.
   * @param   {string} password Minimum 8 characters.
   * @returns {Promise<{ id: string, username: string, roles: string[], createdAt: string }>}
   */
  async register(username, password) {
    if (!username || !password) {
      throw new DatabaseError('Username and password are required', 400)
    }
    if (!/^[a-zA-Z0-9_\-]{2,32}$/.test(username)) {
      throw new DatabaseError(
        'Username must be 2–32 characters: letters, numbers, hyphens, and underscores only', 400
      )
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new DatabaseError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
    }

    const adminSentinelPath = `${this.kvPath}/_admin-exists.json`
    const adminSentinel     = await this.filesystem.readFile(adminSentinelPath, this.useRaw)
    const isFirstUser       = !adminSentinel

    const user = {
      id:           generateId(),
      username,
      passwordHash: await hashSecret(password, username.toLowerCase(), this.pepper),
      createdAt:    new Date().toISOString(),
      roles:        isFirstUser ? ['admin'] : ['user'],
    }

    await retryOnConflict(async () => {
      const existing = this.useRaw
        ? await this.fetchUserRaw(username)
        : (await this.fetchUserWithSha(username))?.user
      if (existing) {
        throw new DatabaseError('That username is already taken', 409)
      }

      try {
        await this.filesystem.writeFile(this.userFilePath(username), user, `auth: register ${username}`)
      } catch (writeError) {
        if (writeError.httpStatus === 422 || writeError.httpStatus === 409) {
          throw new DatabaseError('That username is already taken', 409)
        }
        throw writeError
      }
    })

    if (isFirstUser) {
      try {
        await this.filesystem.writeFile(
          adminSentinelPath,
          { createdAt: user.createdAt },
          'auth: mark first admin'
        )
      } catch (error) {
        if (error.httpStatus !== 409) throw error
      }
    }

    const publicUser = this.toPublicUser(user)
    this.session.persistUser(publicUser)
    return publicUser
  }

  /**
   * Verify credentials and start a session.
   * @param   {string} username
   * @param   {string} password
   * @returns {Promise<{ id: string, username: string, roles: string[], createdAt: string }>}
   */
  async login(username, password) {
    if (!username || !password) {
      throw new DatabaseError('Username and password are required', 400)
    }

    const user = this.useRaw
      ? await this.fetchUserRaw(username)
      : (await this.fetchUserWithSha(username))?.user
    const isValidPassword = user ? await verifySecret(password, user.passwordHash, username.toLowerCase(), this.pepper) : false

    if (!user || !isValidPassword) {
      throw new DatabaseError('Invalid username or password', 401)
    }

    const publicUser = this.toPublicUser(user)
    this.session.persistUser(publicUser)
    return publicUser
  }

  /** End the current session. */
  logout() { this.session.clearSession() }

  /**
   * Change the password for an account.  
   * Admins can bypass the old password check.
   * @param   {string} username
   * @param   {string} currentPassword
   * @param   {string} newPassword
   * @returns {Promise<{ ok: true }>}
   */
  async changePassword(username, currentPassword, newPassword) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new DatabaseError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400)
    }

    const isAdmin = this.session.currentUser?.roles?.includes('admin')
    if (!isAdmin) {
      this.assertOwnershipOrAdmin(username, 'change password')
    }

    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.userFilePath(username))
      if (!file) {
        throw new DatabaseError('User not found', 404)
      }

      if (!isAdmin) {
        const isValidPassword = await verifySecret(currentPassword, file.content.passwordHash, username.toLowerCase(), this.pepper)
        if (!isValidPassword) {
          throw new DatabaseError('Incorrect current password', 401)
        }
      }

      const updated = {
        ...file.content,
        passwordHash: await hashSecret(newPassword, username.toLowerCase(), this.pepper),
        updatedAt:    new Date().toISOString(),
      }
      await this.filesystem.writeFile(
        this.userFilePath(username),
        updated,
        `auth: change password ${username}`,
        file.sha
      )
      return { ok: true }
    })
  }

  /**
   * Permanently delete an account.  
   * Admins can bypass the password check.  
   * If the currently logged-in user deletes their own account they are automatically logged out.
   * @param   {string} username
   * @param   {string} password
   * @returns {Promise<{ deleted: true }>}
   */
  async deleteAccount(username, password) {
    const isAdmin = this.session.currentUser?.roles?.includes('admin')
    if (!isAdmin) {
      this.assertOwnershipOrAdmin(username, 'delete account')
    }

    let passwordVerified = false

    await retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.userFilePath(username))
      if (!file) {
        throw new DatabaseError('User not found', 404)
      }

      if (!isAdmin && !passwordVerified) {
        const isValidPassword = await verifySecret(password, file.content.passwordHash, username.toLowerCase(), this.pepper)
        if (!isValidPassword) {
          throw new DatabaseError('Incorrect password', 401)
        }
        passwordVerified = true
      }

      await this.filesystem.deleteFile(this.userFilePath(username), `auth: delete account ${username}`, file.sha)
    })

    if (this.session.currentUser?.username?.toLowerCase() === username.toLowerCase()) this.session.clearSession()
    return { deleted: true }
  }

  /**
   * List all registered users — no password hashes included.
   * @returns {Promise<Array<{ id: string, username: string, roles: string[], createdAt: string }>>}
   */
  async listUsers() {
    return (await this.fetchAllUsers()).map(user => this.toPublicUser(user))
  }

  /**
   * Assign one or more roles to a user. Admin-only.
   * @param   {string}   username
   * @param   {string[]} roles E.g. `['editor', 'moderator']`.
   * @returns {Promise<{ id: string, username: string, roles: string[], createdAt: string }>}
   */
  async setRoles(username, roles) {
    if (!this.session.isLoggedIn || !this.session.currentUser?.roles?.includes('admin')) {
      throw new DatabaseError('Only admins can assign roles', 403)
    }
    if (!roles.length || roles.some(role => typeof role !== 'string' || !role)) {
      throw new DatabaseError('Roles must be one or more non-empty strings', 400)
    }
    if (roles.includes('public') || roles.includes('auth')) {
      throw new DatabaseError('"public" and "auth" are reserved and cannot be used as roles', 400)
    }

    return retryOnConflict(async () => {
      const file = await this.filesystem.readFile(this.userFilePath(username))
      if (!file) {
        throw new DatabaseError('User not found', 404)
      }

      const updated = { ...file.content, roles, updatedAt: new Date().toISOString() }
      await this.filesystem.writeFile(
        this.userFilePath(username),
        updated,
        `auth: set roles ${username} -> ${roles.join(', ')}`,
        file.sha
      )

      const publicUser = this.toPublicUser(updated)
      if (this.session.currentUser?.username?.toLowerCase() === username.toLowerCase()) { this.session.persistUser(publicUser) }
      return publicUser
    })
  }
}


// ═══ GitHubDB ═════════════════════════════════════════════════════════════════

/**
 * The main entry point.  
 * Use the static factory method to create an instance:  
 * `GitHubDB.instance()`
 *
 * @example
 * const db = await GitHubDB.instance({ owner: 'you', repo: 'my-db', tokens: ['ghdb_enc_...'] })
 */
class GitHubDB {
  /**
   * @param {GitHubFilesystem} filesystem
   * @param {object}           [options]
   * @param {string}           [options.basePath='data']
   * @param {boolean}          [options.useRaw=true]
   * @param {string}           [options.pepper=PASSWORD_PEPPER] Optional custom password pepper.
   */
  constructor(filesystem, { basePath = 'data', useRaw = true, pepper = PASSWORD_PEPPER } = { }) {
    this.filesystem     = filesystem
    this.basePath       = basePath.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
    this.useRaw         = useRaw
    this.pepper         = pepper
    this.session        = new SessionState()
    this.permissionsMap = null

    /** @type {KeyValueStore} */
    this.kv   = new KeyValueStore(filesystem, this.basePath, useRaw, this.session, () => this.permissionsMap)
    /** @type {AuthManager} */
    this.auth = new AuthManager(filesystem, this.session, this.basePath, useRaw, pepper)
  }

  // ══ ORIGIN CHECKING ═══════════════════════════════════════════════════════════

  /** 
   * Check if the current origin is allowed by comparing to the `_origins` key value.  
   * Called automatically by `GitHubDB.instance()`.  
   * Auto-registers the current origin on first run.
   * @throws {DatabaseError} If the current origin is not in `_origins` and cannot be auto-registered.
   */
  async checkOrigins() {
    if (typeof window === 'undefined') { return }

    const originsPath = `${this.basePath}/_kv/_origins.json`
    const file        = await this.filesystem.readFile(originsPath, this.useRaw)

    const resource = await fetch(window.location.href, { method: 'HEAD' })
    const origin   = `${window.location.origin} | ${resource.headers.get('Server') || '?'} | ${resource.headers.get('ETag') || '?'}`

    if (!file) {
      await this.filesystem.writeFile(
        originsPath,
        { key: '_origins', value: [origin], updatedAt: new Date().toISOString() },
        'kv: init _origins'
      )
      return
    }

    const patterns = file.content?.value ?? file.value ?? []

    const allowed = patterns.some(pattern => {
      const regex = new RegExp(
        '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
      )
      return regex.test(origin)
    })

    if (!allowed) throw new DatabaseError(`Origin not allowed. Add this to _origins: "${origin}"`)
  }

  // ══ Static Factory Method ═════════════════════════════════════════════════════

  /**
   * **GHDB instance** — embed a bot token (or pool of tokens) so any visitor can read/write without their own PAT.
   * @param   {{ owner: string, repo: string, tokens: string[], branch?: string, rawBranches?: string[], basePath?: string, useRaw?: boolean, pepper?: string }} config
   * @returns {Promise<GitHubDB>}
   */
  static async instance({ owner, repo, tokens, branch = 'main', rawBranches = null, basePath = 'data', useRaw = true, pepper = PASSWORD_PEPPER }) {
    assertValidConfig({ owner, repo, branch, tokens, basePath })
    const resolvedTokens = tokens.map(resolveToken)
    const database = new GitHubDB(
      new GitHubFilesystem({ owner, repo, tokens: resolvedTokens, branch, rawBranches }),
      { basePath, useRaw, pepper }
    )
    await database.checkOrigins()
    await installWorkflow(owner, repo, tokens, basePath)
    return database
  }

  // ══ Core API ══════════════════════════════════════════════════════════════════

  /**
   * Get a handle on a named collection.  
   * Supports arbitrarily deep nesting via alternating `(recordId, collectionName)` pairs.
   * @param   {string}    name     Root collection name.
   * @param   {...string} segments Alternating `recordId, collectionName` pairs for nesting.
   * @returns {Collection}
   *
   * @example
   * const posts   = db.collection('posts')
   * const members = db.collection('orgs', 'acme', 'teams', 'eng', 'members')
   */
  collection(name, ...segments) {
    assertValidId(name)
    if (segments.length % 2 !== 0) {
      throw new DatabaseError(
        'collection() requires an even number of extra segments: alternating (recordId, collectionName) pairs'
      )
    }

    let path     = `${this.basePath}/${name}`
    let leafName = name

    for (let i = 0; i < segments.length; i += 2) {
      const recordId  = segments[i]
      const childName = segments[i + 1]
      assertValidId(recordId)
      assertValidId(childName)
      path     = `${path}/${recordId}/${childName}`
      leafName = childName
    }

    return new Collection(this.filesystem, path, leafName, this.session, () => this.permissionsMap, this.useRaw)
  }

  /**
   * Set per-collection/key and `'_kv'` for all keys' access permissions.
   * @param   {{ [name: string]: { read: string | string[], write: string | string[] } }} map
   * @returns {this}
   *
   * @example
   * db.permissions({
   *   posts:    { read: 'public', write: 'auth'  },
   *   settings: { read: 'admin',  write: 'admin' },
   *   _kv:      { read: 'auth',   write: 'admin' },
   * })
   */
  permissions(map) {
    for (const [key, value] of Object.entries(map)) {
      const validLevel = level => ['public','auth','admin'].includes(level)
      || (typeof level === 'string' && level.length > 0)
      || (Array.isArray(level) && level.every(index => typeof index === 'string' && index.length > 0))
      
      if (value.read !== undefined && !validLevel(value.read)) {
        throw new DatabaseError(`Invalid permission read level for "${key}"`, 400)
      }
      if (value.write !== undefined && !validLevel(value.write)) {
        throw new DatabaseError(`Invalid permission write level for "${key}"`, 400)
      }
    }
    this.permissionsMap = map
    return this
  }

  // ══ Utilities ═════════════════════════════════════════════════════════════════

  /**
   * Fetch the git commit history for a path.  
   * Every write through this library creates a commit you can inspect here.
   * @param   {string} [path='']
   * @param   {number} [limit=30]
   * @returns {Promise<Array<{ sha: string, message: string, author: string, date: string, url: string }>>}
   */
  getCommitHistory(path = '', limit = 30) {
    return this.filesystem.getCommitHistory(path, limit)
  }

  /**
   * Verify that the configured token and repo are accessible.  
   * Throws a DatabaseError if not.
   * @returns {Promise<object>} GitHub repo metadata.
   */
  validateConnection() {
    return this.filesystem.validateConnection()
  }

  // ══ Static Token Helpers ══════════════════════════════════════════════════════

  /**
   * Obfuscate a plain PAT for safe embedding in public client-side code.  
   * Pass the result as `token` — the library decodes it automatically.
   * @param   {string} plainToken
   * @returns {string}
   */
  static encodeToken(plainToken) { return encodeToken(plainToken) }

  // ══ Static Cryptographic Helpers ═════════════════════════════════════════════

  /**
   * Hash a secret using PBKDF2-SHA256 (200 000 iterations).
   * @param   {string} secret
   * @param   {string} [context='']             Optional binding context (e.g. username).
   * @param   {string} [pepper=PASSWORD_PEPPER] Optional custom pepper.
   * @returns {Promise<string>}                 `<salt>:<derivedKey>`
   */
  static hashSecret(secret, context = '', pepper = PASSWORD_PEPPER) { return hashSecret(secret, context, pepper) }

  /**
   * Verify a plaintext secret against a hash produced by {@link GitHubDB.hashSecret}.
   * @param   {string} secret
   * @param   {string} storedHash               Value returned by `hashSecret`.
   * @param   {string} [context='']             Must match the context used during hashing.
   * @param   {string} [pepper=PASSWORD_PEPPER] Optional custom pepper.
   * @returns {Promise<boolean>}
   */
  static verifySecret(secret, storedHash, context = '', pepper = PASSWORD_PEPPER) { return verifySecret(secret, storedHash, context, pepper) }
}


// ═══ Browser DevTools Helper ══════════════════════════════════════════════════

if (typeof window !== 'undefined' && !window.GitHubDB) {
  window.GitHubDB = GitHubDB
}


// ═══ Exports ══════════════════════════════════════════════════════════════════

export { GitHubDB, DatabaseError }
export default GitHubDB