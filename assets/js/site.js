/* Pizarra Táctica — landing
   Todo es progresivo: sin JS la página sigue siendo legible y navegable. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Tema claro / oscuro ---------- */
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('pt-theme', next); } catch (e) {}
      toggle.setAttribute('aria-label', next === 'light' ? 'Activar tema oscuro' : 'Activar tema claro');
    });
  }

  /* ---------- Menú móvil ---------- */
  var navBtn = document.getElementById('nav-toggle');
  var navLinks = document.getElementById('navlinks');
  if (navBtn && navLinks) {
    navBtn.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      navBtn.setAttribute('aria-expanded', String(open));
      navBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
    navLinks.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('open');
        navBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Borde de la cabecera al hacer scroll ---------- */
  var header = document.getElementById('header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Aparición progresiva de secciones ---------- */
  var items = document.querySelectorAll('.reveal');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!('IntersectionObserver' in window) || reduce) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add('in'); }, Math.min(i, 6) * 60);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  /* ---------- Año del pie ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
