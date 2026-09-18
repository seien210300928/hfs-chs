// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, ReactNode, useEffect, useRef, useState } from 'react'
import { BoolField, Form, MultiSelectField, NumberField, SelectField } from '@hfs/mui-grid-form'
import { Alert, Box } from '@mui/material'
import { apiCall } from './api'
import { alertDialog, useDialogBarColors } from './dialog'
import { apiNewPassword, formatTimestamp, isModifiedConfig, prefix, reactJoin, useIsMobile, wantArray } from './misc'
import { Btn, Flex, IconBtn, NetmaskField, propsForModifiedValues } from './mui'
import { type Account } from './AccountsPage'
import { AutoDelete, Delete } from '@mui/icons-material'
import { state, useSnapState } from './state'
import VfsPathField from './VfsPathField'
import { DateTimeField } from './DateTimeField'

export default function AccountForm({ account, done, groups, addToBar, reload }: {
    account: Account,
    groups: string[],
    done: (username: string, saveBtn?: HTMLButtonElement) => void,
    reload: () => void,
    addToBar: ReactNode
}) {
    const { username } = useSnapState()
    const [values, setValues] = useState<Account & { password?: string, password2?: string }>(account)
    const [belongsOptions, setBelongOptions] = useState<string[]>([])
    const isMobile = useIsMobile()
    useEffect(() => {
        setValues(account)
        setBelongOptions(groups.filter(x => x !== account.username ))
        if (!isMobile)
            ref.current?.querySelector('input')?.focus()
    }, [JSON.stringify(account)]) //eslint-disable-line
    const add = !account.username
    const { isGroup } = values
    const ref = useRef<HTMLFormElement>()
    const { members } = account
    const pluginAuth = account.plugin?.auth
    return h(Form, {
        key: account.username, // remount on account changes because Form owns validation state for the current record
        formRef: ref,
        values,
        set(v, k) {
            setValues(values => ({ ...values, [k]: v }))
        },
        barSx: { gap: 2, width: '100%', ...useDialogBarColors() },
        stickyBar: true,
        addToBar: [
            !add && h(IconBtn, {
                icon: Delete,
                title: "删除",
                confirm: `删除 ${account.username}？`,
                ...username === account.username && { disabled: true, title: "无法删除当前账户" },
                onClick: () => apiCall('del_account', { username: account.username }).then(reload)
            }),
            h(IconBtn, {
                icon: AutoDelete,
                title: `使过去的会话失效${prefix('\n(此前的会话已在 ', formatTimestamp(account.invalidated || 0), ') 失效')}`,
                confirm: `使 "${account.username}" 的所有会话失效？`,
                doneMessage: true,
                onClick: () => apiCall('invalidate_sessions', { username: account.username }).then(reload)
            }),
            ...wantArray(addToBar),
        ],
        fields: [
            { k: 'username', label: isGroup ? '组名' : undefined, autoComplete: 'off', required: true, md: isGroup && !pluginAuth ? 12 : 4,
                getError: v => v !== account.username && apiCall('get_account', { username: v })
                    .then(got => got?.username === account.username ? "用户名不区分大小写" : "已被使用", () => false),
            },
            pluginAuth && { k: '', md: 8, comp: h(Alert, { severity: 'info' }, " 身份验证由插件处理") },
            !isGroup && !pluginAuth && { k: 'password', xs: 6, md: 4, type: 'password', autoComplete: 'new-password', required: add,
                label: add ? "密码" : "修改密码"
            },
            !isGroup && !pluginAuth && { k: 'password2', xs: 6, md: 4, type: 'password', autoComplete: 'new-password', label: '重复密码',
                getError: (x, { values }) => (x||'') !== (values.password||'') && "两次输入的密码不一致" },

            { k: 'disabled', comp: BoolField, fromField: x=>!x, toField: x=>!x, label: "启用", xs: 12, sm: 6, lg: 4,
                helperText:  values.disabled || values.canLogin !== false ? "如果账户或其所有组被禁用，登录将被阻止"
                    : h(Box, { sx: { color: 'warning.main' }, component: 'span' } as any, // Box.component has ts problems with h()
                        new Date(account.expire!) < new Date() ? "登录被阻止，因为账户已过期" // use account instead of values, so to use the value currently applied
                            : "登录被阻止，因为其所有组均被禁用")
            },
            { k: 'ignore_limits', comp: BoolField, xs: 12, sm: 6, lg: 4,
                helperText: values.ignore_limits ? "速度限制不适用于此账户" : "速度限制适用于此账户" },
            { k: 'admin', comp: BoolField, fromField: (v:boolean) => v||null, label: "管理面板访问", xs: 12, sm: 6, lg: 4,
                helperText: "用于访问您正在使用的这个界面",
                ...!account.admin && account.adminActualAccess && { value: true, disabled: true, helperText: "此权限为继承所得。如需禁用，请在组上操作。" },
            },

            !isGroup && { k: 'require_password_change', comp: BoolField, xs: 12, sm: 6, lg: 4, helperText: "下次登录时，但可关闭" },
            { k: 'disable_password_change', label: "修改密码", comp: SelectField, xs: 12, sm: 6, lg: isGroup ? 4 : 4,
                defaultValue: null,
                options: { [`默认（${values.canChangePassword ? '允许' : '禁止'}）`]: null, "允许": false, "禁止": true },
            },

            !members ? null
                : isGroup && !members.length ? h(Box, {}, "没有成员")
                    : members.length > 0 && h(Flex, { gap: 0, flexWrap: 'wrap' }, `${members.length} 个成员: `,
                        reactJoin(', ', account.members?.map(u => h(groups.includes(u) ? 'i' : 'span', {}, u))),
                        h(Btn, {
                            icon: Delete,
                            confirm: `删除 ${account.members.length} 个账户？`,
                            onClick: () => apiCall('del_account', { username: account.members }).then(reload),
                            sx: { verticalAlign: 'text-top' }
                        }),
                ),
            isGroup && h(Alert, { severity: 'info' }, `向该组添加用户：请先选中用户，再点击“继承”`),
            { k: 'belongs', comp: MultiSelectField, label: "从组继承", options: belongsOptions, sm: 6, lg: 4,
                helperText: "指定要继承权限的组"
                    + (!isGroup ? '' : "。组可以从另一个组继承")
                    + (belongsOptions.length ? '' : "。当前已禁用，因为没有可供选择的组，请先创建一个组。")
            },

            { k: 'allow_net', comp: NetmaskField, label: "允许的网络地址", sm: 6, lg: 4, placeholder: "任意地址" },
            !isGroup && { k: 'auto_login_net', comp: NetmaskField, label: "按 IP 地址自动登录", sm: 6, lg: 4, placeholder: "无" },
            { k: 'redirect', comp: VfsPathField, placeholder: "无", sm: 6, lg: 4,
                helperText: "如果希望在登录时将账户重定向到特定文件夹/地址（甚至文件）" },

            { k: 'expire', label: "过期时间", sm: 6, lg: 4, comp: DateTimeField, toField: x => x && new Date(x),
                helperText: "过期后将不允许登录" },
            { k: 'days_to_live', sm: 6, lg: 4, comp: NumberField, step: 'any', min: 1/1000, // 10 minutes
                ...values.expire && { xs: 12, disabled: true, sx: { opacity: .2 } }, helperText: "用于在首次登录时设置过期时间" },
            { k: 'notes', multiline: true, sm: 6, lg: 4 },
        ],
        onError: alertDialog,
        save: {
            ...propsForModifiedValues(isModifiedConfig(values, account)),
            async onClick() {
                const { password='', password2, adminActualAccess, hasPassword, invalidated, canLogin, members, ...withoutPassword } = values
                const saveBtn = ref.current?.querySelector<HTMLButtonElement>('button.saveBtn') || undefined
                if (add) {
                    const got = await apiCall('add_account', withoutPassword)
                    if (password)
                        try { await apiNewPassword(values.username, password) }
                        catch(e) {
                            void apiCall('del_account', { username: values.username }) // best effort, don't wait
                            throw e
                        }
                    done(got?.username, saveBtn)
                    return
                }
                const got = await apiCall('set_account', {
                    username: account.username,
                    changes: withoutPassword,
                })
                if (password) {
                    await apiNewPassword(values.username, password)
                    setValues(values => ({ ...values, password: '', password2: '' }))
                }
                if (account.username === username)
                    state.username = got.username // use the server's normalized name for current-account checks
                done(got?.username, saveBtn) // username may have been changed, so we pass it back
            }
        }
    })
}

