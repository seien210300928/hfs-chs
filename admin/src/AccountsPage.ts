// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, useState, useEffect, Fragment, useMemo, ReactNode } from "react"
import { apiCall, useApiEx } from './api'
import { Alert, Box, Card, CardContent, Grid, List, ListItem, ListItemText, Typography } from '@mui/material'
import {
    AccountTree, ChevronRight, Close, Delete, DoNotDisturb, ExpandMore, Group, MilitaryTech, Person, PersonAdd, Schedule
} from '@mui/icons-material'
import { newDialog, with_, md, Jsonify } from './misc'
import { Btn, execDoneMessage, Flex, IconBtn, iconTooltip, reloadBtn, useBreakpoint, useToggleButton } from './mui'
import { TreeItem, SimpleTreeView } from '@mui/x-tree-view'
import MenuButton from './MenuButton'
import AccountForm from './AccountForm'
import _ from 'lodash'
import { alertDialog, confirmDialog } from './dialog'
import { state, useSnapState } from './state'
import { importAccountsCsv } from './importAccountsCsv'
import type apiAccounts from '../../src/api.accounts'

export type Account = Jsonify<ReturnType<typeof apiAccounts.get_accounts>['list'][0]>

const SEP = '\t'
const userFromItemId = (itemId?: string) => itemId?.split(SEP).at(-1)

