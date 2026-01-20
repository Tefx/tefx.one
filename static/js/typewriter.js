/**
 * Typewriter Effect for tefx.one
 * Double-buffered to avoid empty gap
 */
(function() {
  'use strict';

  const TYPE_SPEED = 120;
  const DELETE_SPEED = 60;
  const PAUSE_BEFORE_SWITCH = 3000;

  let currentIndex = 0;
  let titleEl, sloganEl, data, order;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function init() {
    titleEl = document.getElementById('tw-title');
    sloganEl = document.getElementById('tw-slogan');
    if (!titleEl || !sloganEl) return;

    const dataEl = document.getElementById('tw-data');
    if (!dataEl) return;

    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }

    if (!data || data.length === 0) return;

    order = shuffle([...Array(data.length).keys()]);
    currentIndex = 0;

    const first = data[order[currentIndex]];
    titleEl.textContent = first.title;
    sloganEl.textContent = first.slogan;

    setTimeout(() => startSwitch(), PAUSE_BEFORE_SWITCH);
  }

  function startSwitch() {
    const nextIndex = (currentIndex + 1) % order.length;
    const next = data[order[nextIndex]];

    deleteText(() => {
      typeText(next.title, next.slogan, () => {
        currentIndex = nextIndex;
        if (currentIndex === 0) order = shuffle([...Array(data.length).keys()]);
        setTimeout(() => startSwitch(), PAUSE_BEFORE_SWITCH);
      });
    });
  }

  function deleteText(done) {
    let t = titleEl.textContent;
    let s = sloganEl.textContent;

    function step() {
      if (s.length > 0) {
        s = s.slice(0, -1);
        sloganEl.textContent = s;
        setTimeout(step, DELETE_SPEED);
      } else if (t.length > 0) {
        t = t.slice(0, -1);
        titleEl.textContent = t;
        setTimeout(step, DELETE_SPEED);
      } else {
        done();
      }
    }
    step();
  }

  function typeText(title, slogan, done) {
    let ti = 0;
    let si = 0;

    function step() {
      if (ti < title.length) {
        titleEl.textContent = title.slice(0, ++ti);
        setTimeout(step, TYPE_SPEED);
      } else if (si < slogan.length) {
        sloganEl.textContent = slogan.slice(0, ++si);
        setTimeout(step, TYPE_SPEED);
      } else {
        done();
      }
    }
    step();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
