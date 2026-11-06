/** Mount an optional better-sidebar contribution and mirror its service lifetime. */
export function watchBetterSidebar(ctx, mount) {
  let dispose
  const attach = service => {
    dispose?.()
    dispose = undefined
    if (typeof service?.registerTab === 'function') dispose = mount(service)
  }
  const off = ctx.on('internal/service', (name, service) => {
    if (name === 'betterSidebar') attach(service)
  })
  attach(ctx.get('betterSidebar'))
  return () => {
    off()
    dispose?.()
    dispose = undefined
  }
}
