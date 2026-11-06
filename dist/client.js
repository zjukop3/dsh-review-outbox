window.__ModuleLoader__.load({
	id: "dsh-review-outbox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		// client/better-sidebar.js
		/** Mount an optional better-sidebar contribution and mirror its service lifetime. */
		function watchBetterSidebar(ctx, mount) {
			let dispose;
			const attach = (service) => {
				dispose?.();
				dispose = void 0;
				if (typeof service?.registerTab === "function") dispose = mount(service);
			};
			const off = ctx.on("internal/service", (name, service) => {
				if (name === "betterSidebar") attach(service);
			});
			attach(ctx.get("betterSidebar"));
			return () => {
				off();
				dispose?.();
				dispose = void 0;
			};
		}
		// node_modules/.pnpm/@deepseek-ai+dsh-util-workspace-path@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
		/**
		* The `dsh-resource://file/…` address grammar: how a file is named across the
		* Sidebar and the resource model, built and parsed without touching a
		* filesystem.
		* @module
		*/
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Component-encode one id or path segment, keeping `:` literal for drive letters. */
		function encodeSegment(segment) {
			return encodeURIComponent(segment).replace(/%3A/gi, ":");
		}
		/** Encode a `/`-separated path segment by segment. */
		function encodePath(path) {
			return path.split("/").map(encodeSegment).join("/");
		}
		/**
		* Build the address of a file read through one Session.
		* @param sessionId - the Session whose Host workspace resolves the path.
		* @param path - absolute or workspace-relative path; backslashes are normalized to `/`, and leading `./` prefixes are dropped.
		* @returns the `dsh-resource://file/session/<sessionId>/<path>` address.
		*/
		function sessionFileAddress(sessionId, path) {
			const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
			return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
		}
		/**
		* Browser-safe Workspace path and display helpers.
		* @module @deepseek-ai/dsh-util-workspace-path
		*/
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Whether a path is absolute in either spelling the Host accepts: POSIX (`/a/b`) or Windows drive or UNC.
		* @param path - the path to classify.
		* @returns `true` for an absolute path; `false` for a Workspace-relative one.
		*/
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* The address for a path as a caller holds it: a relative path, or an absolute
		* path inside the Session's workspace, becomes a `session`-scoped address; an
		* absolute path outside it, or one whose workspace root is unknown, keeps its
		* absolute path in that Session's address.
		* @param sessionId - the Session the path is read in.
		* @param cwd - that Session's workspace root, when known.
		* @param path - absolute or workspace-relative path, in either separator spelling.
		* @returns the `dsh-resource://file/…` address.
		*/
		function fileAddressFor(sessionId, cwd, path) {
			const normalized = path.replace(/\\/g, "/");
			if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
			const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
			if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
			if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}
		// client/native-open.js
		function nextPaint() {
			return new Promise((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(resolve));
			});
		}
		/** Open the source Session, then route an artifact through DSH's native viewer. */
		async function openNativeArtifact(ctx, item, { waitForSurface = nextPaint } = {}) {
			if (!item?.sessionId || typeof item.path !== "string") throw new Error("该成果没有可定位的来源会话");
			const sidebar = ctx.get("sidebarRight");
			const workspace = ctx.get("uiWorkspace");
			if (typeof sidebar?.openResource !== "function") throw new Error("当前宿主未提供文档 Viewer");
			if (typeof workspace?.openSession !== "function") throw new Error("当前宿主无法打开成果来源会话");
			const address = fileAddressFor(item.sessionId, item.cwd || void 0, item.path);
			workspace.openSession(item.sessionId);
			await waitForSurface();
			sidebar.openResource(address);
			return address;
		}
		// client/styles.js
		var styles_default = String.raw`
.ro-root{--ro-bg:var(--dsw-alias-bg-base,#f7f8fa);--ro-panel:var(--dsw-alias-bg-elevated,#fff);--ro-text:var(--dsw-alias-label-primary,#17202a);--ro-muted:var(--dsw-alias-label-secondary,#687180);--ro-line:var(--dsw-alias-border-primary,#dfe3e8);--ro-accent:var(--dsw-alias-brand-primary,#315efb);display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--ro-bg);color:var(--ro-text);font-family:inherit}
.ro-root *{box-sizing:border-box}.ro-header{display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 22px;border-bottom:1px solid var(--ro-line);background:var(--ro-panel)}
.ro-title{font-size:18px;font-weight:650;letter-spacing:-.01em}.ro-count{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:99px;background:var(--ro-accent);color:#fff;font-size:12px}.ro-spacer{flex:1}.ro-subtle{color:var(--ro-muted);font-size:12px}.ro-demo{padding:8px 22px;background:#fff5d6;color:#745400;font-size:12px;border-bottom:1px solid #ead79b}
.ro-toolbar{display:flex;gap:6px;padding:12px 22px;border-bottom:1px solid var(--ro-line);background:var(--ro-panel)}.ro-root button{font:inherit}.ro-tab,.ro-button{border:1px solid var(--ro-line);background:var(--ro-panel);color:var(--ro-text);border-radius:8px;padding:7px 11px;cursor:pointer}.ro-tab{font-size:12px}.ro-tab.active{border-color:var(--ro-accent);color:var(--ro-accent);background:color-mix(in srgb,var(--ro-accent) 8%,transparent)}.ro-button:hover,.ro-tab:hover{border-color:var(--ro-accent)}.ro-button:disabled{opacity:.45;cursor:not-allowed}.ro-button.primary{background:var(--ro-accent);color:#fff;border-color:var(--ro-accent)}.ro-button.danger{color:#b3261e}.ro-button.link{border:0;background:transparent;padding:4px 0;color:var(--ro-accent)}
.ro-body{display:grid;grid-template-columns:minmax(260px,34%) minmax(0,1fr);flex:1;min-height:0}.ro-list{overflow:auto;border-right:1px solid var(--ro-line);padding:12px}.ro-card{display:block;width:100%;text-align:left;padding:13px;margin-bottom:9px;border:1px solid var(--ro-line);border-radius:11px;background:var(--ro-panel);color:inherit;cursor:pointer}.ro-card.selected{border-color:var(--ro-accent);box-shadow:0 0 0 1px var(--ro-accent)}.ro-card-title{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ro-card-meta{display:flex;align-items:center;gap:7px;margin-top:7px;color:var(--ro-muted);font-size:11px}.ro-badge{display:inline-block;padding:2px 6px;border-radius:5px;background:var(--ro-bg);color:var(--ro-muted);font-size:10px}.ro-badge.pending{color:#8a5a00;background:#fff2cc}.ro-badge.approved{color:#176b3a;background:#dcf4e5}.ro-badge.returned{color:#9d332c;background:#fde6e3}.ro-badge.archived{color:#626975;background:#eceff3}.ro-card-desc{margin-top:7px;color:var(--ro-muted);font-size:12px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ro-detail{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto}.ro-detail-head{padding:18px 22px 12px;border-bottom:1px solid var(--ro-line);background:var(--ro-panel)}.ro-detail-title{margin:0;font-size:17px;line-height:1.35;word-break:break-word}.ro-path{margin-top:6px;color:var(--ro-muted);font:11px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}.ro-preview{margin:16px 22px;border:1px solid var(--ro-line);border-radius:10px;background:var(--ro-panel);min-height:160px;overflow:hidden}.ro-preview pre{margin:0;padding:16px;max-height:52vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}.ro-preview img{display:block;max-width:100%;max-height:58vh;margin:auto}.ro-preview-message{padding:32px 18px;text-align:center;color:var(--ro-muted);font-size:13px}.ro-diff-line{display:block;padding:0 12px;white-space:pre-wrap}.ro-diff-line.add{background:#e8f6ec;color:#176b3a}.ro-diff-line.del{background:#fdecea;color:#9d332c}
.ro-pack{margin:0 22px 16px;padding:14px 16px;border:1px solid var(--ro-line);border-radius:10px;background:var(--ro-panel)}.ro-pack-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ro-pack-head select{max-width:100%;padding:7px 10px;border:1px solid var(--ro-line);border-radius:8px;background:var(--ro-bg);color:var(--ro-text);font:12px inherit}.ro-pack-summary{margin:10px 0 0;color:var(--ro-muted);font-size:12px;line-height:1.55}.ro-checks{margin-top:8px}.ro-check{padding:10px 0;border-top:1px dashed var(--ro-line)}.ro-check label{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer}.ro-check label span{margin-left:auto;color:var(--ro-muted);font-size:10px}.ro-check p{margin:5px 0 7px 23px;color:var(--ro-muted);font-size:11px;line-height:1.5}.ro-check textarea{display:block;width:calc(100% - 23px);margin-left:23px;resize:vertical;padding:8px 10px;border:1px solid var(--ro-line);border-radius:7px;background:var(--ro-bg);color:var(--ro-text);font:11px/1.5 inherit}.ro-check textarea:focus{outline:1px solid var(--ro-accent);border-color:var(--ro-accent)}.ro-check textarea[readonly]{opacity:.75}
.ro-actions{padding:0 22px 20px}.ro-note{width:100%;min-height:72px;resize:vertical;padding:10px 12px;border:1px solid var(--ro-line);border-radius:9px;background:var(--ro-panel);color:var(--ro-text);font:12px/1.5 inherit}.ro-note:focus{outline:1px solid var(--ro-accent);border-color:var(--ro-accent)}.ro-action-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}.ro-history{margin:0 22px 20px;padding-top:12px;border-top:1px solid var(--ro-line)}.ro-history summary{cursor:pointer;color:var(--ro-muted);font-size:12px}.ro-history-item{padding:8px 0;border-bottom:1px dashed var(--ro-line);font-size:12px}.ro-history-note{margin-top:3px;white-space:pre-wrap;color:var(--ro-muted)}.ro-empty{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:36px;color:var(--ro-muted);text-align:center}.ro-empty strong{color:var(--ro-text);font-size:15px}.ro-error{padding:10px 14px;margin:12px 22px 0;border:1px solid #e5b2ae;background:#fdecea;color:#8c2b25;border-radius:8px;font-size:12px}.ro-footer{padding:10px 22px;border-top:1px solid var(--ro-line);color:var(--ro-muted);font-size:11px;background:var(--ro-panel)}
@media(max-width:850px){.ro-body{grid-template-columns:1fr}.ro-list{max-height:38vh;border-right:0;border-bottom:1px solid var(--ro-line)}.ro-detail{min-height:55vh}.ro-subtle{display:none}.ro-header{padding:12px 16px}.ro-toolbar{padding:10px 16px;overflow:auto}.ro-detail-head,.ro-actions{padding-left:16px;padding-right:16px}.ro-preview,.ro-history{margin-left:16px;margin-right:16px}.ro-pack{margin-left:16px;margin-right:16px}}
`;
		// client/index.jsx
		const API = "/review-outbox/api";
		const FILTERS = [
			["pending", "待审"],
			["approved", "通过"],
			["returned", "退回"],
			["archived", "归档"],
			["all", "全部"]
		];
		const STATUS_LABELS = {
			pending: "待审",
			approved: "通过",
			returned: "退回",
			archived: "归档"
		};
		const SOURCE_LABELS = {
			presented: "交付",
			"workspace-change": "变更",
			demo: "示例"
		};
		async function request(path, options = {}) {
			const response = await fetch(`${API}/${path}`, {
				...options,
				headers: {
					"content-type": "application/json",
					...options.headers || {}
				}
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
			return data;
		}
		function basename(path) {
			return String(path || "").split(/[\\/]/).filter(Boolean).pop() || path;
		}
		function timeLabel(value) {
			if (!value) return "";
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit"
			});
		}
		function Preview({ preview, loading, error }) {
			if (loading) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: "正在读取成果…"
			});
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: error
			});
			if (!preview) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: "选择左侧成果查看内容"
			});
			if (preview.kind === "text") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [preview.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-demo",
				children: "仅显示前 512 KiB，原始文件未被修改"
			}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: preview.content })] });
			if (preview.kind === "image") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src: preview.dataUrl,
				alt: "成果预览"
			});
			if (preview.kind === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: "官方仅在原会话仍存活时提供变更对比。成果元数据与审阅状态仍保留在本地。"
			});
			if (preview.kind === "unsupported") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: "此格式不在本面板内嵌预览。可使用宿主 Viewer，或记录审阅意见与处理状态。"
			});
			if (preview.kind === "binary" || preview.kind === "oversized") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: "该文件为二进制或超出预览上限。"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "ro-preview-message",
				children: "暂无可显示内容"
			});
		}
		function DiffPreview({ preview, loading, error }) {
			if (loading || error || !preview || preview.kind !== "text") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, {
				preview,
				loading,
				error
			});
			const lines = preview.hunks.flatMap((hunk, hunkIndex) => [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "ro-diff-line",
				children: [
					"@@ -",
					hunk.oldStart,
					",",
					hunk.oldLines,
					" +",
					hunk.newStart,
					",",
					hunk.newLines,
					" @@"
				]
			}, `h-${hunkIndex}`), ...hunk.lines.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `ro-diff-line ${line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : ""}`,
				children: line
			}, `${hunkIndex}-${index}`))]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: lines });
		}
		function Outbox({ openSession, openNative, active = true }) {
			const [items, setItems] = react.default.useState([]);
			const [pending, setPending] = react.default.useState(0);
			const [filter, setFilter] = react.default.useState("pending");
			const [selectedId, setSelectedId] = react.default.useState("");
			const [preview, setPreview] = react.default.useState(null);
			const [previewLoading, setPreviewLoading] = react.default.useState(false);
			const [previewError, setPreviewError] = react.default.useState("");
			const [note, setNote] = react.default.useState("");
			const [error, setError] = react.default.useState("");
			const [busy, setBusy] = react.default.useState(false);
			const [stateError, setStateError] = react.default.useState(null);
			const [packs, setPacks] = react.default.useState([]);
			const [checkDetails, setCheckDetails] = react.default.useState({});
			const [checkChecked, setCheckChecked] = react.default.useState({});
			const requestVersion = react.default.useRef(0);
			const checkQueue = react.default.useRef(Promise.resolve());
			const load = react.default.useCallback(async (quiet = false) => {
				const version = ++requestVersion.current;
				if (!quiet) setError("");
				try {
					const data = await request("items");
					if (version !== requestVersion.current) return;
					setItems(data.items);
					setPending(data.pending);
					setStateError(data.stateError);
					setSelectedId((current) => {
						if (current && data.items.some((item) => item.id === current)) return current;
						return data.items.find((item) => item.status === "pending")?.id || data.items[0]?.id || "";
					});
				} catch (cause) {
					if (!quiet) setError(cause.message);
				}
			}, []);
			react.default.useEffect(() => {
				load();
				const timer = setInterval(() => {
					if (active && document.visibilityState === "visible") load(true);
				}, 5e3);
				return () => clearInterval(timer);
			}, [load, active]);
			react.default.useEffect(() => {
				request("packs").then((data) => setPacks(data.packs || [])).catch((cause) => setError(cause.message));
			}, []);
			const filtered = react.default.useMemo(() => filter === "all" ? items : items.filter((item) => item.status === filter), [filter, items]);
			const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
			const selectedPack = packs.find((pack) => pack.id === selected?.reviewPack?.id) || null;
			react.default.useEffect(() => {
				setCheckDetails(Object.fromEntries(Object.entries(selected?.reviewPack?.checks || {}).map(([id, state]) => [id, state.detail || ""])));
				setCheckChecked(Object.fromEntries(Object.entries(selected?.reviewPack?.checks || {}).map(([id, state]) => [id, state.checked === true])));
			}, [selected?.id, selected?.updatedAt]);
			react.default.useEffect(() => {
				if (!selected) {
					setPreview(null);
					return;
				}
				setNote(selected.reviewNote || "");
				let cancelled = false;
				setPreviewLoading(true);
				setPreviewError("");
				request(`${selected.sourceType === "workspace-change" ? "diff" : "preview"}?id=${encodeURIComponent(selected.id)}`).then((data) => {
					if (!cancelled) setPreview(data.preview);
				}).catch((cause) => {
					if (!cancelled) setPreviewError(cause.message);
				}).finally(() => {
					if (!cancelled) setPreviewLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				selected?.id,
				selected?.updatedAt,
				selected?.sourceType
			]);
			const choosePack = async (packId) => {
				if (!selected) return;
				setBusy(true);
				setError("");
				try {
					const data = await request("pack", {
						method: "POST",
						body: JSON.stringify({
							id: selected.id,
							packId
						})
					});
					setItems(data.items);
					setPending(data.pending);
				} catch (cause) {
					setError(cause.message);
				} finally {
					setBusy(false);
				}
			};
			const saveCheck = (checkId, checked) => {
				if (!selected?.reviewPack) return checkQueue.current;
				const itemId = selected.id;
				const detail = checkDetails[checkId] || "";
				const previous = selected.reviewPack.checks?.[checkId];
				setCheckChecked((current) => ({
					...current,
					[checkId]: checked
				}));
				if (previous?.checked === checked && previous?.detail === detail) return checkQueue.current;
				const run = async () => {
					setBusy(true);
					setError("");
					try {
						const data = await request("check", {
							method: "POST",
							body: JSON.stringify({
								id: itemId,
								checkId,
								checked,
								detail
							})
						});
						setItems(data.items);
						setPending(data.pending);
					} catch (cause) {
						setError(cause.message);
					} finally {
						setBusy(false);
					}
				};
				checkQueue.current = checkQueue.current.then(run, run);
				return checkQueue.current;
			};
			const act = async (action) => {
				if (!selected) return;
				if (action === "return" && !note.trim()) {
					setError("退回成果时请写明需要修改的内容");
					return;
				}
				await checkQueue.current;
				setBusy(true);
				setError("");
				try {
					const data = await request("action", {
						method: "POST",
						body: JSON.stringify({
							id: selected.id,
							action,
							note
						})
					});
					setItems(data.items);
					setPending(data.pending);
					const nextFilter = {
						approve: "approved",
						return: "returned",
						archive: "archived",
						reopen: "pending"
					}[action];
					if (nextFilter) setFilter(nextFilter);
				} catch (cause) {
					setError(cause.message);
				} finally {
					setBusy(false);
				}
			};
			const openSource = async () => {
				if (!selected?.sessionId) return;
				if (note.trim()) await navigator.clipboard?.writeText(note.trim()).catch(() => {});
				openSession(selected.sessionId);
			};
			const exportReceipt = async () => {
				if (!selected) return;
				await checkQueue.current;
				setBusy(true);
				setError("");
				try {
					const response = await fetch(`${API}/receipt?id=${encodeURIComponent(selected.id)}`);
					if (!response.ok) {
						const data = await response.json().catch(() => ({}));
						throw new Error(data.error || `HTTP ${response.status}`);
					}
					const blobUrl = URL.createObjectURL(await response.blob());
					const anchor = document.createElement("a");
					const name = basename(selected.path).replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-80) || "artifact";
					anchor.href = blobUrl;
					anchor.download = `${name}.review-r${selected.revision}.html`;
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
					setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
				} catch (cause) {
					setError(cause.message);
				} finally {
					setBusy(false);
				}
			};
			const openInNativeViewer = async () => {
				if (!selected) return;
				setBusy(true);
				setError("");
				try {
					await openNative(selected);
				} catch (cause) {
					setError(cause.message);
				} finally {
					setBusy(false);
				}
			};
			const isDemo = items.some((item) => item.sourceType === "demo");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "ro-root",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: styles_default }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "ro-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "ro-title",
								children: "成果审阅"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "ro-count",
								children: pending
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "ro-subtle",
								children: "Deliverables review outbox"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "ro-spacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "ro-button",
								onClick: () => load(),
								children: "刷新"
							})
						]
					}),
					isDemo ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "ro-demo",
						children: "当前包含合成示例，仅用于验证安装、预览和审阅流程。"
					}) : null,
					stateError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "ro-error",
						children: stateError
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "ro-error",
						children: error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
						className: "ro-toolbar",
						"aria-label": "成果状态筛选",
						children: FILTERS.map(([id, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: `ro-tab ${filter === id ? "active" : ""}`,
							onClick: () => setFilter(id),
							children: [
								label,
								" ",
								id === "all" ? items.length : items.filter((item) => item.status === id).length
							]
						}, id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "ro-body",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
							className: "ro-list",
							"aria-label": "成果列表",
							children: [filtered.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: `ro-card ${selected?.id === item.id ? "selected" : ""}`,
								onClick: () => setSelectedId(item.id),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "ro-card-title",
										children: basename(item.path)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "ro-card-meta",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: `ro-badge ${item.status}`,
												children: STATUS_LABELS[item.status] || item.status
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "ro-badge",
												children: SOURCE_LABELS[item.sourceType] || item.sourceType
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["r", item.revision] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: timeLabel(item.updatedAt) })
										]
									}),
									item.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "ro-card-desc",
										children: item.description
									}) : null
								]
							}, item.id)), filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "ro-empty",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "这里还没有成果" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "当 Agent 交付文件，或你切换其他状态筛选时，成果会出现在这里。" })]
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
							className: "ro-detail",
							children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: "ro-detail-head",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
											className: "ro-detail-title",
											children: basename(selected.path)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "ro-path",
											children: selected.path
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "ro-card-meta",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `ro-badge ${selected.status}`,
													children: STATUS_LABELS[selected.status]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "ro-badge",
													children: SOURCE_LABELS[selected.sourceType]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													"第 ",
													selected.revision,
													" 次交付"
												] }),
												selected.added !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													"+",
													selected.added,
													" / −",
													selected.deleted
												] }) : null
											]
										}),
										selected.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "ro-subtle",
											children: selected.description
										}) : null
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
									className: "ro-preview",
									children: selected.sourceType === "workspace-change" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiffPreview, {
										preview,
										loading: previewLoading,
										error: previewError
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, {
										preview,
										loading: previewLoading,
										error: previewError
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: "ro-pack",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "ro-pack-head",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											"aria-label": "场景验收包",
											value: selectedPack?.id || "",
											disabled: busy || selected.status !== "pending",
											onChange: (event) => choosePack(event.target.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: "通用验收（无额外检查）"
											}), packs.map((pack) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: pack.id,
												children: pack.label
											}, pack.id))]
										}), selected.reviewProgress ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "ro-subtle",
											children: [
												"必填证据 ",
												selected.reviewProgress.requiredCompleted,
												"/",
												selected.reviewProgress.requiredTotal
											]
										}) : null]
									}), selectedPack ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "ro-pack-summary",
										children: selectedPack.summary
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "ro-checks",
										children: selectedPack.checks.map((check) => {
											const state = selected.reviewPack?.checks?.[check.id] || {
												checked: false,
												detail: ""
											};
											const checked = checkChecked[check.id] ?? state.checked;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "ro-check",
												onBlur: (event) => {
													if (selected.status === "pending" && !event.currentTarget.contains(event.relatedTarget)) saveCheck(check.id, checked);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "checkbox",
															checked,
															disabled: busy || selected.status !== "pending",
															onChange: (event) => saveCheck(check.id, event.target.checked)
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: check.label }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: check.required ? "必填" : "可选" })
													] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: check.requirement }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
														"aria-label": `${check.label}证据`,
														rows: 2,
														value: checkDetails[check.id] || "",
														readOnly: selected.status !== "pending",
														placeholder: check.placeholder,
														onChange: (event) => setCheckDetails((current) => ({
															...current,
															[check.id]: event.target.value
														}))
													})
												]
											}, check.id);
										})
									})] }) : null]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: "ro-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "ro-note",
										value: note,
										onChange: (event) => setNote(event.target.value),
										placeholder: "审阅意见；退回时可复制到原会话"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "ro-action-row",
										children: [
											selected.status === "pending" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button primary",
												disabled: busy || selectedPack && !selected.reviewProgress?.complete,
												title: selectedPack && !selected.reviewProgress?.complete ? "完成所有必填检查并填写证据后可通过" : "",
												onClick: () => act("approve"),
												children: "通过"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button danger",
												disabled: busy,
												onClick: () => act("return"),
												children: "退回"
											})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button",
												disabled: busy,
												onClick: () => act("reopen"),
												children: "重新打开"
											}),
											selected.status !== "archived" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button",
												disabled: busy,
												onClick: () => act("archive"),
												children: "归档"
											}) : null,
											selected.sessionId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button",
												disabled: busy,
												onClick: openInNativeViewer,
												children: "在宿主 Viewer 打开"
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button",
												disabled: busy,
												onClick: exportReceipt,
												title: "独立 HTML，不包含成果正文或本机路径",
												children: "导出验收单"
											}),
											selected.sessionId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "ro-button",
												onClick: openSource,
												children: "复制意见并打开原会话"
											}) : null
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
									className: "ro-history",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
										"查看处理历史（",
										selected.history?.length || 0,
										"）"
									] }), [...selected.history || []].reverse().slice(0, 20).map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "ro-history-item",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: entry.action }),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "ro-subtle",
												children: timeLabel(entry.at)
											}),
											entry.note ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "ro-history-note",
												children: entry.note
											}) : null
										]
									}, `${entry.at}-${index}`))]
								})
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "ro-empty",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "选择一项成果开始审阅" })
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", {
						className: "ro-footer",
						children: "本地保存审阅状态 · 通过仅表示审阅完成，不会自动发布 · 普通问题与审批不进入此列表"
					})
				]
			});
		}
		function PanelIcon({ size = 18 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M7 3h7l4 4v14H7z",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M14 3v5h4M10 13l2 2 4-4",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})]
			});
		}
		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: "review-outbox"
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Outbox, {
				openSession: (id) => ctx.get("uiWorkspace")?.openSession(id),
				openNative: (item) => openNativeArtifact(ctx, item)
			})));
			ctx.effect(() => watchBetterSidebar(ctx, (sidebar) => sidebar.registerTab({
				id: "review-outbox",
				title: () => "成果审阅",
				description: () => "审阅 Agent 成果、检查证据并导出验收单",
				icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelIcon, { size }),
				order: 6,
				single: true,
				bottomOnly: true,
				component: ({ visible }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Outbox, {
					active: visible,
					openSession: (id) => ctx.get("uiWorkspace")?.openSession(id),
					openNative: (item) => openNativeArtifact(ctx, item)
				})
			})));
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: "review-outbox",
				order: 6,
				label: () => "成果审阅"
			}, PanelIcon)));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map