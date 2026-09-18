// This file is part of HFS - Copyright 2021-2023, Massimo Melina <a@rejetto.com> - License https://www.gnu.org/licenses/gpl-3.0.txt

import { createElement as h, Fragment } from 'react'
import { Tab, Tabs } from '@mui/material'
import InstalledPlugins from './InstalledPlugins'
import OnlinePlugins from './OnlinePlugins'
import { useRoutedTab } from './routing'

const TABS = [
    { label: "已安装", path: 'installed', Pane: InstalledPlugins },
    { label: "获取更多", path: 'get', Pane: OnlinePlugins },
    { label: "检查更新", path: 'updates', Pane: () => h(InstalledPlugins, { updates: true }) },
]
const TAB_PATHS = TABS.map(x => x.path)
export default function PluginsPage() {
    const [tab, setTab] = useRoutedTab('plugins', TAB_PATHS)
    const { Pane } = TABS[tab]
    return h(Fragment, {},
        h(Tabs, {
            value: tab,
            onChange(ev, i) {
                setTab(i)
            }
        }, TABS.map(x =>
            h(Tab, { key: x.path, label: x.label }))),
        h(Pane)
    )
}