const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileNav = document.querySelector('[data-mobile-nav]');
const protocolTabs = document.querySelectorAll('[data-protocol]');
const protocolPanel = document.querySelector('[data-protocol-panel]');
const protocolLabel = document.querySelector('[data-protocol-label]');
const cityForm = document.querySelector('[data-city-form]');
const cityInput = document.querySelector('#city-search');
const cityFeedback = document.querySelector('[data-city-feedback]');
const selectedCityLabel = document.querySelector('[data-selected-city]');
const selectedCountryLabel = document.querySelector('[data-selected-country]');
const selectedCoordinatesLabel = document.querySelector('[data-selected-coordinates]');
const selectedStatusLabel = document.querySelector('[data-selected-status]');
const mapStatusLabel = document.querySelector('[data-map-status]');
const globeCanvas = document.querySelector('#globe-canvas');
const globeStage = document.querySelector('.globe-stage');
const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;

const protocolNotes = {
  flow: 'Observed relationship, ready for context.',
  host: 'Host context is available when the source is authorized.',
  finding: 'Finding remains linked to its supporting evidence.',
};

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

menuToggle?.addEventListener('click', () => {
  const isOpen = mobileNav?.classList.toggle('is-open') ?? false;
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  mobileNav.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));

protocolTabs.forEach((tab) => tab.addEventListener('click', () => {
  const protocol = tab.dataset.protocol ?? 'flow';
  protocolTabs.forEach((item) => {
    const isActive = item === tab;
    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-selected', String(isActive));
  });
  if (protocolPanel) {
    protocolPanel.dataset.activeProtocol = protocol;
    const note = protocolPanel.querySelector('[data-protocol-note]');
    if (note) note.textContent = protocolNotes[protocol];
    if (protocolLabel) protocolLabel.textContent = `${protocol.toUpperCase()} RECORD`;
  }
}));

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

if (supportsFinePointer && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.hero-visual, .feature-card, .download-card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      card.style.setProperty('--pointer-rotate-x', `${(0.5 - y) * 5}deg`);
      card.style.setProperty('--pointer-rotate-y', `${(x - 0.5) * 6}deg`);
      card.style.setProperty('--pointer-lift', '-5px');
    });
    card.addEventListener('pointerleave', () => {
      card.style.removeProperty('--pointer-rotate-x');
      card.style.removeProperty('--pointer-rotate-y');
      card.style.removeProperty('--pointer-lift');
    });
  });
}

const DATA = {
  countries: './data/countries.json',
  cities: './data/cities.json',
  regions: './data/regions-index.json',
};

const fallbackCities = [
  ['Singapore', 'SG', 1.3521, 103.8198], ['London', 'GB', 51.5072, -0.1276], ['Tokyo', 'JP', 35.6762, 139.6503],
  ['Bengaluru', 'IN', 12.9716, 77.5946], ['Mumbai', 'IN', 19.076, 72.8777], ['New York', 'US', 40.7128, -74.006],
  ['San Francisco', 'US', 37.7749, -122.4194], ['Berlin', 'DE', 52.52, 13.405], ['Toronto', 'CA', 43.6532, -79.3832],
  ['Sydney', 'AU', -33.8688, 151.2093],
];

const loadJson = async (url, fallback) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`geo data ${response.status}`);
    return await response.json();
  } catch {
    return fallback;
  }
};

