// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, ReactNode, useState } from 'react'
import { Box, Card, CardContent, Link } from '@mui/material'
import { apiCall, useApiEx, useApiList } from './api'
import {
    dontBotherWithKeys, onlyTruthy, prefix, REPO_URL, md,
    replaceStringToReact, wait, with_, DAY, HOUR, PREVIOUS_TAG
} from './misc'
import { Btn, Flex, InLink, LinkBtn, wikiLink, } from './mui'
import {
    BrowserUpdated as UpdateIcon, CheckCircle, Colorize, Error, Info, OpenInNew, Restore, Warning
} from '@mui/icons-material'
import { state, useSnapState } from './state'
import { alertDialog, confirmDialog, promptDialog, toast } from './dialog'
import { isCertError, isKeyError, suggestMakingCert } from './OptionsPage'
import _ from 'lodash'
import { subscribeKey } from 'valtio/utils'
import { SwitchThemeBtn } from './theme'
import { CheckboxField } from '@hfs/mui-grid-form'
import { ConfigForm } from './ConfigForm'
import { Release } from '../../src/update'
import { adminApis } from '../../src/adminApis'
import { RandomPlugin } from './RandomPlugin'

export default function HomePage() {
    const SOLUTION_SEP = " — "
    const { username } = useSnapState()
    const { data: status, reload: reloadStatus, element: statusEl } = useApiEx<typeof adminApis.get_status>('get_status')
    const { data: account } = useApiEx<typeof adminApis.get_account>(username && 'get_account')
    const cfg = useApiEx('get_config', { only: ['https_port', 'cert', 'private_key', 'proxies', 'ignore_proxies', 'vfs'] })
    const { list: plugins } = useApiList('get_plugins')
    const [checkPlugins, setCheckPlugins] = useState(false)
    const { list: pluginUpdates} = useApiList(checkPlugins && 'get_plugin_updates')
    const [updates, setUpdates] = useState<undefined | Release[]>()
    const [otherVersions, setOtherVersions] = useState<undefined | Release[]>()
    if (statusEl || !status) // !status here to shut up ts
        return statusEl
    const { http, https } = status
    const goSecure = !http?.listening && https?.listening ? 's' : ''
    const srv = goSecure ? https : (http?.listening && http)
    const href = srv && `http${goSecure}://`+window.location.hostname + (srv.port === (goSecure ? 443 : 80) ? '' : ':'+srv.port)
    const serverErrors = _.mapValues({ http, https }, v =>
        v.busy ? [`端口 ${v.configuredPort} 已被 ${v.busy} 占用${SOLUTION_SEP}请选择`, cfgLink('其他端口'), `，或停止 ${v.busy}`]
            : v.error )
    const errors = serverErrors && onlyTruthy(Object.entries(serverErrors).map(([k,v]) =>
        v && [md(`协议 <u>${k}</u>: `), v,
            (isCertError(v) || isKeyError(v)) && [
                SOLUTION_SEP, h(LinkBtn, {
                    onClick() { suggestMakingCert().then(() => wait(999)).then(cfg.reload).then(reloadStatus) } },
                    "创建一个"
                ), " 或 ", SOLUTION_SEP, cfgLink("提供合适的文件")
            ]]))
    const rightClickToInstallFromUrl = {
        async onContextMenu(ev: any) {
            ev.preventDefault()
            if (!status.updatePossible)
                return alertDialog("您的安装方式不支持自动更新", 'warning')
            const res = await promptDialog("输入要安装的 zip 文件链接")
            if (res)
                await update(res)
        },
        title: status.updatePossible && "如需安装 zip 文件，请右键点击",
    }
    const vfs = cfg.data?.vfs
    return h(Box, {},
        h(RandomPlugin),
        h(Box, { sx: { display:'flex', gap: 2, flexDirection:'column', alignItems: 'flex-start', height: '100%' } },
            dontBotherWithKeys(status.alerts?.map(x => entry('warning', md(x, { html: false }))) || []),
            errors.length ? dontBotherWithKeys(errors.map(msg => entry('error', dontBotherWithKeys(msg))))
                : entry('success', "服务器运行中"),
            vfs && !vfs.children?.length && !vfs.source ? entry('warning', "您没有共享文件", SOLUTION_SEP, fsLink("添加一些")) : null,
            account?.adminActualAccess ? entry('', "欢迎，"+username)
                : entry('', md("您正在 localhost 上访问管理面板，因此无需账户"),
                    ...status.anyAccountCanLoginAdmin ? [] : [SOLUTION_SEP, "要从其他计算机访问，您必须 ", h(InLink, { to:'/accounts' }, md("创建一个具有 *admin* 权限的账户"))] ),
            !href && entry('warning', "前端不可达: ",
                _.map(serverErrors, (v,k) => k + " " + (v ? "出错" : "已关闭")).join(', '),
                !errors.length && [ SOLUTION_SEP, cfgLink("打开 http 或 https") ]
            ),
            with_(status.acmeRenewError, x => x && entry('warning', x)),
            with_(status.blacklistedInstalledPlugins, x => x?.length > 0
                && entry('warning', "发现被列入黑名单的插件: ", x.join(', ')) ),
            with_(plugins?.filter(x => x.error || x.badApi).length, x => x > 0
                && entry('warning', `${x} 个插件运行失败`, SOLUTION_SEP, h(InLink, { to:'/plugins' }, "立即检查"))),
            !cfg.data?.split_uploads && (Date.now() - Number(status.cloudflareDetected || 0)) < DAY
                && entry('', wikiLink('Reverse-proxy#cloudflare', "检测到 Cloudflare，请阅读我们的指南")),
            with_(proxyWarning(cfg.data, status), x => x && entry('warning', x,
                    SOLUTION_SEP, cfgLink("设置代理数量"),
                    SOLUTION_SEP, "除非您确定并且能够 ", h(Btn, {
                        variant: 'outlined',
                        size: 'small',
                        sx: { lineHeight: 'unset' }, // fit in the line, avoiding bad layout
                        confirm: "只有在您清楚自己在做什么时才继续",
                        onClick: () => apiCall('set_config', { values: { ignore_proxies: true } }).then(cfg.reload)
                    }, "忽略此警告"),
                    SOLUTION_SEP, wikiLink('Proxy-warning', "说明")
            )),
            (cfg.data?.proxies > 0 || status?.proxyDetected) && entry('', wikiLink('Reverse-proxy', "阅读我们的代理指南")),
            status.frpDetected && entry('warning', `检测到 FRP。在 HFS 中不应使用 "type = tcp"。可能的解决方案：`,
                h('ol',{},
                    h('li',{}, `将 FRP 配置为 type=http（最佳方案）`),
                    h('li',{}, md(`将 FRP 配置为<u>不</u>通过 localhost 连接 HFS（安全，但您将看不到用户的 IP）`)),
                    h('li',{}, `在 HFS 中禁用 "localhost 的管理员访问"（安全，但您将看不到用户的 IP）`),
                )),
            entry('', md("这是 *管理面板*，您可以在这里管理服务器。在 [前端](../..) 访问您的文件。")),
            entry('', wikiLink('', "查看文档"), " 并 ", h(Link, { target: 'support', href: REPO_URL + 'discussions' }, "获取支持")),
            !updates && with_(status.autoCheckUpdateResult, x =>
                x?.isNewer && h(Update, { info: x, fromAuto: true, bodyCollapsed: true, title: "发现新版本" }) ),
            pluginUpdates.length > 0 && entry('success', "有可用的插件更新: " + pluginUpdates.map(p => p.id).join(', ')),
            h(ConfigForm, {
                // MUI 7 folded Grid2 into Grid, so the generated class name changed with the import path.
                gridProps: { sx: { mt: 1, display: 'flex', columnGap: 1, alignitems: 'center', '&>div.MuiGrid-root': { width: 'auto', px: .5, py: 0 }, '.MuiCheckbox-root': { pl: '2px' } } },
                saveOnChange: true,
                form: {
                    fields: [
                        status.updatePossible === 'local' ? h(Btn, { icon: UpdateIcon, onClick: () => update() }, "从本地文件更新")
                            : !updates && h(Btn, {
                                icon: UpdateIcon,
                                onClick() {
                                    apiCall('wait_project_info').then(reloadStatus)
                                    setCheckPlugins(true) // this only happens once, actually (until you change page)
                                    return apiCall<typeof adminApis.check_update>('check_update').then(x => setUpdates(x.options), alertDialog)
                                },
                                ...rightClickToInstallFromUrl
                            }, "检查更新"),
                        { k: 'auto_check_update', comp: CheckboxField, label: "每天自动检查更新" },
                        { k: 'update_to_beta', comp: CheckboxField, label: "包含测试版" },
                    ]
                }
            }),
            updates && with_(_.find(updates, 'isNewer'), newer =>
                !updates.length || !status.updatePossible && !newer ? entry('', "没有可用更新")
                    : newer && !status.updatePossible ? entry('success', `发现新版本 ${newer.name}`)
                        : h(Flex, { vert: true },
                            updates.map((x: any) => h(Update, { info: x, key: x.name })) ),
            ),
            h(Flex, { flexWrap: 'wrap' },
                !otherVersions && status.updatePossible && status.previousVersionAvailable
                    && h(Btn, { icon: Restore, onClick: () => update(PREVIOUS_TAG) }, "重新安装上一个版本"),
                !status.updatePossible ? entry('', h(Link, { href: REPO_URL + 'releases/', target: 'repo' }, "所有版本"))
                    : !otherVersions ? h(Btn, { icon: Colorize, onClick: getOtherVersions, ...rightClickToInstallFromUrl }, "获取其他版本")
                        : h(Flex, { vert: true }, otherVersions.map((x: any) => h(Update, {
                            info: x,
                            key: x.name,
                            bodyCollapsed: true
                        }))),
            ),
            h(SwitchThemeBtn),
            Date.now() - Number(new Date(status.started)) > HOUR && h(Link, {
                title: "捐赠",
                target: 'donate',
                style: { textDecoration: 'none', position: 'fixed', bottom: 0, right: 4, fontSize: 'large' },
                href: 'https://www.paypal.com/donate/?hosted_button_id=HC8MB4GRVU5T2'
            }, '❤️')
        )
    )

    async function getOtherVersions() {
        return apiCall<typeof adminApis.get_other_versions>('get_other_versions')
            .then(x => setOtherVersions(x.options), alertDialog)
    }
}

