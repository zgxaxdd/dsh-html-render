# dsh-html-render（DSH profile bundle）

Out-of-tree profile bundle 形态的 dsh-html-render —— 由仓库根的 `tools/build-bundle.mjs` 生成，请勿手改。

```sh
dsh plugin --profile web add dsh-html-render        # npm 形态（发布后）
dsh plugin --profile web add link:<本目录绝对路径>    # 本地 link 形态
```

- Host 半边（lib/index.js）：KaTeX 资产路由 + systemPrompt 围栏契约 + 打包 skill
- Client 半边（lib/client.js）：ModuleLoader 包装的渲染内核（v3.4.0，资产基座指向插件路由）
- 卸载：`dsh plugin --profile web remove dsh-html-render`

与磁盘补丁形态互斥守卫：两形态同时存在时由 `window.__dshHtmlRenderer` 版本守卫保证只有一个内核实例运行；建议插件形态下卸载磁盘补丁（`node install.mjs --uninstall`）。
