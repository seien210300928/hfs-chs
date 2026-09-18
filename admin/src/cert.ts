import { createElement as h } from 'react'
import { Box } from '@mui/material'
import { CardMembership } from '@mui/icons-material'
import { apiCall } from './api'
import { state } from './state'
import { alertDialog, newDialog } from './dialog'
import { InLink, LinkBtn, wikiLink } from './mui'

export function isCertError(error: any) {
    return /certificate/.test(error)
}

export function isKeyError(error: any) {
    return /private key/.test(error)
}

export async function suggestMakingCert(onSaved?: (saved: object) => void) {
    return new Promise(resolve => {
        const { close } = newDialog({
            icon: CardMembership,
            title: "获取证书",
            onClose: resolve,
            Content: () => h(Box, { sx: { p: 1, lineHeight: 1.5 } },
                h(Box, {}, "HTTPS 需要证书才能工作。"),
                h(Box, {}, "我们建议您 ", h(InLink, { to: '/internet' }, "获取免费但正规的证书"), '。'),
                h(Box, {}, "如果您没有域名 ", h(LinkBtn, { onClick: makeCertAndSave }, "创建自签名证书"),
                    " 但这样做 ", wikiLink('HTTPS#certificate', "并非完美"), '。' ),
            )
        })

        async function makeCertAndSave() {
            if (!window.crypto.subtle)
                return alertDialog("请在 localhost 上重试此操作", 'warning')
            try {
                const saved = await apiCall('make_self_signed_cert', { fileName: 'self' })
                Object.assign(state.config, saved)
                onSaved?.(saved)
                await alertDialog("证书已保存", 'success')
                close()
            }
            catch(e) {
                await alertDialog(e as Error)
            }
        }
    })
}
