// SCORE X LP 共通スクリプト
document.addEventListener('DOMContentLoaded', function () {
  // ===== UTMパラメータの保持と引き継ぎ（Meta広告の判別用） =====
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
  var utm = {};
  try { utm = JSON.parse(sessionStorage.getItem('scx_utm') || '{}'); } catch (e) { utm = {}; }
  var params = new URLSearchParams(window.location.search);
  var found = false;
  UTM_KEYS.forEach(function (k) {
    var v = params.get(k);
    if (v) { utm[k] = v; found = true; }
  });
  // 最初に着地したURL（広告からの流入URL）を記録
  if (found || !utm.landing_url) utm.landing_url = window.location.href;
  try { sessionStorage.setItem('scx_utm', JSON.stringify(utm)); } catch (e) {}
  window.SCX_UTM = utm;

  // サイト内リンクにUTMを引き継ぐ（LP → フォーム → サンクス）
  var qs = [];
  UTM_KEYS.forEach(function (k) {
    if (utm[k]) qs.push(k + '=' + encodeURIComponent(utm[k]));
  });
  if (qs.length) {
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var h = a.getAttribute('href');
      if (!h || /^(https?:|mailto:|tel:|#|javascript:)/i.test(h)) return;
      // 「index.html#jobs」のようなアンカー付きリンクは、クエリを # の手前に差し込む
      var hash = '';
      var hi = h.indexOf('#');
      if (hi >= 0) { hash = h.slice(hi); h = h.slice(0, hi); }
      a.setAttribute('href', h + (h.indexOf('?') >= 0 ? '&' : '?') + qs.join('&') + hash);
    });
  }

  // ハンバーガーメニュー
  var btn = document.getElementById('menuBtn');
  var menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.style.display = 'none'; });
    });
  }
  // FAQアコーディオン
  document.querySelectorAll('.faq-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var ans = b.parentElement.querySelector('.faq-ans');
      var sym = b.querySelector('.faq-sym');
      var open = ans && ans.style.display !== 'none';
      if (ans) ans.style.display = open ? 'none' : 'flex';
      if (sym) sym.textContent = open ? '＋' : '−';
    });
  });
  // 導入事例動画（サムネイル→クリックで再生）
  document.querySelectorAll('.yt-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var wrap = b.parentElement;
      var f = document.createElement('iframe');
      f.src = b.getAttribute('data-embed');
      f.title = 'YouTube video player';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen = true;
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
      wrap.appendChild(f);
      b.remove();
    });
  });

  // 追従CTA：FVを通過してから表示。フォームが見えている間は隠す（送信ボタンと重なるため）
  var fv = document.getElementById('fv');
  var formSec = document.getElementById('form');
  var sticky = document.getElementById('stickyCta');
  if (fv && sticky) {
    var pastFv = false;
    var inForm = false;
    var apply = function () {
      var show = pastFv && !inForm;
      sticky.style.opacity = show ? '1' : '0';
      sticky.style.visibility = show ? 'visible' : 'hidden';
      sticky.style.transform = show ? 'translateY(0)' : 'translateY(12px)';
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { pastFv = !e.isIntersecting; });
        apply();
      }, { threshold: 0 }).observe(fv);
      if (formSec) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { inForm = e.isIntersecting; });
          apply();
        }, { threshold: 0 }).observe(formSec);
      }
    } else {
      window.addEventListener('scroll', function () {
        pastFv = window.scrollY > fv.offsetHeight;
        if (formSec) {
          var r = formSec.getBoundingClientRect();
          inForm = r.top < window.innerHeight && r.bottom > 0;
        }
        apply();
      }, { passive: true });
    }
  }

  // ===== 画像拡大（PC:ホバープレビュー／全画面ギャラリー・SP:タップで横画面） =====
  var zoomables = document.querySelectorAll('.zoomable');
  if (zoomables.length) {
    // data-zoom-group ごとにギャラリーをまとめる（同じ組の画像は拡大したまま横スライドできる）
    var groups = {};
    Array.prototype.forEach.call(zoomables, function (img, i) {
      var g = img.getAttribute('data-zoom-group') || ('single-' + i);
      (groups[g] = groups[g] || []).push(img);
    });

    var ov = document.createElement('div');
    ov.id = 'zoomOverlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div id="zoomStage">' +
                     '<div id="zoomTrack"></div>' +
                     '<button id="zoomPrev" class="zoom-nav" type="button" aria-label="前へ">‹</button>' +
                     '<button id="zoomNext" class="zoom-nav" type="button" aria-label="次へ">›</button>' +
                     '<button id="zoomClose" type="button" aria-label="閉じる">×</button>' +
                     '<p id="zoomCaption"></p>' +
                   '</div>';
    document.body.appendChild(ov);
    var track = ov.querySelector('#zoomTrack');
    var ovCap = ov.querySelector('#zoomCaption');
    var prevOverflow = '';
    var items = [];      // 現在開いているグループの画像
    var current = 0;

    // SPの縦持ちのときだけステージを90度回転させて「横画面」で見せる
    // （iOS Safari は screen.orientation.lock 非対応のため、CSS回転で実現）
    var mqSP = window.matchMedia('(max-width:767px), (pointer:coarse)');
    var mqPortrait = window.matchMedia('(orientation:portrait)');
    var updateCaption = function () {
      var alt = items[current] ? (items[current].alt || '') : '';
      var nav = items.length > 1 ? ' （' + (current + 1) + '/' + items.length + '・横にスライドできます）' : '';
      var tilt = ov.classList.contains('is-rotated') ? '／端末を横にするとそのまま見られます' : '';
      ovCap.textContent = alt + nav + tilt;
    };
    var applyRotation = function () {
      ov.classList.toggle('is-rotated', mqSP.matches && mqPortrait.matches);
      updateCaption();
      // 回転で寸法が変わるため現在のスライドへ位置を取り直す
      track.style.scrollBehavior = 'auto';
      track.scrollLeft = current * track.clientWidth;
      track.style.scrollBehavior = '';
    };
    var onViewportChange = function () { if (ov.classList.contains('is-open')) applyRotation(); };
    if (mqPortrait.addEventListener) mqPortrait.addEventListener('change', onViewportChange);
    else if (mqPortrait.addListener) mqPortrait.addListener(onViewportChange);
    window.addEventListener('resize', onViewportChange);

    var goTo = function (i, smooth) {
      current = Math.max(0, Math.min(items.length - 1, i));
      if (!smooth) track.style.scrollBehavior = 'auto';
      track.scrollLeft = current * track.clientWidth;
      if (!smooth) track.style.scrollBehavior = '';
      updateCaption();
    };

    var openZoom = function (img) {
      var g = img.getAttribute('data-zoom-group') || null;
      // 絞り込みで非表示になっている画像はギャラリーに含めない
      items = g ? groups[g].filter(function (el) { return el.offsetParent !== null; }) : [img];
      var start = Math.max(0, Array.prototype.indexOf.call(items, img));
      track.innerHTML = '';
      items.forEach(function (it) {
        var slide = document.createElement('div');
        slide.className = 'zoom-slide';
        var im = document.createElement('img');
        im.src = it.currentSrc || it.src;
        im.alt = it.alt || '';
        slide.appendChild(im);
        track.appendChild(slide);
      });
      ov.classList.toggle('is-single', items.length < 2);
      ov.classList.add('is-open');
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      current = start;
      applyRotation();
      goTo(start, false);
      requestAnimationFrame(function () { ov.classList.add('is-visible'); });
    };
    var closeZoom = function () {
      ov.classList.remove('is-visible');
      document.body.style.overflow = prevOverflow;
      setTimeout(function () {
        ov.classList.remove('is-open');
        ov.classList.remove('is-rotated');
        track.innerHTML = '';
      }, 200);
    };

    ov.querySelector('#zoomClose').addEventListener('click', closeZoom);
    ov.querySelector('#zoomPrev').addEventListener('click', function () { goTo(current - 1, true); });
    ov.querySelector('#zoomNext').addEventListener('click', function () { goTo(current + 1, true); });
    // 背景（画像やボタン以外）をクリックしたときだけ閉じる
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.id === 'zoomStage' ||
          (e.target.classList && e.target.classList.contains('zoom-slide'))) closeZoom();
    });
    // スワイプ／ホイールでの移動を現在位置に反映
    var scrollTimer = null;
    track.addEventListener('scroll', function () {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var w = track.clientWidth;
        if (!w) return;
        var i = Math.round(track.scrollLeft / w);
        if (i !== current) { current = i; updateCaption(); }
      }, 90);
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (!ov.classList.contains('is-open')) return;
      if (e.key === 'Escape' || e.key === 'Esc') closeZoom();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1, true); }
    });

    // PCのホバープレビュー（マウス操作の端末のみ）
    var fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    var peek = null, peekImg = null, hoverTimer = null;
    if (fine) {
      peek = document.createElement('div');
      peek.id = 'zoomPeek';
      peek.innerHTML = '<img alt=""><p>クリックすると全画面で開き、横にスライドできます</p>';
      document.body.appendChild(peek);
      peekImg = peek.querySelector('img');
    }
    var hidePeek = function () {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      if (peek) peek.classList.remove('is-visible');
    };

    Array.prototype.forEach.call(zoomables, function (img) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.addEventListener('click', function () { hidePeek(); openZoom(img); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openZoom(img); }
      });
      if (fine) {
        img.addEventListener('mouseenter', function () {
          if (ov.classList.contains('is-open')) return;
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(function () {
            peekImg.src = img.currentSrc || img.src;
            peekImg.alt = img.alt || '';
            peek.classList.add('is-visible');
          }, 180);
        });
        img.addEventListener('mouseleave', hidePeek);
      }
    });
    if (fine) window.addEventListener('scroll', hidePeek, { passive: true });
  }
});

