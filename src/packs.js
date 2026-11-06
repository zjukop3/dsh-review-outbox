const RESEARCH_REPORT = {
  id: 'research-report',
  version: 1,
  label: '研究报告验收',
  summary: '核验结论证据、引用来源、数据口径、方法限制和复现信息；检查由审阅者完成，不代表自动事实核查。',
  checks: [
    {
      id: 'claims-evidence', label: '核心结论有对应证据', required: true,
      requirement: '逐条核对核心结论，记录能支持结论的正文位置、数据或原始来源。',
      placeholder: '例：结论 1 见第 3 节表 2；样本数据与结论一致。',
    },
    {
      id: 'citations-accessible', label: '引用来源可复核', required: true,
      requirement: '引用能定位到作者或机构、标题、日期及 URL/DOI，并且来源确实支持对应论断。',
      placeholder: '例：抽查引用 [1] [3] [5]，链接可访问，原文段落与报告表述一致。',
    },
    {
      id: 'data-scope', label: '数据时间与统计口径明确', required: true,
      requirement: '核对统计区间、时区、单位、样本范围和比较基线，避免把不同口径的数据直接比较。',
      placeholder: '例：数据截至 2026-10-31，UTC；金额均为人民币，同比基线一致。',
    },
    {
      id: 'method-limitations', label: '方法与限制已披露', required: true,
      requirement: '检查检索或实验方法、纳入排除标准、局限性和重要相反证据。',
      placeholder: '例：检索式与数据库已记录；仅覆盖公开中文资料的限制已说明。',
    },
    {
      id: 'reproduction', label: '复现材料可定位', required: false,
      requirement: '需要复现的报告应提供脚本、数据、环境和步骤；不适用时记录原因。',
      placeholder: '例：附录包含运行命令与依赖版本；或本次为文献综述，不涉及脚本复现。',
    },
  ],
}

const PACKS = [RESEARCH_REPORT]

export function listPacks() {
  return PACKS.map(pack => ({ ...pack, checks: pack.checks.map(check => ({ ...check })) }))
}

export function getPack(id) {
  const pack = PACKS.find(candidate => candidate.id === id)
  return pack ? { ...pack, checks: pack.checks.map(check => ({ ...check })) } : null
}

export function initialReviewPack(pack) {
  return {
    id: pack.id,
    version: pack.version,
    checks: Object.fromEntries(pack.checks.map(check => [check.id, { checked: false, detail: '' }])),
  }
}

export function reviewProgress(item) {
  const pack = getPack(item?.reviewPack?.id)
  if (!pack) return null
  const states = item.reviewPack?.checks || {}
  const required = pack.checks.filter(check => check.required)
  const complete = check => states[check.id]?.checked === true && String(states[check.id]?.detail || '').trim().length > 0
  const requiredCompleted = required.filter(complete).length
  return {
    completed: pack.checks.filter(complete).length,
    total: pack.checks.length,
    requiredCompleted,
    requiredTotal: required.length,
    complete: requiredCompleted === required.length,
    incomplete: required.filter(check => !complete(check)).map(check => check.id),
  }
}

export function assertReviewReady(item, action) {
  if (action !== 'approve' || !item?.reviewPack) return
  const pack = getPack(item.reviewPack.id)
  const progress = reviewProgress(item)
  if (pack && progress && !progress.complete) {
    const missing = pack.checks.filter(check => progress.incomplete.includes(check.id)).map(check => check.label).join('、')
    throw new Error(`完成必填检查并填写证据后才能通过：${missing}`)
  }
}
