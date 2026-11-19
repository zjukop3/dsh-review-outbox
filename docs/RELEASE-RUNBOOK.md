# 发布 runbook（review-outbox）

每次 release 的完整步骤。顺序与一致性由 `test/site-build.test.js` 的幂等断言把关——漏一步 `npm run check` 就会红。

## 前置条件

- Node ≥ 22.19 与 npm；已 `npm login` 到 **registry.npmjs.org**（本机 `.npmrc` 指向 npmmirror，所以发布命令必须显式 `--registry=https://registry.npmjs.org`）。
- `gh` 已认证，且是 `zjukop3` 这个账号——发布 pin 里要写 commit，目录 PR 也从这个账号发。
- 工作区干净（`git status --porcelain` 无输出）。带未提交改动发布会把上一个批次的半成品打进包里。
- 能直连 github.com:443；这台机器上会间歇失败，推送按重试写。

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

## 版本声明清单（发布前逐项 grep 核对）

版本号散落在多份文本里，每次发布全量对齐。逐项替换 `0.1.10` → 新版本，`grep -rn '0\.1\.10' README.md README.en.md site/` 计数为 0（`0.1.0` 旧包链接是刻意保留的历史产物，不计）：

| 位置 | 内容 |
|---|---|
| `README.md` 头部导航 | 「应用内安装 0.1.x」 |
| `README.md` 验证段 | 「当前源码与应用内索引为 0.1.x」+ npm 版本引用 |
| `README.md` CLI 回退段 | 「同一个 0.1.x 公开提交」 |
| `README.md` pin 语义示例 | `@0.1.x` |
| `README.en.md` 头部导航 | "Install 0.1.x in DSH" |
| `README.en.md` 验证段 | "Current source and the application index are 0.1.x" + npm 版本引用 |
| `README.en.md` CLI 回退段 | "the same public 0.1.x commit" |
| `README.en.md` pin 语义示例 | `@0.1.x` |
| `site/research-report/index.html`（自举源） | CLI 回退 commit、安装标题、确认版本 |
| `market-release.json` | commit + notes |
| `CHANGELOG.md` | 新版本条目 |

## 已知口径

- **市场可见性冷却**：`minimumReleaseAge` 1440 分钟——发布当晚应用内默认命令装到的是旧版，显式钉版本不受限；
- **镜像故障**：registry.npmmirror.com 整体 500 时连显式版本也报 `ERR_PNPM_NO_MATCHING_VERSION`，等待即可；
- npm 页 README 随发布流动，repo README 的改动在下次 release 才到 npm。
- **发布前先查 dist-tags**：`npm view <pkg> dist-tags`——版本线不是从 0.1.0 线性生长的，填空降一个旧版本号会落库但 latest 不动（实测 dsh-outline-lint：0.1.1 落库后 latest 仍是 0.1.2，补发 0.1.3 才让修正进 latest）；
- registry 元数据缓存与镜像同步各有延迟：版本端点先 200、dist-tags 后翻转、镜像再滞后——每一步都实测后再走下一步。
