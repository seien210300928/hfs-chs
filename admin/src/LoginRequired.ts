// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { state, useSnapState } from './state'
import { createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import { ALLOW_SESSION_IP_CHANGE, HTTP_FORBIDDEN, HTTP_UNAUTHORIZED, makeSessionRefresher, withSrpLib } from './misc'
import { BoolField, Form } from '@hfs/mui-grid-form'
import { apiCall } from './api'
import { srpClientSequence } from '../../src/srp'
import { Alert, Box } from '@mui/material'
import { Center } from './mui'

export function LoginRequired({ children }: any) {
    const { loginRequired } = useSnapState()
    if (loginRequired === HTTP_FORBIDDEN)
        return h(Center, {},
            h(Alert, { severity: 'error' }, "管理面板仅限 localhost 访问"),
            h(Box, { sx: { mt: 2, fontSize: 'small' } }, "因为没有配置管理员账户")
        )
    if (loginRequired)
        return h(LoginForm)
    return h(Fragment, {}, children)
}

function LoginForm() {
    const [values, setValues] = useState({ username: '', password: '', [ALLOW_SESSION_IP_CHANGE]: false })
    const [error, setError] = useState('')
    const formRef = useRef<HTMLFormElement>()
    const empty = formRef.current?.querySelector('input[value=""]')
    useEffect(() => (empty as any)?.focus?.(), [empty])
    return h(Center, {},
        h(Form, {
            formRef,
            values,
            sx: { m: 2, maxWidth: '25em' },
            set(v, k) {
                setValues(values => ({ ...values, [k]: v }))
            },
            fields: [
                { k: 'username', autoComplete: 'username', autoFocus: true, required: true },
                { k: 'password', type: 'password', autoComplete: 'current-password', required: true },
                { k: ALLOW_SESSION_IP_CHANGE, comp: BoolField, label: "允许本次会话期间更换 IP" },
            ],
            addToBar: [ error && h(Alert, { severity: 'error', sx: { flex: 1 } }, error) ],
            saveOnEnter: true,
            save: {
                children: "登录",
                startIcon: null,
                async onClick() {
                    try {
                        setError('')
                        await login(values.username, values.password, {
                            [ALLOW_SESSION_IP_CHANGE]: values[ALLOW_SESSION_IP_CHANGE]
                        })
                    }
                    catch(e) {
                        setError(String(e))
                    }
                }
            }
        })
    )
}

async function login(username: string, password: string, extra?: object) {
    const res = await withSrpLib(srpClientSequence)(username, password, apiCall, extra).catch(err => {
        throw err?.code === HTTP_UNAUTHORIZED ? err.message || "用户名或密码错误"
            : err === 'trust' ? "登录中止：无法信任服务器身份"
            : err?.name === 'AbortError' ? "服务器无响应"
            : (err?.message || "未知错误")
    })
    if (!res.isAdmin)
        throw "此账户没有管理权限"

    // login was successful, update state
    state.loginRequired = false
    refreshSession(res)
}

const refreshSession = makeSessionRefresher(state)