export default function AccountsPage() {
    const { username, accountsAsTree } = useSnapState()
    const { data, reload, element } = useApiEx<typeof apiAccounts.get_accounts>('get_accounts')
    const [sel, setSel] = useState<string[] | 'new-group' | 'new-user'>([])
    const selectionMode = Array.isArray(sel)
    useEffect(() => { // if accounts are reloaded, review the selection to remove elements that don't exist anymore
        if (Array.isArray(data?.list) && selectionMode)
            setSel( sel.filter(x => data!.list.find((e:any) => e?.username === userFromItemId(x))) ) // remove elements that don't exist anymore
    }, [data]) //eslint-disable-line -- Don't fall for its suggestion to add `sel` here: we modify it and declaring it as a dependency would cause a logical loop
    const list = useMemo(() => data && _.sortBy(data.list, [x => !x.isGroup, x => !x.adminActualAccess, 'username']), [data])
    const selectedAccount = selectionMode && _.find(list, { username: userFromItemId(sel[0]) })
    const sideBreakpoint = 'md'
    const isSideBreakpoint = useBreakpoint(sideBreakpoint)

    const sideContent = !(sel.length > 0) || !list ? null // this clever test is true both when some accounts are selected and when we are in "new account" modes
        : selectionMode && sel.length > 1 ? h(Fragment, {},
                h(Flex, {},
                    h(Typography, {variant: 'h6'}, sel.length + " 个已选"),
                    h(Btn, { onClick: deleteAccounts, icon: Delete }, "移除"),
                ),
                h(List, {},
                    _.uniq(sel.map(userFromItemId)).map(username =>
                        h(ListItem, { key: username },
                            h(ListItemText, {}, username))))
            )
            : with_(selectedAccount || newAccount(), a =>
                h(AccountForm, {
                    account: a,
                    groups: list.filter(x => x.isGroup).map(x => x.username),
                    addToBar: isSideBreakpoint && [
                        h(Box, { sx: { flex: 1 } }),
                        account2icon(a, { fontSize: 'large', sx: { p: 1 }}),
                        // not really useful, but users misled in thinking it's a dialog will find satisfaction in dismissing the form
                        h(IconBtn, {  icon: Close, title: "关闭", onClick: selectNone }),
                    ],
                    reload,
                    done(username, saveBtn) {
                        setSel(isSideBreakpoint ? [username] : [])
                        reload()
                        execDoneMessage('', saveBtn)
                    }
                }))
    useEffect(() => {
        if (isSideBreakpoint || !sideContent || !sel.length) return
        const { close } = newDialog({
            title: _.isString(sel) ? _.startCase(sel)
                : sel.length > 1 ? "多选"
                    : selectedAccount ? (selectedAccount.isGroup ? "组: " : "用户: ") + selectedAccount.username
                        : '?', // never
            Content: () => sideContent,
            onClose(keepSelection) {
                if (!keepSelection)
                    selectNone()
            },
        })
        // effect cleanup replaces the dialog; only user dismissal should clear selection
        return () => void close(true)
    }, [isSideBreakpoint, sel, selectedAccount])

    const scrollProps = { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' } as const
    const [showTree, showTreeBtn] = useToggleButton("显示树", "显示列表", () => ({ icon: AccountTree }), accountsAsTree)
    state.accountsAsTree = showTree
    return element || h(Grid, { container: true, sx: { rowSpacing: 1, columnSpacing: 2, top: 0, flex: '1 1 auto', height: 0 } },
        h(Grid, { size: { xs: 12, [sideBreakpoint]: 5, lg: 4, xl: 5 } as any, sx: scrollProps },
            h(Box, {
                sx: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    mb: 2,
                    boxShadow: theme => `0px -8px 4px 10px ${theme.palette.background.paper}`,
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    backgroundColor: 'background.paper',
                    width: 'fit-content',
                },
            },
                h(MenuButton, {
                    variant: 'contained',
                    startIcon: h(PersonAdd),
                    items: [
                        { children: "用户", onClick: () => setSel('new-user') },
                        { children: "组", onClick: () => setSel('new-group') },
                        { children: "从 CSV 导入", onClick: () => importAccountsCsv(reload) },
                    ]
                }, "添加"),
                reloadBtn(reload),
                showTreeBtn,
                list?.length! > 0 && h(Typography, { sx: { p: 1 } }, `${list!.length} 个账户`),
            ),
            !list?.length && h(Alert, { severity: 'info' }, md`如需<u>远程</u>访问管理界面，你需要创建一个具有管理员权限的账户`),
            h(SimpleTreeView<true>, { // true because it's not detecting multiSelect correctly (ts495)
                    multiSelect: true,
                    sx: { pr: 4, pb: 2, minWidth: '15em' },
                    selectedItems: selectionMode ? sel : [],
                    slots: {
                        collapseIcon: ExpandMore,
                        expandIcon: ChevronRight,
                    },
                    onSelectedItemsChange(ev, ids) {
                        if (!(ev?.target as any)?.closest?.('.MuiTreeItem-iconContainer')) // don't select if clicked the expansion button, mostly for mobile users
                            setSel(ids)
                    }
                },
                list && (function recur(thisLevel, prefixPath=''): ReactNode {
                    return thisLevel.map(ac =>
                        h(TreeItem, {
                            key: ac.username,
                            itemId: prefixPath + ac.username,
                            label: h(Box, {
                                    sx: {
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        padding: '.2em 0',
                                        columnGap: '.5em',
                                        alignItems: 'center',
                                    }
                                },
                                account2icon(ac),
                                (ac.disabled || ac.canLogin === false)
                                && iconTooltip(DoNotDisturb, ac.disabled ? "已禁用" : "被其组禁用", ac.disabled ? undefined : { color: 'text.secondary' }),
                                (ac.expire || ac.days_to_live) && h(Schedule),
                                ac.adminActualAccess && iconTooltip(MilitaryTech, "可登录管理面板"),
                                ac.username,
                                Boolean(ac.belongs?.length) && h(Box, { sx: { color: 'text.secondary', fontSize: 'small' } },
                                    '(', ac.belongs?.join(', '), ')')
                            ),
                        }, showTree && recur(list.filter(x => ac.directMembers?.includes(x.username)), prefixPath+ac.username+SEP)))
                })(showTree ? list.filter(ac => !list.some(x => x.members?.includes(ac.username))) : list)
            )
        ),
        isSideBreakpoint && sideContent && h(Grid, { size: 'grow', sx: { ...scrollProps, maxWidth: '100%' } },
            h(Card, { sx: { overflow: 'initial' } }, // overflow is incompatible with stickyBar
                h(CardContent, {}, sideContent)) )
    )

    function newAccount() {
        return {
            username: '',
            hasPassword: sel === 'new-user',
            adminActualAccess: false,
            invalidated: undefined,
            canLogin: true,
            canChangePassword: true,
            isGroup: sel === 'new-group',
            members: [],
            directMembers: [],
        } satisfies Account
    }

    function selectNone() {
        setSel([])
    }

    async function deleteAccounts() {
        if (typeof sel === 'string') return
        if (sel.some(x => userFromItemId(x) === username))
            if (!await confirmDialog(`您不能删除正在使用的账户。是否继续删除其余账户？`)) return
        const toDelete = _.without(_.uniq(sel.map(userFromItemId)), username)
        if (!toDelete.length)
            return alertDialog("没有可删除的项", 'info')
        if (!await confirmDialog(`删除 ${toDelete.length} 个条目？`)) return
        const errors = []
        for (const username of toDelete)
            if (!await apiCall('del_account', { username }).then(() => 1, () => 0))
                errors.push(username)
        reload()
        if (errors.length)
            return alertDialog("以下条目无法删除：" + errors.join(', '), 'error')
    }

}

function account2icon(account: Account, props={}) {
    return h(account.isGroup ? Group : Person, props)
}