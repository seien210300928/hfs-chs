'use strict';{
    const HFS = window.HFS
    if (HFS) {
        const { h, React, Btn } = HFS
        const useState = React.useState
        const COOKIE = 'folder-size-mode'

        function getMode() {
            const m = document.cookie.split('; ').find(x => x.startsWith(COOKIE + '='))
            return m && m.split('=')[1] === 'ls' ? 'ls' : 'tree'
        }
        function setMode(m) {
            document.cookie = COOKIE + '=' + m + '; path=/; max-age=31536000; SameSite=Lax'
        }

        // 1) 在大小前面显示 "N 个文件夹, M 个文件"
        HFS.onEvent('additionalEntryDetails', ({ entry }) => {
            if (!entry || !entry.isFolder) return
            if (entry.fc == null || entry.dc == null) return
            const files = Number(entry.fc)
            const folders = Number(entry.dc)
            if (!isFinite(files) || !isFinite(folders)) return
            return h('span', { className: 'fs-counts' },
                folders + ' 个文件夹, ' + files + ' 个文件')
        })

        // 2) 菜单条里的切换按钮：递归(tree) <-> 列表(ls)
        function ModeButton() {
            const [mode, setModeState] = useState(getMode())
            return h(Btn, {
                icon: mode === 'tree' ? 'archive' : 'list',
                label: mode === 'tree' ? '递归' : '列表',
                toggled: mode === 'ls',
                tooltip: mode === 'tree'
                    ? '大小始终为总量；文件/文件夹数量为递归总数。点击改为只显示本层数量。'
                    : '大小始终为总量；文件/文件夹数量只显示本层直接子项。点击改为递归总数。',
                onClick() {
                    const m = mode === 'tree' ? 'ls' : 'tree'
                    setMode(m)
                    setModeState(m)
                    HFS.reloadList()
                },
            })
        }
        HFS.onEvent('appendMenuBar', () => h(ModeButton))
    }
}
