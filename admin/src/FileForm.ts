// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { markVfsModified, prepareVfsUndo, state, useSnapState } from './state'
import { createElement as h, forwardRef, memo, ReactElement, ReactNode, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Collapse, FormHelperText, Link, MenuItem, MenuList, useTheme } from '@mui/material'
import {
    BoolField, DisplayField, Field, FieldProps, Form, MultiSelectField, NumberField, SelectField, StringField
} from '@hfs/mui-grid-form'
import { apiCall, UseApi, useApiEx } from './api'
import {
    basename, defaultPerms, formatBytes, formatTimestamp, isWhoObject, newDialog, useRequestRender, try_, pathEncode,
    onlyTruthy, prefix, VfsPerms, wantArray, WhoVfs, WhoObject, matches, xlate, md, Callback, copyTextToClipboard,
    splitAt, IMAGE_FILEMASK, CFG, MASK_IN_TESTS, WHO_ANY_ACCOUNT, WHO_ADMIN, WHO_NO_ONE, WHO_ANYONE, stringBefore,
    ipForUrl
} from './misc'
import { isModifiedConfig } from './AccountForm'
import { Btn, Flex, IconBtn, LinkBtn, propsForModifiedValues, useBreakpoint, wikiLink } from './mui'
import { deleteVfs, getInheritedPerms, id2vfsNode, reindexVfs, VfsNodeAdmin } from './VfsPage'
import _ from 'lodash'
import FileField from './FileField'
import { alertDialog, toast, useDialogBarColors } from './dialog'
import yaml from 'yaml'
import {
    Check, ContentCopy, ContentCut, ContentPaste, Delete, Edit, QrCode2, Save, RestartAlt
} from '@mui/icons-material'
import { moveVfs } from './VfsTree'
import QrCreator from 'qr-creator'
import { AddVfsBtn } from './VfsMenuBar'
import { SYS_ICONS } from '@hfs/frontend/src/sysIcons'
import { TextEditorField } from './TextEditor'
import { account2icon } from './AccountsPage'
import apiAccounts from '../../src/api.accounts'

const ACCEPT_LINK = "https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept"