const formatCoordinate = (value, positive, negative) => `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
const globePoint = (lat, lon) => {
  const latitude = lat * Math.PI / 180;
  const longitude = lon * Math.PI / 180;
  return { x: Math.cos(latitude) * Math.cos(longitude), y: Math.sin(latitude), z: -Math.cos(latitude) * Math.sin(longitude) };
};

const unwrapRing = (ring) => {
  const output = [];
  ring.forEach(([lon, lat]) => {
    let current = lon;
    const previous = output.at(-1)?.[0];
    if (previous !== undefined) {
      while (current - previous > 180) current -= 360;
      while (current - previous < -180) current += 360;
    }
    output.push([current, lat]);
  });
  return output;
};

function createGlobe() {
  if (!(globeCanvas instanceof HTMLCanvasElement) || !(globeStage instanceof HTMLElement)) return;
  const context = globeCanvas.getContext('2d');
  if (!context) return;

  let width = 0;
  let height = 0;
  let scale = 1;
  let rotationY = -0.62;
  let rotationX = -0.08;
  let targetRotationY = rotationY;
  let targetRotationX = rotationX;
  let targetZoom = 1;
  let zoom = 1;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let animationFrame = 0;
  let resizeObserver = null;
  let countries = [];
  let cities = fallbackCities;
  let regions = [];
  let selected = { name: 'Singapore', country: 'Singapore', iso: 'SG', lat: 1.3521, lon: 103.8198 };
  let selectedStateFeatures = [];
  let visibleLabelCities = new Set();
  let labelRotationY = Number.NaN;
  let labelRotationX = Number.NaN;
  let labelZoom = Number.NaN;

  const resize = () => {
    const bounds = globeStage.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    scale = Math.min(window.devicePixelRatio || 1, 2);
    globeCanvas.width = Math.round(width * scale);
    globeCanvas.height = Math.round(height * scale);
    globeCanvas.style.width = `${width}px`;
    globeCanvas.style.height = `${height}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
  };

  const rotatePoint = (point) => {
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const x = point.x * cosY - point.z * sinY;
    const z = point.x * sinY + point.z * cosY;
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);
    return { x, y: point.y * cosX - z * sinX, z: point.y * sinX + z * cosX };
  };

  const project = (point, radius) => ({ x: width / 2 + point.x * radius, y: height / 2 - point.y * radius, z: point.z });
  const drawPath = (ring, radius, stroke, lineWidth, dash = []) => {
    const unwrapped = unwrapRing(ring);
    if (unwrapped.length < 2) return;
    context.beginPath();
    let visible = 0;
    unwrapped.forEach(([lon, lat], index) => {
      const screen = project(rotatePoint(globePoint(lat, lon)), radius);
      if (screen.z > -0.22) visible += 1;
      if (index === 0) context.moveTo(screen.x, screen.y); else context.lineTo(screen.x, screen.y);
    });
    if (visible < Math.max(2, unwrapped.length * .2)) return;
    context.setLineDash(dash);
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
    context.setLineDash([]);
  };

  const drawCountry = (country, radius) => {
    const isSelected = selected.iso === country.iso;
    country.polys?.forEach((poly) => {
      const outer = poly?.[0];
      if (!outer?.length) return;
      const unwrapped = unwrapRing(outer);
      context.beginPath();
      let visible = 0;
      unwrapped.forEach(([lon, lat], index) => {
        const screen = project(rotatePoint(globePoint(lat, lon)), radius);
        if (screen.z > -0.22) visible += 1;
        if (index === 0) context.moveTo(screen.x, screen.y); else context.lineTo(screen.x, screen.y);
      });
      if (visible < Math.max(3, unwrapped.length * .18)) return;
      context.closePath();
      context.fillStyle = isSelected ? 'rgba(140,150,154,.08)' : 'rgba(18,24,28,.18)';
      context.fill();
      drawPath(outer, radius, isSelected ? 'rgba(216,242,122,.95)' : 'rgba(140,231,236,.62)', isSelected ? 1.25 : .65);
      poly.slice(1).forEach((hole) => drawPath(hole, radius, 'rgba(7,12,16,.72)', .5));
    });
  };

  const drawStateFeatures = (radius) => {
    selectedStateFeatures.forEach((feature) => {
      const geometry = feature.geometry;
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.coordinates ?? [];
      polygons.forEach((polygon) => polygon.forEach((ring) => drawPath(ring, radius, 'rgba(181,165,255,.75)', .62, [3, 4])));
    });
  };

  const drawCity = (city, radius) => {
    const point = rotatePoint(globePoint(city.lat, city.lon));
    if (point.z < -.08) return;
    const screen = project(point, radius);
    const isSelected = city.name.toLowerCase() === selected.name.toLowerCase();
    context.fillStyle = isSelected ? '#d8f27a' : 'rgba(140,231,236,.85)';
    context.shadowColor = isSelected ? 'rgba(216,242,122,.9)' : 'rgba(140,231,236,.65)';
    context.shadowBlur = isSelected ? 12 : 5;
    context.beginPath();
    context.arc(screen.x, screen.y, isSelected ? 3.2 : 1.7, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    if (isSelected) {
      context.strokeStyle = 'rgba(216,242,122,.75)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(screen.x, screen.y, 9, 0, Math.PI * 2);
      context.stroke();
    }
    if (visibleLabelCities.has(city.name) && point.z > .18) {
      context.fillStyle = isSelected ? '#d8f27a' : 'rgba(220,244,246,.72)';
      context.font = isSelected ? '700 9px ui-monospace, SFMono-Regular, Menlo, monospace' : '8px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillText(city.name.toUpperCase(), screen.x + 7, screen.y - 6);
    }
  };

  const chooseCityLabels = (radius) => {
    if (Math.abs(rotationY - labelRotationY) < .012 && Math.abs(rotationX - labelRotationX) < .012 && Math.abs(zoom - labelZoom) < .012) return;
    labelRotationY = rotationY;
    labelRotationX = rotationX;
    labelZoom = zoom;
    const candidates = cities.map(([name, iso, lat, lon]) => {
      const point = rotatePoint(globePoint(lat, lon));
      const screen = project(point, radius);
      const distanceFromCenter = Math.hypot(screen.x - width / 2, screen.y - height / 2) / radius;
      const selectedBoost = name.toLowerCase() === selected.name.toLowerCase() ? 4 : 0;
      const frontScore = Math.max(0, point.z) * 2.4;
      return { name, point, screen, score: selectedBoost + frontScore + Math.max(0, 1 - distanceFromCenter), iso };
    }).filter((city) => city.point.z > .18).sort((a, b) => b.score - a.score);

    const labels = [];
    candidates.forEach((candidate) => {
      if (labels.length >= 12) return;
      const hasSpace = labels.every((label) => Math.hypot(label.screen.x - candidate.screen.x, label.screen.y - candidate.screen.y) > 44);
      if (hasSpace || candidate.name.toLowerCase() === selected.name.toLowerCase()) labels.push(candidate);
    });
    visibleLabelCities = new Set(labels.map((city) => city.name));
  };

  const drawCountryLabels = (radius) => {
    const labelCountries = new Set(['United States', 'Canada', 'Brazil', 'United Kingdom', 'Germany', 'India', 'China', 'Japan', 'Australia', 'Russia', 'South Africa', 'Singapore']);
    countries.forEach((country) => {
      if (!labelCountries.has(country.n) && country.iso !== selected.iso) return;
      const point = rotatePoint(globePoint(country.la, country.lo));
      if (point.z < .18) return;
      const screen = project(point, radius);
      context.fillStyle = country.iso === selected.iso ? '#d8f27a' : 'rgba(140,231,236,.7)';
      context.font = country.iso === selected.iso ? '700 10px ui-monospace, SFMono-Regular, Menlo, monospace' : '9px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillText(country.n.toUpperCase(), screen.x + 7, screen.y + 4);
    });
  };

  const drawStateLabels = (radius) => {
    selectedStateFeatures.slice(0, 18).forEach((feature) => {
      const ring = feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates?.[0] : feature.geometry?.coordinates?.[0]?.[0];
      if (!Array.isArray(ring) || ring.length < 3) return;
      const center = ring.reduce((sum, pair) => ({ lon: sum.lon + pair[0], lat: sum.lat + pair[1] }), { lon: 0, lat: 0 });
      const lat = center.lat / ring.length;
      const lon = center.lon / ring.length;
      const point = rotatePoint(globePoint(lat, lon));
      if (point.z < .3) return;
      const screen = project(point, radius);
      context.fillStyle = 'rgba(181,165,255,.85)';
      context.font = '7px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillText(String(feature.properties?.name ?? '').toUpperCase(), screen.x, screen.y);
    });
  };

  const draw = () => {
    rotationY += (targetRotationY - rotationY) * .08;
    rotationX += (targetRotationX - rotationX) * .08;
    zoom += (targetZoom - zoom) * .08;
    context.clearRect(0, 0, width, height);
    const radius = Math.min(width, height) * .46 * zoom;
    const glow = context.createRadialGradient(width / 2, height / 2, radius * .2, width / 2, height / 2, radius * 1.28);
    glow.addColorStop(0, 'rgba(18, 22, 24, .16)');
    glow.addColorStop(.62, 'rgba(5, 7, 10, .08)');
    glow.addColorStop(1, 'rgba(5, 7, 10, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(width / 2, height / 2, radius * 1.3, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(140,231,236,.12)';
    context.lineWidth = .5;
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 6) points.push(project(rotatePoint(globePoint(latitude, longitude)), radius));
      context.beginPath();
      points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
      context.stroke();
    }
    for (let longitude = -150; longitude <= 180; longitude += 30) {
      const points = [];
      for (let latitude = -90; latitude <= 90; latitude += 5) points.push(project(rotatePoint(globePoint(latitude, longitude)), radius));
      context.beginPath();
      points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
      context.stroke();
    }

    countries.forEach((country) => drawCountry(country, radius));
    drawStateFeatures(radius);
    animationFrame = requestAnimationFrame(draw);
  };

  const locate = async (location) => {
    selected = location;
    labelRotationY = Number.NaN;
    labelRotationX = Number.NaN;
    labelZoom = Number.NaN;
    const point = globePoint(location.lat, location.lon);
    targetRotationY = Math.atan2(point.x, point.z);
    targetRotationX = Math.asin(point.y) * .72;
    targetZoom = 1.08;
    const country = countries.find((item) => item.iso === location.iso);
    if (country) {
      try {
        const response = await fetch(`./data/admin1/${country.iso}.geojson`);
        selectedStateFeatures = response.ok ? (await response.json()).features ?? [] : [];
      } catch {
        selectedStateFeatures = [];
      }
    } else {
      selectedStateFeatures = [];
    }
    if (selectedCityLabel) selectedCityLabel.textContent = location.name;
    if (selectedCountryLabel) selectedCountryLabel.textContent = location.country || country?.n || location.iso || 'Unknown country';
    if (selectedCoordinatesLabel) selectedCoordinatesLabel.textContent = `${formatCoordinate(location.lat, 'N', 'S')} · ${formatCoordinate(location.lon, 'E', 'W')}`;
    if (selectedStatusLabel) selectedStatusLabel.textContent = `${location.name} selected`;
    if (mapStatusLabel) mapStatusLabel.textContent = country ? `${country.n} · country + state boundaries` : 'countries · cities · state boundaries';
  };

  const findLocation = (query) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;
    const city = cities.find(([name]) => name.toLowerCase() === normalized) ?? cities.find(([name]) => name.toLowerCase().includes(normalized));
    if (city) return { name: city[0], iso: city[1], lat: city[2], lon: city[3], country: countries.find((item) => item.iso === city[1])?.n ?? city[1] };
    const country = countries.find((item) => item.n.toLowerCase() === normalized) ?? countries.find((item) => item.n.toLowerCase().includes(normalized) || item.iso.toLowerCase() === normalized);
    if (country) return { name: country.cap || country.n, iso: country.iso, lat: country.la, lon: country.lo, country: country.n };
    const region = regions.find((item) => item.name.toLowerCase() === normalized) ?? regions.find((item) => item.name.toLowerCase().includes(normalized) || item.code.toLowerCase() === normalized);
    if (region) return { name: region.name, iso: region.country, lat: region.la, lon: region.lo, country: countries.find((item) => item.iso === region.country)?.n ?? region.country };
    return null;
  };

  cityForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const location = findLocation(cityInput?.value ?? '');
    if (!location) {
      if (cityFeedback) cityFeedback.textContent = 'No city, country, or state found. Try Singapore, India, London, or California.';
      return;
    }
    await locate(location);
    if (cityFeedback) cityFeedback.textContent = `${location.name}, ${location.country} located. Country borders and state boundaries are now highlighted.`;
  });

  globeStage.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    globeStage.classList.add('is-dragging');
    globeStage.setPointerCapture(event.pointerId);
  });
  globeStage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    targetRotationY -= (event.clientX - lastX) * .008;
    targetRotationX = Math.max(-1.1, Math.min(1.1, targetRotationX + (event.clientY - lastY) * .006));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = (event) => {
    dragging = false;
    globeStage.classList.remove('is-dragging');
    if (event?.pointerId !== undefined) globeStage.releasePointerCapture?.(event.pointerId);
  };
  globeStage.addEventListener('pointerup', endDrag);
  globeStage.addEventListener('pointercancel', endDrag);
  globeStage.addEventListener('wheel', (event) => {
    event.preventDefault();
    targetZoom = Math.max(.8, Math.min(1.35, targetZoom + event.deltaY * .0007));
  }, { passive: false });

  window.addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(globeStage);
  }
  resize();
  Promise.all([
    loadJson(DATA.countries, []),
    loadJson(DATA.cities, fallbackCities),
    loadJson(DATA.regions, []),
  ]).then(async ([countryData, cityData, regionData]) => {
    countries = Array.isArray(countryData) ? countryData : [];
    cities = Array.isArray(cityData) ? cityData : fallbackCities;
    regions = Array.isArray(regionData) ? regionData : [];
    if (countries.length) {
      await locate(selected);
      if (mapStatusLabel) mapStatusLabel.textContent = `${countries.length} countries · cities · state boundaries`;
    }
  });
  locate(selected);
  draw();
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
  }, { once: true });
}

createGlobe();
