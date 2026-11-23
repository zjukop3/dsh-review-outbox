# DSH 插件装不上 / 更新不了：按症状查

九种症状，每条给一句原因、一条诊断命令、一个处理动作。**只有我们亲手量过的才写成结论**；没量过的分支会明确标注。

## 1. 命令报 `ERR_PNPM_NO_MATCHING_VERSION`

你会看到的原文（pnpm）:

```
ERR_PNPM_NO_MATCHING_VERSION  No matching version found for <name>@<version>
while fetching it from https://registry.npmmirror.com/
```

**原因**：你请求的那个版本不在 registry 的**元数据**里。注意 tarball 与元数据是两件事：文件可能已经在服务，元数据还没更新。

**诊断**：

```bash
curl -s https://registry.npmmirror.com/<name> | grep -o '"latest":"[^"]*"'
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmmirror.com/<name>/-/<name>-<version>.tgz
```

第二个命令返回 `302` 而第一个里没有这个版本 —— 就是这种情况。

**处理**：等镜像追平；或换上游 registry 再装：

```bash
mkdir -p /tmp/npmjs && printf 'registry=https://registry.npmjs.org\n' > /tmp/npmjs/.npmrc
node "$PNPM" add <name>@<version> --config.userconfig=/tmp/npmjs/.npmrc
```

## 2. 装上了，但装到的是旧版本

你会看到的原文（安装输出里的这一行）:

```
+ dsh-review-outbox 0.1.3
```

明明 npm 上已经有更新的版本，这里却是旧的。

**原因**：宿主的发布等待期（`minimumReleaseAge`，默认 1440 分钟）。浮动范围只解析**最高成熟版本**，装到旧版不报错。

**诊断**：

```bash
npm view <name> time --registry=https://registry.npmjs.org | tail -3
# 把某版本的发布时间 + 24 小时，与当前时间比较
```

**处理**：等它成熟；或者用精确版本装（前提是元数据里已有，见第 1 条）。

## 3. 从此再也不自动更新了

你会看到的原文（profile 的 `package.json`）:

```json
"dependencies": { "<name>": "1.2.3" }     ← 冻住
"dependencies": { "<name>": "^1.2.3" }    ← 会更新
```

**原因**：装的时候写成了精确版本。精确 spec 是上限，`pnpm update` 也不会越过它。

**诊断**：

```bash
node -e "console.log(require('<DSH_HOME>/profiles/web/package.json').dependencies['<name>'])"
# 输出 ^1.2.3 → 会更新；输出 1.2.3 → 冻住
```

**处理**：把 spec 改成 `^<当前版本>` 再 `pnpm install`；或重跑一遍不带版本的安装命令。

## 4. 市场卡片上的版本和装下去的不一样

**原因**：两者来源不同。卡片来自目录（每天重建一次），安装按精确版本取最新发布版。**这不是故障。**

**诊断**：装完看 profile 里实际版本，而不是看卡片：

```bash
node -e "console.log(require('<DSH_HOME>/profiles/web/node_modules/<name>/package.json').version)"
```

**处理**：不需要处理。要判断"是否落后"看这个命令的输出。

## 5. 目录里根本没有，或版本停在几天前

**原因**：目录每天构建一次（约 `04:46Z`），且只收录**已发布到 npm 且 `repository` 字段指回被收录仓库**的包。

**诊断**：

```bash
npm view dsh-plugin-catalog time --registry=https://registry.npmjs.org | tail -5
```

**处理**：等下一次构建；若包已发布但一直不出现，先检查 `repository` 字段。

## 6. 其它插件被我这次安装/更新连带拦住

**这条我们没有实测**，只在上游 issue 里读到：pnpm 在改动前会校验整个 lockfile，某个仍在等待期内的版本可能让**所有**插件的安装被拒。对应处理是在该 profile 的 `pnpm-workspace.yaml` 里给那个包追加豁免行。

