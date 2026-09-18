// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { Box, Button, FormHelperText, Tab, Tabs } from '@mui/material';
import { createElement as h, useEffect, useId, useRef, useState } from 'react'
import { apiCall, useApiEx } from './api'
import { state, useSnapState } from './state'
import { Link as RouterLink } from 'wouter'
import { EditNote, Refresh, Warning } from '@mui/icons-material'
import { adminApis } from '../../src/adminApis'
import {
    MAX_TILE_SIZE, REPO_URL, SORT_BY_OPTIONS, THEME_OPTIONS, CFG, IMAGE_FILEMASK, Dict, md, with_, try_, ipForUrl, Html,
    useFixSticky,
} from './misc'
import {
    iconTooltip, LinkBtn, propsForModifiedValues, wikiLink, useBreakpoint, NetmaskField, WildcardsSupported,
    execDoneMessage,
} from './mui'
import {
    Form, BoolField, NumberField, SelectField, FieldProps, Field, type FieldDescriptor, type FormProps, StringField,
} from '@hfs/mui-grid-form'
import { ArrayField } from './ArrayField'
import FileField from './FileField'
import { alertDialog, confirmDialog, toast } from './dialog'
import { proxyWarning } from './HomePage'
import _ from 'lodash';
import { proxy, subscribe, useSnapshot } from 'valtio'
import { TextEditorField } from './TextEditor'
import { WhoField } from './WhoField';
import { SERVER_CODE_SPLIT, parseServerCode } from '../../src/serverCode'
import { highlight, languages } from 'prismjs'
import { isCertError, isKeyError, suggestMakingCert } from './cert'
import { useRoutedTab } from './routing'

let loaded: Dict | undefined
const TAB_PATHS = ['net', 'frontend', 'uploads', 'others']
const pageState = proxy({
    changes: {} as Dict
})

//subscribeKey is not working (anymore) on nested changes
subscribe(state, (ops) => {
    if (ops.some(op => op[1][0] === 'config'))
        recalculateChanges()
})

