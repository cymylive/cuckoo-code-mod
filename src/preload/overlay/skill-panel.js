/**
 * 技能管理面板：列表渲染、新建/编辑/删除、本地导入、插入输入框
 */
const { showToast } = require('./ui');
const { sendToChat } = require('../dom/chat-input');

const SOURCE_LABELS = { custom: '自定义', local: '本地导入' };

let editingName = null;
let cachedSkills = [];

function sourceLabel(s) {
  return SOURCE_LABELS[s] || s || '自定义';
}

/** 取当前搜索关键字（去空白，小写） */
function getSearchKeyword() {
  const el = document.getElementById('cuckoo-skill-search');
  return el ? el.value.trim().toLowerCase() : '';
}

/** 技能是否匹配关键字（名称 / 简介 / 指令） */
function skillMatches(s, keyword) {
  if (!keyword) return true;
  const hay = [s.name, s.description, s.instructions].join(' ').toLowerCase();
  return hay.indexOf(keyword) !== -1;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

async function openSkillManager() {
  const panel = document.getElementById('cuckoo-skill-manager');
  if (!panel) return;
  panel.classList.remove('cuckoo-hidden');
  hideEditor();
  await renderSkillList();
}

function closeSkillManager() {
  const panel = document.getElementById('cuckoo-skill-manager');
  if (panel) panel.classList.add('cuckoo-hidden');
}

function hideEditor() {
  editingName = null;
  const editor = document.getElementById('cuckoo-skill-editor');
  if (editor) editor.classList.add('cuckoo-hidden');
  const nameEl = document.getElementById('cuckoo-skill-ed-name');
  const descEl = document.getElementById('cuckoo-skill-ed-desc');
  const instEl = document.getElementById('cuckoo-skill-ed-instructions');
  const memEl = document.getElementById('cuckoo-skill-ed-memory');
  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';
  if (instEl) instEl.value = '';
  if (memEl) memEl.checked = true;
}

function showEditor(skill) {
  const editor = document.getElementById('cuckoo-skill-editor');
  if (!editor) return;
  editor.classList.remove('cuckoo-hidden');
  editingName = skill ? skill.name : null;
  const nameEl = document.getElementById('cuckoo-skill-ed-name');
  const descEl = document.getElementById('cuckoo-skill-ed-desc');
  const instEl = document.getElementById('cuckoo-skill-ed-instructions');
  const memEl = document.getElementById('cuckoo-skill-ed-memory');
  if (nameEl) nameEl.value = skill ? skill.name : '';
  if (descEl) descEl.value = skill ? skill.description : '';
  if (instEl) instEl.value = skill ? skill.instructions : '';
  if (memEl) memEl.checked = skill ? skill.memoryEnabled !== false : true;
}

async function renderSkillList() {
  const list = document.getElementById('cuckoo-skill-list');
  if (!list) return;
  try {
    const res = await window.electronAPI.listSkills();
    if (!res || !res.success) {
      list.innerHTML = '<div class="cuckoo-session-empty">加载失败：' + escapeHtml((res && res.error) || '未知错误') + '</div>';
      return;
    }
    cachedSkills = res.skills || [];
  } catch (err) {
    list.innerHTML = '<div class="cuckoo-session-empty">加载失败：' + escapeHtml(err.message) + '</div>';
    return;
  }

  const keyword = getSearchKeyword();
  const items = keyword ? cachedSkills.filter((s) => skillMatches(s, keyword)) : cachedSkills;

  if (items.length === 0) {
    list.innerHTML = '<div class="cuckoo-session-empty">' + (keyword ? '无匹配技能' : '暂无技能，点击"新建技能"或"本地导入"') + '</div>';
    return;
  }

  list.innerHTML = items.map((s) => (
    '<div class="cuckoo-memory-item cuckoo-skill-item" data-name="' + escapeHtml(s.name) + '">' +
      '<div class="cuckoo-memory-head">' +
        '<span class="cuckoo-skill-toggle ' + (s.enabled !== false ? 'on' : 'off') + '" data-op="toggle">' + (s.enabled !== false ? '●' : '○') + '</span>' +
        '<span class="cuckoo-memory-name">' + escapeHtml(s.name) + '</span>' +
        '<span class="cuckoo-skill-src">' + escapeHtml(sourceLabel(s.source)) + '</span>' +
      '</div>' +
      (s.description ? '<div class="cuckoo-memory-content">' + escapeHtml(s.description) + '</div>' : '') +
      '<div class="cuckoo-memory-ops">' +
        '<span class="cuckoo-memory-op insert" data-op="insert">插入</span>' +
        '<span class="cuckoo-memory-op" data-op="edit">编辑</span>' +
        '<span class="cuckoo-memory-op del" data-op="del">删除</span>' +
      '</div>' +
    '</div>'
  )).join('');

  list.querySelectorAll('.cuckoo-skill-item').forEach((el) => {
    const name = el.dataset.name;
    const skill = cachedSkills.find((s) => s.name === name);
    el.querySelector('[data-op="insert"]').addEventListener('click', () => insertSkill(skill));
    el.querySelector('[data-op="edit"]').addEventListener('click', () => showEditor(skill));
    el.querySelector('[data-op="del"]').addEventListener('click', () => deleteSkillByName(name));
    el.querySelector('[data-op="toggle"]').addEventListener('click', () => toggleSkill(skill));
  });
}

function insertSkill(skill) {
  if (!skill) return;
  const text = skill.instructions;
  if (!sendToChat(text, '插入技能', 300)) {
    showToast('未找到输入框，请确保已打开聊天界面', 3000);
  } else {
    showToast('已插入技能：' + skill.name, 2000);
  }
}

async function saveEditor() {
  const nameEl = document.getElementById('cuckoo-skill-ed-name');
  const descEl = document.getElementById('cuckoo-skill-ed-desc');
  const instEl = document.getElementById('cuckoo-skill-ed-instructions');
  const memEl = document.getElementById('cuckoo-skill-ed-memory');

  const skill = {
    name: nameEl ? nameEl.value.trim() : '',
    description: descEl ? descEl.value.trim() : '',
    instructions: instEl ? instEl.value.trim() : '',
    memoryEnabled: !!(memEl && memEl.checked),
    source: 'custom',
  };
  if (!skill.name) { showToast('技能名称不能为空', 3000); return; }
  if (!skill.instructions) { showToast('指令内容不能为空', 3000); return; }

  try {
    const res = await window.electronAPI.saveSkill(skill);
    if (!res || !res.success) {
      showToast('保存失败：' + ((res && res.error) || '未知错误'), 3000);
      return;
    }
    showToast(editingName != null ? '已更新' : '已保存', 2000);
    hideEditor();
    await renderSkillList();
  } catch (err) {
    showToast('保存失败：' + err.message, 3000);
  }
}

async function deleteSkillByName(name) {
  try {
    const res = await window.electronAPI.deleteSkill(name);
    if (!res || !res.success) {
      showToast('删除失败：' + ((res && res.error) || '未知错误'), 3000);
      return;
    }
    showToast('已删除', 2000);
    await renderSkillList();
  } catch (err) {
    showToast('删除失败：' + err.message, 3000);
  }
}

async function toggleSkill(skill) {
  if (!skill) return;
  try {
    const next = !(skill.enabled !== false);
    const res = await window.electronAPI.setSkillEnabled(skill.name, next);
    if (!res || !res.success) {
      showToast('操作失败：' + ((res && res.error) || '未知错误'), 3000);
      return;
    }
    await renderSkillList();
  } catch (err) {
    showToast('操作失败：' + err.message, 3000);
  }
}

async function importFolder() {
  try {
    const res = await window.electronAPI.importSkillFolder();
    if (!res || !res.success) {
      if (res && res.canceled) return;
      showToast('导入失败：' + ((res && res.error) || '未知错误'), 3000);
      return;
    }
    if (res.imported > 0) {
      showToast('已导入 ' + res.imported + ' 个技能', 2500);
    } else {
      showToast('未导入技能：' + (res.warnings || []).join('；'), 4000);
    }
    await renderSkillList();
  } catch (err) {
    showToast('导入失败：' + err.message, 3000);
  }
}

function bindSkillPanelEvents() {
  const skillBtn = document.getElementById('cuckoo-btn-skill');
  skillBtn?.addEventListener('click', openSkillManager);

  const closeBtn = document.getElementById('cuckoo-skill-close');
  closeBtn?.addEventListener('click', closeSkillManager);

  const newBtn = document.getElementById('cuckoo-skill-new');
  newBtn?.addEventListener('click', () => showEditor(null));

  const importBtn = document.getElementById('cuckoo-skill-import');
  importBtn?.addEventListener('click', importFolder);

  const refreshBtn = document.getElementById('cuckoo-skill-refresh');
  refreshBtn?.addEventListener('click', renderSkillList);

  const searchEl = document.getElementById('cuckoo-skill-search');
  searchEl?.addEventListener('input', renderSkillList);

  const saveBtn = document.getElementById('cuckoo-skill-ed-save');
  saveBtn?.addEventListener('click', saveEditor);

  const cancelBtn = document.getElementById('cuckoo-skill-ed-cancel');
  cancelBtn?.addEventListener('click', hideEditor);
}

module.exports = { bindSkillPanelEvents, openSkillManager, closeSkillManager };
