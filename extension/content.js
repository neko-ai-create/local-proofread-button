(() => {
  let target = null;
  let root = null;
  let positionFrame = 0;
  // Position is kept within this page only; no page text is stored.
  let manualPosition = null;
  const editableSelector = 'textarea,input[type="text"],input[type="search"],[contenteditable="true"],[role="textbox"],.ProseMirror';
  const richSelector = '[contenteditable="true"],[role="textbox"],.ProseMirror';

  const editable = (element) => {
    if (!element || element.nodeType !== 1) return null;
    return element.matches(editableSelector) ? element : element.closest(editableSelector);
  };
  const textOf = (element) => {
    const rich = element.matches(richSelector) ? element : element.closest(richSelector);
    return rich ? (rich.innerText || rich.textContent || '') : (element.value || '');
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const close = () => { root?.remove(); root = null; };

  function collides(x, y, width, height) {
    const points = [[x + 2, y + 2], [x + width - 2, y + 2], [x + 2, y + height - 2], [x + width - 2, y + height - 2]];
    return points.some(([px, py]) => {
      const element = document.elementFromPoint(px, py);
      if (!element || element === document.body || root.contains(element) || target.contains?.(element)) return false;
      return element.matches?.('button,input,textarea,select,a,[role="button"],[contenteditable="true"]');
    });
  }

  function placeButton() {
    if (!root || !root.querySelector('.proof-button')) return;
    if (!target?.isConnected) { close(); return; }
    if (manualPosition) {
      const size = root.querySelector('.proof-button').getBoundingClientRect();
      manualPosition.x = Math.max(8, Math.min(manualPosition.x, innerWidth - size.width - 8));
      manualPosition.y = Math.max(8, Math.min(manualPosition.y, innerHeight - size.height - 8));
      root.style.left = `${manualPosition.x}px`;
      root.style.top = `${manualPosition.y}px`;
      root.style.visibility = 'visible';
      return;
    }
    const field = target.getBoundingClientRect();
    if (!field.width || !field.height || field.bottom <= 0 || field.top >= innerHeight || field.right <= 0 || field.left >= innerWidth) {
      root.style.visibility = 'hidden';
      return;
    }
    root.style.visibility = 'visible';
    const button = root.querySelector('.proof-button');
    const size = button.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const candidates = [
      [field.left, field.top - size.height - gap],
      [field.right + gap, field.top + (field.height - size.height) / 2],
      [field.left - size.width - gap, field.top + (field.height - size.height) / 2],
      [field.left, field.bottom + gap]
    ];
    const usable = candidates.find(([x, y]) => x >= margin && y >= margin && x + size.width <= innerWidth - margin && y + size.height <= innerHeight - margin && !collides(x, y, size.width, size.height));
    // Keep the control alive so a later scroll or resize can show it again.
    if (!usable) { root.style.visibility = 'hidden'; return; }
    root.style.left = `${usable[0]}px`;
    root.style.top = `${usable[1]}px`;
  }

  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      placeButton();
    });
  }

  function show(element) {
    target = editable(element) || element;
    if (!target || typeof target.getBoundingClientRect !== 'function') return;
    close();
    root = document.createElement('div');
    root.id = 'local-proofread-root';
    root.dataset.version = '0.2.2';
    const button = document.createElement('button');
    button.className = 'proof-button';
    button.type = 'button';
    button.textContent = '✓ 校正';
    button.title = 'クリックで校正／押したまま動かすと移動。ボタンにフォーカスしてEscで位置を戻す';
    setupDrag(button);
    root.append(button);
    document.body.append(root);
    placeButton();
    schedulePosition();
  }

  function setupDrag(button) {
    let drag = null;
    let suppressClick = false;
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || button.disabled) return;
      const rect = button.getBoundingClientRect();
      suppressClick = false;
      drag = {id:event.pointerId, x:event.clientX, y:event.clientY, left:rect.left, top:rect.top, moved:false};
      button.setPointerCapture(event.pointerId);
      event.stopPropagation();
    });
    button.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      suppressClick = true;
      button.classList.add('is-dragging');
      manualPosition = {x:drag.left + dx, y:drag.top + dy};
      placeButton();
      event.preventDefault();
      event.stopPropagation();
    });
    const finish = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (event.type === 'pointercancel') suppressClick = true;
      drag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
    button.addEventListener('lostpointercapture', finish);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (suppressClick && event.detail !== 0) {
        suppressClick = false;
        event.preventDefault();
        return;
      }
      proofread();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        manualPosition = null;
        placeButton();
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  function replaceAll(text) {
    const prototype = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    target.focus();
    if (setter) setter.call(target, text); else target.value = text;
    target.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:text}));
  }

  async function proofread() {
    const original = textOf(target);
    const button = root.querySelector('.proof-button');
    if (!original.trim()) { button.outerHTML = '<span class="error">文章を入力してから校正ボタンを押してください。</span>'; return; }
    button.disabled = true;
    button.textContent = '校正中…';
    try {
      const response = await fetch('http://127.0.0.1:8765/proofread', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:original})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '校正サーバーでエラーが発生しました');
      render(original, data);
    } catch (error) {
      button.outerHTML = `<span class="error">${escapeHtml(error instanceof TypeError ? '校正サーバーが起動していません。' : error.message)}</span>`;
    }
  }

  function render(original, data) {
    const corrected = data.corrected || original;
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const plain = target.matches('textarea,input');
    const type = (issue) => { const r = issue.reason || ''; if (r.includes('脱字')) return '脱字'; if (r.includes('誤字')) return '誤字'; if (r.includes('変換') || r.includes('同音')) return '変換ミス'; if (r.includes('敬語')) return '敬語'; return '要確認'; };
    const cards = issues.map((issue) => `<section class="issue-card"><span class="issue-type">${escapeHtml(type(issue))}</span><div class="issue-change"><span class="proof-before">${escapeHtml(issue.original || '')}</span><span class="proof-arrow">→</span><span class="proof-after">${escapeHtml(issue.suggestion || '')}</span></div><p class="proof-reason">${escapeHtml(issue.reason || '')}</p></section>`).join('');
    root.style.left = '50%'; root.style.top = '50%'; root.style.transform = 'translate(-50%,-50%)';
    root.innerHTML = `<div class="proof-panel"><header class="proof-head"><span>✓ 校正結果</span><button class="proof-close" aria-label="閉じる">×</button></header><main class="proof-body"><p class="proof-summary">指摘 ${issues.length}件</p>${cards}<button class="copy-button" id="apply">${plain ? '修正版で置き換え' : '修正版をコピー'}</button><p class="proof-note">${plain ? 'この入力欄は修正版で置き換えられます。' : '※この入力欄は自動置き換え非対応です。コピーして貼り付けてください'}</p><button class="proof-toggle" id="toggle">▶ 修正版の全文を見る</button><div class="proof-full" id="full">${escapeHtml(corrected)}</div></main></div>`;
    root.querySelector('.proof-close').onclick = close;
    root.querySelector('#toggle').onclick = (event) => { const full = root.querySelector('#full'); const open = full.classList.toggle('open'); event.currentTarget.textContent = `${open ? '▼' : '▶'} 修正版の全文を見る`; };
    root.querySelector('#apply').onclick = async () => { if (plain) replaceAll(corrected); else await navigator.clipboard.writeText(corrected); close(); };
  }

  document.addEventListener('focusin', (event) => { if (editable(event.target)) show(event.target); }, true);
  document.addEventListener('mousedown', (event) => { if (editable(event.target) && !root?.contains(event.target)) show(event.target); }, true);
  document.addEventListener('click', (event) => { if (editable(event.target) && !root?.contains(event.target)) show(event.target); }, true);
  document.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  document.addEventListener('input', (event) => {
    if (editable(event.target) && !root?.querySelector('.proof-panel')) {
      if (!root || target !== editable(event.target)) show(event.target);
      else schedulePosition();
    }
  }, true);
  // Restore the button when the input was focused before this script loaded.
  if (editable(document.activeElement)) show(document.activeElement);
})();