export default function OptionsPage() {
    const { data, reload: reloadConfig, element } = useApiEx('get_config', { omit: ['vfs'] })
    const snap = useSnapState()
    const { changes } = useSnapshot(pageState)
    const statusApi  = useApiEx<typeof adminApis.get_status>(data && 'get_status')
    const status = statusApi.data
    const reloadStatus = statusApi.reload
    const makeCert = () => suggestMakingCert(saved => {
        if (loaded)
            Object.assign(loaded, saved)
        setTimeout(reloadStatus, 1000) // give some time for backend to apply
        setTimeout(reloadStatus, 2000) // try again in case it's very slow
    })
    useEffect(() => void reloadStatus(), [data]) //eslint-disable-line
    const sm = useBreakpoint('sm')
    const saveBtnRef = useRef<HTMLButtonElement>(null)
    const tabsSticky = useFixSticky()
    const [tab, setTab] = useRoutedTab('options', TAB_PATHS)
    const fieldTabs: Dict<number> = {}

    const admins = useApiEx('get_admins').data?.list

    const connectionAddress = status?.connectionAddress
    const isLH = window.location.hostname === 'localhost'
    const isV6 = connectionAddress?.includes(':')
    const listenInterfaceOptions = [
        { label: "任意", value: '', disabled: false },
        { label: "任意 IPv4", value: '0.0.0.0', disabled: !isLH && (!connectionAddress || isV6) },
        { label: "任意 IPv6", value: '::', disabled: !isLH && (!connectionAddress || !isV6) },
        ...['127.0.0.1', '::1'].map(x => ({ label: x, value: x, disabled: !isLH && connectionAddress !== x })),
        ...status?.ips?.map(x => ({ value: x, disabled: connectionAddress !== x })) || [],
    ]

    if (element)
        return element
    if (statusApi.error)
        return statusApi.element
    const values = (loaded !== data) ? (state.config = loaded = data) : snap.config
    const maxSpeedDefaults = {
        comp: NumberField,
        min: 1,
        unit: "KB/s",
        placeholder: "无限制",
        sm: 6,
    }
    const maxDownloadsDefaults = {
        comp: NumberField,
        placeholder: "无限制",
        toField: (x: any) => x || '',
        sm: 4,
    }
    const httpsEnabled = values[CFG.https_port] >= 0
    return h(Form, {
        sx: { maxWidth: '60em' },
        values,
        set(v, k) {
            state.config[k] = v
        },
        stickyBar: true,
        onError: alertDialog,
        onValidation(errors: false | Dict, submitting: boolean) {
            if (!submitting)
                return
            const firstError = errors && Object.keys(errors).find(k => errors[k])
            // reveal the first invalid field before Form scrolls to it
            if (firstError && fieldTabs[firstError] !== undefined)
                setTab(fieldTabs[firstError])
        },
        save: {
            ref: saveBtnRef,
            onClick: save,
            children: '保存',
            ...propsForModifiedValues( Object.keys(changes).length>0),
        },
        barSx: { gap: 2 },
        addToBar: [
            h(Button, {
                onClick() {
                    reloadConfig()
                    reloadStatus()
                },
                startIcon: h(Refresh),
            }, "重新加载"),
            h(Button, { // @ts-ignore
                component: RouterLink,
                href: "/config",
                startIcon: h(EditNote),
            }, sm ? "配置文件" : "文件"),
        ],
        defaults() {
            return { xs: 6 }
        },
        fields: fieldsForTabs({
            "网络": [
                { k: CFG.port, comp: PortField, xs: 12, sm: 4, label:"HTTP 端口", status: status?.http||true, suggestedPort: 80 },
                { k: CFG.https_port, comp: PortField, xs: 12, sm: 4, label: "HTTPS 端口", status: status?.https||true, suggestedPort: 443,
                    onChange(v: number) {
                        if (v >= 0 && !httpsEnabled && !values[CFG.cert])
                            void makeCert()
                        return v
                    }
                },
                { k: CFG.upnp_enabled, comp: BoolField, xs: 12, sm: 4, label: "UPnP/SSDP",
                    helperText: "端口转发和双重 NAT 检测" },

                httpsEnabled && { k: CFG.cert, comp: FileField, sm: 4, label: "HTTPS 证书文件",
                    helperText: wikiLink('HTTPS#certificate', "这是什么？"),
                    error: with_(status?.https.error, e => isCertError(e) && (
                        status!.https.listening ? e
                            : [e, ' - ', h(LinkBtn, { key: 'fix', onClick: makeCert }, "创建一个")] )),
                },
                httpsEnabled && { k: CFG.private_key, comp: FileField, sm: 4, label: "HTTPS 私钥文件",
                    ...with_(status?.https.error, e => isKeyError(e) ? { error: true, helperText: e } : null)
                },
                httpsEnabled && { k: CFG.force_https, comp: BoolField, label: "强制 HTTPS", sm: 4, disabled: !httpsEnabled || values[CFG.port] < 0,
                    helperText: "不适用于 localhost。与代理不兼容。"
                },

                {
                    k: CFG.listen_interface, label: '监听接口',
                    comp: SelectField,
                    sm: 4,
                    afterList: listenInterfaceOptions.some(x => x.disabled)
                        && h(Box, { sx: { p: '8px 16px 0', borderTop: '1px solid', fontSize: 'small' } }, "如果某个地址被禁用，请使用该地址连接以选择它" ),
                    options: listenInterfaceOptions,
                },
                { k: CFG.max_kbps,        ...maxSpeedDefaults, sm: 4, label: "限制输出", helperText: "不适用于 localhost" },
                { k: CFG.max_kbps_per_ip, ...maxSpeedDefaults, sm: 4, label: "按 IP 限制输出" },

                { k : CFG.max_downloads, ...maxDownloadsDefaults, label: "最大下载数", helperText: "同时下载的数量" },
                { k : CFG.max_downloads_per_ip, ...maxDownloadsDefaults, label: "每 IP 最大下载数" },
                { k : CFG.max_downloads_per_account, ...maxDownloadsDefaults, label: "每账户最大下载数", helperText: "覆盖其他限制" },

                { k: CFG.admin_net, comp: NetmaskField, xs: 12, sm: 6, label: "管理面板可从以下地址访问", placeholder: "任意地址",
                    helperText: "浏览器所在机器的 IP – localhost 例外"
                },
                { k: CFG.localhost_admin, comp: BoolField, xs: 12, sm: 6, label: "将 localhost 访问视为管理员",
                    getError: x => !x && admins?.length===0 && "请先创建至少一个管理员账户",
                    helperText: "无需输入凭据即可访问管理面板"
                },

                { k: CFG.proxies, comp: NumberField, xs: 6, md: 3, max: 9, label: "传入 HTTP 代理数量", placeholder: "无",
                    error: proxyWarning(values, status),
                    helperText: "检测用户 IP 所必需"
                },
                { k: CFG.outbound_interface, comp: SelectField, xs: 6, md: 3, label: '出站接口',
                    options: [{ label: "自动", value: '' }, ...status?.ips?.map(value => ({ value })) || []] },
                { k: CFG.outbound_proxy, xs: 6, md: 4, label: "出站代理", placeholder: "无", helperText: "URL 格式",
                    getError: x => try_(() => x && new URL(x) && '', () => "无效的 URL") },
                { k: CFG.allowed_referer, comp: AllowedReferer, md: 2, placeholder: "任意", label: "来自其他网站的链接",
                    helperText: "当另一个网站链接了您的文件" },

                { k: CFG.block, label: false, comp: ArrayField, xs: 12, prepend: true, sm: true, autoRowHeight: true,
                    form: { sx: { maxWidth: '40em' } },
                    fields: [
                        { k: 'ip', label: "被屏蔽的 IP", sm: 12, required: true, wrap: true, $width: 2, comp: NetmaskField,
                            $column: { mergeRender: { comment: {}, expire: {} } },
                            helperText: "小心不要把自己的 IP 也屏蔽掉，以免把自己踢出去",
                        },
                        { k: 'expire', $type: 'dateTime', label: '过期时间', minDate: new Date(), sm: 6, $hideUnder: 'sm',
                            helperText: "留空表示永不过期" },
                        {
                            k: 'disabled',
                            $type: 'boolean',
                            label: "启用",
                            helperText: "当您想在不删除规则的情况下不进行屏蔽时",
                            toField: (x: any) => !x,
                            fromField: (x: any) => x ? undefined : true,
                            sm: 6,
                            $width: 80,
                        },
                        { k: 'comment', label: '备注', $hideUnder: 'sm' },
                    ],
                },
            ],
            "前端": [
                { k: CFG.file_menu_on_link, comp: SelectField, label: "访问文件菜单", md: 3,
                    options: { "点击文件名": true, "通过专用按钮": false  }
                },
                { k: CFG.menu_at_top, comp: SelectField, md: 3, label: "菜单面板", options: { "顶部": true, "底部": false } },
                { k: CFG.title, label: "标题", md: 6, helperText: "您可以在浏览器标签页中看到它" },

                { k: CFG.auto_play_seconds, comp: NumberField, xs: 6, sm: 3, min: 1, max: 10000, required: true,
                    label: "自动播放延迟秒数", helperText: md(`[显示界面](${REPO_URL}discussions/270) 的默认值`) },
                { k: CFG.tile_size, comp: NumberField, xs: 6, sm: 3, max: MAX_TILE_SIZE, required: true,
                    label: "默认平铺大小", helperText: wikiLink('Tiles', "启用平铺模式") },
                { k: CFG.theme, comp: SelectField, xs: 6, sm: 3, label: '主题', options: _.map(THEME_OPTIONS, (v, k) => ({ label: ({ auto: '自动', light: '浅色', dark: '深色' } as Dict<string>)[k] ?? k, value: v })) },
                { k: CFG.sort_by, comp: SelectField, xs: 6, sm: 3, label: '排序方式', options: _.map(SORT_BY_OPTIONS, v => ({ value: v, label: ({ name: '名称', extension: '扩展名', size: '大小', time: '修改时间', creation: '创建时间' } as Dict<string>)[v] ?? v })) },

                { k: CFG.invert_order, comp: BoolField, xs: 6, md: 3, label: "反转排序" },
                { k: CFG.folders_first, comp: BoolField, xs: 6, md: 3, label: "文件夹优先" },
                { k: CFG.sort_numerics, comp: BoolField, xs: 6, md: 3, label: "数字名称按数值排序" },
                { k: CFG.title_with_path, comp: BoolField, xs: 6, md: 3, label: "标题包含路径" },
                { k: CFG.favicon, comp: FileField, label: '网站图标', placeholder: "无", fileMask: '*.ico|' + IMAGE_FILEMASK, xs: 12, sm: 6,
                    helperText: "与您的网站关联的图标" },
                { k: CFG.show_uploader, label: "上传者显示给", comp: WhoField, xs: true },
                { k: CFG.page_size, comp: NumberField, xs: true, min: 1, required: true, label: "每页条目数", helperText: "每页显示的条目数" },
            ],
            "上传": [
                { k: CFG.dont_overwrite_uploading, comp: BoolField, md: 4, label: "上传不覆盖",
                    helperText: "文件自动编号（仅前端）" },
                { k : CFG.split_uploads, comp: NumberField, unit: 'MB', md: 2, step: .1, min: .1,
                    fromField: x => x * 1E6, toField: x => x ? x / 1E6 : null,
                    placeholder: "已禁用", label: "分块上传", helperText: "突破代理限制（仅前端）" },
                { k: CFG.delete_unfinished_uploads_after, comp: NumberField, md: 3, min : 0, unit: "秒", label: "删除未完成上传的时间", required: true },
                { k: CFG.min_available_mb, comp: NumberField, md: 3, min : 0, unit: "MB", placeholder: "无",
                    label: "最小可用磁盘空间", helperText: "拒绝不符合要求的上传" },
                { k: CFG.own_upload_delete_hours, comp: NumberField, xs: 12, sm: 6, md: 3, min: 0, unit: "小时", required: true,
                    label: "上传者可以删除其文件的时间", helperText: "设为 0 以禁用" },
            ],
            "其他": [
                { k: CFG.show_hidden_files, comp: BoolField, sm: 3, label: "显示隐藏文件" },
                { k: CFG.descript_ion_encoding, sm: 3, label: "DESCRIPT.ION 文件的编码", comp: SelectField, disabled: values[CFG.comments_storage] === 'attr',
                    options: ['utf8',720,775,819,850,852,862,869,874,808, ..._.range(1250,1257),10029,20866,21866] },
                { k: CFG.comments_storage, comp: SelectField, xs: 12, sm: 6, label: '评论存储', options: {
                        "保存在 DESCRIPT.ION 文件中": '',
                        "保存在文件属性中": 'attr',
                        "保存在文件属性中 + 加载 DESCRIPT.ION": 'attr+ion',
                    } },

                { k: CFG.keep_session_alive, comp: BoolField, sm: 6, md: 6, label: "保持会话活跃", helperText: "在页面保持打开且电脑开机时保持登录状态" },
                { k: CFG.session_duration, comp: NumberField, sm: 3, md: 3, min: 5, unit: "秒", label: "会话时长", required: true },
                { k: CFG.size_1024, label: "KB 大小", comp: SelectField, sm: 3, options: { 1000: false, 1024: true } },

                { k: CFG.open_browser_at_start, comp: BoolField, label: "启动时打开管理面板", xs: 12, sm: 6, md: 3,
                    helperText: "启动 HFS 时自动打开浏览器"
                },
                { k: CFG.zip_calculate_size_for_seconds, comp: NumberField, xs: 12, sm: 6, md: 3, unit: "秒", required: true,
                    label: "计算 ZIP 大小的时间", helperText: "如果时间不足，浏览器将不会显示下载百分比" },
                { k: CFG.mime, comp: ArrayField, label: "自定义 MIME 类型", reorder: true, prepend: true, xs: 12, sm: 12, md: 6,
                    fields: [
                        { k: 'v', label: "MIME 类型", placeholder: "自动", $width: 2, helperText: "留空将自动判断" },
                        { k: 'k', label: "文件掩码", helperText: h(WildcardsSupported), $width: 1, $column: {
                                renderCell: ({ value, id }: any) => h('code', {},
                                    value,
                                    value === '*' && id < _.size(values[CFG.mime]) - 1
                                    && iconTooltip(Warning, md("带有 `*` 的 MIME 应放在最后，因为首先匹配的行生效"), {
                                        color: 'warning.main', ml: 1
                                    }))
                            } },
                    ],
                    toField: x => Object.entries(x || {}).map(([k,v]) => ({ k, v })),
                    fromField: x => Object.fromEntries(x.map((row: any) => [row.k, row.v || 'auto'])),
                    helperText: "大多数 MIME 类型会自动识别",
                },

                { k: CFG.force_webdav_login, comp: WebdavAgentAuthField, sm: true, label: "WebDAV 强制登录",
                    fallbackRE: 'Microsoft-WebDAV', // ms-webdav won't send credentials even with the initial_auth – it must be forced, so we offer it as preset regex if you don't like the *always* value
                    helperText: ["强制登录那些无法正确处理匿名/受保护混合访问的客户端。 ", wikiLink('webdav', "为什么？") ],
                },
                values[CFG.force_webdav_login] !== true && { k: CFG.webdav_initial_auth, comp: WebdavAgentAuthField, sm: 6, label: "WebDAV 首次认证",
                    helperText: "仅强制登录一次。仅在前一选项不匹配时使用",
                },

                { k: CFG.server_code, comp: ArrayField, xs: 12, label: '服务器代码',
                    fields: [
                        { k: 'name', label: '名称', $width: 0.4, $render: ({ value }: any) => value.trim() || h('i', {}, "无名称") },
                        { k: 'code', label: '代码', comp: TextEditorField, lang: 'js', $hideUnder: 'sm',
                            $render: ({ value }: any) => typeof value === 'string' ? h(Html, {}, highlight(value, languages.js, 'js')) : '?',
                            helperText: md(`此代码的工作方式类似于[插件](${REPO_URL}blob/main/dev-plugins.md)（有一些限制）`),
                        }
                    ],
                    toField: v => !v || typeof v !== 'string' ? [] : parseServerCode(v),
                    fromField: stringifyServerCode,
                    applyButton: {
                        onClick: (res: any) => save({ [CFG.server_code]: stringifyServerCode(res) }),
                    },
                },
            ],
        })
    })

    function fieldsForTabs(sections: Dict<(FieldDescriptor | false | null | undefined)[]>) {
        const tabs = Object.entries(sections)
        const groupedFields: FormProps<Dict>['fields'] = []
        for (const [sectionIndex, [, fields]] of tabs.entries()) {
            for (const field of fields) {
                if (!field) {
                    groupedFields.push(field)
                    continue
                }
                fieldTabs[field.k] = sectionIndex
                groupedFields.push({
                    ...field,
                    parentProps: { ...field.parentProps, hidden: sectionIndex !== tab },
                })
            }
        }
        return [
            {
                k: '',
                xs: 12,
                comp: h(Tabs, {
                    value: tab,
                    variant: 'scrollable',
                    scrollButtons: 'auto',
                    onChange(_ev, value) {
                        setTab(value)
                    },
                }, tabs.map(([title]) => h(Tab, { key: title, label: title, sx: { minWidth: 0 } }))),
                parentProps: {
                    ref: tabsSticky,
                    sx: {
                        position: 'sticky',
                        top: { xs: 56, sm: 64, lg: 0 },
                        zIndex: 2,
                        bgcolor: 'background.paper',
                    },
                },
            },
            ...groupedFields,
        ] satisfies FormProps<Dict>['fields']
    }

    function stringifyServerCode(rows: any) {
        return rows.map(({ name='', code='' }, i: number) => i || name ? `${SERVER_CODE_SPLIT}${name}\n${code}\n` : code).join('')
    }

    async function save(moreChanges: Dict = {}) {
        // changes is a Valtio snapshot, so build the payload without mutating it
        const toSave = { ...changes, ...moreChanges }
        if (_.isEmpty(toSave))
            return toast("没有需要保存的内容")
        const loc = window.location
        const keys = [CFG.port, CFG.https_port]
        if (keys.every(k => toSave[k] !== undefined))
            return alertDialog("您不能同时更改 http 和 https 端口。请先更改一个、保存，然后再更改另一个。", 'warning')
        const working = [status?.http?.listening, status?.https?.listening]
        const onHttps = location.protocol === 'https:'
        if (onHttps) {
            keys.reverse()
            working.reverse()
        }
        const newPort = toSave[keys[0]]
        const otherPort = values[keys[1]]
        const otherIsReliable = otherPort > 0 && working[1]
        const otherProtocol = onHttps ? 'http' : 'https'
        if (newPort < 0 && !otherIsReliable)
            return alertDialog("除非您有一个可用的固定端口用于 " + otherProtocol + "，否则无法关闭此端口", 'warning')
        if (newPort === 0 && !otherIsReliable)
            return alertDialog("除非您有一个可用的固定端口用于 " + otherProtocol + "，否则无法随机化此端口", 'warning')
        const goingNewPort = newPort > 0 && newPort != loc.port // == loc.port can happen when listening on a temporary port, and the user just set the same port as new config
        if (goingNewPort && !await confirmDialog("您正在更改端口，可能会断开连接"))
            return
        const certChange = CFG.cert in toSave || CFG.private_key in toSave
        if (onHttps && certChange && !await confirmDialog("您可能会中断 HTTPS 服务，导致自己被踢出"))
            return
        await apiCall('set_config', { values: toSave })
        if (CFG.split_uploads in toSave)
            await alertDialog("用户需要重新加载页面，“分块上传”选项才能生效", 'warning')
        const ip = ipForUrl(loc.hostname)
        const path = loc.pathname + loc.hash
        const redirect = newPort <= 0 ? `${onHttps ? 'http:' : 'https:'}//${ip}:${otherPort}${path}` // jump protocol also in case of random port, because people must know their port while using GUI
            : goingNewPort ? `${loc.protocol}//${ip}:${newPort || values[keys[0]]}${path}`
                : await with_(`https://${ip}:${loc.port}${path}`, httpsUrl => // could we be kicked out because of force_https?
                    !onHttps && (toSave[CFG.force_https] ?? data[CFG.force_https]) && fetch(httpsUrl).then(() => httpsUrl, () => 0)) // only happens if https is working
        if (redirect) {
            await alertDialog("您正在被重定向，但在某些情况下这可能会失败。请稍候！", 'warning')
            return window.location.href = redirect
        }
        const portChange = CFG.port in toSave || CFG.https_port in toSave
        setTimeout(reloadStatus, portChange || certChange ? 1000 : 0) // give some time to apply news
        Object.assign(loaded!, toSave) // since changes are recalculated subscribing state.config, but it depends on 'loaded' to (which cannot be subscribed), be sure to update loaded first
        recalculateChanges()
        execDoneMessage(false, saveBtnRef.current)
    }
}

