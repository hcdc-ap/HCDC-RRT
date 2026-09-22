// ============================================================================
// huong-dan-engine.js — hiển thị + tương tác cho trang Hướng dẫn sử dụng RRT
// Đọc dữ liệu từ window.RRT_GUIDE (huong-dan-data.js). Không phụ thuộc app chính.
// ============================================================================
(function () {
  'use strict';

  var GUIDE = window.RRT_GUIDE;
  if (!GUIDE) {
    document.getElementById('sections').innerHTML =
      '<p style="color:#a30000">Không tải được nội dung hướng dẫn (huong-dan-data.js).</p>';
    return;
  }

  // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu.
  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Cú pháp rich text tối giản trong nội dung: **đậm** và [[Tên nút]] (hiển thị như nhãn nút).
  function richText(text) {
    var out = escHtml(text);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\[\[(.+?)\]\]/g, '<span class="btnlabel">$1</span>');
    return out;
  }

  function blockToText(b) {
    switch (b.t) {
      case 'p': return b.text;
      case 'steps':
      case 'list': return [b.title || '', ...b.items].join(' ');
      case 'note': return (b.title || '') + ' ' + b.text;
      case 'table': return [b.title || '', ...b.head, ...b.rows.flat()].join(' ');
      default: return '';
    }
  }

  function sectionToText(s) {
    return norm(
      (s.title + ' ' + s.summary + ' ' + s.blocks.map(blockToText).join(' ')).replace(/\*\*|\[\[|\]\]/g, '')
    );
  }

  var NOTE_META = {
    tip: { icon: 'bx-bulb', label: 'Mẹo' },
    warn: { icon: 'bx-error', label: 'Lưu ý quan trọng' },
    info: { icon: 'bx-info-circle', label: 'Cần biết' },
  };

  function renderBlock(b) {
    switch (b.t) {
      case 'p':
        return '<div class="block"><p>' + richText(b.text) + '</p></div>';
      case 'steps': {
        var items = b.items.map(function (it, i) {
          return '<li><span class="n">' + (i + 1) + '</span><span>' + richText(it) + '</span></li>';
        }).join('');
        return '<div class="block">' + (b.title ? '<h4>' + escHtml(b.title) + '</h4>' : '') +
          '<ol class="steps">' + items + '</ol></div>';
      }
      case 'list': {
        var li = b.items.map(function (it) { return '<li>' + richText(it) + '</li>'; }).join('');
        return '<div class="block">' + (b.title ? '<h4>' + escHtml(b.title) + '</h4>' : '') +
          '<ul class="plain">' + li + '</ul></div>';
      }
      case 'note': {
        var meta = NOTE_META[b.kind] || NOTE_META.info;
        return '<div class="block"><aside class="note ' + b.kind + '">' +
          '<p class="note-title"><i class="bx ' + meta.icon + '"></i> ' + escHtml(b.title || meta.label) + '</p>' +
          '<p>' + richText(b.text) + '</p></aside></div>';
      }
      case 'table': {
        var head = b.head.map(function (h) { return '<th>' + escHtml(h) + '</th>'; }).join('');
        var rows = b.rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + richText(c) + '</td>'; }).join('') + '</tr>';
        }).join('');
        return '<div class="block">' + (b.title ? '<h4>' + escHtml(b.title) + '</h4>' : '') +
          '<div class="tablewrap"><table class="guide-table"><thead><tr>' + head +
          '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      }
      default:
        return '';
    }
  }

  function sectionsFor(role) {
    var doc = GUIDE.perRole[role] || { title: GUIDE.title, audience: '', sections: [] };
    var groups = [];
    if (GUIDE.common && GUIDE.common.length) groups.push({ label: 'Chung', sections: GUIDE.common });
    if (doc.sections && doc.sections.length) groups.push({ label: doc.groupLabel || 'Dành riêng', sections: doc.sections });
    return { doc: doc, groups: groups, flat: groups.reduce(function (a, g) { return a.concat(g.sections); }, []) };
  }

  var state = { role: GUIDE.roles[0].role, query: '' };

  function buildRoleTabs() {
    var wrap = document.getElementById('roletabs');
    wrap.innerHTML = '';
    GUIDE.roles.forEach(function (r) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = r.label;
      btn.setAttribute('role', 'tab');
      btn.dataset.role = r.role;
      btn.addEventListener('click', function () {
        setRole(r.role);
        history.replaceState(null, '', '#' + r.role);
      });
      wrap.appendChild(btn);
    });
  }

  function setRole(role) {
    state.role = role;
    Array.prototype.forEach.call(document.querySelectorAll('#roletabs button'), function (btn) {
      var active = btn.dataset.role === role;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    render();
  }

  function render() {
    var data = sectionsFor(state.role);
    var doc = data.doc;
    document.getElementById('doc-title').textContent = doc.title || GUIDE.title;
    document.getElementById('doc-audience').textContent = doc.audience ? 'Dành cho: ' + doc.audience : '';
    document.getElementById('doc-version').textContent = GUIDE.version || '';

    var q = norm(state.query);
    var tocHtml = '';
    var secHtml = '';
    var idx = 0;
    var matchCount = 0;

    data.groups.forEach(function (group) {
      var groupToc = '';
      group.sections.forEach(function (s) {
        idx++;
        var text = sectionToText(s);
        var match = q === '' || text.indexOf(q) !== -1;
        if (match) matchCount++;
        var anchorId = state.role + '--' + s.id;

        if (match) {
          groupToc += '<li><a href="#' + anchorId + '" data-anchor="' + anchorId + '">' +
            '<span class="num">' + idx + '.</span>' + escHtml(s.title) + '</a></li>';
        }

        secHtml += '<section class="guide-section' + (match ? '' : ' is-hidden') + '" id="' + anchorId + '">' +
          '<h2><span class="num">' + idx + '.</span>' + escHtml(s.title) + '</h2>' +
          '<p class="summary">' + escHtml(s.summary) + '</p>' +
          s.blocks.map(renderBlock).join('') +
          '</section>';
      });
      if (groupToc !== '') {
        tocHtml += '<li class="toc-group-title">' + escHtml(group.label) + '</li>' + groupToc;
      }
    });

    document.getElementById('toc-list').innerHTML = tocHtml;
    document.getElementById('sections').innerHTML = secHtml;

    var statusEl = document.getElementById('toc-status');
    if (q !== '') {
      statusEl.textContent = matchCount === 0
        ? 'Không có mục nào khớp.'
        : matchCount + '/' + data.flat.length + ' mục phù hợp.';
    } else {
      statusEl.textContent = '';
    }
    document.getElementById('empty-state').style.display = (q !== '' && matchCount === 0) ? 'block' : 'none';

    highlightCurrentOnScroll();
  }

  var searchTimer = null;
  document.getElementById('guide-search').addEventListener('input', function (e) {
    var val = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = val;
      render();
    }, 120);
  });

  document.getElementById('btn-print').addEventListener('click', function () {
    window.print();
  });

  // Đổi mục "đang xem" trong mục lục theo scroll.
  var tocLinks = [];
  function highlightCurrentOnScroll() {
    tocLinks = Array.prototype.slice.call(document.querySelectorAll('#toc-list a'));
  }
  var scrollTimer = null;
  window.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      var pos = window.scrollY + 110;
      var current = null;
      Array.prototype.forEach.call(document.querySelectorAll('section.guide-section:not(.is-hidden)'), function (sec) {
        if (sec.offsetTop <= pos) current = sec.id;
      });
      tocLinks.forEach(function (a) {
        a.classList.toggle('current', current && a.dataset.anchor === current);
      });
    }, 80);
  }, { passive: true });

  // Khởi tạo: đọc vai trò từ hash (#admin, #ward_admin-xxx, #user), mặc định vai trò đầu tiên.
  buildRoleTabs();
  var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  var initialRole = GUIDE.roles[0].role;
  var jumpAnchor = null;
  if (hash) {
    var found = GUIDE.roles.find(function (r) { return hash === r.role || hash.indexOf(r.role + '--') === 0; });
    if (found) {
      initialRole = found.role;
      if (hash !== found.role) jumpAnchor = hash;
    }
  }
  setRole(initialRole);
  if (jumpAnchor) {
    var target = document.getElementById(jumpAnchor);
    if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 0);
  }
})();
