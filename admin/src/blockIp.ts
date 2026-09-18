import { apiCall } from '@hfs/shared/api'
import { createElement as h } from 'react'
import { toast } from './dialog'
import { IconBtn, IconBtnProps } from './mui'
import { Block } from '@mui/icons-material'
import { useBatch } from '@hfs/shared'

export function BlockIpBtn({ ip, comment, ...rest }: { ip: string, comment: string } & Partial<IconBtnProps>) {
    const { data, refresh } = useBatch(isIpBlocked, ip, { delay: 100, expireAfter: 5_000 })
    return h(IconBtn, {
        icon: Block,
        title: "屏蔽 IP",
        confirm: "屏蔽地址 " + ip,
        ...data && { disabled: true, title: "已屏蔽" },
        ...rest,
        async onClick() {
            await apiCall('add_block', { ip, merge: { comment } })
            refresh()
            toast("已屏蔽", 'success')
        }
    })
}

async function isIpBlocked(ips: string[]) {
    return apiCall('is_ip_blocked', { ips }).then(x => x.blocked)
}