interface FileFormProps {
    file: VfsNodeAdmin
    addToBar?: ReactNode
    statusApi: UseApi
    accountsApi: AccountsApi
    saved: Callback
    isSideBreakpoint: boolean
}
export default function FileForm({ file, addToBar, statusApi, accountsApi, saved, isSideBreakpoint }: FileFormProps) {
    const { parent, children, isRoot, byMasks, ...rest } = file
    const [values, setValues] = useState(rest)
    useEffect(() => {
        setValues(Object.assign(_.mapValues(defaultPerms, () => null), rest))
    }, [file]) //eslint-disable-line

    const inheritedDefault = useMemo(() => {
        let p = file.parent
        while (p) {
            if (p.default != null)
                return p.default
            p = p.parent
        }
    }, [file])
    const { source } = file
    const isDir = file.type === 'folder'
    const isUnknown = !file.type && source && file.size! < 0 // the type is lost
    const isLink = values.url !== undefined
    const hasSource = source !== undefined // we need a boolean
    const realFolder = hasSource && isDir
    const xl = useBreakpoint('xl')
    const showTimestamps = !isLink && (xl || hasSource)
    const showSize = !isLink && xl || (hasSource && !realFolder)
    const showAccept = file.accept! > '' || isDir && (file.can_upload ?? file.inherited?.can_upload)
    const showWebsite = isDir
    const barColors = useDialogBarColors()
    const { movingFile } = useSnapState()

    const needSourceWarning = !hasSource && h(Box as any, { sx: { color: 'warning.main' }, component: 'span' }, "仅对具有磁盘源的文件夹生效！ ")
    const show: Record<keyof VfsPerms, boolean> = {
        can_read: !isLink,
        can_see: true,
        can_archive: !isLink,
        can_list: isDir,
        can_upload: isDir,
        can_delete: isDir,
    }
    const defaultIcon = !values.icon
    const embeddedIcon = values.icon && !values.icon.includes('.')
    const nameFromSource = source && basename(source)
    const nameIsDerivedFromSource = nameFromSource === values.name
    return h(Form, {
        values,
        set(v, k) {
            setValues(values => {
                // updating the source, if the name is virtual, we must update that too
                if (k === 'source' && nameIsDerivedFromSource)
                    values.name = basename(v)
                return { ...values, [k]: v }
            })
        },
        barSx: { gap: 2, width: '100%', ...barColors },
        stickyBar: true,
        addToBar: [
            isDir && !isSideBreakpoint && h(AddVfsBtn, { variant: 'outlined' }, "添加"),
            h(IconBtn, {
                icon: ContentCut,
                disabled: isRoot || movingFile === file.id,
                title: "剪切（也可以拖放来移动条目）",
                'aria-label': "剪切",
                onClick() {
                    state.movingFile = file.id
                    alertDialog(h(Box, {}, "现在已标记为待移动，请点击目标文件夹，然后再点击粘贴按钮 ", h(ContentPaste)), 'info')
                },
            }),
            movingFile && h(IconBtn, {
                icon: ContentPaste,
                disabled: file.type !== 'folder'
                    || file.id.startsWith(movingFile) // can't move below myself
                    || file.id === movingFile.replace(/[^/]+\/?$/,''), // can't move to the same parent
                title: movingFile,
                async onClick() {
                    if (moveVfs(movingFile, file.id))
                        state.movingFile = ''
                },
            }),
            h(IconBtn, {
                icon: Delete,
                title: "删除",
                disabled: isRoot,
                onClick() {
                    deleteVfs([file.id])
                    saved()
                },
            }),
            ...wantArray(addToBar)
        ],
        onError: alertDialog,
        save: {
            ...propsForModifiedValues(isModifiedConfig(values, rest)),
            children: "应用",
            startIcon: h(Check),
            async onClick() {
                const node = state.selectedFiles[0] || id2vfsNode.get(values.id)
                if (!node)
                    throw Error("未找到所选节点")
                const props = _.omit(values, ['birthtime','mtime','size','id'])
                const wasId = node.id
                prepareVfsUndo()
                Object.assign(node, props)
                if (props.name !== undefined)
                    reindexVfs({ node, clearMap: false, select: [node] })
                if (node.id !== wasId)
                    setValues(v => ({ ...v, id: node.id }))
                markVfsModified()
                saved()
            }
        },
        fields: [
            isRoot ? h(Alert, { severity: 'info' }, "这是主页文件夹，即您共享文件的根目录。此处设置的选项将应用于所有文件。")
                : isDir && hasSource && h(Alert, { severity: 'info' }, `要为文件夹中的单个条目设置权限，请点击“添加”按钮，然后选择“来自磁盘的文件或文件夹”`),
            {
                k: 'name', required: true, xl: true, helperText: hasSource && "您可以指定一个与磁盘上不同的名称",
                ...isRoot && { disabled: true, value: "主页文件夹" },
                end: nameFromSource && !nameIsDerivedFromSource && h(Btn, {
                    icon: RestartAlt, title: "恢复为磁盘上的同名",
                    onClick: () => setValues({ ...values, name: nameFromSource })
                }),
            },
            isLink ? { k: 'url', label: "网址", lg: 12, xl: 8, required: true }
                : { k: 'source', label: "磁盘源", xl: true, comp: FileField, files: isUnknown || !isDir, folders: isUnknown || isDir,
                    placeholder: "无",
                    helperText: !values.source ? "如果在此输入路径，其内容将被列出。留空则此文件夹完全虚拟。"
                        : isDir ? "将列出磁盘上此路径的文件，但您还可以添加更多" : undefined,
            },
            { k: 'id', comp: LinkField, statusApi, xs: 12 },
            { k: 'order', comp: NumberField, min: -1E5, max: 1E5, label: "优先级（前端中的顺序）", placeholder: '默认', sm: 4, helperText: wikiLink('Virtual-file-system#order', "用于强制排序位置") },
            {
                k: 'iconType',
                comp: SelectField,
                options: ['default', 'file', 'embedded'],
                value: !values.icon ? 'default' : embeddedIcon ? 'embedded' : 'file',
                fromField: v => setValues({ ...values, icon: v === 'default' ? '' : v === 'file' ? 'select.a.file' : Object.keys(SYS_ICONS)[0] }),
                xs: true,
                sm: defaultIcon ? 8 : true,
            },
            !defaultIcon && { k: 'icon', xs: 8, sm: 4,
                ...embeddedIcon ? {
                    comp: SelectField, // uniqBy to avoid same icon (with different names), but it works only on array, so first step is to convert the object
                    options: _.map(_.uniqBy(_.map(SYS_ICONS, (v,k) => [k, v[0], v[1] ?? k] as const), x => x[2]), ([k, emoji]) =>
                        ({ value: k, label: h(Flex, { gap: '.5em' }, hIcon(k), hIcon(emoji), ' ', k) }) ), // show both font-icon and emoji versions
                    helperText: "第二个图标为备用图标"
                } : {
                    label: "图标文件", placeholder: "默认", comp: FileField, fileMask: IMAGE_FILEMASK,
                }
            },
            perm('can_read', "能看见但不能下载的用户将被要求登录"),
            perm('can_archive', "用户以 ZIP 下载时是否包含此条目"),
            perm('can_list', "请求文件夹列表的权限。列表将只包含您能看见的内容。", { contentText: "子文件夹" }),
            perm('can_delete', [needSourceWarning, "能删除的用户也可以重命名和剪切/移动"]),
            perm('can_upload', needSourceWarning, { contentText: "子文件夹" }),
            perm('can_see', ["在列表中可见该条目。 ", wikiLink('Permissions', "更多帮助。")]),
            isLink && {
                k: 'target',
                comp: BoolField,
                sm: true,
                label: "在新浏览器中打开",
                fromField: x => x ? '_blank' : null,
                toField: x => x > '',
            },
            showSize && { k: 'size', comp: DisplayField, sm: 6, lg: 4, toField: formatBytes },
            showTimestamps && { k: 'birthtime', comp: DisplayField, sm: 6, lg: showSize && 4, label: "创建时间", toField: formatTimestamp },
            showTimestamps && { k: 'mtime', comp: DisplayField, sm: 6, lg: showSize && 4, label: "修改时间", toField: formatTimestamp },
            showAccept && { k: 'accept', label: "上传时接受", placeholder: "任意", xl: showWebsite ? 4 : 12,
                helperText: h('span', {}, "仅提示浏览器，并不强制。 ", h(Link, { href: ACCEPT_LINK, target: '_blank' }, "示例: .zip")) },
            showWebsite && { k: 'default', comp: BoolField, xl: showAccept ? 8 : 12,
                label: "若找到 index.html 则作为网页提供" + (inheritedDefault && values.default == null ? '（继承）' : ''),
                value: values.default ?? inheritedDefault,
                toField: Boolean, fromField: (v:boolean) => v && !inheritedDefault ? 'index.html' : v ? null : false,
                helperText: md("...而不是显示文件列表")
            },
            { k: 'comment', multiline: true, xl: true },
            isDir && { k: 'masks', multiline: true, xl: 6,
                toField: yaml.stringify, fromField: v => v ? yaml.parse(v) : undefined,
                comp: TextEditorField, lang: 'yaml',
                helperText: ["特殊字段，除非您清楚自己在做什么，否则请留空。YAML 语法。 ", wikiLink('Masks-field', "（示例）")]
            },
        ]
    })

    function perm(perm: keyof VfsPerms, helperText?: ReactNode, props: Partial<WhoFieldProps>={}) {
        if (!show[perm]) return null
        const dontShow = [perm, ...onlyTruthy(_.map(show, (v,k) => !v && k))]
        const others = _.difference(Object.keys(defaultPerms), dontShow)
        // a freshly created node can be selected before `inherited` is filled by a server roundtrip
        let inherit = file.inherited?.[perm] ?? getInheritedPerms(file)?.[perm] ?? defaultPerms[perm]
        while (typeof inherit === 'string' && _.get(show, inherit) === false) // is 'inherit' referring to another permission that is not displayed?
            inherit = _.get(values, inherit)
                // non-permission who values (like WHO_ANY_ACCOUNT) are not valid keys for inherited lookup
                ?? (inherit !== WHO_ANY_ACCOUNT && inherit !== WHO_ADMIN ? getInheritedPerms(file)?.[inherit] : undefined)
                ?? _.get(defaultPerms, inherit)! // then show its value instead
        return {
            comp: WhoField,
            k: perm, sm: 6, lg: 12, xl: 4,
            parent, accountsApi, helperText, isDir,
            otherPerms: others.map(x => ({ value: x, label: who2desc(x) })),
            label: "谁可以 " + perm2word(perm),
            inherit,
            byMasks: byMasks?.[perm],
            offerInheritance: true,
            fromField: (v?: WhoVfs) => v ?? null,
            ...props
        }
    }

}

