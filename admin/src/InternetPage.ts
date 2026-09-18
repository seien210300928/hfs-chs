import { createElement as h, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
    Alert, Box, Button, Card, CardContent, CircularProgress, Divider, LinearProgress, Link, Typography, Skeleton,
} from '@mui/material'
import { CardMembership, Check, Dns, HomeWorkTwoTone, Lock, Public, PublicTwoTone, RouterTwoTone, Send, Storage,
    Error as ErrorIcon, SvgIconComponent, Search } from '@mui/icons-material'
import { apiCall, useApiEvents, useApiEx } from './api'
import {
    closeDialog, formatTimestamp, wait, wantArray, with_, PORT_DISABLED, isIP, CFG, md,
    useRequestRender, replace, restartAnimation, prefix, isIpLan, HIDE_IN_TESTS
} from './misc'
import { Flex, LinkBtn, Btn, Country, wikiLink, NetmaskField } from './mui'
import { alertDialog, confirmDialog, formDialog, promptDialog, toast, waitDialog } from './dialog'
import { BoolField, Form, MultiSelectField, NumberField, SelectField } from '@hfs/mui-grid-form'
import { suggestMakingCert } from './cert'
import { changeBaseUrl } from './baseUrl'
import { adminApis } from '../../src/adminApis'
import { ALL, WITH_IP } from './countries'
import _ from 'lodash'
import { SvgIconProps } from '@mui/material/SvgIcon'
import { ConfigForm } from './ConfigForm'
import { DynamicDnsResult } from '../../src/ddns'
import { ArrayField } from './ArrayField'
import VfsPathField from './VfsPathField'
import { PageProps } from './App'

const COUNTRIES = ALL.filter(x => WITH_IP.includes(x.code))

const PORT_FORWARD_URL = 'https://portforward.com/'
const HIGHER_PORT = 1080
const MSG_ISP = h('div', {}, "HFS 在互联网上可能无法访问。 ", wikiLink('Work-on-the-internet#double-nat', "了解更多"))

