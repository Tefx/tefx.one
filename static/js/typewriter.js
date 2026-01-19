/**
 * Typewriter Effect for tefx.one
 * Lightweight (<1KB gzip), no dependencies
 * 
 * Config:
 * - Cursor: underscore (_)
 * - First load: random
 * - Loop order: random (shuffle)
 */
(function() {
  'use strict';

  // Config
  const TYPE_SPEED = 80;      // ms per character when typing
  const DELETE_SPEED = 40;    // ms per character when deleting
  const PAUSE_BEFORE_DELETE = 3000;  // ms to wait before deleting
  const PAUSE_BEFORE_TYPE = 500;     // ms to wait before typing next

  // State
  let currentIndex = 0;
  let isDeleting = false;
  let titleEl, sloganEl, data, shuffledIndices;

  // Fisher-Yates shuffle
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function init() {
    console.log('Typewriter: Init started');
    titleEl = document.getElementById('tw-title');
    sloganEl = document.getElementById('tw-slogan');
    
    if (!titleEl || !sloganEl) {
        console.error('Typewriter: Elements not found', {titleEl, sloganEl});
        return;
    }

    // Parse data from script tag
    const dataEl = document.getElementById('tw-data');
    if (!dataEl) {
        console.error('Typewriter: Data element not found');
        return;
    }
    
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error('Typewriter: Failed to parse data', e);
      return;
    }

    if (!data || data.length === 0) return;

    // Create shuffled order
    shuffledIndices = shuffle([...Array(data.length).keys()]);
    currentIndex = 0;  // Index into shuffledIndices
    
    // Set initial content (first random item)
    const firstItem = data[shuffledIndices[currentIndex]];
    titleEl.textContent = firstItem.title;
    sloganEl.textContent = firstItem.slogan;

    // Start the loop after initial pause
    setTimeout(tick, PAUSE_BEFORE_DELETE);
  }

  function tick() {
    const realIndex = shuffledIndices[currentIndex];
    const current = data[realIndex];
    const titleText = titleEl.textContent;
    const sloganText = sloganEl.textContent;

    if (isDeleting) {
      // Delete phase: remove characters
      if (titleText.length > 0 || sloganText.length > 0) {
        // Delete slogan first, then title
        if (sloganText.length > 0) {
          sloganEl.textContent = sloganText.slice(0, -1);
        } else {
          titleEl.textContent = titleText.slice(0, -1);
        }
        setTimeout(tick, DELETE_SPEED);
      } else {
        // Done deleting, move to next
        isDeleting = false;
        currentIndex = (currentIndex + 1) % shuffledIndices.length;
        
        // Reshuffle when we've gone through all items
        if (currentIndex === 0) {
          shuffledIndices = shuffle([...Array(data.length).keys()]);
        }
        
        setTimeout(tick, PAUSE_BEFORE_TYPE);
      }
    } else {
      // Type phase: add characters
      const targetTitle = data[shuffledIndices[currentIndex]].title;
      const targetSlogan = data[shuffledIndices[currentIndex]].slogan;

      if (titleText.length < targetTitle.length) {
        // Type title first
        titleEl.textContent = targetTitle.slice(0, titleText.length + 1);
        setTimeout(tick, TYPE_SPEED);
      } else if (sloganText.length < targetSlogan.length) {
        // Then type slogan
        sloganEl.textContent = targetSlogan.slice(0, sloganText.length + 1);
        setTimeout(tick, TYPE_SPEED);
      } else {
        // Done typing, pause then delete
        isDeleting = true;
        setTimeout(tick, PAUSE_BEFORE_DELETE);
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
