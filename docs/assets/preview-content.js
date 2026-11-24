(() => {
  const main = document.querySelector('main[data-preview-content]');
  if (!main) return;

  function setExpanded(item, open) {
    item.classList.toggle('open', open);
    item.querySelector('.expand-item-heading')?.setAttribute('aria-expanded', String(open));
  }

  for (const item of main.querySelectorAll('[data-expand]')) {
    const heading = item.querySelector('.expand-item-heading');
    if (!heading) continue;
    heading.tabIndex = 0;
    heading.setAttribute('role', 'button');
    setExpanded(item, item.classList.contains('open'));
    heading.addEventListener('click', () => setExpanded(item, !item.classList.contains('open')));
    heading.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      heading.click();
    });
  }

  for (const group of main.querySelectorAll('[data-preview-page-size]')) {
    const items = [...group.children];
    const pageSize = Number(group.dataset.previewPageSize);
    const filters = group.hasAttribute('data-preview-filtered')
      ? [...main.querySelectorAll('[data-preview-filter]')]
      : [];
    let end = pageSize;
    const sentinel = document.createElement('div');
    sentinel.className = 'preview-pagination-sentinel';
    group.after(sentinel);
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      end += pageSize;
      update();
    }, { rootMargin: '180px' });
    function update() {
      const selected = filters.map(filter => (
        [...filter.querySelectorAll('input:checked')].map(input => input.id)
      ));
      let total = 0;
      for (const item of items) {
        const values = (item.dataset.filterValues || '').split(' ');
        const matches = selected.every(options => !options.length || options.some(option => values.includes(option)));
        item.hidden = !matches || total >= end;
        if (matches) total += 1;
      }
      sentinel.textContent = total ? '' : 'Предложения по выбранным параметрам не найдены';
      sentinel.classList.toggle('preview-empty', !total);
      observer.disconnect();
      if (end < total) observer.observe(sentinel);
    }
    update();
    for (const filter of filters) {
      filter.addEventListener('change', () => {
        end = pageSize;
        update();
      });
      const label = filter.querySelector('.name-filter');
      label.tabIndex = 0;
      label.setAttribute('role', 'button');
      label.setAttribute('aria-expanded', 'false');
      label.addEventListener('click', () => {
        const open = filter.classList.toggle('preview-filter-open');
        label.setAttribute('aria-expanded', String(open));
      });
      label.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        label.click();
      });
    }
  }

  for (const carousel of main.querySelectorAll('swiper-container')) {
    const controls = carousel.closest('.carousel');
    if (!controls) continue;
    for (const [direction, name] of [['Prev', 'Предыдущее фото'], ['Next', 'Следующее фото']]) {
      for (const control of controls.querySelectorAll('.swiper-button-' + direction.toLowerCase())) {
        control.tabIndex = 0;
        control.setAttribute('role', 'button');
        control.setAttribute('aria-label', name);
        control.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          carousel.swiper?.['slide' + direction]();
        });
        control.addEventListener('keydown', event => {
          if (!['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          control.click();
        });
      }
    }
  }

  const mediaSelector = 'a[data-fancybox], a[data-caption], swiper-container a.slider-block-image, a.video-link-editor';
  const viewer = document.createElement('dialog');
  viewer.className = 'preview-gallery preview-media-viewer';
  viewer.innerHTML = `<button type="button" class="preview-gallery-close" aria-label="Закрыть">×</button>
    <button type="button" class="preview-gallery-prev" aria-label="Предыдущий кадр">‹</button>
    <div class="preview-media-frame"></div>
    <button type="button" class="preview-gallery-next" aria-label="Следующий кадр">›</button>`;
  document.body.append(viewer);
  const frame = viewer.querySelector('.preview-media-frame');
  const previous = viewer.querySelector('.preview-gallery-prev');
  const next = viewer.querySelector('.preview-gallery-next');
  let media = [];
  let active = 0;
  let trigger;

  function showMedia(index) {
    active = (index + media.length) % media.length;
    const link = media[active];
    const caption = link.dataset.caption || link.querySelector('img')?.alt || '';
    const isVideo = link.dataset.type === 'iframe' || link.href.includes('dzen.ru/embed/');
    const element = document.createElement(isVideo ? 'iframe' : 'img');
    element.src = link.href;
    if (isVideo) {
      element.title = caption || 'Видео Giulia Novars';
      element.allowFullscreen = true;
    } else {
      element.alt = caption;
    }
    frame.replaceChildren(element);
    if (caption) {
      const description = document.createElement('p');
      description.textContent = caption;
      frame.append(description);
    }
    previous.hidden = next.hidden = media.length < 2;
  }

  viewer.querySelector('.preview-gallery-close').addEventListener('click', () => viewer.close());
  previous.addEventListener('click', () => showMedia(active - 1));
  next.addEventListener('click', () => showMedia(active + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') showMedia(active - 1);
    if (event.key === 'ArrowRight') showMedia(active + 1);
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => {
    frame.replaceChildren();
    trigger?.focus();
  });

  main.addEventListener('click', event => {
    const mediaLink = event.target.closest(mediaSelector);
    if (mediaLink && mediaLink.getAttribute('href')?.startsWith('#') === false && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      trigger = mediaLink;
      const group = mediaLink.closest('swiper-container, .expand-item-content');
      media = group ? [...group.querySelectorAll(mediaSelector)] : [mediaLink];
      showMedia(media.indexOf(mediaLink));
      viewer.showModal();
      return;
    }

    const jump = event.target.closest('[data-scrollto]');
    if (jump?.hash) {
      const destination = document.getElementById(jump.hash.slice(1));
      if (destination) {
        event.preventDefault();
        if (destination.matches('[data-expand]')) setExpanded(destination, true);
        destination.scrollIntoView({ behavior: 'smooth' });
      }
    }

    const review = event.target.closest('.comment-toggle');
    if (review) {
      event.preventDefault();
      const open = review.closest('.comment').classList.toggle('open');
      review.setAttribute('aria-expanded', String(open));
    }

    const play = event.target.closest('button.play');
    const video = play?.parentElement.querySelector('video');
    if (video) {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }

    const like = event.target.closest('.btn--like');
    if (like) {
      event.preventDefault();
      like.setAttribute('aria-pressed', String(like.getAttribute('aria-pressed') !== 'true'));
    }

    const allColors = event.target.closest('[data-preview-facades]');
    if (allColors) {
      event.preventDefault();
      for (const item of main.querySelectorAll('#facades_vue [data-expand]')) setExpanded(item, true);
    }
  });

  for (const form of main.querySelectorAll('form[data-demo]')) {
    form.addEventListener('change', () => {
      const consent = form.querySelector('.consent-check');
      const submit = form.querySelector('[type=submit]');
      if (consent && submit) submit.disabled = !consent.checked;
    });
  }
})();