export default function InternetPage({ setTitleSide }: PageProps) {
    const [checkResult, setCheckResult] = useState<boolean | undefined>()
    const [checking, setChecking] = useState(false)
    const [mapping, setMapping] = useState(false)
    const status = useApiEx('get_status')
    const config = useApiEx('get_config', { only: [CFG.base_url] })
    const baseUrl = config.data?.[CFG.base_url]
    const localColor = with_([status.data?.http?.error, status.data?.https?.error], ([h, s]) =>
        h && s ? 'error' : h || s ? 'warning' : 'success')
    const nat = useApiEx<typeof adminApis.get_nat>('get_nat', {}, { timeout: 20 })
    const { data: publicIps, error: publicIpsError } = useApiEx<typeof adminApis.get_public_ips>('get_public_ips', {}, { timeout: 20 })
    const { data } = nat
    const port = data?.internalPort
    const wrongMap = data?.mapped && data.mapped.private.port !== port && data.mapped.private.port
    const doubleNat = data?.externalIp && publicIps && !publicIps.includes(data.externalIp)
    const verifyAgain = useRequestRender()
    useEffect(() => {
        if (verifyAgain.state) // skip first
            void verify(true)
    }, [verifyAgain.state])
    setTitleSide(useMemo(() =>
        h(Alert, { severity: 'info', sx: { display: { xs: 'none', sm: 'inherit' }  } }, "此页面用于确保您的网站在互联网上正常工作"),
        []))
    return h(Flex, { vert: true, gap: '2em' },
        h(Box, { sx: { maxWidth: '40em' } }, networkBox()),
        h(Flex, { gap: '2em', flexWrap: 'wrap', maxWidth: '84em', '&>*': { maxWidth: '40em', width: { md: '40em' } }, alignItems: 'flex-start', justifyContent: 'space-between' },
            baseUrlBox(),
            httpsBox(),
            geoBox(),
            ddnsBox(),
    ))

    function stripTags(html: string) {
        return html.replace(/.+<body>(.+)<\/body>.+/is, (all,x) => x || all) // extract body, if any
            .replace(/<[^>]+>/g, ' ')
    }

    function ddnsBox() {
        const { data } = useApiEvents<DynamicDnsResult>('get_dynamic_dns_error')
        const ref = useRef<any>()
        useEffect(() => ref.current && restartAnimation(ref.current, '1s blink'), [data]);
        return h(TitleCard, { icon: Dns, title: "动态 DNS 更新器" },
            data && h(Flex, {},
                data.error ? h(ErrorIcon, { color: 'error', ref }) : h(Check, { color: 'success', ref }),
                formatTimestamp(data.ts), ' – ',
                prefix("错误：", stripTags(data.error)).slice(0, 500) || "更新成功",
            ),
            "此工具可以让您的域名随时更新为最新 IP 地址。并非所有服务都兼容，而且大多数服务都有自己专门用于此用途的软件，效果更好；如果您愿意，我们提供这个轻量级方案。",
            h(ConfigForm<{
                [CFG.dynamic_dns_url]: string,
            }>, {
                form: (v, { setValues }) => ({
                    fields: [
                        h(Flex, {},
                            _.map({
                                NoIP: {
                                    url: 'https://$username:$password@dynupdate.no-ip.com/nic/update?hostname=$domain',
                                    fields: [{ k: 'username', label: '用户名' }, { k: 'password', label: '密码' }, { k: 'domain', label: '域名' }],
                                },
                                DuckDNS: {
                                    url: 'https://www.duckdns.org/update/$domain/$token>OK',
                                    fields: [{ k: 'domain', label: '域名', helperText: "不要包含 .duckdns.org 部分" }, { k: 'token', label: '令牌' }],
                                }
                            }, ({ url, fields }, label) =>
                                h(Btn, {
                                    key: url,
                                    onClick: () => formDialog({
                                        title: label + " 向导",
                                        form: {
                                            sx: { maxWidth: '20em' },
                                            before: h(Box, { sx: { mb: 1 } }, "以下信息将以未加密方式存储"),
                                            fields: fields.map(k => _.isString(k) ? { k } : k)
                                        }
                                    }).then(symbols => symbols && setValues({ [CFG.dynamic_dns_url]: replace(url, symbols as any, '$') }))
                                }, label + " 向导")
                            )
                        ),
                        { k: CFG.dynamic_dns_url, label: "更新器 URL", multiline: true,
                            helperText: "请咨询您的 DNS 服务提供商，了解哪些 URL 可以自动保持您的域名更新。支持的符号有 $IP4、$IP6、$IPX。可选地，您可以追加“>”后跟一个正则表达式来确定成功的响应，否则将使用状态码。"
                        },
                    ]
                })
            })
        )
    }

    function geoBox() {
        const countryOptions = useMemo(() => COUNTRIES.map(x => ({ value: x.code, label: x.name })), [COUNTRIES])
        return h(TitleCard, { title: "地理 IP", icon: Public },
            h(ConfigForm<{
                [CFG.geo_enable]: boolean
                [CFG.geo_allow]: null | boolean
                [CFG.geo_list]: string[]
                [CFG.geo_allow_unknown]: boolean
                [CFG.geo_ignore_net]: string
            }>, {
                keys: [ CFG.geo_enable, CFG.geo_allow, CFG.geo_list, CFG.geo_allow_unknown, CFG.geo_ignore_net ],
                form: values => ({ fields: [
                    { k: CFG.geo_enable, comp: BoolField, label: "启用", helperText: md("每月将下载必要数据库（2MB）。该服务由 [IP2Location](https://www.ip2location.com) 提供。") },
                    ...!values?.[CFG.geo_enable] ? [] : [
                        {
                            k: CFG.geo_allow,
                            comp: SelectField,
                            label: "规则",
                            options: { "无限制": null, "屏蔽所选国家": false, "允许所选国家": true },
                        },
                        values[CFG.geo_allow] != null && {
                            k: CFG.geo_list,
                            comp: MultiSelectField<string>,
                            label: `所选国家（${values[CFG.geo_list]?.length || 0}）`,
                            valueSeparator: false,
                            placeholder: "无",
                            options: countryOptions,
                            renderOption: (v: any) => h(Country, { code: v.value, long: true }),
                            clearable: true,
                            getError: (v: any) => values[CFG.geo_allow] && !v?.length && "不能为空",
                        },
                        values[CFG.geo_allow] != null && {
                            k: CFG.geo_allow_unknown,
                            comp: SelectField,
                            label: "当无法确定国家时",
                            helperText: "本地 IP 将被忽略",
                            options: { 允许: true, 阻止: false },
                            sm: 6,
                        },
                        {
                            k: CFG.geo_ignore_net,
                            comp: NetmaskField,
                            label: "忽略 IP 地址",
                            placeholder: "无",
                            helperText: "绕过地理位置过滤",
                            sm: 6,
                        },
                    ]
                ] }),
                addToBar: [
                    h(Box, { sx: { flex: 1 } }),
                    h(Btn, { icon: Search, onClick: lookup }, "查询 IP")
                ],
            })
        )
    }

    async function lookup() {
        const ip = await promptDialog("查询 IP")
        if (!ip) return
        const { country } = await apiCall('geo_ip', { ip })
        if (!country)
            return alertDialog("未找到 IP", 'error')
        return alertDialog(h(Country, { code: country, long: true }), 'success')
    }

    function httpsBox() {
        const [values, setValues] = useState<any>()
        const cert = useApiEx('get_cert')
        useEffect(() => { apiCall('get_config', { only: ['acme_domain', 'acme_renew'] }).then(setValues) } , [])
        const [saving, setSaving] = useState(false)
        if (!values) return h(CircularProgress)
        const { https } = status.data ||{}
        const disabled = https?.port === PORT_DISABLED
        const error = https?.error
        return status.element || h(TitleCard, { title: "HTTPS", icon: Lock, color: https?.listening && !error ? 'success' : 'warning' },
            error ? h(Alert, { severity: 'warning' }, error) :
                (disabled && h(LinkBtn, { onClick: notEnabled }, "未启用")),
            cert.element || with_(cert.data, c => c.none ? h(LinkBtn, { onClick: noCertClick }, "未配置证书") : h(Box, {},
                h(CardMembership, { fontSize: 'small', sx: { mr: 1, verticalAlign: 'middle' } }), "当前证书",
                h('ul', {},
                    h('li', {}, "域名：", c.altNames?.join(' + ') ||'-'),
                    h('li', {}, "颁发者：", c.issuer?.O || h('i', {}, '自签名')),
                    h('li', {}, "有效期：", ['validFrom', 'validTo'].map(k => formatTimestamp(c[k])).join(' – ')),
                )
            )),
            h(Divider),
            h(Form, {
                sx: { gap: 1 },
                gridProps: {rowSpacing:1},
                values,
                set(v, k) {
                    setValues((was: any) => {
                        const values = { ...was, [k]: v }
                        setSaving(true)
                        apiCall('set_config', { values }).finally(() => setSaving(false))
                        return values
                    })
                },
                fields: [
                    md("使用 [Let's Encrypt](https://letsencrypt.org) 生成证书"),
                    {
                        k: 'acme_domain',
                        label: "证书域名",
                        sm: values.acme_domain?.length > 30 ? 12 : 6,
                        required: true,
                        multiline: true,
                        fromField: x => x.replaceAll('\n', ','),
                        toField: x => x.replaceAll(',', '\n'),
                        helperText: md("示例：your.domain.com\n多个域名请分行填写")
                    },
                    values.acme_domain?.split(',').some(isIP) && h(Alert, { severity: 'info' },
                        "IP 地址需要 Let's Encrypt 的短期配置文件：整个证书将持续 160 小时，必须自动续期"),
                    {
                        k: 'acme_renew',
                        label: "到期前自动续期",
                        comp: BoolField,
                        disabled: !values.acme_domain
                    },
                    with_(status.data.acmeRenewError, x => x && h(Alert, { severity: 'error' }, x)),
                ],
                save: {
                    children: "申请",
                    disabled: !cert.data,
                    startIcon: h(Send),
                    ...saving && { loading: true },
                    async onClick() {
                        const [domain, ...altNames] = values.acme_domain.split(',')
                        const validTo = Number(new Date(cert.data.validTo))
                        const renewBefore = (validTo - Number(new Date(cert.data.validFrom))) / 3
                        const fresh = cert.data.altNames?.includes(domain)
                            && validTo - Date.now() >= renewBefore
                        if (fresh && !await confirmDialog("您的证书仍然有效", { trueText: "仍然重新申请" }))
                            return
                        if (!await confirmDialog("HFS 必须临时在公共端口 80 上提供 HTTP 服务，并且您的路由器必须已配置，否则此操作将失败")) return
                        if (await stopOnCheckDomain(domain)) return
                        await apiCall('make_cert', { domain, altNames }, { timeout: 20_000 })
                            .then(async () => {
                                await alertDialog("证书已创建", 'success')
                                if (disabled)
                                    await notEnabled()
                                cert.reload()
                            }, alertDialog)
                            .finally(status.reload)
                    }
                },
            })
        )

        async function noCertClick() {
            await suggestMakingCert()
            cert.reload()
            status.reload()
        }
    }

    async function notEnabled() {
        if (!await confirmDialog("HTTPS 当前已禁用。\n完整配置可在“选项”页面中进行。", { trueText: "启用"})) return
        const stop = waitDialog()
        try {
            await apiCall('set_config', { values: { https_port: 443 } })
            await wait(1000)
            status.reload()
        }
        finally { stop() }
    }

    function baseUrlBox() {
        return config.element || h(TitleCard, { icon: Public, title: "地址" },
            h(Flex, { flexWrap: 'wrap' },
                "主地址：",
                baseUrl ? h('tt', {}, baseUrl) : "自动，未配置",
                h(Btn, {
                    size: 'small',
                    variant: 'outlined',
                    'aria-label': "更改地址",
                    onClick: () => void changeBaseUrl().then(config.reload)
                }, "更改"),
            ),
            h(Divider),
            h(ConfigForm<{ roots: any, force_address: boolean }>, {
                saveOnChange: true,
                onSave() {
                    status.reload() // this config is affecting status data
                },
                form: {
                    fields: [
                        {
                            k: CFG.roots,
                            label: "域名根目录",
                            helperText: "您可以为不同的域名指定不同的主文件夹（在 VFS 中），有点像虚拟主机。如果没有匹配的域名，将使用默认主页。",
                            comp: ArrayField,
                            fields: [
                                { k: 'host', label: "域名/主机", helperText: "支持通配符：*.domain.com|other.com",
                                    getError: (v?: string) => v?.includes('/') && "这里不能填写 URL 或路径！" },
                                { k: 'root', label: "主页/根目录", comp: VfsPathField, files: false, placeholder: "默认", helperText: "VFS 中的根路径",
                                    $column: { renderCell({ value }: any) { return value || h('i', {}, '默认') } } },
                            ],
                            toField: x => Object.entries(x || {}).map(([host,root]) => ({ host, root })),
                            fromField: x => Object.fromEntries(x.map((row: any) => [row.host, row.root || ''])),
                        },
                        {
                            k: CFG.force_address,
                            label: "仅接受使用上述域名（和 localhost）的请求",
                            comp: BoolField,
                        }
                    ]
                },
            })
        )
    }

    function networkBox() {
        if (nat.error) return nat.element
        const direct = publicIps?.includes(data?.localIp!)
        return h(Flex, { justifyContent: 'space-around' },
            h(Device, { name: "服务器", icon: direct ? Storage : HomeWorkTwoTone, color: localColor, ip: data?.localIp,
                below: port && h(Box, { className: 'port ' + HIDE_IN_TESTS }, "端口 ", port),
            }),
            !direct && h(DataLine),
            !direct && h(Device, {
                name: "路由器", icon: RouterTwoTone, ip: data?.gatewayIp,
                color: checkResult ? 'success' : data?.mapped && (wrongMap ? 'warning' : 'success'),
                below: mapping ? h(LinearProgress, { sx: { height: '1em' } })
                    : data && (
                        checkResult && !data.mapped ? `端口 ${data.externalPort || data.internalPort}`
                            : h(LinkBtn, { sx: { display: 'block' }, onClick: configure },
                                "端口 ", wrongMap ? "错误" : data?.externalPort || (checkResult ? "已验证" : "未知"))
                    ),
            }),
            h(DataLine),
            h(Device, { name: "互联网", icon: PublicTwoTone, ip: publicIpsError ? [] : publicIps,
                color: checkResult ? 'success' : checkResult === false ? 'error' : doubleNat ? 'warning' : undefined,
                below: publicIpsError ? String(publicIpsError)
                    : checking ? h(LinearProgress, { sx: { height: '1em' } }) : publicIps && h(Box, { className: HIDE_IN_TESTS },
                    doubleNat && h(LinkBtn, { sx: { display: 'block' }, onClick: () => alertDialog(MSG_ISP, 'warning') }, "双重 NAT"),
                    checkResult ? "工作正常！" : checkResult === false ? "失败！" : '',
                    ' ',
                    (baseUrl > '' || publicIps?.length > 0) && data?.internalPort && h(LinkBtn, { onClick: () => verify() }, "验证")
                        || ' ' // steadier layout, mainly for testing
                )
            }),
        )
    }

    async function stopOnCheckDomain(domain: string) {
        return domain && false === await apiCall('check_domain', { domain }).catch(e =>
            confirmDialog(String(e), { trueText: "仍然继续", falseText: "停止" }))
    }

    async function verify(again=false): Promise<any> {
        await nat.loading
        const data = nat.getData() // fresh data
        if (!data) return
        setCheckResult(undefined)
        if (!again && !await confirmDialog("此测试将检查您的服务器在互联网上是否正常工作")) return
        setChecking(true)
        try {
            const hostname = baseUrl && new URL(baseUrl).hostname
            const checkUrl = !isIpLan(hostname) && baseUrl
            if (!isIP(hostname) && await stopOnCheckDomain(hostname)) return
            const urlResult = checkUrl && await apiCall('self_check', { url: checkUrl }).catch(e =>
                alertDialog(!e.code ? e : "抱歉，此功能目前不可用。请稍后重试。", 'error'))
            if (checkUrl && !urlResult)
                return
            if (urlResult?.success) {
                setCheckResult(true)
                return alertDialog(h(Box, {}, "您的服务器在互联网上响应正常：",
                    h('ul', {}, h('li', {}, urlResult.url))), 'success')
            }
            if (urlResult?.success === false)
                await alertDialog(md(`您配置的地址 ${checkUrl} 似乎无法工作 😰\n我们仍将测试您的 IP 地址 🤞`), 'warning')
            const res = await apiCall('self_check', {})
            if (res.some((x: any) => x.success)) {
                setCheckResult(true)
                const mild = urlResult?.success === false && md(`您的服务器在互联网上响应正常 👍\n但配置的地址 ${checkUrl} 无法工作 👎\n仅通过您的 IP 响应：`)
                return alertDialog(h(Box, {}, mild || "您的服务器在互联网上响应正常：",
                    h('ul', {}, ...res.map((x: any) => h('li', {}, x.url)))), mild ? 'warning' : 'success')
            }
            setCheckResult(false)
            if (wrongMap)
                return fixPort().then(verifyAgain)
            if (doubleNat)
                return alertDialog(MSG_ISP, 'warning')
            const msg = "我们无法从互联网访问您的服务器。 "
            if (data.upnp && !data!.mapped)
                return confirmDialog(msg + "请在路由器上尝试端口转发", { trueText: "修复" }).then(async go => {
                    if (!go) return
                    try { await mapPort(data!.internalPort!, '', '') }
                    catch { await mapPort(HIGHER_PORT, '') }
                    toast("端口已转发，现在重新验证", 'success')
                    verifyAgain()
                })
            const cfg = await apiCall('get_config', { only: [CFG.geo_enable, CFG.geo_allow] })
            const { close } = alertDialog(h(Box, {}, msg + "可能的原因：", h('ul', {},
                cfg[CFG.geo_enable] && cfg[CFG.geo_allow] != null && h('li', {}, "您可能屏蔽了执行测试所在的国家"),
                !data.upnp && h('li', {}, "您的路由器可能需要配置。 ", h(Link, { href: PORT_FORWARD_URL, target: 'help' }, "怎么做？")),
                h('li', {}, "可能存在防火墙，请尝试配置或禁用。"),
                (data.externalPort || data.internalPort!) <= 1024 && h('li', {},
                    "您的网络服务提供商可能屏蔽了 1024 以下的端口。 ",
                    data.upnp && h(Button, {
                        size: 'small',
                        onClick() {
                            close()
                            mapPort(HIGHER_PORT).then(verifyAgain)
                        }
                    }, "尝试 " + HIGHER_PORT)),
                data.mapped && h('li', {}, "您的调制解调器/路由器可能存在故障，请尝试重启。"),
                h('li', {}, h('div', {}, "Your Internet Provider may not assign you a public IP address. ", wikiLink('Work-on-the-internet#double-nat', "了解更多"))),
            )), 'warning')
        }
        catch(e: any) {
            alertDialog(e)
        }
        finally {
            setChecking(false)
        }
    }

    async function configure() {
        if (!data) return // shut up ts
        if (wrongMap)
            return await confirmDialog(`存在端口转发，但它指向了错误的端口（${wrongMap}）`, { trueText: "修复" })
                && fixPort()
        if (!data.upnp)
            return alertDialog(h(Box, { sx: { lineHeight: 1.5 } }, md(`由于 UPnP 不可用，我们无法帮您配置路由器。\n[在此网站](${PORT_FORWARD_URL}) 查找更多帮助。`)), 'info')
        const msg = `要让 HFS 在互联网上工作，您需要在调制解调器/路由器上将一个端口转发到此电脑的端口 ${port}。\n\n`
            + (data?.mapped ? '' : `在尝试以下操作之前，您可能需要先确认这一点。\n\n`)
            + `这将请求路由器转发一个端口。\n您可以使用与本地网络端口相同的编号（${port}），或使用不同的编号。`
        const res = await promptDialog(md(msg), {
            value: data.externalPort || port,
            field: { label: "从互联网看到的端口", comp: NumberField },
            addToBar: data.mapped && [h(Button, { color: 'warning', onClick: remove }, "移除")],
            dialogProps: { sx: { maxWidth: '20em' } },
        })
        if (res)
            await mapPort(Number(res), "端口已转发").catch(() => {})

        function remove() {
            closeDialog()
            mapPort(0, "端口已移除")
        }
    }

    function fixPort() {
        if (!data?.externalPort) return alertDialog("未找到 externalPort", 'error')
        return mapPort(data.externalPort, "转发已纠正")
    }

    async function mapPort(external: number, msg='', errMsg="操作失败") {
        setMapping(true)
        try {
            await apiCall('map_port', { external })
            nat.reload()
            if (msg) toast(msg, 'success')
            setCheckResult(undefined) // things have changed, invalidate check result
        }
        catch(e: any) {
            if (errMsg) {
                const low = (external || data!.internalPort!) < 1024
                const msg = errMsg + prefix(': ', e?.message) + (low ? "。某些路由器拒绝使用 1024 以下的端口。" : '')
                await alertDialog(msg, 'error')
            }
            throw e
        }
        finally {
            setMapping(false)
        }
    }
}