function recalculateChanges() {
    const o: Dict = {}
    if (state.config)
        for (const [k, v] of Object.entries(state.config))
            if (JSON.stringify(v) !== JSON.stringify(loaded?.[k]))
                o[k] = v
    pageState.changes = o
}

function PortField({ label, value, onChange, setApi, status, suggestedPort=1, error, helperText }: FieldProps<number | null>) {
    const lastCustom = useRef(suggestedPort)
    if (value! > 0)
        lastCustom.current = value!
    const selectValue = Number(value! > 0 ? lastCustom.current : value) || 0
    let errMsg = status?.error
    if (errMsg)
        if (isCertError(errMsg) || isKeyError(errMsg))
            errMsg = undefined // never mind, we'll show this error elsewhere
        else
            error = true
    return h(Box, {},
        h(Box, { sx: { display: 'flex' } },
            h(SelectField as Field<number>, {
                sx: { flexGrow: 1 },
                label,
                error,
                value: selectValue,
                options: [
                    { label: "关闭", value: -1 },
                    { label: "随机", value: 0 },
                    { label: "选择", value: lastCustom.current },
                ],
                onChange,
            }),
            value! > 0 && h(NumberField, {
                label: "端口号",
                fullWidth: false,
                value,
                onChange,
                setApi,
                error,
                min: 1,
                max: 65535,
                helperText,
                sx: { minWidth: '5.5em' }
            }),
        ),
        status && h(FormHelperText, { error },
            status === true ? '...'
                : errMsg ?? (status?.listening && "端口 " + status.port + " 工作正常") )
    )
}