// ===== 案件掲示板UIのタブ切り替え（プレミアム案件／課題一覧／パートナー案件） =====
document.addEventListener('DOMContentLoaded', function () {
  Array.prototype.forEach.call(document.querySelectorAll('.board-ui'), function (ui) {
    var tabs  = ui.querySelectorAll('.board-tab');
    var track = ui.querySelector('.board-track');
    var count = ui.querySelector('.board-count');
    if (!tabs.length || !track) return;
    var slides = track.querySelectorAll('img');
    if (!slides.length) return;

    // 選んだタブに属する案件だけを残し、先頭までスクロールを戻す
    var show = function (cat) {
      var shown = 0;
      Array.prototype.forEach.call(slides, function (img) {
        var hit = (img.getAttribute('data-cat') || '').split(' ').indexOf(cat) !== -1;
        img.classList.toggle('is-hidden', !hit);
        if (hit) shown++;
      });
      if (count) count.textContent = shown + '件を表示中';
      track.style.scrollBehavior = 'auto';
      track.scrollLeft = 0;
      track.style.scrollBehavior = '';
    };

    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        show(tab.getAttribute('data-cat'));
      });
    });

    show((ui.querySelector('.board-tab.is-active') || tabs[0]).getAttribute('data-cat'));
  });
});

// ===== 案件一覧の業種絞り込み（相性の良い業種 → 案件一覧） =====
document.addEventListener('DOMContentLoaded', function () {
  var sel   = document.getElementById('jobFilter');
  var list  = document.getElementById('jobList');
  var empty = document.getElementById('jobEmpty');
  var count = document.getElementById('jobCount');
  if (!sel || !list) return;
  var cards = list.querySelectorAll('.job-card');

  var apply = function () {
    var cat = sel.value;
    var shown = 0;
    Array.prototype.forEach.call(cards, function (img) {
      var hit = cat === 'all' || (img.getAttribute('data-cat') || '').split(' ').indexOf(cat) !== -1;
      img.style.display = hit ? 'block' : 'none';
      if (hit) shown++;
    });
    list.style.display = shown ? 'flex' : 'none';
    if (empty) empty.style.display = shown ? 'none' : 'block';
    if (count) count.textContent = shown ? shown + '件の案件を表示中' : '';
  };
  sel.addEventListener('change', apply);
  apply();
});
