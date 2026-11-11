/**
 * @param {{ tables: { id: string, game: string }[], layouts: Record<string, { mode?: string, groups?: { id: string, name: string, tableIds: string[] }[] }> }} prefs
 * @param {string} game
 */
export function layoutMode(prefs, game) {
  const mode = prefs.layouts[game]?.mode;
  return mode === 'configuration' || mode === 'custom' ? mode : 'language';
}

/**
 * @param {{ id: string, game: string, language: string, configuration: string, definition: string }[]} tables
 * @param {'language' | 'configuration'} mode
 * @param {{ languageLabel: (code: string) => string, configurationLabel: (id: string) => string, definitionIndex: (id: string) => number }} labels
 */
export function derivedGroups(tables, mode, labels) {
  const sorted = [...tables].sort((a, b) => {
    const lang = labels.languageLabel(a.language).localeCompare(labels.languageLabel(b.language));
    const config = labels.configurationLabel(a.configuration).localeCompare(labels.configurationLabel(b.configuration));
    if (mode === 'language') {
      if (lang) return lang;
      if (config) return config;
    } else {
      if (config) return config;
      if (lang) return lang;
    }
    return labels.definitionIndex(a.definition) - labels.definitionIndex(b.definition);
  });
  /** @type {Map<string, { id: string, name: string, tableIds: string[] }>} */
  const groups = new Map();
  for (const table of sorted) {
    const id = mode === 'language' ? `lang:${table.language}` : `cfg:${table.configuration}`;
    const name = mode === 'language' ? labels.languageLabel(table.language) : labels.configurationLabel(table.configuration);
    let group = groups.get(id);
    if (!group) {
      group = { id, name, tableIds: [] };
      groups.set(id, group);
    }
    group.tableIds.push(table.id);
  }
  return [...groups.values()];
}

/**
 * @param {{ tables: { id: string, game: string, language: string, configuration: string, definition: string }[], layouts: Record<string, { mode?: string, groups?: { id: string, name: string, tableIds: string[] }[] }> }} prefs
 * @param {string} game
 * @param {{ languageLabel: (code: string) => string, configurationLabel: (id: string) => string, definitionIndex: (id: string) => number }} labels
 */
export function viewGroups(prefs, game, labels) {
  const tables = prefs.tables.filter((table) => table.game === game);
  const known = new Set(tables.map((table) => table.id));
  if (layoutMode(prefs, game) !== 'custom') return derivedGroups(tables, layoutMode(prefs, game) === 'configuration' ? 'configuration' : 'language', labels);
  const seen = new Set();
  const groups = (prefs.layouts[game]?.groups || []).map((group) => {
    const tableIds = group.tableIds.filter((id) => known.has(id) && !seen.has(id));
    for (const id of tableIds) seen.add(id);
    return { id: group.id, name: group.name, tableIds };
  });
  const missing = tables.filter((table) => !seen.has(table.id)).map((table) => table.id);
  if (missing.length) {
    const last = groups[groups.length - 1];
    if (last) last.tableIds.push(...missing);
    else groups.push({ id: `lang:${tables[0].language}`, name: labels.languageLabel(tables[0].language), tableIds: missing });
  }
  return groups;
}

/**
 * @param {object} prefs
 * @param {string} game
 * @param {{ mode: string, groups?: { id: string, name: string, tableIds: string[] }[] }} layout
 */
function withLayout(prefs, game, layout) {
  return { ...prefs, layouts: { ...prefs.layouts, [game]: layout } };
}

/**
 * @param {object} prefs
 * @param {string} game
 * @param {'language' | 'configuration'} mode
 */
export function setArrangement(prefs, game, mode) {
  return withLayout(prefs, game, { mode });
}

/**
 * @param {object} prefs
 * @param {string} game
 * @param {{ languageLabel: (code: string) => string, configurationLabel: (id: string) => string, definitionIndex: (id: string) => number }} labels
 */