function perm2word(perm: string) {
    return xlate(perm.split('_')[1], { read: '下载', archive: '压缩', list: '访问列表' })
}

type AccountsApi = ReturnType<typeof useAccountsApi>
export function useAccountsApi() {
    return useApiEx<typeof apiAccounts.get_accounts>('get_accounts', {}, {
        onResponse(_res, data) {
            if (!data) return
            data.list = _.sortBy(data.list, 'username')
        }
    })
}

interface WhoFieldProps extends FieldProps<WhoVfs | undefined> {
    accountsApi?: AccountsApi,
    otherPerms?: any[],
    isChildren?: boolean,
    isDir: boolean
    contentText?: string
}
export function WhoField({ value, onChange, parent, inherit, accountsApi, helperText, otherPerms, byMasks,
        hideValues, isChildren, isDir, contentText="文件夹内容", setApi, offerInheritance, ...rest }: WhoFieldProps): ReactElement {
    const defaultLabel = who2desc(byMasks ?? inherit)
        + prefix(' (', byMasks !== undefined ? "来自掩码" : parent !== undefined ? "与父文件夹相同" : "默认", ')')
    const objectMode = isWhoObject(value)
    const thisValue = objectMode ? value.this : value
    accountsApi ??= useAccountsApi() // it's important that the "accounts" prop is stable in the truthy sense
    const accounts = accountsApi?.data?.list

    const options = useMemo(() =>
        onlyTruthy([
            offerInheritance && { value: null, label: defaultLabel },
            { value: WHO_NO_ONE },
            { value: WHO_ANY_ACCOUNT },
            { value: WHO_ADMIN },
            { value: WHO_ANYONE },
            ...otherPerms || [],
            { value: [], label: "选择账户" },
        ].map(x => x && !hideValues?.includes(x.value)
            && { label: who2desc(x.value), ...x })), // default label
        [inherit, parent, thisValue, ...wantArray(hideValues)])

    const timeout = 500
    const arrayMode = Array.isArray(thisValue)
    // a large sideband will convey union across the fields
    return h(Box, { sx: { borderRight: objectMode ? '8px solid #8884' : undefined, transition: `all ${timeout}ms` } },
        h(SelectField as typeof SelectField<typeof thisValue | null>, {
            ...rest,
            value: arrayMode ? [] : thisValue ?? null,
            onChange(v, { event }) {
                onChange(objectMode ? simplify({ ...value, this: v ?? undefined }) : v ?? undefined, { was: value, event })
            },
            options,
        }),
        h(Collapse, { in: arrayMode, timeout },
            arrayMode && h(MultiSelectField as Field<string[]>, {
                label: accounts?.length ? "账户 " + rest.label : "您还没有创建任何账户",
                value: thisValue,
                onChange,
                options: accounts?.map(a => ({ value: a.username, label: a.username, a })) || [],
                placeholder: "无",
                ...thisValue.length === 0 && { helperText: "请选择账户", error: true },
                // show icon only for groups, to save space inside the field (not the list)
                renderOption: (x: any) => h('span', {}, x.a?.isGroup && account2icon(x.a), ' ', x.label),
            }) ),
        h(FormHelperText, {},
            helperText,
            !isChildren && isDir && h(LinkBtn, {
                sx: { display: 'block', mt: -.5 },
                onClick(event) {
                    onChange(objectMode ? thisValue : { this: thisValue, children: thisValue == null ? !inherit : undefined  } , { was: value, event })
                }
            }, objectMode ? "为以下内容设置相同权限 " : "为以下内容设置不同权限 ", contentText)
        ),
        !isChildren && h(Collapse, { in: objectMode, timeout },
            h(WhoField, {
                label: "权限应用于 " + contentText,
                parent, inherit, accountsApi, otherPerms, isDir,
                value: objectMode ? value?.children : undefined,
                isChildren: true,
                hideValues: [thisValue ?? inherit, thisValue],
                onChange(v, { event }) {
                    if (objectMode) // shut up ts
                        onChange(simplify({ ...value, children: v }), { was: value, event })
                }
            })
        ),
    )

    function simplify(v: WhoObject) {
        return v.this === v.children ? v.this : v
    }
}