function Update({ info, title, bodyCollapsed, fromAuto }: { title?: ReactNode, info: Release, bodyCollapsed?: boolean, fromAuto?: true }) {
    const [collapsed, setCollapsed] = useState(bodyCollapsed)
    return h(Flex, { alignItems: 'flex-start', flexWrap: 'wrap' },
        h(Card, { className: 'release' }, h(CardContent, {},
            h(Flex, {},
                title && h(Box, { sx: { fontSize: 'larger', mb: 1 } }, title),
                h(Btn, {
                    icon: UpdateIcon,
                    ...!info.isNewer && info.prerelease && { color: 'warning', variant: 'outlined' },
                    onClick: () => update(fromAuto ? undefined : info.tag_name) // in case of autoCheck, don't specify the tag_name, as it may have been retired in the meantime (in favor of a newer one)
                }, prefix("安装 ", info.name, info.isNewer ? '' : "（旧版）")),
                h(Link, { href: REPO_URL + 'releases/tag/' + info.tag_name, target: 'repo' }, h(OpenInNew)),
            ),
            collapsed ? h(LinkBtn, { sx: { display: 'block', mt: 1 }, onClick(){ setCollapsed(false) } }, "查看详情")
                : h(Box, { sx: { mt: 1 } }, renderChangelog(info.body))
        )),
    )
}

