// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { HTTP_MESSAGES, MD_TAGS } from '@hfs/shared'
import { Link } from '@mui/material'
import httpCodes from './httpCodes'
export * from '@hfs/shared'

;(MD_TAGS as any).a = Link

export function err2msg(code: string | number) {
    const permPath = typeof code === 'string' && code.split("Error: EPERM: operation not permitted, access ")[1]?.split('\n')[0]
    if (permPath)
        return `磁盘访问被拒绝：${permPath}`
    return {
        github_quota: "请求被拒绝。您可能已达限制，请稍后重试。",
        ENOENT: "未找到",
        ENOTDIR: "不是文件夹",
    }[code] || HTTP_MESSAGES[code as any] || httpCodes[code] || String(code) // prefer short form, as httpCodes is quite long
}

export function formatTimestamp(x: number | string | Date) {
    return !x ? '' : (x instanceof Date ? x : new Date(x)).toLocaleString()
}
