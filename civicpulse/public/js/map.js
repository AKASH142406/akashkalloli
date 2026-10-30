// Leaflet helpers. Tiles are served locally from /tiles with an OpenStreetMap fallback.
import { icon, catMeta, esc } from './ui.js';

export const DEMO_CENTER = [12.936, 77.625];
export const DEMO_ZOOM = 13;

export function createMap(el, { center = DEMO_CENTER, zoom = DEMO_ZOOM, interactive = true } = {}) {
  const map = L.map(el, {
    center,
    zoom,
    zoomControl: interactive,
    attributionControl: true,
    scrollWheelZoom: false,
    dragging: interactive,
    tap: true,
  });
  L.tileLayer('/tiles/{z}/{x}/{y}.png?v=2', {
    minZoom: 11,
    maxZoom: 16,
    attribution: '&copy; OpenStreetMap contributors',
    crossOrigin: true,
  }).addTo(map);
  if (interactive) {
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
  }
  return map;
}

export function reportMarker(report, { onClick = null, selected = false } = {}) {
  const meta = catMeta(report.category);
  const marker = L.marker([report.location.lat, report.location.lng], {
    icon: L.divIcon({
      className: `cp-marker ${report.priority?.level === 'Critical' ? 'critical' : ''} ${selected ? 'selected' : ''}`,
      html: `<div class="pin" style="background:${meta.color}">${icon(meta.icon, 11)}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
    keyboard: false,
    title: `${report.id} · ${report.category}`,
  });
  if (onClick) marker.on('click', () => onClick(report));
  marker.bindTooltip(`<b>${esc(report.id)}</b> · ${esc(report.category)}<br>${esc(report.area)}`, { direction: 'top', offset: [0, -10], opacity: 1 });
  return marker;
}

export function pinMarker(lat, lng, { draggable = true, onMove = null } = {}) {
  const marker = L.marker([lat, lng], {
    draggable,
    icon: L.divIcon({ className: 'cp-pin-drop', html: '<div class="pin"></div>', iconSize: [30, 42], iconAnchor: [15, 40] }),
  });
  if (onMove) marker.on('dragend', () => { const p = marker.getLatLng(); onMove(p.lat, p.lng); });
  return marker;
}

export function hotspotLayer(cluster, { onClick = null } = {}) {
  const group = L.layerGroup();
  const critical = cluster.critical > 0;
  const color = critical ? '#b3261e' : '#b56f0d';
  L.circle([cluster.centroid.lat, cluster.centroid.lng], {
    radius: Math.max(90, cluster.radiusMeters),
    color,
    weight: 1.5,
    opacity: 0.7,
    fillColor: color,
    fillOpacity: 0.09,
    interactive: false,
  }).addTo(group);
  const badge = L.marker([cluster.centroid.lat, cluster.centroid.lng], {
    icon: L.divIcon({
      className: `cp-hotspot ${critical ? '' : 'medium'}`,
      html: `<div class="ring" style="width:52px;height:52px"><span>${cluster.count}</span></div>`,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
    }),
    zIndexOffset: 500,
    keyboard: false,
  });
  badge.bindTooltip(`<b>${esc(cluster.area)} hotspot</b><br>${cluster.count} open reports · severity ${cluster.severity}`, { direction: 'top', offset: [0, -24] });
  if (onClick) badge.on('click', () => onClick(cluster));
  badge.addTo(group);
  return group;
}

export function fitToReports(map, reports, { padding = [34, 34], maxZoom = 14 } = {}) {
  const points = reports.filter(r => r.location).map(r => [r.location.lat, r.location.lng]);
  if (!points.length) return;
  if (points.length === 1) { map.setView(points[0], 15); return; }
  map.fitBounds(L.latLngBounds(points).pad(0.12), { padding, maxZoom });
}

export function mapLegend() {
  return `<div class="map-legend">
    <span><i style="background:#b3261e"></i> Critical</span>
    <span><i style="background:#b56f0d"></i> High</span>
    <span><i style="background:#2563a8"></i> Medium</span>
    <span><i style="background:#5b6b73"></i> Low</span>
    <span><i style="background:transparent;border:1.5px solid #b3261e"></i> Hotspot</span>
  </div>`;
}
