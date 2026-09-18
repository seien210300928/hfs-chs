// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, Fragment } from "react"
import { Alert, Box } from '@mui/material'
import { apiCall, useApiEx } from './api'
import { alertDialog } from "./dialog"
import { useSnapState } from './state'
import { HTTP_UNAUTHORIZED } from './misc'
import { Logout, PowerSettingsNew } from '@mui/icons-material'
import { Btn } from './mui'

export default function LogoutPage() {
    const { element } = useApiEx('get_config', { only: [] }) // sort of noop, just to get the 'element' part
    const { username } = useSnapState()
    if (element)
        return element
    return h(Box, { sx: { display: 'flex', flexDirection:'column', alignItems: 'flex-start', gap: 2 } },
        !username ? h(Alert, { severity: 'info' }, "您未登录，因为 localhost 无需身份验证")
            : h(Fragment, {},
                "当前登录用户：" + username,
                h(Btn, {
                    icon: Logout,
                    size: 'large',
                    onClick: () => apiCall('logout').catch(err => // we expect 401
                            err.code !== HTTP_UNAUTHORIZED && alertDialog(err))
                }, "我要退出登录")
            ),
        h(Btn, {
            icon: PowerSettingsNew,
            size: 'large',
            color: 'warning',
            confirm: "停止服务器后，此界面将不再响应",
            async onClick() {
                await apiCall('quit')
                await alertDialog("再见", 'success')
                location.reload()
            },
        }, "退出 HFS")
    )
}