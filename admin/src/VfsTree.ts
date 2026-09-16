// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { markVfsModified, prepareVfsUndo, state, useSnapState } from './state'
import { createElement as h, ReactElement, useCallback, useEffect, useRef, MouseEvent } from 'react'
import { TreeItem, SimpleTreeView } from '@mui/x-tree-view'
import {
    ChevronRight, ExpandMore, TheaterComedy, Folder, Home, Link, InsertDriveFileOutlined, Lock,
    RemoveRedEye, Web, Upload, Cloud, Delete, HighlightOff, UnfoldMore, UnfoldLess
} from '@mui/icons-material'
import { Box, Typography } from '@mui/material'
import { deleteVfs, id2vfsNode, isDescendantUri, reindexVfs, VfsNodeAdmin } from './VfsPage'
import { onlyTruthy, pathDecode, pathEncode, prefix, toMutable, wantArray, WhoVfs, with_ } from './misc'
import { Flex, iconTooltip, useToggleButton } from './mui'
import VfsMenuBar from './VfsMenuBar'
import { ApiObject } from './api'
import { alertDialog, toast } from './dialog'
import _ from 'lodash'

export const FolderIcon = Folder
export const FileIcon = InsertDriveFileOutlined

let once = true

const SPECIAL_TREE_ITEM = '?'

