# Review Outbox 静态搜索站点

这是一个无需后端、无需外部资源的静态站点，用可独立使用的研究报告验收清单承接自然搜索，并让访问者直接打开真实验收单。

## 文件

- `research-report/index.md`：页面正文源文件。
- `research-report/annotations.json`：歸藏 Page 排版标注。
- `research-report/index.html`：可索引的完整页面，默认不请求外部资源。
- `research-report/receipt-example.html`：当前固定提交首次价值流程实际下载的独立验收单。
- `research-report/first-value.png`：历史密封报告自动回填、默认 `0/4` 验收包的真实界面截图。
- `index.html`：以 0.1.1 应用内安装为主路径的站点首页。
- `robots.txt`、`sitemap.xml`、`llms.txt`：搜索与 Agent 发现入口。

## 重新生成

先使用歸藏 Page 渲染正文，再执行构建脚本：

```bash
node /path/to/guizang-page-skill/scripts/render.mjs \
  site/research-report/index.md \
  site/research-report/annotations.json \
  site/research-report/index.html \
  --style swiss --theme ikb

PUBLIC_ORIGIN='https://zjukop3.github.io/dsh-review-outbox' node scripts/build-research-site.mjs
```

`PUBLIC_ORIGIN` 必须是站点实际公开根地址，例如 `https://your-org.github.io/dsh-review-outbox`。不传时不生成 canonical、Open Graph URL 或 sitemap 链接，避免把测试地址当成正式域名。

每次修改 Markdown 后都要先重新渲染，再运行构建脚本，避免重复注入元数据。

## 本地验证

```bash
python3 -m http.server 43222 --bind 127.0.0.1 --directory site
PUBLIC_ORIGIN='http://127.0.0.1:43222' node scripts/build-research-site.mjs
node scripts/e2e-research-site.mjs
```

验证脚本检查 SEO 元数据、三类结构化数据、清单和 FAQ 数量、0.1.1 应用内索引、固定提交 CLI、首值图片加载、当前验收单导航、首页跳转、移动端横向溢出、离线打开、外部请求和浏览器错误。生产构建后将 `SITE_URL=https://zjukop3.github.io/dsh-review-outbox` 传入同一脚本可复测公网版本。

## 部署

将 `site/` 整个目录发布到任意静态托管。部署后用真实 `PUBLIC_ORIGIN` 重新构建一次。站点没有 cookie、遥测、后端写入或外部字体请求。

公开部署由 `.github/workflows/pages.yml` 完成，推送到 `main` 后构建并发布 `site/`。`site/downloads/` 保存已验证的插件 tarball 与 SHA-256 文件。公开站点是自然获客基础设施，不代表已经产生搜索曝光、访问或激活数据。
