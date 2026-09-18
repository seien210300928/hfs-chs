import { createElement as h, Fragment } from 'react'
import { Box, Link } from '@mui/material'
import { Error as ErrorIcon, PlayCircle, Warning } from '@mui/icons-material'
import { apiCall } from './api'
import { HFS_REPO, HTTP_FAILED_DEPENDENCY, NBSP, with_ } from './misc'
import { alertDialog, confirmDialog, toast } from './dialog'
import { Flex, hTooltip } from './mui'
import _ from 'lodash'

const HFS_GITHUB_ACCOUNT = HFS_REPO.replace(/\/.+/, `/`)
export const PLUGIN_ERRORS = { ENOTFOUND: "无法访问 github.com", ECONNREFUSED: "无法访问 github.com" }

export function renderPluginName({ row, value }: any) {
    const { repo } = row
    return h(Fragment, {},
        row.downgrade && errorIcon("此版本比您安装的版本旧。作者可能发现您的版本存在问题并决定将其下架。", true),
        errorIcon(row.error || row.badApi, !row.error),
        repo?.includes('//') ? h(Link, { href: repo, target: 'plugin' }, value)
            : with_(repo?.split('/'), arr => arr?.length !== 2 ? value
                : h(Fragment, {},
                    h(Link, { href: 'https://github.com/' + repo, target: 'plugin', onClick(ev) { ev.stopPropagation() } }, pluginName(arr[1])),
                    NBSP + '作者 ', arr[0]
                ))
    )

    function errorIcon(msg: string, warning=false) {
        return msg && hTooltip(msg, msg, h(ErrorIcon, { fontSize: 'small', color: warning ? 'warning' : 'error', sx: { ml: -.5, mr: .5 } }))
    }
}

export async function startPlugin(id: string) {
    try {
        await apiCall('start_plugin', { id })
        toast("插件已启动", h(PlayCircle, { color: 'success' }))
        return true
    }
    catch(e: any) {
        alertDialog(`插件 ${id} 启动失败，错误: ${String(e?.message || e)}`, 'error')
    }
}

export async function installPluginFromResult(row: any) {
    if (!row.id.startsWith(HFS_GITHUB_ACCOUNT))
        if (!await confirmDialog(
            h(Flex, { vert: true, alignItems: 'center' },
                h(Warning, { color: 'warning', fontSize: 'large' }),
                "仅在您信任此插件时才继续",
                h(Box, { sx: { fontSize: '60%' } }, "插件与任何其他软件具有同等的权限"),
            ))) return
    if (row.missing && !await confirmDialog("同时还会安装: " + _.map(row.missing, 'repo').join(', '))) return
    const branch = row.branch || row.default_branch
    return installPlugin(row.id, branch).catch((e: any) => {
        if (e.code !== HTTP_FAILED_DEPENDENCY)
            return alertDialog(e)
        const msg = h(Fragment, {}, "此插件存在未满足的依赖项:",
            e.data.map((x: any) => h('li', { key: x.repo }, x.repo + ': ' + x.error)) )
        return alertDialog(msg, 'error')
    })
}

export function pluginName(name: string) {
    return name.replace(/hfs-/, '')
}

async function installPlugin(id: string, branch?: string): Promise<any> {
    try {
        const res = await apiCall('download_plugin', { id, branch, stop: true }, { timeout: false })
        if (await confirmDialog(`插件 ${id} 已下载`, { trueText: "启动" }))
            await startPlugin(res.id)
    }
    catch(e:any) {
        let done = false
        if (e.code === HTTP_FAILED_DEPENDENCY) // try to install automatically
            for (const x of e.cause)
                if (x.error === 'missing') {
                    toast("正在安装依赖: " + x.repo)
                    await installPlugin(x.repo)
                    done = true
                }
        if (done) // try again
            return installPlugin(id, branch)
        throw e
    }
}
