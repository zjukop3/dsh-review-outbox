# 发布 runbook（review-outbox）

每次 release 的完整步骤。顺序与一致性由 `test/site-build.test.js` 的幂等断言把关——漏一步 `npm run check` 就会红。

## 1. 版本号

```bash
python3 -c "import json,pathlib;p=pathlib.Path('package.json');d=json.loads(p.read_text());d['version']='0.1.x';p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')"
```

## 2. 发布 pin（market-release.json）

```json
{ "commit": "<当前 HEAD 全 40 位>", "notes": "Version 0.1.x. <一句要点>" }
```

文档版发布同样要移动 pin——pin 钉的是「这个版本从哪个提交装」，不是「代码变了没有」。

## 3. 自举页面的烙印内容

`site/research-report/index.html` 是自举文件（构建读它再注入元数据），三处内容随版本手工更新：

- CLI 回退命令的 commit（`dsh-review-outbox#<HEAD>`）；
- 「安装 Review Outbox 0.1.x」标题；
- 「确认版本 <code>0.1.x</code>」。

「旧版 0.1.0 tarball」链接是刻意保留的历史产物，不动。

## 4. 构建与校验

```bash
npm run build:market    # 重生成 site/plugins.json（0.1.x + 新 pin）
npm run check           # 索引校验 + 链接审计 + 90 项测试 + 客户端构建
```

幂等断言会核对：落地页安装标题 == 已发布索引版本、CLI 回退命令 == 发布 pin。红了先看哪条断言，别绕过。

## 5. 发布与验证

```bash
npm publish --registry=https://registry.npmjs.org --access public
```

**验证要走版本端点 + 缓存旁路**——packument 索引（dist-tags）与版本端点的更新不同步，实测 0.1.11 发布后 dist-tags 滞后 8 分钟以上、期间直查版本 404：

```bash
curl -H 'cache-control: no-cache' 'https://registry.npmjs.org/dsh-review-outbox/0.1.x'   # 版本端点先 200
# dist-tags.latest 翻转要再等几分钟，重试报「cannot publish over」即已落库
```

## 6. 索引与站点收尾

```bash
npm run build:market && PUBLIC_ORIGIN='https://zjukop3.github.io/dsh-review-outbox' node scripts/build-research-site.mjs
git add -A && git commit && git push     # Pages 部署，sitemap 自动带上新页
node scripts/submit-indexnow.mjs          # 可选：加速重抓
```

## 已知口径

- **市场可见性冷却**：`minimumReleaseAge` 1440 分钟——发布当晚应用内默认命令装到的是旧版，显式钉版本不受限；
- **镜像故障**：registry.npmmirror.com 整体 500 时连显式版本也报 `ERR_PNPM_NO_MATCHING_VERSION`，等待即可；
- npm 页 README 随发布流动，repo README 的改动在下次 release 才到 npm。
