# DSH 插件装不上 / 更新不了：按症状查

六种症状，每条给一句原因、一条诊断命令、一个处理动作。**只有我们亲手量过的才写成结论**；没量过的分支会明确标注。

## 1. 命令报 `ERR_PNPM_NO_MATCHING_VERSION`

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

**原因**：宿主的发布等待期（`minimumReleaseAge`，默认 1440 分钟）。浮动范围只解析**最高成熟版本**，装到旧版不报错。

**诊断**：

```bash
npm view <name> time --registry=https://registry.npmjs.org | tail -3
# 把某版本的发布时间 + 24 小时，与当前时间比较
```

**处理**：等它成熟；或者用精确版本装（前提是元数据里已有，见第 1 条）。

## 3. 从此再也不自动更新了

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

## 这套判断的依据

每条结论都来自可复现的实测，完整时间常数、命令与自我修正记录在[发布与收录手册](https://zjukop3.github.io/dsh-review-outbox/operations/)里。若你测到的与这里不同，**以你的复现结果为准** —— 我们只保证"我们量到的是这样"，不保证别的环境一定相同。
