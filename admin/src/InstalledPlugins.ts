// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { apiCall, useApiList } from './api'
import { createElement as h, useEffect, useState } from 'react'
import { Box, Table, TableBody, TableCell, TableRow, useTheme } from '@mui/material'
import type { Breakpoint } from '@mui/material/styles'
import { DataTable, DataTableColumn } from './DataTable'
import {
    Delete, FormatPaint as ThemeIcon, ListAlt, PlayCircle, Settings, StopCircle, Upgrade
} from '@mui/icons-material'
import {
    CFG, HTTP_FAILED_DEPENDENCY, md, prefix, xlate, tryJson, isPrimitive, HIDE_IN_TESTS, wait
} from './misc'
import { confirmDialog, toast } from './dialog'
import _ from 'lodash'
import { PLUGIN_ERRORS, pluginName, renderPluginName, startPlugin } from './plugin'
import { Btn, IconBtn, iconTooltip, usePauseButton } from './mui'
import { showPluginOptions, evalWrapper } from './pluginOptions'

// updates=true will show the "check updates" version of the page
export default function InstalledPlugins({ updates }: { updates?: true }) {
    const { list, error, setList, initializing } = useApiList<any>(updates ? 'get_plugin_updates' : 'get_plugins', {}, {
        map(x: any) { x.config &&= tryJson(x.config, s => evalWrapper('()=>('+s+')')()) }
    })
    const [sortAgain, setSortAgain] = useState(0)
    useEffect(() => {
        setList(list =>
            _.sortBy(list, x => (x.error ? 0 : x.started ? 1 : x.badApi ? 2 : 3) + pluginName(x.repo?.split('/').reverse().join('/') || x.id).toLowerCase()))
    }, [list.length, sortAgain])
    const size = 'small'
    const { pause, pauseButton } = usePauseButton("插件", () => getSingleConfig(CFG.suspend_plugins).then(x => !x), {
        async onClick() {
            await apiCall('set_config', { values: { [CFG.suspend_plugins]: !pause } })
            if (!pause) return
            await wait(2000)
            setSortAgain(Date.now())
        }
    })
    const theme = useTheme()
    return h(DataTable, {
        error: isPrimitive(error) ? xlate(error, PLUGIN_ERRORS)
            : _.map(error, (v, k) => `错误 ${k}，插件: ${v.join(', ')}`).join('; '), // complex error for updates
        rows: list.length ? list : [], // workaround for DataGrid's bug causing 'no rows' message to be not displayed after 'loading' was also used
        fillFlex: true,
        initializing,
        disableColumnSelector: true,
        quickFilter: !updates,
        actionsHeader: !updates && pauseButton,
        getRowHeight: updates && (({ model }) => model.changelog ? 'auto' as const : 50),
        noRows: updates && `没有可用更新。仅检查"在线搜索"中可用的插件。`,
        columns: [
            {
                field: 'id',
                headerName: "名称",
                flex: .3,
                minWidth: 150,
                renderCell: renderPluginName,
                valueGetter(_value: any, row: any) { return row.repo || row.id },
                mergeRender: { [updates ? 'changelog' : 'description']: { sx: { fontSize: 'x-small' } } }
            },
            {
                field: 'version',
                headerName: '版本',
                width: 70,
                hideUnder: 'sm',
                cellInnerProps: { className: HIDE_IN_TESTS },
                mergeRender: { installedVersion: { sx: { fontSize: 'x-small' } } }
            },
            themeField,
            {
                ...descriptionField,
                flex: 1,
                hideUnder: 'sm',
            },
            {
                field: 'installedVersion',
                hideUnder: true,
                dialogHidden: true,
                renderCell: ({ value }) => value && `您的版本 ${value}`
            },
            {
                field: 'changelog',
                headerName: "更新日志",
                flex: 2,
                hideUnder: !updates || 'sm',
                sx: { flexDirection: 'column', alignItems: 'flex-start' },
                renderCell({ value, row }) {
                    if (!Array.isArray(value)) return null
                    return h(Table, { sx: { td: { p: 0 } } },
                        h(TableBody, {},
                            _.uniq(_.sortBy(value, 'version').filter(x => _.isString(x.message) && x.message && x.version > row.installedVersion))
                                .map((x, i) => h(TableRow, { key: i },
                                    h(TableCell, { sx: { whiteSpace: 'pre', verticalAlign: 'top' } }, `• ${x.version}: `),
                                    h(TableCell, {}, md(x.message, { html: false }))
                                ))
                        )
                    )
                }
            }
        ],
        actions: ({ row, id }) => updates ? [
            h(IconBtn, {
                icon: Upgrade,
                title: row.downloading ? "正在下载" : row.updated ? "已是最新" : "更新",
                disabled: row.updated,
                progress: row.downloading,
                size,
                async onClick() {
                    await apiCall('update_plugin', { id }, { timeout: false }).catch(e => {
                        throw e.code !== HTTP_FAILED_DEPENDENCY ? e
                            : Error("依赖安装失败: " + e.cause?.map((x: any) => prefix(`插件 "`, x.id || x.repo, `" `) + x.error).join('; '))
                    })
                    toast("插件已更新")
                }
            })
        ] : [
            h(IconBtn, row.started ? {
                icon: StopCircle,
                title: h(Box, { 'aria-hidden': true }, `停止 ${id}`, h('br'), `启动于 ` + new Date(row.started as string).toLocaleString()),
                'aria-label': `停止 ${id}`,
                size,
                color: 'success',
                doneAnimation: true,
                onClick: () => apiCall('stop_plugin', { id }),
            } : {
                icon: PlayCircle,
                title: `启动 ${id}`,
                disabled: pause && "所有插件已暂停 – 请点击下方的继续按钮",
                size,
                onClick: () => startPlugin(id),
            }),
            h(IconBtn, {
                icon: row.config || !row.started || !row.log ? Settings : ListAlt,
                title: row.config || !row.log ? "选项" : "日志",
                size,
                disabled: !row.started && "启动插件以访问选项"
                    || !row.config && !row.log && "此插件没有选项也没有日志",
                onClick() {
                    const cd = row.configDialog
                    // support css values for maxWidth without having to wrap in sx, as in DialogProps it only supports breakpoints
                    let maxWidth = theme.breakpoints.values[cd?.maxWidth as Breakpoint] || cd?.sx?.maxWidth || xlate(cd?.maxWidth, { xs: 0 }) || 432
                    if (typeof maxWidth === 'number')  // @ts-ignore
                        maxWidth += 'px'
                    return showPluginOptions(row, maxWidth)
                }
            }),
            h(IconBtn, {
                icon: Delete,
                title: "卸载",
                size,
                async onClick() {
                    const res = await confirmDialog(`${id}：是否同时删除配置？`, {
                        trueText: "是",
                        falseText: "否",
                        after: ({ onClick }) => h(Btn, { variant: 'outlined', onClick(){ onClick(undefined) } }, "中止")
                    })
                    if (res === undefined) return
                    await apiCall('uninstall_plugin', { id, deleteConfig: res })
                    toast("插件已卸载")
                }
            }),
        ]
    })
}

function getSingleConfig(k: string) {
    return apiCall('get_config', { only: [k] }).then(x => x[k])
}

export const descriptionField: DataTableColumn = {
    field: 'description',
    headerName: '描述',
    mergeRender: { isTheme: {} } ,
    mergeRenderSx: { float: 'left' },
}

export const themeField: DataTableColumn = {
    field: 'isTheme',
    headerName: "主题",
    hideUnder: true,
    dialogHidden: true,
    type: 'boolean',
    renderCell({ value }) {
        return value && iconTooltip(ThemeIcon, _.isString(value) ? `${value} 主题` : "主题", { fontSize: '1.2rem', mr: '.3em' })
    }
}