function renderChangelog(s: string) {
    return md(s, {
        onText: s => replaceStringToReact(s, /(?<=^|\W)#(\d+)\b|(https:.*\S+)/g, m =>  // link issues and urls
            m[1] ? h(Link, { href: REPO_URL + 'issues/' + m[1], target: '_blank' }, h(OpenInNew, { fontSize: 'small' }) )
                : h(Link, { href: m[2], target: '_blank' }, m[2] )
        )
    })
}

async function update(tag?: string) {
    if (!await confirmDialog("安装通常不到一分钟，具体取决于服务器速度")) return
    toast('正在下载')
    const err = await apiCall('update', { tag }, { timeout: 600 /*download can be lengthy*/ })
        .then(() => 0, e => e)
    if (err)
        return alertDialog(err)
    toast("正在重启")
    const restarting = Date.now()
    let warning: undefined | ReturnType<typeof alertDialog>
    while (await apiCall('NONE').then(() => 0, e => !e.code)) { // while we get no response
        if (!warning && Date.now() - restarting > 15_000)
            warning = alertDialog("耗时过长，请检查您的服务器", 'warning')
        await wait(500)
    }
    warning?.close()
    // the server is back on, SSE is restored and login dialog may appear, unwanted because we are just waiting to reload
    subscribeKey(state, 'loginRequired', () => state.loginRequired = false)
    await alertDialog("流程完成", 'success')
    window.location.reload() // show new gui
}

type Color = '' | 'success' | 'warning' | 'error'

function entry(color: Color, ...content: ReactNode[]) {
    return h(Box, {
            sx: { fontSize: 'x-large', color: th => color && th.palette[color]?.main },
        },
        h(({ success: CheckCircle, info: Info, '': Info, warning: Warning, error: Error })[color], {
            sx: { mr: 1, color: color ? undefined : 'primary.main' }
        }),
        h('span', { style: ['warning', 'error'].includes(color) ? { animation: '.5s blink 2' } : undefined },
            ...content)
    )
}

function fsLink(text=`文件系统页面`) {
    return h(InLink, { to:'/fs' }, text)
}

function cfgLink(text=`选项页面`) {
    return h(InLink, { to: '/options' }, text)
}

export function proxyWarning(cfg: any, status: any) {
    return status && cfg && !cfg.ignore_proxies && (!cfg.proxies && status.proxyDetected ? "检测到代理，但未配置任何代理"
        : cfg.proxies && !status.proxyDetected && (Date.now() - +new Date(status.started) > DAY) ? `代理数量设置为 ${cfg.proxies}，但近期未检测到代理。建议将其设置为零`
        : '')
}