function AllowedReferer({ label, value, onChange, error }: FieldProps<string>) {
    const yesNo = !value || value==='-'
    const example = 'example.com'
    return h(Box, { sx: { display: 'flex' } },
        h(SelectField as Field<string>, {
            label,
            value: yesNo ? value : example,
            options: { "全部允许": '', "全部禁止": '-', "允许部分": example, },
            onChange,
            error,
            sx: yesNo ? undefined : { maxWidth: '11em' },
        }),
        !yesNo && h(StringField, {
            label: "允许的域名",
            value,
            placeholder: 'example.com',
            onChange,
            error,
            helperText: h(WildcardsSupported)
        })
    )
}

function WebdavAgentAuthField({ label, value, onChange, error, helperText, fallbackRE='.*' }: FieldProps<boolean | string>) {
    const [lastRegex, setLastRegex] = useState('')
    const isRE = typeof value === 'string'
    useEffect(() => setLastRegex(isRE ? value : fallbackRE), [value])
    const helperId = useId()
    return h(Box, {},
        h(Box, { sx: { display: 'flex' } },
            h(SelectField as Field<boolean | string>, {
                label, value, onChange, error,
                'aria-describedby': helperId,
                options: { "关闭": false, "总是": true, "正则": lastRegex },
                sx: isRE ? { maxWidth: '9em' } : undefined,
            }),
            isRE && h(StringField, { label: "User-Agent 正则", value, onChange, error }),
        ),
        h(FormHelperText, { id: helperId }, helperText),
    )
}
