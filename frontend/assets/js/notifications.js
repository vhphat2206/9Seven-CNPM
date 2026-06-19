/**
 * FFC notification center — bell icon + dropdown panel.
 *
 * Requires:
 *   - api.js   (exposes window.api + window.apiToken)
 *   - DOM:     #notifBtn, #notifBadge (or #notifDot), #notifPanel, #notifList, #notifMarkAll
 *
 * Behaviour:
 *   - Polls /api/notifications/unread-count every 12s while logged in
 *   - Click bell → fetch /api/notifications and render dropdown
 *   - Click a row → mark read + (TODO: navigate to entity)
 *   - "Mark all read" button → POST /notifications/read-all
 */
(function () {
  const POLL_INTERVAL = 12000;
  let pollTimer = null;
  let lastCount = 0;

  function isLoggedIn() {
    return !!(window.apiToken && window.apiToken.get());
  }

  async function refreshBadge() {
    if (!isLoggedIn()) {
      hideBadge();
      return;
    }
    try {
      const r = await api('/notifications/unread-count');
      setBadge(r.count || 0);
    } catch (err) {
      /* Silent fail — bell stays at last known state */
    }
  }

  function setBadge(count) {
    lastCount = count;
    const badge = document.getElementById('notifBadge');
    const dot   = document.getElementById('notifDot');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (dot) dot.style.display = count > 0 ? 'block' : 'none';
  }
  function hideBadge() {
    const badge = document.getElementById('notifBadge');
    const dot   = document.getElementById('notifDot');
    if (badge) badge.style.display = 'none';
    if (dot)   dot.style.display = 'none';
  }

  /* Mapping notification type → emoji icon */
  const ICON = {
    ticket_status:     '🔄',
    ticket_intake:     '📥',
    payment:           '💰',
    booking_new:       '📅',
    booking_confirmed: '✅',
    ktv_assigned:      '🔧',
    default:           '🔔',
  };

  function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60)    return 'Vừa xong';
    if (diff < 3600)  return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    return Math.floor(diff / 86400) + ' ngày trước';
  }

  async function renderList() {
    const host = document.getElementById('notifList');
    if (!host) return;
    if (!isLoggedIn()) {
      host.innerHTML = '<div class="notif-empty">Đăng nhập để xem thông báo</div>';
      return;
    }
    host.innerHTML = '<div class="notif-empty">Đang tải...</div>';
    try {
      const r = await api('/notifications');
      const items = r.data || [];
      if (!items.length) {
        host.innerHTML = '<div class="notif-empty">🎉 Không có thông báo nào</div>';
        return;
      }
      host.innerHTML = items.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-entity="${n.entity_type || ''}" data-code="${n.entity_code || ''}">
          <div class="notif-icon">${ICON[n.type] || ICON.default}</div>
          <div class="notif-body">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-msg">${escapeHtml(n.message)}</div>
            <div class="notif-time">${timeAgo(n.created_at)}</div>
          </div>
          ${n.is_read ? '' : '<span class="notif-unread-dot"></span>'}
        </div>
      `).join('');
    } catch (err) {
      host.innerHTML = `<div class="notif-empty">Lỗi tải thông báo: ${err.message}</div>`;
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  window.toggleNotifPanel = function (e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    detachPanelToBody(); /* ensure panel is escaped from any clipping ancestor */
    const open = panel.style.display !== 'none' && panel.classList.contains('open');
    if (open) {
      panel.classList.remove('open');
      setTimeout(() => { panel.style.display = 'none'; }, 200);
    } else {
      panel.style.display = 'block';
      requestAnimationFrame(() => panel.classList.add('open'));
      renderList();
    }
  };

  /* Click outside → close */
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const btn   = document.getElementById('notifBtn');
    if (!panel || panel.style.display === 'none') return;
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    panel.classList.remove('open');
    setTimeout(() => { panel.style.display = 'none'; }, 200);
  });

  /* Click on a notification item → mark read */
  document.addEventListener('click', async (e) => {
    const item = e.target.closest('.notif-item');
    if (!item) return;
    const id = item.dataset.id;
    if (item.classList.contains('unread')) {
      try {
        await api(`/notifications/${id}/read`, { method: 'PATCH' });
        item.classList.remove('unread');
        item.querySelector('.notif-unread-dot')?.remove();
        refreshBadge();
      } catch (_) {}
    }
    /* TODO: navigate to entity (open ticket modal, etc.) */
  });

  /* "Mark all read" button */
  document.addEventListener('click', async (e) => {
    if (e.target.id !== 'notifMarkAll') return;
    try {
      await api('/notifications/read-all', { method: 'POST' });
      renderList();
      refreshBadge();
    } catch (_) {}
  });

  /* Move notif-panel out of any backdrop-filter/transform ancestor
     so `position: fixed` works correctly (escapes containing block). */
  function detachPanelToBody() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  /* Start polling */
  function start() {
    if (pollTimer) clearInterval(pollTimer);
    detachPanelToBody();
    refreshBadge();
    pollTimer = setInterval(refreshBadge, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
