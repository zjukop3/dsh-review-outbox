# 发布新包名时会先落一个 `0.0.0-stage` 占位包

2026-11-20 发 `dsh-check-suite@0.1.0` 时遇到的，记下来免得下次当成失败。

## 症状

```
$ npm publish --registry=https://registry.npmjs.org
+ dsh-check-suite@0.1.0                         # 看起来发了

$ curl -sS https://registry.npmjs.org/dsh-check-suite | jq '."dist-tags"'
{ "latest": "0.0.0-stage" }                     # 实际只有占位包

$ curl -sSL https://registry.npmjs.org/dsh-check-suite/-/dsh-check-suite-0.1.0.tgz
{"error":"Not found"}                            # 真正的 tarball 还没放出来
```

占位包的 manifest 只有一句话：`Temporary package placeholder for staged publishing`，
内容就是一个 `package.json` 和一个 `README.md`，`maintainers` 是我自己。

## 事实

1. 新包名的**第一次** `npm publish` 只建了占位包 `0.0.0-stage`，`0.1.0` 没有进 `versions`。
2. **再发一次**同名同版本，`0.1.0` 就进了 `versions`，`dist-tags.latest` 也指到 `0.1.0`，
   npm 不再报 "cannot publish over the previously published versions"。
3. 但 `dist.tarball` 仍会在一段时间内返回 `{"error":"Not found"}`；实测约 1 分钟后可取到
   5 KiB 的 tarball，里面 8 个文件都在、patch 27 行完整。
4. 已在册的包名（本轮另发的 27 个）不受影响，一次发布即正常。

## 结论（给以后的自己）

- 新包名发布后，**判据不是 `npm publish` 的输出行**，而是
  `registry/<name>` 的 `dist-tags.latest` 等于你刚发的版本，且 `dist.tarball` 能下到真包。
- 第一次发布只拿到 `0.0.0-stage` 时，**原样再发一次**即可，不需要改名、不需要等一天。
- 与之前那三次假绿灯（`git push | grep`、`grep up-to-date`、`[ $? -eq 0 ]`）同族：
  看到了「成功的样子」，没去看「成功应该留下的痕迹」。

## 复现命令

```sh
npm publish --registry=https://registry.npmjs.org
curl -sS https://registry.npmjs.org/<name> | grep -o '"latest":"[^"]*"'
curl -sSL https://registry.npmjs.org/<name>/-/<name>-<version>.tgz | tar tz | head
```