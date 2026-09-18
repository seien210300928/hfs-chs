// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { getInheritedPerms, id2vfsNode, markVfsModified, prepareVfsUndo, reindexVfs, state, VfsNodeAdmin } from './state'
import { createElement as h, forwardRef, memo, ReactNode, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Link, useTheme } from '@mui/material'
import {
    BoolField, DisplayField, FieldProps, Form, NumberField, SelectField
} from '@hfs/mui-grid-form'
import { UseApi } from './api'
import {
    basename, defaultPerms, formatBytes, formatTimestamp, isModifiedConfig, newDialog, useRequestRender, try_, pathEncode,
    onlyTruthy, prefix, VfsPerms, wantArray, WhoVfs, matches, md, Callback, copyTextToClipboard,
    IMAGE_FILEMASK, MASK_IN_TESTS, WHO_ANY_ACCOUNT, WHO_ADMIN, normalizeVfsPath,
} from './misc'
import { Btn, Flex, IconBtn, propsForModifiedValues, useBreakpoint, wikiLink } from './mui'
import VfsActionButtons from './VfsActionButtons'
import _ from 'lodash'
import FileField from './FileField'
import { alertDialog, useDialogBarColors } from './dialog'
import yaml from 'yaml'
import { Check, ContentCopy, Edit, QrCode2, RestartAlt } from '@mui/icons-material'
import QrCreator from 'qr-creator'
import { AddVfsBtn } from './VfsMenuBar'
import { SYS_ICONS } from '@hfs/frontend/src/sysIcons'
import { TextEditorField } from './TextEditor'
import { type AccountsApi, perm2word, WhoField, type WhoFieldProps, who2desc } from './WhoField'
import { changeBaseUrl } from './baseUrl'

const ACCEPT_LINK = "https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept"

interface FileFormProps {
    file: VfsNodeAdmin
    addToBar?: ReactNode
    statusApi: UseApi
    accountsApi: AccountsApi
    done?: Callback
    isSideBreakpoint: boolean
}
export default function FileForm({ file, addToBar, statusApi, accountsApi, done, isSideBreakpoint }: FileFormProps) {
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
    const autoApply = isSideBreakpoint
    const barColors = useDialogBarColors()
    const actions = [
        isDir && !isSideBreakpoint && h(AddVfsBtn, { variant: 'outlined' }, "添加"),
        !autoApply && h(VfsActionButtons, { files: [file], pasteTo: file, done }),
        ...wantArray(addToBar)
    ].filter(Boolean)

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
            setFormValue(v, k as keyof typeof values | 'iconType')
        },
        onValidation: autoApply ? applyValidatedValues : undefined,
        onError: alertDialog,
        ...autoApply ? { save: false } : {
            barSx: { gap: 2, width: '100%', ...barColors },
            stickyBar: true,
            addToBar: actions,
            save: {
                ...propsForModifiedValues(isModifiedConfig(values, rest)),
                children: "应用",
                startIcon: h(Check),
                async onClick() {
                    applyValues(values)
                    done?.()
                }
            },
        },
        fields: [
            isRoot ? h(Alert, { severity: 'info' }, "这是主页文件夹，即您共享文件的根目录。此处设置的选项将应用于所有文件。")
                : isDir && hasSource && h(Alert, { severity: 'info' }, `要为文件夹中的单个条目设置权限，请点击“添加”按钮，然后选择“来自磁盘的文件或文件夹”`),
            {
                k: 'name', label: '名称', required: true, xl: true, helperText: hasSource && "您可以指定一个与磁盘上不同的名称",
                ...isRoot && { disabled: true, value: "主页文件夹" },
                end: !isRoot && nameFromSource && !nameIsDerivedFromSource && h(Btn, {
                    icon: RestartAlt, title: "恢复为磁盘上的同名",
                    onClick: resetNameFromSource
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
                k: 'iconType', label: '图标类型',
                comp: SelectField,
                options: [{ value: 'default', label: '默认' }, { value: 'file', label: '文件图标' }, { value: 'embedded', label: '内嵌图标' }],
                value: !values.icon ? 'default' : embeddedIcon ? 'embedded' : 'file',
                xs: true,
                sm: defaultIcon ? 8 : true,
            },
            !defaultIcon && { k: 'icon', xs: 8, sm: 4, label: '图标',
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
            showSize && { k: 'size', label: '大小', comp: DisplayField, sm: 6, lg: 4, toField: formatBytes },
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
            { k: 'comment', multiline: true, xl: true, label: '备注' },
            isDir && hasSource && { k: 'see_without_probing', comp: BoolField, xl: 6,
                label: "显示时不探测磁盘源", helperText: "列出其父项时不访问此文件夹的磁盘源" },
            isDir && { k: 'masks', multiline: true, xl: 6, label: '掩码',
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

    function setFormValue(v: any, k: keyof typeof values | 'iconType') {
        if (k === 'iconType') { // iconType is UI-only; store its change as icon so auto-apply sees a real VFS property
            k = 'icon'
            v = v === 'default' ? '' : v === 'file' ? 'select.a.file' : Object.keys(SYS_ICONS)[0]
        }
        const nextValues = { ...values, [k]: v }
        // updating the source, if the name is virtual, we must update that too
        if (k === 'source' && nameIsDerivedFromSource)
            nextValues.name = basename(v)
        setValues(nextValues)
        return nextValues
    }

    function resetNameFromSource() {
        const nextValues = setFormValue(nameFromSource, 'name')
        if (autoApply)
            applyValues(nextValues)
    }

    function applyValues(nextValues: typeof values) {
        const node = state.selectedFiles[0] || id2vfsNode.get(nextValues.id)
        if (!node)
            throw Error("未找到所选节点")
        const props = _.omit(nextValues, ['birthtime','mtime','size','id'])
        if (!_.isEqual(nextValues, rest)) { // false is a meaningful permission, so lax config equality would discard "无人"
            prepareVfsUndo()
            Object.assign(node, props)
            if (props.name !== undefined)
                // changing the VFS name changes ids; refresh maps and selection before the UI reads stale references
                reindexVfs({ node, clearMap: false, select: [node] })
            markVfsModified()
        }
        if (node.id !== nextValues.id)
            // changing the name changes the readonly link field, so sync the local form copy too
            setValues({ ...nextValues, id: node.id })
    }

    function applyValidatedValues(errors: false | object) {
        if (errors) return
        // Form validates after the value update rerenders this component, so values is the validated snapshot
        applyValues(values)
    }

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
        // match the server's root normalization and preserve the directory boundary
        root = pathEncode(normalizeVfsPath(root))
        return uri?.startsWith(root) ? uri.slice(root.length - 1) : undefined
    }
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
