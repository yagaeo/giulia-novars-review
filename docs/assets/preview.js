const navigation = document.querySelector('#page-nav');
const menuButtons = [...document.querySelectorAll('[data-action="open-nav"]')];
let activeAside = null;

function toggleNavigation(open) {
  if (!navigation) return;
  navigation.classList.toggle('show', open);
  document.body.classList.toggle('preview-menu-open', open);
  for (const button of menuButtons) {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Меню');
    const label = open ? button.dataset.closetitle : button.dataset.opentitle;
    if (label) button.innerHTML = label;
  }
}

for (const button of menuButtons) {
  button.addEventListener('click', event => {
    event.preventDefault();
    toggleNavigation(button.getAttribute('aria-expanded') !== 'true');
  });
}
navigation?.addEventListener('click', event => {
  if (event.target.closest('a[href]:not([href="#"])')) toggleNavigation(false);
});
for (const heading of navigation?.querySelectorAll('.expand-item-heading') ?? []) {
  heading.tabIndex = 0;
  heading.setAttribute('role','button');
  heading.setAttribute('aria-expanded','false');
  heading.addEventListener('click', () => {
    const open = heading.parentElement.classList.toggle('preview-expanded');
    heading.setAttribute('aria-expanded',String(open));
  });
  heading.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      heading.click();
    }
  });
}
document.addEventListener('click', event => {
  if (!event.composedPath().some(node => node instanceof HTMLElement && node.matches('header'))) toggleNavigation(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    toggleNavigation(false);
    activeAside?.classList.remove('show');
    activeAside = null;
  }
});

for (const trigger of document.querySelectorAll('[data-aside-form]')) {
  trigger.addEventListener('click', event => {
    event.preventDefault();
    activeAside = document.querySelector(trigger.dataset.asideForm + ' .page-aside');
    activeAside?.classList.add('show');
    activeAside?.querySelector('input, button')?.focus();
  });
}
for (const close of document.querySelectorAll('.page-aside-close')) {
  close.tabIndex = 0;
  close.setAttribute('role', 'button');
  close.setAttribute('aria-label', 'Закрыть форму');
  close.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') close.click();
  });
  close.addEventListener('click', () => {
    close.closest('.page-aside').classList.remove('show');
    activeAside = null;
  });
}
document.addEventListener('submit', event => {
  if (!event.target.matches('[data-demo]')) return;
  event.preventDefault();
  const status = event.target.querySelector('[role="status"]');
  if (status) status.textContent = 'Предпросмотр формы. Данные не отправлены.';
});

const topButton = document.querySelector('#page-top');
topButton?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => topButton?.classList.toggle('show', window.scrollY > 650), { passive: true });

for (const video of document.querySelectorAll('video')) {
  video.muted = true;
  if (video.autoplay) video.play().catch(() => {});
}

const salonSelect = document.querySelector('[data-salon-city]');
salonSelect?.addEventListener('change', () => {
  let count = 0;
  for (const salon of document.querySelectorAll('[data-salon-code]')) {
    const show = salonSelect.value ? salon.dataset.salonCode === salonSelect.value : salon.hasAttribute('data-salon-start');
    salon.hidden = !show;
    if (show) count += 1;
  }
  document.querySelector('[data-salon-empty]').hidden = count > 0;
});

const projectCards = [...document.querySelectorAll('[data-project-order]')];
const projectFilters = [...document.querySelectorAll('[data-project-filter]')];
const sort = document.querySelector('[data-project-sort]');
function refreshProjects() {
  const sorted = [...projectCards].sort((first, second) => {
    if (sort.value === 'date') return second.dataset.projectDate.localeCompare(first.dataset.projectDate);
    return Number(first.dataset.projectOrder) - Number(second.dataset.projectOrder);
  });
  const row = projectCards[0]?.parentElement;
  let count = 0;
  for (const card of sorted) {
    const show = projectFilters.every(filter => {
      const values = card.getAttribute('data-project-' + filter.dataset.projectFilter).split('|');
      return !filter.value || values.includes(filter.value);
    });
    if (show) count += 1;
    card.hidden = !show;
    row?.append(card);
  }
  document.querySelector('[data-project-empty]').hidden = count > 0;
}
for (const filter of projectFilters) filter.addEventListener('change', refreshProjects);
sort?.addEventListener('change', refreshProjects);

const galleryLinks = [...document.querySelectorAll('[data-project-gallery]')];
if (galleryLinks.length) {
  const gallery = document.createElement('dialog');
  gallery.className = 'preview-gallery';
  gallery.innerHTML = `<form method="dialog"><button class="preview-gallery-close" aria-label="Закрыть">×</button></form>
    <button class="preview-gallery-prev" type="button" aria-label="Предыдущее фото">‹</button>
    <figure><img alt=""><figcaption><a></a><span></span></figcaption></figure>
    <button class="preview-gallery-next" type="button" aria-label="Следующее фото">›</button>`;
  document.body.append(gallery);
  let current = 0;
  let images = [];
  const image = gallery.querySelector('img');
  const project = gallery.querySelector('figcaption a');
  const position = gallery.querySelector('figcaption span');
  const show = index => {
    current = (index + images.length) % images.length;
    image.src = images[current];
    position.textContent = (current + 1) + ' / ' + images.length;
  };
  gallery.querySelector('.preview-gallery-prev').addEventListener('click', () => show(current - 1));
  gallery.querySelector('.preview-gallery-next').addEventListener('click', () => show(current + 1));
  gallery.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') show(current - 1);
    if (event.key === 'ArrowRight') show(current + 1);
  });
  gallery.addEventListener('click', event => { if (event.target === gallery) gallery.close(); });
  for (const link of galleryLinks) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      images = JSON.parse(link.dataset.projectGallery);
      if (!images.length) return;
      event.preventDefault();
      image.alt = link.dataset.projectName;
      project.textContent = link.dataset.projectName + ' — подробнее';
      project.href = link.dataset.projectLink;
      gallery.showModal();
      show(0);
    });
  }
}
