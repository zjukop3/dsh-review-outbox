import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'

function nextPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

/** Open the source Session, then route an artifact through DSH's native viewer. */
export async function openNativeArtifact(ctx, item, { waitForSurface = nextPaint } = {}) {
  if (!item?.sessionId || typeof item.path !== 'string') throw new Error('该成果没有可定位的来源会话')
  const sidebar = ctx.get('sidebarRight')
  const workspace = ctx.get('uiWorkspace')
  if (typeof sidebar?.openResource !== 'function') throw new Error('当前宿主未提供文档 Viewer')
  if (typeof workspace?.openSession !== 'function') throw new Error('当前宿主无法打开成果来源会话')
  const address = fileAddressFor(item.sessionId, item.cwd || undefined, item.path)
  workspace.openSession(item.sessionId)
  await waitForSurface()
  sidebar.openResource(address)
  return address
}