export function materialize(prefs, game, labels) {
  if (layoutMode(prefs, game) === 'custom' && Array.isArray(prefs.layouts[game]?.groups)) return prefs;
  const groups = viewGroups(prefs, game, labels).map((group) => ({
    id: group.id,
    name: group.name,
    tableIds: [...group.tableIds],
  }));
  return withLayout(prefs, game, { mode: 'custom', groups });
}

/**
 * @param {object} prefs
 * @param {string} game
 * @param {string} tableId
 * @param {string} toGroupId
 * @param {string} beforeId
 * @param {{ languageLabel: (code: string) => string, configurationLabel: (id: string) => string, definitionIndex: (id: string) => number }} labels
 */
export function moveTable(prefs, game, tableId, toGroupId, beforeId, labels) {
  if (!tableId || beforeId === tableId) return prefs;
  const next = materialize(prefs, game, labels);
  const groups = (next.layouts[game].groups || []).map((group) => ({
    ...group,
    tableIds: group.tableIds.filter((id) => id !== tableId),
  }));
  const target = groups.find((group) => group.id === toGroupId);
  if (!target) return prefs;
  const index = beforeId ? target.tableIds.indexOf(beforeId) : -1;
  if (index >= 0) target.tableIds.splice(index, 0, tableId);
  else target.tableIds.push(tableId);
  return withLayout(next, game, { mode: 'custom', groups });
}

/**
 * @param {object} prefs
 * @param {string} game
 * @param {string} name
 * @param {{ languageLabel: (code: string) => string, configurationLabel: (id: string) => string, definitionIndex: (id: string) => number }} labels
 */
export function addCustomGroup(prefs, game, name, labels) {
  const next = materialize(prefs, game, labels);
  const groups = [...(next.layouts[game].groups || []), { id: crypto.randomUUID(), name, tableIds: [] }];
  return withLayout(next, game, { mode: 'custom', groups });
}

/**
 * @param {object} prefs
 * @param {string} game
 * @param {string} groupId
 */
export function removeEmptyGroup(prefs, game, groupId) {
  const layout = prefs.layouts[game];
  if (!layout || layout.mode !== 'custom') return prefs;
  return withLayout(prefs, game, {
    mode: 'custom',
    groups: (layout.groups || []).filter((group) => group.id !== groupId || group.tableIds.length),
  });
}

/**
 * @param {object} prefs
 * @param {{ id: string, game: string, language: string, configuration: string, definition: string, hidden: boolean }} table
 * @param {{ languageLabel: (code: string) => string, configurationLabel: (id: string) => string, definitionIndex: (id: string) => number }} labels
 */
export function placeNewTable(prefs, table, labels) {
  const next = { ...prefs, selected: table.game, tables: [...prefs.tables, table] };
  if (layoutMode(prefs, table.game) !== 'custom') return next;
  const groups = (prefs.layouts[table.game].groups || []).map((group) => ({
    ...group,
    tableIds: [...group.tableIds],
  }));
  if (!groups.length) {
    groups.push({
      id: `lang:${table.language}`,
      name: labels.languageLabel(table.language),
      tableIds: [],
    });
  }
  groups[groups.length - 1].tableIds.push(table.id);
  return withLayout(next, table.game, { mode: 'custom', groups });
}

/**
 * @param {object} prefs
 * @param {string} tableId
 */
export function dropTable(prefs, tableId) {
  const table = prefs.tables.find((item) => item.id === tableId);
  if (!table) return prefs;
  const tables = prefs.tables.filter((item) => item.id !== tableId);
  const layouts = { ...prefs.layouts };
  const layout = layouts[table.game];
  if (layout?.mode === 'custom') {
    layouts[table.game] = {
      mode: 'custom',
      groups: (layout.groups || []).map((group) => ({
        ...group,
        tableIds: group.tableIds.filter((id) => id !== tableId),
      })),
    };
  }
  if (!tables.some((item) => item.game === table.game)) delete layouts[table.game];
  const selected = prefs.selected === table.game && !tables.some((item) => item.game === table.game) ? '' : prefs.selected;
  return { ...prefs, tables, layouts, selected };
}
