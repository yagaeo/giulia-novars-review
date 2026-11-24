(() => {
  const panel = document.querySelector('[data-map-salons]');
  if (!panel) return;

  const filter = panel.querySelector('#map-city');
  const canvas = panel.querySelector('#salon-map');
  const status = panel.querySelector('[role=status]');
  const source = new URL('../map/salons.json', document.currentScript.src);
  const pin = new URL('./map-pin.svg', document.currentScript.src);
  const loadTimeout = 12_000;

  const notice = document.createElement('div');
  notice.className = 'salon-map-error';
  notice.hidden = true;
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn--grey btn--sm';
  retry.textContent = 'Повторить загрузку';
  const list = document.createElement('a');
  list.href = new URL('../shops/', source);
  list.className = 'link link--black_border';
  list.textContent = 'Открыть список салонов';
  notice.append(message, retry, list);
  canvas.before(notice);

  let retryLoad = loadSalons;
  retry.addEventListener('click', () => {
    retry.disabled = true;
    message.textContent = 'Загружаем карту…';
    retryLoad();
  });

  function showError(text) {
    notice.hidden = false;
    message.textContent = text;
    retry.disabled = false;
  }

  function clearError() {
    if (notice.contains(document.activeElement)) canvas.focus({ preventScroll: true });
    notice.hidden = true;
    message.textContent = '';
  }

  async function loadSalons() {
    let salons;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), loadTimeout);
    try {
      const response = await fetch(source, { signal: request.signal });
      if (!response.ok) throw new Error('Salon data request failed');
      salons = await response.json();
      if (!Array.isArray(salons) || !salons.length) throw new Error('No salon data');
    } catch (error) {
      showError('Не удалось загрузить данные салонов.');
      console.warn('Ошибка загрузки данных салонов', error);
      return;
    } finally {
      clearTimeout(timeout);
    }

    try {
      clearError();
      initializeMap(salons);
    } catch (error) {
      retryLoad = () => location.reload();
      showError('Не удалось открыть карту салонов.');
      console.error('Ошибка карты салонов', error);
    }
  }

  function initializeMap(salons) {
    const map = L.map(canvas, { scrollWheelZoom: false, zoomControl: false });
    L.control.zoom({
      position: 'topright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить',
    }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    const failedTiles = new Set();
    const tileError = 'Не удалось полностью загрузить подложку карты.';
    let tileTimeout;

    function checkTiles() {
      const view = canvas.getBoundingClientRect();
      const hasVisibleError = [...failedTiles].some(tile => {
        const bounds = tile.getBoundingClientRect();
        return bounds.left < view.right && bounds.right > view.left &&
          bounds.top < view.bottom && bounds.bottom > view.top;
      });
      if (hasVisibleError) showError(tileError);
      else clearError();
    }

    function watchTiles() {
      clearTimeout(tileTimeout);
      tileTimeout = setTimeout(() => showError(tileError), loadTimeout);
    }

    tiles.on('loading', watchTiles);
    tiles.on('tileerror', ({ tile }) => failedTiles.add(tile));
    tiles.on('tileunload', ({ tile }) => failedTiles.delete(tile));
    tiles.on('load', () => {
      clearTimeout(tileTimeout);
      checkTiles();
    });
    tiles.addTo(map);
    map.on('moveend', () => {
      if (!tiles.isLoading()) checkTiles();
    });
    retryLoad = () => {
      watchTiles();
      tiles.redraw();
    };

    const icon = L.icon({ iconUrl: pin.href, iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -31] });
    const clusters = L.markerClusterGroup({
      maxClusterRadius: 35,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        return L.divIcon({
          className: 'salon-map-cluster',
          html: '<span>' + cluster.getChildCount() + '</span>',
          iconSize: [42, 42],
        });
      },
    }).addTo(map);

    function popup(salon) {
      const content = document.createElement('article');
      const heading = document.createElement('div');
      heading.className = 'text-h5';
      heading.textContent = salon.name;
      const address = document.createElement('p');
      address.textContent = salon.address;
      content.append(heading, address);
      for (const phone of salon.phones) {
        const link = document.createElement('a');
        link.href = 'tel:' + phone.replace(/[^+\d]/g, '');
        link.textContent = phone;
        content.append(link);
      }
      for (const hours of salon.hours) {
        const line = document.createElement('div');
        line.textContent = hours;
        content.append(line);
      }
      const details = document.createElement('a');
      details.href = salon.link ? new URL(salon.link, source) : salon.source;
      details.className = 'link link--black_border';
      details.textContent = 'Подробнее о салоне';
      content.append(details);
      return content;
    }

    const markers = salons.map(salon => ({
      salon,
      marker: L.marker(salon.coordinates, { icon, title: salon.name, alt: salon.name })
        .bindPopup(() => popup(salon), { maxWidth: 285 }),
    }));
    for (const [code, label] of new Map(salons.map(salon => [salon.cityCode, salon.city]))) {
      filter.add(new Option(label, code));
    }

    function showCity(code) {
      const visible = markers.filter(({ salon }) => !code || salon.cityCode === code);
      clusters.clearLayers();
      clusters.addLayers(visible.map(({ marker }) => marker));
      if (visible.length === 1) {
        map.setView(visible[0].salon.coordinates, 12);
      } else {
        map.fitBounds(clusters.getBounds(), { padding: [30, 45], maxZoom: code ? 12 : 4 });
      }
      showCount(visible.length);
    }

    function showCount(count) {
      canvas.dataset.markerCount = String(count);
      status.textContent = 'Салонов на карте: ' + count;
    }

    filter.disabled = false;
    filter.addEventListener('change', () => showCity(filter.value));
    const query = canvas.dataset.salon || new URLSearchParams(location.search).get('salon');
    const match = markers.find(({ salon }) => salon.slug === query || salon.id === query);
    if (match && canvas.dataset.salon) {
      match.marker.addTo(map);
      map.setView(match.salon.coordinates, 14);
      showCount(1);
      return;
    }
    showCity(match?.salon.cityCode || '');
    if (match) {
      filter.value = match.salon.cityCode;
      clusters.zoomToShowLayer(match.marker, () => match.marker.openPopup());
    }
  }

  loadSalons();
})();
