// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { id2vfsNode, isDescendantUri, markVfsModified, prepareVfsUndo, reindexVfs, state, VfsNodeAdmin } from './state'
import { getHFS, normalizeFilenameForPlatform, onlyTruthy, pathEncode, prefix } from './misc'
import { alertDialog } from './dialog'
import _ from 'lodash'

export type MoveVfsSources = string | readonly string[]

export function getMoveVfsError(from: MoveVfsSources, to: string) {
    const fromUris = normalizeMoveSources(from)
    if (fromUris.includes('/'))
        return "无法移动根目录"
    const topLevelUris = getTopLevelMoveSources(fromUris)
    const fromNodes = onlyTruthy(topLevelUris.map(uri => id2vfsNode.get(uri)))
    if (fromNodes.length !== topLevelUris.length)
        return "未找到要移动的条目"
    const toNode = id2vfsNode.get(to)
    if (!toNode || toNode.type !== 'folder')
        return "未找到目标文件夹"
    if (topLevelUris.some(uri => isDescendantUri(to, uri)))
        return "不能移动到自身内部"
    if (topLevelUris.every(uri => isDirectChildOf(uri, to)))
        return "已在此文件夹中"
    if (_.uniqBy(fromNodes, node => normalizeName(node.name)).length !== fromNodes.length)
        return "某些选定项目具有相同的名称"
    if (fromNodes.some(fromNode => toNode.children?.some(x => normalizeName(x.name) === normalizeName(fromNode.name) && x.id !== fromNode.id)))
        return "目标位置已存在同名条目"
    if (fromNodes.some(fromNode => !fromNode.parent?.children))
        return "未找到源父级"

    function normalizeName(name: string) {
        return normalizeFilenameForPlatform(name, getHFS().platform)
    }
}

export function moveVfs(from: MoveVfsSources, to: string) {
    const error = getMoveVfsError(from, to)
    if (error)
        return !alertDialog(error, 'error')
    const topLevelUris = getTopLevelMoveSources(normalizeMoveSources(from))
    const fromNodes = onlyTruthy(topLevelUris.map(uri => id2vfsNode.get(uri)))
    const toNode = id2vfsNode.get(to)!
    const destinationAncestors = getAncestorIds(toNode)
    const movedIds = fromNodes.map(fromNode =>
        prefix(to, pathEncode(fromNode.name), fromNode.type === 'folder' ? '/' : ''))
    prepareVfsUndo()
    for (const fromNode of fromNodes) {
        const oldSiblings = fromNode.parent!.children!
        _.remove(oldSiblings, { id: fromNode.id })
        // empty child arrays should not survive moves, or the admin tree keeps phantom expandable folders
        if (!oldSiblings.length)
            fromNode.parent!.children = undefined
    }
    addToChildrenOf(toNode, fromNodes)
    // ids and node references change after moving; select by the new ids after reindex
    reindexVfs({ select: movedIds })
    state.expanded = _.uniq([...state.expanded, ...destinationAncestors])
    return true
}

export function addToChildrenOf(parent: VfsNodeAdmin, moreChildren: VfsNodeAdmin[]) {
    if (!parent.children)
        parent.children = []
    // keep the assignment above and push separated: on proxied nodes, combining them will push to a stale array reference.
    parent.children.push(...moreChildren)

    markVfsModified()
}

function normalizeMoveSources(from: MoveVfsSources) {
    return _.uniq(typeof from === 'string' ? [from] : from).sort()
}

function getTopLevelMoveSources(fromUris: string[]) {
    return fromUris.filter((uri, idx) =>
        idx === 0 || _.findLastIndex(fromUris, parentUri => isDescendantUri(uri, parentUri), idx - 1) < 0)
}

function isDirectChildOf(childId: string, parentId: string) {
    return childId.startsWith(parentId) && !childId.slice(parentId.length + 1, -1).includes('/')
}

function getAncestorIds(node: VfsNodeAdmin) {
    const ret: string[] = []
    let cur: typeof node | undefined = node
    while (cur) {
        ret.push(cur.id)
        cur = cur.parent
    }
    return ret
}