export default function VfsTree({ statusApi }:{ statusApi: ApiObject }) {
    const { vfs, selectedFiles, expanded } = useSnapState()
    const dragging = useRef<string>()
    const Branch = useCallback(function({ node }: { node: Readonly<VfsNodeAdmin> }): ReactElement {
        let { id, name, isRoot } = node
        const isFolder = node.type === 'folder'
        const ref = useRef<HTMLLIElement | null>()
        if (isRoot && ref.current)
            ref.current.firstElementChild?.classList.toggle('Mui-selected', !(selectedFiles.length && !_.find(selectedFiles, { id: '/' })))
        const rootValue = pathDecode(id.slice(1))
        const rootFor = _.findKey(statusApi.data?.roots, v => v === rootValue)
        return h(TreeItem, {
            ref(el) {
                ref.current = el
            },
            onKeyUp(ev) {
                if (ev.key === 'Delete') {
                    deleteVfs([id])
                    ev.stopPropagation()
                }
            },
            onDoubleClick: toggle,
            label: h(Box, {
                draggable: !isRoot,
                onDragStart() {
                    dragging.current = id
                },
                onDragOver(ev) {
                    if (!isFolder) return
                    const src = dragging.current
                    if (src?.startsWith(id) && !src.slice(id.length + 1, -1).includes('/')) return // dragging node (src) must not be direct child of destination (id)
                    ev.preventDefault()
                },
                async onDrop() {
                    const from = dragging.current
                    if (!from) return
                    const fromName = id2vfsNode.get(from)?.name // won't work after moving
                        if (moveVfs(from, id))
                            toast(`已将 "${fromName}" 移动到 "${id2vfsNode.get(id)?.name}" 下`, 'success')
                },
                sx: {
                    display: 'flex',
                    gap: '.5em',
                    minHeight: '1.8em', pt: '.2em', // comfy, make single-line ones taller
                }
            },
                h(Box, { sx: { display: 'flex', flex: 0 } },
                    vfsNodeIcon(node),
                    // attributes, as icons
                    h(Box, {
                        sx: {
                            flex: 0, ml: '2px', my: '2px', '&>*': { fontSize: '87%', opacity: .6, mt: '-2px' },
                            display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'auto auto', height: '1em',
                        }
                    },
                        node.can_delete != null && iconTooltip(Delete, "删除权限"),
                        node.can_upload != null && iconTooltip(Upload, "上传权限"),
                        !isRoot && !node.source && !node.url && iconTooltip(Cloud, "虚拟（无来源）"),
                        isRestricted(node.can_see) && iconTooltip(RemoveRedEye, "谁能看见的限制"),
                        isRestricted(node.can_read) && iconTooltip(Lock, "谁能下载的限制"),
                        node.default && iconTooltip(Web, "作为网页显示"),
                        node.masks && iconTooltip(TheaterComedy, "掩码"),
                        node.size === -1 && iconTooltip(HighlightOff, "未找到来源"),
                        rootFor && iconTooltip(Home, `为 ${rootFor} 的主页`)
                    ),
                ),
                isRoot ? "主页文件夹" : name
            ),
            itemId: id
        }, with_(node.source && isFolder ? "来自 " + node.source : !node.children?.length && isRoot && "此处为空", x =>
                x && h(TreeItem, { itemId: SPECIAL_TREE_ITEM + id, label: h('i', {}, x) })),
            ...node.children?.map(x => h(Branch, { key: x.id, node: x })) || []
        )

        function isRestricted(who: WhoVfs | undefined) {
            return who != null && who !== true
        }

        function toggle(ev: MouseEvent<any>){
            const was = state.expanded
            state.expanded = was.includes(id) ? was.filter(x => x !== id) : [...was, id]
            ev.preventDefault()
            ev.stopPropagation()
        }
    }, [statusApi.data])
    const ref = useRef<HTMLUListElement>(null)
    const allExpanded = id2vfsNode.size > 0 && expanded.length === id2vfsNode.size
    const initialExpansion = ['/', ...vfs?.children?.length === 1 ? [vfs.children[0].id] : []] // in case there's only one child, expand that too
    if (once) {
        once = false
        state.expanded = initialExpansion
    }
    const [_expandAll, toggleBtn] = useToggleButton("全部折叠", "全部展开", exp => ({
        icon: exp ? UnfoldLess : UnfoldMore,
        sx: { rotate: exp ? 0 : '180deg' },
        onClick() {
            state.expanded = allExpanded ? initialExpansion : Array.from(id2vfsNode.keys())
        }
    }), allExpanded)
    useEffect(() => {
        state.expanded = _.uniq(state.expanded.concat(state.selectedFiles.map(x => x.parent?.id || '')))
    }, [state.vfs])
    // be sure the selected element is visible
    const treeId = 'vfs'
    const first = selectedFiles[0]
    useEffect(() => { // scrollIntoView in modern browsers is returning a Promise
        document.getElementById(`${treeId}-${first?.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    }, [first])
    return h(Flex, { flexDirection: 'column', alignItems: 'stretch', flex: 1 },
        h(Flex, { mb: 1, flexWrap: 'wrap', gap: [1, 2], mt: '2px' /*account for the save button's outline*/ },
            h(Typography, { variant: 'h6' }, "虚拟文件系统"),
            h(VfsMenuBar, { statusApi, add: toggleBtn }),
        ),
        vfs && h(SimpleTreeView, {
            ref,
            expandedItems: toMutable(expanded),
            expansionTrigger: 'iconContainer',
            onExpandedItemsChange(_ev, ids) {
                // keep placeholder helper rows out of expansion state to avoid persisting fake ids
                state.expanded = wantArray(ids).filter((x): x is string => typeof x === 'string' && !x.startsWith(SPECIAL_TREE_ITEM))
            },
            selectedItems: selectedFiles.map(x => x.id),
            multiSelect: true,
            id: treeId,
            sx: {
                height: 0, flex: '1 1 auto',
                overflowX: 'auto',
                maxWidth: ref.current && `calc(100vw - ${16 + ref.current.offsetLeft}px)`, // limit possible horizontal scrolling to this element
                '& ul': { borderLeft: '1px dashed #444', marginLeft: '15px', paddingLeft: '15px' },
            },
            slots: {
                collapseIcon: ExpandMore,
                expandIcon: ChevronRight,
            },
            onSelectedItemsChange(_ev, ids) {
                const selectedIds = wantArray(ids) as string[]
                state.selectedFiles = onlyTruthy(selectedIds.map(id => id2vfsNode.get(id)))
                // this is the only point where we have special node ids that don't fit selectedFiles
                state.vfsShowDiskContentFor = selectedIds.length === 1
                    && selectedIds[0][0] === SPECIAL_TREE_ITEM
                    && id2vfsNode.get(selectedIds[0].slice(1))?.source || ''
            }
        }, h(Branch, { node: vfs as Readonly<VfsNodeAdmin> }))
    )
}

export function moveVfs(from: string, to: string) {
    const fromNode = id2vfsNode.get(from)
    if (!fromNode)
        return !alertDialog("未找到要移动的条目", 'error')
    if (fromNode.isRoot)
        return !alertDialog("无法移动根目录", 'error')
    const toNode = id2vfsNode.get(to)
    if (!toNode || toNode.type !== 'folder')
        return !alertDialog("未找到目标文件夹", 'error')
    if (isDescendantUri(to, from))
        return !alertDialog("不能移动到自身内部", 'error')
    if (toNode.children?.find(x => x.name === fromNode.name))
        return !alertDialog("目标位置已存在同名条目", 'error')
    const oldSiblings = fromNode.parent?.children
    if (!oldSiblings)
        return !alertDialog("未找到源父级", 'error')
    const fromParent = fromNode.parent
    const movedName = fromNode.name
    const movedIsFolder = fromNode.type === 'folder'
    const destinationAncestors = getAncestorIds(toNode)
    prepareVfsUndo()
    _.remove(oldSiblings, { id: fromNode.id })
    if (!oldSiblings.length && fromParent)
        fromParent.children = undefined
    addToChildrenOf(toNode, [fromNode])
    const movedId = prefix(to, pathEncode(movedName), movedIsFolder ? '/' : '')
    reindexVfs({ select: [movedId] })
    state.expanded = _.uniq([...state.expanded, ...destinationAncestors])
    return true

    function getAncestorIds(node: VfsNodeAdmin) {
        const ret: string[] = []
        let cur: typeof node | undefined = node
        while (cur) {
            ret.push(cur.id)
            cur = cur.parent
        }
        return ret
    }
}

export function vfsNodeIcon(node: VfsNodeAdmin) {
    return node.isRoot ? iconTooltip(Home, "主页（如果您愿意，也可以视为根目录）")
        : node.type === 'folder' ? iconTooltip(FolderIcon, "文件夹")
            : node.url ? iconTooltip(Link, "网页链接")
                : iconTooltip(FileIcon, "文件")
}

export function addToChildrenOf(parent: VfsNodeAdmin, moreChildren: VfsNodeAdmin[]) {
    if (!parent.children)
        parent.children = []
    // keep the assignment above and push separated: on proxied nodes, combining them will push to a stale array reference.
    parent.children.push(...moreChildren)

    markVfsModified()
}
