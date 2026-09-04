/* dsh-html-renderer（宿主侧）— 由 cordis_define 动态加载的 Host-only 插件
 *
 * 作用：
 *  1. 注册精确路由 /dsh-html/client.js，对外提供客户端渲染器脚本；
 *  2. 通过 webserver/index-inject 结构化注入行，在每一个 index 渲染时
 *     把 <script src="/dsh-html/client.js"> 注入 <body> 开头 —— 页面
 *     刷新即生效，无需重启 Web 服务器、无需客户端审批。
 *
 * 依赖：webServer（硬依赖）、fs（可选，用于按需读取渲染器源码文件）。
 * 渲染器源码：docs/dsh-html-render/dsh-html-client.js
 */
return {
  name: 'dsh-html-renderer',
  inject: ['webServer'],
  apply(ctx) {
    const ws = ctx.webServer
    const fs = ctx.get('fs')
    const SOURCE_PATH = 'D:\\1AAB\\非标机械设计\\docs\\dsh-html-render\\dsh-html-client.js'
    const SOURCE_DIR = 'D:\\1AAB\\非标机械设计\\docs\\dsh-html-render'
    const SOURCE_FILE = 'dsh-html-client.js'
    let cached = null

    async function loadClient() {
      if (cached !== null) return cached
      if (fs === undefined) throw new Error('fs service unavailable')
      const attempts = []
      try { attempts.push(await fs.resolve(SOURCE_PATH)) } catch (e) { /* 尝试下一种 */ }
      if (attempts.length === 0) {
        try { attempts.push(await fs.resolve(SOURCE_FILE, { cwd: SOURCE_DIR })) } catch (e) { /* 尝试下一种 */ }
      }
      if (attempts.length === 0) throw new Error('cannot resolve renderer source file')
      cached = await fs.readText(attempts[0])
      return cached
    }

    const disposers = []
    disposers.push(ws.register({
      kind: 'exact',
      path: '/dsh-html/client.js',
      handler: async (req, res) => {
        try {
          const js = await loadClient()
          res.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(js)
        } catch (error) {
          ctx.logger.warn(
            '[dsh-html-renderer] 无法加载渲染器: ' + (error instanceof Error ? error.message : String(error)),
          )
          res.writeHead(404)
          res.end()
        }
      },
    }))
    disposers.push(ctx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'script-src', placement: 'body', src: '/dsh-html/client.js' })
    }))
    ctx.effect(() => {
      for (const dispose of disposers) {
        if (typeof dispose === 'function') dispose()
      }
    })
  },
}