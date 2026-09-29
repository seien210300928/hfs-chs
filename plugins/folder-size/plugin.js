// folder-size plugin for HFS
//
// File-view list enhancements (no core source modified):
//  1. Shows the TOTAL (recursive) size of every folder in the list.
//  2. Shows counts of files/folders inside each folder, before the size.
//  3. A toolbar button toggles the COUNT granularity:
//       - 递归 (tree): counts are the recursive totals
//       - 列表 (ls):   counts are only the direct children
//     The SIZE is always the recursive total, regardless of the toggle.
//     The choice is stored in a cookie (follows the browser).
//  Permission-aware: walking goes through HFS' own walkNode with the request
//  context, so files/folders the current account cannot see are excluded.

exports.description = "Shows folder sizes and file/folder counts in the list, permission-aware, with tree/ls count toggle"
exports.version = 3
exports.apiRequired = 13

exports.config = {
    cache_seconds: {
        type: 'number',
        defaultValue: 300,
        min: 0,
        label: "Cache duration (seconds)",
        helperText: "Sizes/counts are re-scanned after this much time. 0 = re-scan on every list.",
    },
    max_seconds: {
        type: 'number',
        defaultValue: 20,
        min: 1,
        label: "Max scan time per folder (seconds)",
        helperText: "If a folder takes longer to scan, its info is skipped this visit; it keeps scanning in the background and is ready next time.",
    },
}

exports.init = api => {
    const { walkNode, nodeStats, nodeIsFolder } = api.require('./vfs')
    const fsp = require('fs/promises')
    const path = require('path')

    const cache = new Map()      // key -> { size, files, folders, mtimeMs, time }
    const inFlight = new Map()
    const MAX_CACHE = 5000
    const COOKIE = 'folder-size-mode'

    function ttlMs() {
        return Math.max(0, Number(api.getConfig('cache_seconds')) || 0) * 1000
    }
    function maxWaitMs() {
        return Math.max(1, Number(api.getConfig('max_seconds')) || 20) * 1000
    }
    function currentUser(ctx) {
        try { return api.getCurrentUsername(ctx) || '' }
        catch { return '' }
    }

    async function statDir(p) {
        try { return await fsp.stat(p) }
        catch { return undefined }
    }

    // Recursive walk, permission-aware via ctx. Sums size + counts.
    async function walkRecursive(node, ctx) {
        let size = 0, files = 0, folders = 0
        for await (const n of walkNode(node, { ctx, depth: Infinity })) {
            if (nodeIsFolder(n))
                folders++
            else {
                size += await nodeStats(n).then(s => s?.size || 0, () => 0)
                files++
            }
        }
        return { size, files, folders }
    }

    // Immediate children only (one level), permission-aware. Counts only.
    async function walkImmediate(node, ctx) {
        let files = 0, folders = 0
        for await (const n of walkNode(node, { ctx, depth: 0 })) {
            if (nodeIsFolder(n)) folders++
            else files++
        }
        return { files, folders }
    }

    async function compute(node, ctx, wantImmediate) {
        const src = node.source
        const st = await statDir(src)
        if (!st || !st.isDirectory()) return undefined
        const user = currentUser(ctx)
        const ttl = ttlMs()
        const now = Date.now()
        const baseKey = path.resolve(src) + '|' + user

        // ---- recursive size + recursive counts (always) ----
        let rec = cache.get(baseKey)
        const recStale = !rec || (ttl && now - rec.time >= ttl) || rec.mtimeMs !== st.mtimeMs
        if (recStale) {
            rec = await walkRecursive(node, ctx)
            rec = { ...rec, mtimeMs: st.mtimeMs, time: now }
            if (cache.size >= MAX_CACHE)
                cache.delete(cache.keys().next().value)
            cache.set(baseKey, rec)
        }

        if (!wantImmediate)
            return { size: rec.size, files: rec.files, folders: rec.folders }

        // ---- immediate counts (ls mode) ----
        const imKey = baseKey + '|im'
        let im = cache.get(imKey)
        const imStale = !im || (ttl && now - im.time >= ttl) || im.mtimeMs !== st.mtimeMs
        if (imStale) {
            im = await walkImmediate(node, ctx)
            im = { ...im, mtimeMs: st.mtimeMs, time: now }
            cache.set(imKey, im)
        }
        // size stays the recursive total; counts are the immediate ones
        return { size: rec.size, files: im.files, folders: im.folders }
    }

    async function getInfo(node, ctx, wantImmediate) {
        const key = path.resolve(node.source) + '|' + currentUser(ctx) + '|' + (wantImmediate ? 'ls' : 'tree')
        let p = inFlight.get(key)
        if (!p) {
            p = compute(node, ctx, wantImmediate).catch(() => undefined)
                .finally(() => inFlight.delete(key))
            inFlight.set(key, p)
        }
        const limit = maxWaitMs()
        if (!limit) return p
        let timer
        const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(undefined), limit) })
        try {
            return await Promise.race([p, timeout])
        }
        finally { clearTimeout(timer) }
    }

    api.events.on('dirEntry', async ({ entry, node, ctx }) => {
        if (!entry.n.endsWith('/')) return        // only folders
        if (entry.url) return                     // skip external links (no on-disk folder)
        // entry.web (folder has a default page) is NOT skipped: still a real disk folder
        const src = node && node.source
        if (!src || entry.s !== undefined) return
        let wantImmediate = false
        try {
            const m = ctx && ctx.cookies && ctx.cookies.get && ctx.cookies.get(COOKIE)
            if (m === 'ls') wantImmediate = true
        }
        catch {}
        try {
            const info = await getInfo(node, ctx, wantImmediate)
            if (info) {
                entry.s = info.size
                entry.fc = info.files
                entry.dc = info.folders
            }
        }
        catch {}
    })

    api.log('folder-size plugin started (permission-aware; size always recursive)')
    return {
        frontend_js: 'main.js',
        frontend_css: 'style.css',
    }
}
