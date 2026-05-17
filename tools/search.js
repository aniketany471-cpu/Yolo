export async function searchTool({ prompt, config, performWebSearch, isDeep = false }) {
  if (!performWebSearch || config?.searchEnabled !== 1) return { ok: false, data: "", source: "disabled" };
  const data = await performWebSearch(prompt, config, isDeep);
  return { ok: Boolean(data), data: data || "", source: "search" };
}
