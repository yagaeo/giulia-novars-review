(async () => {
  const panel = document.querySelector('[data-map-salons]');
  if (!panel) return;

  const filter = panel.querySelector('#map-city');
  const canvas = panel.querySelector('#salon-map');
  const status = panel.querySelector('[role=status]');
  const source = new URL('../map/salons.json', document.currentScript.src);
  const pin = new URL('./map-pin.svg', document.currentScript.src);

  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error('Salon data request failed');
    const salons = await response.json();

    const map = L.map(canvas, { scrollWheelZoom: false, zoomControl: false });
    L.control.zoom({
      position: 'topright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить',
    }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

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
      canvas.dataset.markerCount = String(visible.length);
      status.textContent = 'Салонов на карте: ' + visible.length;
    }

    filter.disabled = false;
    filter.addEventListener('change', () => showCity(filter.value));
    const query = canvas.dataset.salon || new URLSearchParams(location.search).get('salon');
    const match = markers.find(({ salon }) => salon.slug === query || salon.id === query);
    showCity(match?.salon.cityCode || '');
    if (match) {
      filter.value = match.salon.cityCode;
      if (canvas.dataset.salon) {
        clusters.clearLayers();
        match.marker.addTo(map);
        map.setView(match.salon.coordinates, 14);
      } else {
        clusters.zoomToShowLayer(match.marker, () => match.marker.openPopup());
      }
    }
  } catch (error) {
    status.classList.remove('sr-only');
    status.textContent = 'Карту не удалось загрузить. Адреса доступны в списке салонов.';
    console.error('Ошибка карты салонов', error);
  }
})();