**处理前请先读上游讨论**，不要照抄我们的转述：[dsh-market#944](https://github.com/dsh-market/dsh-market/issues/944)。

---

## 7. `npx 包名` 报 `could not determine executable to run`

**症状**：包在 npm 上明明有，`npx dsh-dockerfile-check` 却直接失败：

```
npm error could not determine executable to run
```

**原因几乎总是镜像同步不完整，不是包坏了。** npm 的 `npx` 靠包清单里的 `bin` 字段决定跑哪个可执行文件；镜像站（npmmirror 等）在包刚发布后的同步窗口里，可能先有了包体、`bin` 字段还没跟上。用官方 registry 一验就能分辨：

```bash
npx --yes --registry=https://registry.npmjs.org dsh-dockerfile-check@latest Dockerfile
```

2026-11-18 实测：当天两个最新发布的包（dsh-dockerfile-check、dsh-pr-description-check）在默认镜像上就是这个错，切到官方 registry 后**两个都正常运行**；同一批更早发布的包在镜像上正常。也就是说这是一段时效性的同步延迟，不是包的缺陷。

**如果确实要用镜像**：等同步（通常几小时内），或显式指定官方源跑一次，或 `npm i -g 包名 --registry=https://registry.npmjs.org` 后再用命令。

**顺带一条**：`dsh-hashcheck` 有子命令，`npx dsh-hashcheck 某文件` 会以出口码 2 打印用法——那是设计内的用法错误，不是装坏了。正确用法是 `npx dsh-hashcheck build <目录>` / `npx dsh-hashcheck verify <清单>`。

## 8. `dsh plugin add` 报 `error: --profile <name> is required`

**症状**：照 README 或目录页抄了安装命令，得到：

```
error: --profile <name> is required
```

**原因**：`dsh plugin` 的 `--profile` 是必填项（CLI `0.2.2-rc.5`）。安装命令必须指明装到哪个 profile；`dsh plugin add <包名>` 这种写法从来就不成立。

```bash
dsh plugin --profile web add <包名>          # Web profile
dsh plugin --profile desktop add <包名>      # Desktop 应用
```

装完核实它真的在：

```bash
dsh plugin --profile web why <包名>
```

## 9. `ERR_PNPM_TARBALL_EXTRACT … Invalid checksum for TAR header`

**症状**：安装在国内镜像上失败，报错指向一个 `<包名>-0.0.0-stage.tgz`：

```
ERR_PNPM_TARBALL_EXTRACT  Failed to add tarball from
"https://registry.npmmirror.com/<name>/-/<name>-0.0.0-stage.tgz"
to store: Invalid checksum for TAR header at offset 2560
```

**原因**：镜像的 `dist-tags.latest` 停在那个包**首发时**的空壳占位包上（通常只有 2 个文件、几百字节），而上游 npmjs 的 `latest` 早已是正式版。这是镜像的指针问题，不是包的问题——我们自己的 `dsh-check-suite` 在 2026-11-23 就是这样：上游 `latest` 已经是 `0.1.0` 好几个小时，镜像仍报 `0.0.0-stage`。

**诊断**（两边一对比就清楚）：

```bash
curl -s https://registry.npmjs.org/<name>      | grep -o '"latest":"[^"]*"'
curl -s https://registry.npmmirror.com/<name>  | grep -o '"latest":"[^"]*"'
```

**处理**，按顺序试：

```bash
# 一：钉住版本，绕开镜像的 latest
dsh plugin --profile web add <包名>@<版本>
# 二：这一次直接走上游
dsh plugin --profile web add --registry=https://registry.npmjs.org <包名>
# 三：让镜像重新抓取，然后等（实测约六分钟后跟上，不是立刻）
curl -X PUT https://registry.npmmirror.com/<name>/sync
```

触发后同一条命令在镜像上成功（`resolved 28, downloaded 28, done in 7.1s`）。

## 这套判断的依据

每条结论都来自可复现的实测，完整时间常数、命令与自我修正记录在[发布与收录手册](https://zjukop3.github.io/dsh-review-outbox/operations/)里。若你测到的与这里不同，**以你的复现结果为准** —— 我们只保证"我们量到的是这样"，不保证别的环境一定相同。
