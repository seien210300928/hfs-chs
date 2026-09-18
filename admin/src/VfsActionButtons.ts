// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, Fragment } from 'react'
import { Box } from '@mui/material'
import { ContentCut, ContentPaste, Delete } from '@mui/icons-material'
import { Btn } from './mui'
import { deleteVfs } from './VfsPage'
import { Callback } from './misc'
import { alertDialog } from './dialog'
import { state, useSnapState } from './state'
import { getMoveVfsError, moveVfs } from './VfsMove'
import _ from 'lodash'

export default function VfsActionButtons({ files, pasteTo, done }: {
    files: readonly VfsActionNode[]
    pasteTo?: VfsActionNode
    done?: Callback
}) {
    const { movingFiles } = useSnapState()
    const hasRoot = files.some(x => x.isRoot)
    const ids = files.map(x => x.id)
    return h(Fragment, {},
        h(Btn, {
            icon: ContentCut,
            disabled: !files.length ? "请先选择要剪切的内容"
                : hasRoot ? "无法剪切主页"
                : _.isEqual(ids.slice().sort(), movingFiles.slice().sort()) && "已剪切",
            title: "剪切（也可以拖放来移动条目）",
            'aria-label': "剪切",
            onClick() {
                state.movingFiles = ids
                alertDialog(h(Box, {}, "现在已标记为待移动，请点击目标文件夹，然后再点击粘贴按钮 ", h(ContentPaste)), 'info')
            },
        }),
        movingFiles.length > 0 && h(Btn, {
            icon: ContentPaste,
            disabled: !pasteTo ? "请选择目标文件夹" : getMoveVfsError(movingFiles, pasteTo.id),
            title: movingFiles.join('\n'),
            async onClick() {
                if (pasteTo && moveVfs(movingFiles, pasteTo.id))
                    state.movingFiles = []
            },
        }),
        h(Btn, {
            icon: Delete,
            title: "删除",
            disabled: !files.length ? "请先选择要删除的内容"
                : hasRoot && "无法删除主页",
            onClick() {
                deleteVfs(ids)
                done?.()
            },
        }),
    )
}

type VfsActionNode = {
    readonly id: string
    readonly isRoot?: true
}