function who2desc(who: any) {
    return who === false ? "无人"
        : who === true ? "任何人"
            : who === WHO_ANY_ACCOUNT ? "任何已登录账户"
                : who === WHO_ADMIN ? "任何管理员"
                    : Array.isArray(who) ? who.join(', ')
                        : typeof who === 'string' ? `相当于“可以${perm2word(who)}”`
                            : "*UNKNOWN*" + JSON.stringify(who)
}

interface LinkFieldProps extends FieldProps<string> {
    statusApi: UseApi<any> // receive status from parent, to avoid asking server at each click on a file
}
function LinkField({ value, statusApi }: LinkFieldProps) {
    const { reload, error } = statusApi
    // workaround to get fresh data and be rerendered even when mounted inside imperative dialog
    const requestRender = useRequestRender()
    useEffect(() => statusApi.sub(requestRender), [])
    const data = statusApi.getData()

    const urls: string[] = data && (data.urls.https || data.urls.http || [data.base_url])
    const baseHost = try_(() => new URL(data?.baseUrl).host) // URL can throw on malformed data
    const roots = data?.roots || {}
    const root = baseHost && _.find(roots, (_root, host) => matches(baseHost, host))
    const originalValue = value
    if (root)
        value = pathInRoot(value, root)
    let linkBase = data?.baseUrl || ''
    if (value === undefined) { // baseUrl didn't match, but other hosts in roots may
        const base = try_(() => new URL(linkBase))
        if (base) {
            const sorted = _.sortBy(Object.entries(roots), ([, root]) => -String(root).length) // prioritize longer roots because are more specific
            for (const [hostMask, root] of sorted) {
                if (typeof root !== 'string') continue
                value = pathInRoot(originalValue, root)
                const host = value && hostMask.split('|').find(x => x && !/[*?]/.test(x) && x !== baseHost)
                if (!host) continue
                linkBase = base.protocol + '//' + host
                break
            }
        }
    }
    const link = prefix(linkBase, value)
    const RenderLink = useMemo(() => forwardRef((props: any, ref) =>
        h(Link, {
            ref,
            ...props,
            href: link,
            style: { height: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' },
            target: 'frontend',
        }, link)
    ), [link])
    return h(Box, { sx: { display: 'flex' } },
        !baseHost ? "无效的 baseUrl" : !urls ? 'error' : // check data is ok
        h(DisplayField, {
            label: "链接",
            className: MASK_IN_TESTS,
            value: link || `在配置的主地址之外（${baseHost}）`,
            error,
            InputProps: link ? { inputComponent: RenderLink } : undefined,
            end: h(Box, {},
                h(IconBtn, {
                    icon: ContentCopy,
                    title: "复制",
                    disabled: !link,
                    doneAnimation: true,
                    onClick: () => copyTextToClipboard(link)
                }),
                h(IconBtn, { icon: QrCode2, title: "二维码", onClick: showQr, disabled: !link }),
                h(IconBtn, { icon: Edit, title: "修改", onClick() { changeBaseUrl().then(reload) } }),
            )
        }),
    )

    function showQr() {
        newDialog({
            title: "二维码",
            dialogProps: { sx: { bgcolor: 'background.default', border: '1px solid' } },
            Content() {
                const theme = useTheme()
                return h('canvas', {
                    ref: (canvas: HTMLCanvasElement) => canvas && generateQRCode(canvas, link, theme.palette.text.primary),
                    style: { width: '100%' },
                })
            }
        })
    }

    async function generateQRCode(canvas: HTMLCanvasElement, text: string, color: string) {
        try {
            QrCreator.render({
                text,
                radius: 0.0, // 0.0 to 0.5
                ecLevel: 'H', // L, M, Q, H
                fill: color, // foreground color
                background: null, // color or null for transparent
                size: 300 // in pixels
            }, canvas)
        } catch (error) {
            console.error('Error generating QR code:', error)
        }
    }

    function pathInRoot(uri: string | undefined, root: string | undefined) {
        if (!root || root === '/') return uri
        root = pathEncode(root)
        return uri?.startsWith(root, 1) ? uri.slice(root.length) : undefined
    }
}

export async function changeBaseUrl() {
    return new Promise(async resolve => {
        const res = await apiCall('get_status')
        const { base_url, roots } = await apiCall('get_config', { only: [CFG.base_url, CFG.roots] })
        const urls: string[] = res.urls.https || res.urls.http
        const domainsFromRoots = Object.keys(roots).map(x => x.split('|')).flat().filter(x => !/[*?]/.test(x))
        const proto = splitAt('//', urls[0])[0] + '//'
        urls.push(..._.difference(domainsFromRoots.map(x => proto + x), urls))
        const { close } = newDialog({
            title: "主地址",
            Content() {
                const [v, setV] = useState(base_url || '')
                const proto = stringBefore('//', v || urls[0]) + '//'
                const host = urls.includes(v) ? '' : v.slice(proto.length)
                const check = h(Check, { sx: { ml: 2 } })
                return h(Box, { sx: { display: 'flex', flexDirection: 'column' } },
                    h(Box, { sx: { mb: 2 } }, "为您的链接选择主地址"),
                    h(MenuList, {},
                        h(MenuItem, {
                            selected: !v,
                            onClick: () => set(''),
                        }, "自动", !v && check),
                        urls.map(u => h(MenuItem, {
                            key: u,
                            selected: u === v,
                            onClick: () => set(u),
                        }, u, u === v && check))
                    ),
                    h(StringField, {
                        label: "自定义 IP 或域名",
                        helperText: md("您可以输入任意地址，但*您*需要自行保证该地址可用。\n此功能只是帮助您在拥有域名或复杂网络配置时复制链接。"),
                        value: host,
                        onChange: v => set(prefix(proto, ipForUrl(v))),
                        start: h(SelectField as Field<string>, {
                            value: proto,
                            onChange: v => host ? set(v + host) : toast("请先输入域名"),
                            options: ['http://','https://'],
                            size: 'small',
                            variant: 'standard',
                            sx: { '& .MuiSelect-select': { pt: '1px', pb: 0 } },
                        }),
                        sx: { mt: 2 }
                    }),
                    h(Box, { sx: { mt: 2, textAlign: 'right' } },
                        h(Btn, {
                            icon: Save,
                            children: "保存",
                            async onClick() {
                                if (v !== base_url)
                                    await apiCall('set_config', { values: { [CFG.base_url]: v.replace(/\/$/, '') } })
                                close()
                                resolve(v)
                            },
                        }) ),
                )

                function set(u: string) {
                    if (u.endsWith('/'))
                        u = u.slice(0, -1)
                    setV(u)
                }
            }
        })
    })
}


interface IconProps { name:string, className?:string, alt?:string, [rest:string]: any }
// name = null ? none : unicode ? unicode : "?" ? file_url : font_icon_class
const Icon = memo(({ name, alt, className='', ...props }: IconProps) => {
    if (!name) return null
    const [emoji, clazz=name] = SYS_ICONS[name] || []
    className += ' icon'
    const nameIsTheIcon = name.length === 1 ||
        name.match(/^[\uD800-\uDFFF\u2600-\u27BF\u2B00-\u2BFF\u3030-\u303F\u3297\u3299\u00A9\u00AE\u200D\u20E3\uFE0F\u2190-\u21FF\u2300-\u23FF\u2400-\u243F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF]*$/)
    const nameIsUrl = !nameIsTheIcon && /[/?]/.test(name)
    const isFontIcon = clazz
    className += nameIsUrl ? ' file-icon' : isFontIcon ? ` font-icon fa-${clazz}` : ' emoji-icon'
    return h('span',{
        ...alt ? { 'aria-label': alt } : { 'aria-hidden': true },
        role: 'img',
        ...props,
        ...nameIsUrl ? { style: { backgroundImage: `url(${JSON.stringify(name)})`, ...props?.style } } : undefined,
        className,
    }, nameIsTheIcon ? name : isFontIcon ? null : (emoji||'#'))
})

function hIcon(name: string, props?: Omit<IconProps, 'name'>) {
    return h(Icon, { name, ...props })
}
