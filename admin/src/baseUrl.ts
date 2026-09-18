import { createElement as h, useState } from 'react'
import { Box, MenuItem, MenuList } from '@mui/material'
import { Check, Save } from '@mui/icons-material'
import { Field, SelectField, StringField } from '@hfs/mui-grid-form'
import { apiCall } from './api'
import { CFG, ipForUrl, md, newDialog, prefix, splitAt, stringBefore } from './misc'
import { Btn } from './mui'
import { alertDialog, toast } from './dialog'
import _ from 'lodash'

export async function changeBaseUrl() {
    try {
        const res = await apiCall('get_status')
        const { base_url, roots } = await apiCall('get_config', { only: [CFG.base_url, CFG.roots] })
        const urls: string[] = res.urls.https || res.urls.http
        const domainsFromRoots = Object.keys(roots).map(x => x.split('|')).flat().filter(x => !/[*?]/.test(x))
        const proto = splitAt('//', urls[0])[0] + '//'
        urls.push(..._.difference(domainsFromRoots.map(x => proto + x), urls))
        return await new Promise(resolve => {
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
    catch(e) {
        await alertDialog(e as Error)
    }
}