function DataLine() {
    return h(Box, { sx: { flex: 1 }, className: 'animated-dashed-line' })
}

function Device({ name, icon, color, ip, below }: any) {
    const fontSize = 'min(20vw, 10vh)'
    const ips = wantArray(ip)
    const onlyV4 = ips.every(x => typeof x === 'string' && isIP(x) && !x.includes(':'))
    return h(Box, { sx: { display: 'inline-block', textAlign: 'center' } },
        h(icon, { color, sx: { fontSize, mb: '-0.1em' } }),
        h(Box, { sx: { fontSize: 'larger' } }, name),
        ip === undefined ? h(Skeleton) : h(Box, { sx: { fontSize: 'smaller', whiteSpace: onlyV4 ? 'pre' : 'pre-wrap' }, className: 'ip ' + HIDE_IN_TESTS }, ips.join('\n') || "未知"),
        below ? h(Box, { sx: { fontSize: 'smaller' } }, below) : h(Skeleton),
    )
}

function TitleCard({ title, icon, color, children }: { title: ReactNode, icon?: SvgIconComponent, color?: SvgIconProps['color'], children?: ReactNode }) {
    return h(Card, {}, h(CardContent, {}, h(Flex, { vert: true },
        h(Typography, { variant: 'h3', sx: { fontSize: 'x-large' } }, icon && h(icon, { color, sx: { mr: 1, mb: '2px' } }), title),
        children
    )))
}

